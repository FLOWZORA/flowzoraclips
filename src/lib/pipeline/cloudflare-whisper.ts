import { TranscriptSegment, WordTimestamp, SourceLanguage } from './types';
import { splitAudioBufferIntoChunks } from './audio-extractor';

export interface CloudflareTranscriptionResult {
  text: string;
  language: string;
  duration: number;
  segments: TranscriptSegment[];
  words: WordTimestamp[];
}

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Workers AI model — hardcoded to Large v3 Turbo. No override: the old
 * `@cf/openai/whisper` default is removed completely.
 * @see https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/
 */
export const CLOUDFLARE_WHISPER_MODEL = '@cf/openai/whisper-large-v3-turbo';

/** Back-compat alias (same hardcoded Turbo id). */
export const DEFAULT_CLOUDFLARE_WHISPER_MODEL = CLOUDFLARE_WHISPER_MODEL;

/**
 * Cloudflare Workers AI Whisper Large v3 Turbo is ALWAYS tried first.
 * Groq Whisper is strictly a backup when this fails (quota/limit/error) —
 * Groq is never tried first.
 *
 * Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN.
 */
export function isCloudflareWhisperConfigured(): boolean {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID?.trim() && process.env.CLOUDFLARE_API_TOKEN?.trim());
}

export function getCloudflareWhisperModel(): string {
  return CLOUDFLARE_WHISPER_MODEL;
}

function getModel(): string {
  return CLOUDFLARE_WHISPER_MODEL;
}

/**
 * Trimmed Account ID with format validation. Cloudflare answers a wrong or
 * whitespace-padded Account ID with HTTP 400 code 7000 ("No route for that
 * URI"), which is cryptic — fail fast with a clear config error instead.
 * (Account IDs are 32 hex chars; a Zone ID pasted here will not route.)
 */
function getAccountId(): string {
  const id = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(id)) {
    throw new Error(
      'Cloudflare Workers AI account ID looks invalid (expected the 32-character hex Account ID from the Cloudflare dashboard overview page, not a Zone ID). Check CLOUDFLARE_ACCOUNT_ID.'
    );
  }
  return id;
}

function getApiToken(): string {
  const token = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!token) {
    throw new Error('Cloudflare Workers AI is not configured (CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN).');
  }
  return token;
}

/**
 * Buffers over this size are sub-chunked before calling Workers AI — the API
 * rejects multi-MB audio payloads (413 Request too large), while Cloudflare's
 * own Whisper tutorial uses ~1 MB chunks. 1 MB ≈ 2 min at 64kbps.
 * Timestamps are re-offset on merge.
 */
const CF_SUBCHUNK_BYTES = 1 * 1024 * 1024;
/** Parallel sub-requests per transcription call (bounds step runtime). */
const CF_CONCURRENCY = 3;

export async function transcribeWithCloudflare(
  audioBuffer: Buffer | Uint8Array,
  language?: SourceLanguage
): Promise<CloudflareTranscriptionResult> {
  const accountId = getAccountId();
  const apiToken = getApiToken();
  const model = getModel();
  console.log(`[CF Whisper] Model: ${model} (acct …${accountId.slice(-4)})`);

  // Split large buffers so every request stays small; tiny inputs go direct.
  let pieces: Array<{ buffer: Buffer; startSec: number }> = [
    { buffer: Buffer.from(audioBuffer), startSec: 0 },
  ];
  if (audioBuffer.length > CF_SUBCHUNK_BYTES) {
    const { chunks } = await splitAudioBufferIntoChunks(audioBuffer, {
      chunkTargetBytes: CF_SUBCHUNK_BYTES,
      maxChunks: 500, // 500 × 1 MB ≈ 1000 min at 64kbps — headroom past 180 min
      overlapSec: 3,
    });
    pieces = chunks.map((c) => ({ buffer: c.buffer, startSec: c.startSec }));
    console.log(
      `[CF Whisper] Split ${(audioBuffer.length / 1048576).toFixed(1)} MB into ${pieces.length} sub-chunks for Workers AI.`
    );
  }

  const allWords: WordTimestamp[] = [];
  const texts: string[] = [];
  // Chunks carry a 3s head overlap (see splitAudioBufferIntoChunks), so local
  // timestamps are relative to extractStart, not the nominal start — same
  // re-offset + overlap-drop rule as the Groq chunk path.
  //
  // Sub-requests run with bounded concurrency: a 20 MB pipeline chunk fans out
  // to ~20 one-MB calls, which would blow the 300s step budget sequentially.
  const OVERLAP_SEC = 3;
  const partResults = new Array<{ text: string; words: CfWord[] }>(pieces.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < pieces.length) {
      const idx = nextIndex;
      nextIndex += 1;
      const { buffer } = pieces[idx];
      console.log(
        `[CF Whisper] Transcribing part ${idx + 1}/${pieces.length} (${(buffer.length / 1024).toFixed(0)} KB)...`
      );
      partResults[idx] = await transcribeOneRequest(buffer, accountId, apiToken);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CF_CONCURRENCY, pieces.length) }, () => worker())
  );
  for (let i = 0; i < pieces.length; i++) {
    const nominalStart = pieces[i].startSec;
    const extractStart = i === 0 ? 0 : Math.max(0, nominalStart - OVERLAP_SEC);
    const part = partResults[i];
    texts.push(part.text);
    for (const w of part.words) {
      const absStart = Number((w.start + extractStart).toFixed(2));
      const absEnd = Number((w.end + extractStart).toFixed(2));
      if (i > 0 && absStart < nominalStart - 0.15) continue;
      allWords.push({ word: w.word, start: absStart, end: absEnd });
    }
  }

  // Large v3 Turbo word times are interpolated from its timed segments, so
  // re-synthesize coarse sentence/pause segments for candidate generation,
  // which needs clean segment boundaries.
  const segments = synthesizeSegments(allWords);
  const duration =
    allWords.length > 0 ? Number(allWords[allWords.length - 1].end.toFixed(2)) : 0;
  console.log(`[CF Whisper] Complete: model=${model}, ${allWords.length} words, ${duration.toFixed(1)}s.`);
  return {
    text: texts.join(' ').trim(),
    language: language === 'hindi' ? 'hi' : 'en',
    duration,
    segments,
    words: allWords,
  };
}

interface CfWord {
  word: string;
  start: number;
  end: number;
}

async function transcribeOneRequest(
  buffer: Buffer,
  accountId: string,
  apiToken: string
): Promise<{ text: string; words: CfWord[] }> {
  const model = getModel();
  const url = `${CF_API_BASE}/accounts/${accountId}/ai/run/${model}`;

  // Attempt 1: auto-detect the language (best quality, esp. Hinglish).
  try {
    return await postAudio(url, apiToken, buffer);
  } catch (err: any) {
    // The model refuses chunks where it hears multiple languages and asks
    // for a forced single language — retry English, then Hindi.
    if (!isMixedLanguageError(err)) throw err;
    console.warn(`[CF Whisper] Mixed-language chunk detected, retrying with forced language…`);
    try {
      return await postAudio(url, apiToken, buffer, 'en');
    } catch (enErr: any) {
      if (!isMixedLanguageError(enErr)) throw enErr;
      return await postAudio(url, apiToken, buffer, 'hi');
    }
  }
}

function isMixedLanguageError(err: any): boolean {
  return /different languages|force a single language/i.test(err?.message || '');
}

/**
 * Sends one audio piece to Workers AI Large v3 Turbo. Always uses the JSON
 * `{ audio (base64), task, language? }` body — the canonical Turbo form per
 * Cloudflare's docs — so optional params ride the same way every call.
 * `language` is only pinned on the mixed-language retry path; otherwise the
 * model auto-detects (best quality for Hinglish code-switching).
 */
async function postAudio(
  url: string,
  apiToken: string,
  buffer: Buffer,
  language?: string
): Promise<{ text: string; words: CfWord[] }> {
  const body: Record<string, unknown> = {
    audio: buffer.toString('base64'),
    task: 'transcribe',
  };
  if (language) body.language = language;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const errors = (data.errors || []).map((e: any) => e.message || JSON.stringify(e)).join('; ');
    const codes = (data.errors || []).map((e: any) => e.code).filter(Boolean);
    const codeStr = codes.length ? ` [${codes.join(',')}]` : '';
    // Code 7000 "No route for that URI" = request never routed: wrong
    // CLOUDFLARE_ACCOUNT_ID (never an audio problem).
    const hint = codes.includes(7000)
      ? ' (routing failed — check CLOUDFLARE_ACCOUNT_ID)'
      : '';
    throw new Error(
      `Cloudflare Workers AI error (${res.status})${codeStr}: ${errors || res.statusText || 'request failed'}${hint}`
    );
  }

  const result = data.result || {};
  const rawWords: any[] = Array.isArray(result.words) ? result.words : [];
  const words: CfWord[] = rawWords
    .map((w) => {
      const start = Number(w.start);
      let end = Number(w.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      // Same sanity clamp as the Groq path: no spoken word lasts > 2s.
      if (end - start > 2.0) end = Number((start + 1.2).toFixed(2));
      return { word: String(w.word ?? ''), start, end };
    })
    .filter((w): w is CfWord => Boolean(w && w.word));

  // Large v3 Turbo returns timed `segments` (start/end/text) plus a `vtt`
  // subtitle string, but no `words` array — derive approximate word
  // timestamps by distributing each segment's words evenly across its
  // (model-produced) time range. Segment boundaries stay exact; only
  // intra-segment splits are interpolated. Far better than zero words;
  // Groq backup stays the precise-timestamp path when quota allows.
  let text = String(result.text || '');
  if (words.length === 0 && Array.isArray(result.segments)) {
    let segCount = 0;
    for (const s of result.segments) {
      const start = Number(s?.start);
      const end = Number(s?.end);
      const segText = String(s?.text || '').trim();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !segText) continue;
      const tokens = segText.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) continue;
      segCount += 1;
      const per = (end - start) / tokens.length;
      tokens.forEach((tok, i) => {
        const wStart = Number((start + i * per).toFixed(2));
        let wEnd = Number((start + (i + 1) * per).toFixed(2));
        if (wEnd - wStart > 2.0) wEnd = Number((wStart + 1.2).toFixed(2));
        words.push({ word: tok, start: wStart, end: wEnd });
      });
    }
    if (!text.trim() && words.length > 0) {
      text = words.map((w) => w.word).join(' ');
    }
    if (words.length > 0) {
      console.log(`[CF Whisper] Derived ${words.length} word timestamps from ${segCount} timed segments.`);
    }
  }

  // Last-resort fallback: Turbo also returns a `vtt` subtitle string. If
  // `segments` was missing/empty, parse VTT cues into timed words the same
  // way so the pipeline never sees a silent "0 words" success.
  if (words.length === 0 && typeof result.vtt === 'string' && result.vtt.trim()) {
    const fromVtt = parseVttToWords(result.vtt);
    for (const w of fromVtt) words.push(w);
    if (!text.trim() && words.length > 0) {
      text = words.map((w) => w.word).join(' ');
    }
    if (words.length > 0) {
      console.log(`[CF Whisper] Derived ${words.length} word timestamps from VTT output.`);
    }
  }

  return { text, words };
}

/**
 * Minimal WebVTT cue parser for the Turbo `vtt` fallback:
 * `00:00.000 --> 00:02.500` cue headers + caption lines. Cue word tokens
 * are spread evenly across the cue range (same interpolation rule as
 * the `segments` path).
 */
function parseVttToWords(vtt: string): CfWord[] {
  const out: CfWord[] = [];
  const cueRe =
    /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/;
  const toSec = (h: string, m: string, s: string, ms: string) =>
    Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
  const blocks = vtt.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const headIdx = lines.findIndex((l) => cueRe.test(l));
    if (headIdx === -1) continue;
    const m = cueRe.exec(lines[headIdx]);
    if (!m) continue;
    const start = toSec(m[1], m[2], m[3], m[4]);
    const end = toSec(m[5], m[6], m[7], m[8]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const caption = lines
      .slice(headIdx + 1)
      .join(' ')
      .replace(/<[^>]*>/g, '')
      .trim();
    if (!caption || /^webvtt/i.test(caption)) continue;
    const tokens = caption.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const per = (end - start) / tokens.length;
    tokens.forEach((tok, i) => {
      const wStart = Number((start + i * per).toFixed(2));
      let wEnd = Number((start + (i + 1) * per).toFixed(2));
      if (wEnd - wStart > 2.0) wEnd = Number((wStart + 1.2).toFixed(2));
      out.push({ word: tok, start: wStart, end: wEnd });
    });
  }
  return out;
}

/**
 * Coarse segment synthesis for candidate generation: break on sentence-end
 * punctuation or natural pauses, capped at ~10s per segment.
 */
function synthesizeSegments(words: WordTimestamp[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let current: WordTimestamp[] = [];
  const flush = () => {
    if (current.length === 0) return;
    segments.push({
      id: `seg-${segments.length}`,
      text: current.map((w) => w.word).join(' '),
      start: current[0].start,
      end: current[current.length - 1].end,
      words: [...current],
    });
    current = [];
  };

  for (let i = 0; i < words.length; i++) {
    current.push(words[i]);
    const isSentenceEnd = /[.?!।॥\u0964\u0965]\s*$/.test(words[i].word);
    const next = words[i + 1];
    const pauseAfter = next ? next.start - words[i].end : 0;
    const tooLong = next ? next.end - current[0].start > 10 : true;
    if (isSentenceEnd || pauseAfter >= 0.5 || tooLong || i === words.length - 1) {
      flush();
    }
  }
  return segments;
}
