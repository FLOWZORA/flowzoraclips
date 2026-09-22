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
 * Cloudflare Workers AI Whisper is the primary transcription provider (free
 * tier: 10,000 neurons/day ≈ one 3-hour video/day, no card required).
 *
 * Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN,
 *   optional CLOUDFLARE_WHISPER_MODEL (default @cf/openai/whisper).
 */
export function isCloudflareWhisperConfigured(): boolean {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
}

function getModel(): string {
  return process.env.CLOUDFLARE_WHISPER_MODEL || '@cf/openai/whisper';
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
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error('Cloudflare Workers AI is not configured (CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN).');
  }

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

  // Workers AI returns no segments — synthesize coarse ones (sentence ends or
  // ~8s windows) for candidate generation, which needs segment boundaries.
  const segments = synthesizeSegments(allWords);
  const duration =
    allWords.length > 0 ? Number(allWords[allWords.length - 1].end.toFixed(2)) : 0;
  console.log(`[CF Whisper] Complete: ${allWords.length} words, ${duration.toFixed(1)}s.`);
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
  const res = await fetch(
    `${CF_API_BASE}/accounts/${accountId}/ai/run/${model}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'audio/mpeg',
      },
      body: buffer as any,
    }
  );

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const errors = (data.errors || []).map((e: any) => e.message || JSON.stringify(e)).join('; ');
    throw new Error(
      `Cloudflare Workers AI error (${res.status}): ${errors || res.statusText || 'request failed'}`
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

  return { text: String(result.text || ''), words };
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
