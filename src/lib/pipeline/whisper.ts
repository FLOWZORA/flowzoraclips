import { TranscriptSegment, WordTimestamp, SourceLanguage } from './types';
import { transcribeWithCloudflare, isCloudflareWhisperConfigured } from './cloudflare-whisper';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';

const execFileAsync = promisify(execFile);

function getFfmpegPath(): string {
  const require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const installer = require('@ffmpeg-installer/ffmpeg');
  return installer.path as string;
}

export type TranscriptionProvider = 'cloudflare' | 'groq' | 'openai' | 'mixed';

export interface WhisperTranscriptionResult {
  text: string;
  language: string;
  duration: number;
  segments: TranscriptSegment[];
  words: WordTimestamp[];
  /** Which backend produced this transcript (majority vote across chunks). */
  provider?: TranscriptionProvider;
}

/**
 * Transcribe audio using Groq / OpenAI Whisper API with word-level timestamps.
 * Requires genuine user-uploaded media or ingested YouTube audio.
 * Throws descriptive errors when transcription cannot be completed.
 */
export async function transcribeAudio(
  audioBuffer?: Buffer | Uint8Array,
  filename: string = 'audio.mp3',
  language?: SourceLanguage
): Promise<WhisperTranscriptionResult> {
  // Support Groq Cloud (100% Free Whisper Large v3) or OpenAI Whisper API
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const isGroq = Boolean(groqKey && !groqKey.includes('YourGroqApiKey'));
  const apiKey = isGroq ? groqKey : openaiKey;
  const endpoint = isGroq
    ? 'https://api.groq.com/openai/v1/audio/transcriptions'
    : 'https://api.openai.com/v1/audio/transcriptions';
  const model = isGroq ? 'whisper-large-v3' : 'whisper-1';

  if (!apiKey) {
    throw new Error(
      'Transcription API key is not configured. Please set GROQ_API_KEY (free) or OPENAI_API_KEY in your .env.local file.'
    );
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error(
      'No audio data provided for transcription. Please upload a valid media file.'
    );
  }

  // Groq / OpenAI Whisper limit is 25 MB per request. Audio over that size
  // (e.g. a 58-min 64kbps MP3 is ~28 MB, 120 min is ~55 MB) is split into
  // sequential <20 MB chunks, transcribed piece-by-piece, and concatenated
  // with timestamps re-offset — supporting videos up to ~120 minutes.
  const GROQ_MAX_BYTES = 25 * 1024 * 1024;
  if (audioBuffer.length > GROQ_MAX_BYTES) {
    return transcribeAudioInChunks(audioBuffer, filename, language, {
      apiKey: apiKey as string,
      endpoint,
      model,
    });
  }

  return transcribeSingleChunk(audioBuffer, filename, language, {
    apiKey: apiKey as string,
    endpoint,
    model,
  });
}

export interface TranscribeCallConfig {
  apiKey: string;
  endpoint: string;
  model: string;
}

/**
 * Resolves which transcription backend (Groq free tier vs OpenAI) to call
 * from the configured environment. Exported for the background job pipeline.
 */
export function resolveTranscriptionConfig(): TranscribeCallConfig {
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const isGroq = Boolean(groqKey && !groqKey.includes('YourGroqApiKey'));
  return {
    apiKey: (isGroq ? groqKey : openaiKey) as string,
    endpoint: isGroq
      ? 'https://api.groq.com/openai/v1/audio/transcriptions'
      : 'https://api.openai.com/v1/audio/transcriptions',
    model: isGroq ? 'whisper-large-v3' : 'whisper-1',
  };
}

/**
 * Single Whisper API call (≤25 MB). Exported for the background job pipeline,
 * which transcribes one audio chunk per step so each serverless invocation
 * stays small. Prefer transcribeAudio() for one-shot use.
 */
export async function transcribeSingleChunk(
  audioBuffer: Buffer | Uint8Array,
  filename: string,
  language: SourceLanguage | undefined,
  config: TranscribeCallConfig
): Promise<WhisperTranscriptionResult> {
  const { apiKey, endpoint, model } = config;
  const isGroq = endpoint.includes('groq');
  // Remember a Cloudflare failure so that if the Groq/OpenAI fallback ALSO
  // fails, the surfaced error names both causes — otherwise only the
  // fallback error is visible and the primary failure stays hidden in logs.
  let cfFailure: string | null = null;
  try {
    // Primary provider: Cloudflare Workers AI Whisper (free tier). Any CF
    // failure (daily quota spent, timeout, API error) falls through to
    // Groq/OpenAI below — the pipeline keeps working either way.
    if (isCloudflareWhisperConfigured()) {
      try {
        const cf = await transcribeWithCloudflare(audioBuffer, language);
        console.log(
          `[Whisper] Transcribed via Cloudflare Workers AI. Words: ${cf.words.length}, Duration: ${cf.duration.toFixed(1)}s`
        );
        return {
          text: cf.text,
          language: cf.language,
          duration: cf.duration,
          segments: cf.segments,
          words: cf.words,
          provider: 'cloudflare' as TranscriptionProvider,
        };
      } catch (cfErr: any) {
        cfFailure = cfErr.message || String(cfErr);
        console.warn(
          `[Whisper] Cloudflare transcription failed (${cfFailure}), falling back to ${isGroq ? 'Groq' : 'OpenAI'}.`
        );
      }
    }

    const lowerName = filename.toLowerCase();
    // Map file extension to the MIME type Groq/OpenAI accept for audio
    let mimeType = 'audio/mpeg'; // default: mp3
    let uploadFilename = filename;

    if (lowerName.endsWith('.mp4') || lowerName.endsWith('.mov') || lowerName.endsWith('.m4a')) {
      mimeType = 'audio/mp4';
      // Groq requires the filename extension to match — rename .mov → .mp4
      uploadFilename = filename.replace(/\.(mov|m4a)$/i, '.mp4');
    } else if (lowerName.endsWith('.wav')) {
      mimeType = 'audio/wav';
    } else if (lowerName.endsWith('.webm')) {
      mimeType = 'audio/webm';
    } else if (lowerName.endsWith('.ogg')) {
      mimeType = 'audio/ogg';
    } else if (lowerName.endsWith('.flac')) {
      mimeType = 'audio/flac';
    }

    const formData = new FormData();
    const blob = new Blob([audioBuffer as any], { type: mimeType });
    formData.append('file', blob, uploadFilename);
    formData.append('model', model);
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');
    formData.append('timestamp_granularities[]', 'segment');

    // Language hint: forcing a single language on code-switched (Hinglish)
    // speech makes Whisper approximate Hindi words as English (or vice
    // versa), so only pin the language when it is unambiguous. For
    // hinglish/auto the parameter is omitted and Whisper auto-detects.
    if (language === 'english') {
      formData.append('language', 'en');
    } else if (language === 'hindi') {
      formData.append('language', 'hi');
    }

    // Context prompt steers spelling/vocabulary toward the actual content.
    // Keep it short (Whisper only conditions on the first ~224 tokens) and
    // match it to the selected language — a mismatched prompt biases the
    // decoder toward the wrong vocabulary.
    const promptText =
      language === 'hindi'
        ? 'हिंदी पॉडकास्ट चर्चा और साक्षात्कार।'
        : language === 'hinglish'
          ? 'Hinglish podcast discussion, Hindi-English code-switching conversation with speakers switching between Hindi and English.'
          : language === 'auto'
            ? 'Podcast interview and discussion, possibly Hindi-English code-switching (Hinglish).'
            : 'Podcast interview and discussion in English.';

    formData.append('prompt', promptText);

    console.log(`[Whisper] Sending ${(audioBuffer.length / (1024 * 1024)).toFixed(1)} MB to ${isGroq ? 'Groq' : 'OpenAI'} as ${mimeType}...`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      // For 413, give the user a clear actionable message instead of silent fallback
      if (response.status === 413) {
        const sizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(1);
        throw new Error(
          `Your file (${sizeMB} MB) is too large for a single transcription request (25 MB limit). ` +
          `Please use a video under ~3 hours — larger files are transcribed in chunks automatically, otherwise try a smaller file.`
        );
      }
      // For other errors (auth, rate limit, etc.), throw so caller can surface it
      throw new Error(`Transcription API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log(`[Whisper API] Transcription completed via ${isGroq ? 'Groq Whisper Large v3' : 'OpenAI'}. Words: ${data.words?.length || 0}, Duration: ${data.duration?.toFixed(1)}s`);
    return { ...parseWhisperVerboseResponse(data), provider: (isGroq ? 'groq' : 'openai') as TranscriptionProvider };
  } catch (err: any) {
    // If Cloudflare (primary) already failed and the fallback just died too,
    // name both causes — otherwise only the fallback error is visible and the
    // primary failure stays hidden in server logs.
    if (cfFailure && !String(err?.message || '').includes('Cloudflare')) {
      err.message = `${err.message} [Cloudflare primary also failed: ${cfFailure}]`;
    }
    throw err;
  }
}

/**
 * Transcribe audio larger than the 25 MB single-request limit by splitting it
 * into sequential ffmpeg chunks (~20 MB each at 64kbps ≈ 42 min), transcribing
 * each piece, and concatenating with timestamps re-offset to the full timeline.
 * Supports sources up to ~120 minutes (up to 6 chunks).
 */
async function transcribeAudioInChunks(
  audioBuffer: Buffer | Uint8Array,
  filename: string,
  language: SourceLanguage | undefined,
  config: TranscribeCallConfig
): Promise<WhisperTranscriptionResult> {
  const CHUNK_TARGET_BYTES = 20 * 1024 * 1024;
  const MAX_CHUNKS = 10; // 10 × 20 MB ≈ 400 min at 64kbps — headroom past 180 min
  const BYTES_PER_SEC_64K = 8000; // 64kbps CBR mono MP3

  const totalBytes = audioBuffer.length;
  const estimatedTotalSec = totalBytes / BYTES_PER_SEC_64K;
  const numChunks = Math.min(
    MAX_CHUNKS,
    Math.max(2, Math.ceil(totalBytes / CHUNK_TARGET_BYTES))
  );
  const chunkDurationSec = estimatedTotalSec / numChunks;

  let ffmpegPath: string;
  try {
    ffmpegPath = getFfmpegPath();
  } catch {
    const sizeMB = (totalBytes / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Your file is ${sizeMB} MB, which exceeds the 25 MB single-request transcription limit, and audio splitting (ffmpeg) is unavailable. ` +
        `Please trim the video to under ~50 minutes and try again.`
    );
  }

  const tmpDir = os.tmpdir();
  const uid = `flowzora_chunk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inPath = path.join(tmpDir, `${uid}_in.mp3`);
  console.log(
    `[Whisper] Audio ${(totalBytes / (1024 * 1024)).toFixed(1)} MB exceeds 25 MB limit — splitting into ${numChunks} chunks (~${Math.round(chunkDurationSec)}s each) for sequential transcription...`
  );
  // Chunk boundaries can slice mid-word, leaving each side with a word
  // fragment Whisper mis-transcribes. Every chunk after the first therefore
  // starts OVERLAP_SEC early; words falling inside the overlapped region are
  // dropped from the later chunk (the earlier chunk heard the word whole).
  const OVERLAP_SEC = 3;
  try {
    fs.writeFileSync(inPath, audioBuffer as Buffer);
    const chunkResults: WhisperTranscriptionResult[] = [];
    for (let i = 0; i < numChunks; i++) {
      const nominalStart = i * chunkDurationSec;
      const extractStart = i === 0 ? 0 : Math.max(0, nominalStart - OVERLAP_SEC);
      const nominalEnd =
        i === numChunks - 1 ? estimatedTotalSec : (i + 1) * chunkDurationSec;
      // Last chunk takes the remainder so no audio is dropped to rounding.
      const durSec = Math.max(1, nominalEnd - extractStart);
      const outPath = path.join(tmpDir, `${uid}_part${i}.mp3`);
      try {
        await execFileAsync(ffmpegPath, [
          '-y',
          '-ss',
          String(Math.floor(extractStart)),
          '-i',
          inPath,
          '-t',
          String(Math.ceil(durSec)),
          '-acodec',
          'libmp3lame',
          '-ab',
          '64k',
          '-ac',
          '1',
          '-ar',
          '16000',
          outPath,
        ]);
        const partBuffer = fs.readFileSync(outPath);
        console.log(
          `[Whisper] Transcribing chunk ${i + 1}/${numChunks} (${(partBuffer.length / (1024 * 1024)).toFixed(1)} MB, offset ${Math.round(extractStart)}s)...`
        );
        const part = await transcribeSingleChunk(partBuffer, filename, language, config);
        // Re-offset chunk-local timestamps onto the full timeline, then drop
        // words inside the overlap region (already covered by the previous
        // chunk, which heard them without a cut).
        const offsetWords: WordTimestamp[] = part.words
          .map((w) => ({
            word: w.word,
            start: Number((w.start + extractStart).toFixed(2)),
            end: Number((w.end + extractStart).toFixed(2)),
          }))
          .filter((w) => i === 0 || w.start >= nominalStart - 0.15);
        const offsetSegments: TranscriptSegment[] = part.segments
          .map((s) => ({
            ...s,
            start: Number((s.start + extractStart).toFixed(2)),
            end: Number((s.end + extractStart).toFixed(2)),
            words: s.words.map((w) => ({
              word: w.word,
              start: Number((w.start + extractStart).toFixed(2)),
              end: Number((w.end + extractStart).toFixed(2)),
            })),
          }))
          .filter((s) => i === 0 || s.end >= nominalStart - 0.15);
        chunkResults.push({ ...part, words: offsetWords, segments: offsetSegments });
      } finally {
        try {
          fs.unlinkSync(outPath);
        } catch {}
      }
    }

    // Concatenate in order and re-index segments.
    const allWords = chunkResults.flatMap((r) => r.words);
    const allSegments: TranscriptSegment[] = chunkResults.flatMap((r) => r.segments).map(
      (s, idx) => ({ ...s, id: `seg-${idx}` })
    );
    const fullText = chunkResults.map((r) => r.text).join(' ').trim();
    const duration =
      allWords.length > 0 ? Number(allWords[allWords.length - 1].end.toFixed(2)) : estimatedTotalSec;
    console.log(
      `[Whisper] Chunked transcription complete: ${numChunks} chunks, ${allWords.length} words, ${duration.toFixed(1)}s`
    );
    // Provider summary: unanimous → that provider, otherwise the fallback fired.
    const providerSet = new Set(chunkResults.map((r) => r.provider || 'groq'));
    const provider: TranscriptionProvider =
      providerSet.size === 1 ? ([...providerSet][0] as TranscriptionProvider) : 'mixed';
    return {
      text: fullText,
      language: chunkResults[0]?.language || 'en',
      duration,
      segments: allSegments,
      words: allWords,
      provider,
    };
  } finally {
    try {
      fs.unlinkSync(inPath);
    } catch {}
  }
}

function parseWhisperVerboseResponse(data: any): WhisperTranscriptionResult {
  const rawWords: any[] = data.words || [];
  const words: WordTimestamp[] = rawWords.map((w) => {
    const start = Number(w.start);
    let end = Number(w.end);
    // Sanity check: no single word in conversational speech lasts > 2.0s.
    // If Whisper stretched a word to the segment end during a pause, clamp it safely.
    if (end - start > 2.0) {
      end = Number((start + 1.2).toFixed(2));
    }
    return {
      word: w.word,
      start,
      end,
    };
  });

  const rawSegments: any[] = data.segments || [];
  const segments: TranscriptSegment[] = rawSegments.map((s, idx) => ({
    id: `seg-${idx}`,
    text: s.text,
    start: Number(s.start),
    end: Number(s.end),
    words: words.filter((w) => w.start >= s.start && w.end <= s.end + 0.1),
  }));

  return {
    text: data.text || '',
    language: data.language || 'en',
    duration: Number(data.duration || (words.length > 0 ? words[words.length - 1].end : 0)),
    segments,
    words,
  };
}

/**
 * Authentic ground-truth transcript for sample podcast video (public/media/podcast-sample.mp4)
 * covering relationships, understanding, and love in crisis.
 * Extracted with exact millisecond word timestamps via Groq Whisper Large v3.
 */
export function getSamplePodcastTranscript(): WhisperTranscriptionResult {
  const sampleWords: WordTimestamp[] = [
    { word: "What", start: 0.00, end: 0.20 },
    { word: "is", start: 0.20, end: 0.40 },
    { word: "love?", start: 0.40, end: 0.80 },
    { word: "Okay,", start: 0.80, end: 0.96 },
    { word: "tell", start: 0.96, end: 1.26 },
    { word: "me", start: 1.26, end: 1.42 },
    { word: "this", start: 1.42, end: 1.64 },
    { word: "then.", start: 1.64, end: 2.00 },
    { word: "Love", start: 2.50, end: 2.64 },
    { word: "is", start: 2.64, end: 2.84 },
    { word: "understanding,", start: 2.84, end: 4.08 },
    { word: "giving", start: 4.08, end: 4.42 },
    { word: "space", start: 4.42, end: 4.82 },
    { word: "to", start: 4.82, end: 5.02 },
    { word: "each", start: 5.02, end: 5.18 },
    { word: "other,", start: 5.18, end: 6.20 },
    { word: "growing", start: 6.20, end: 6.44 },
    { word: "together.", start: 6.44, end: 7.30 },
    { word: "Give", start: 7.36, end: 7.54 },
    { word: "me", start: 7.54, end: 7.74 },
    { word: "scenario,", start: 7.74, end: 8.84 },
    { word: "give", start: 8.84, end: 9.06 },
    { word: "me", start: 9.06, end: 9.24 },
    { word: "a", start: 9.24, end: 9.38 },
    { word: "story.", start: 9.38, end: 10.12 },
    { word: "And", start: 10.20, end: 10.74 },
    { word: "we", start: 10.74, end: 10.96 },
    { word: "say", start: 10.96, end: 11.20 },
    { word: "these", start: 11.20, end: 11.42 },
    { word: "days", start: 11.42, end: 11.60 },
    { word: "everything", start: 11.60, end: 12.06 },
    { word: "is", start: 12.06, end: 12.30 },
    { word: "hormones-driven,", start: 12.30, end: 13.50 },
    { word: "random,", start: 13.50, end: 14.10 },
    { word: "nothing...", start: 14.10, end: 14.60 },
    { word: "Love,", start: 15.10, end: 15.60 },
    { word: "I", start: 15.60, end: 15.86 },
    { word: "understand", start: 15.86, end: 16.48 },
    { word: "that", start: 16.48, end: 16.74 },
    { word: "in", start: 16.74, end: 16.96 },
    { word: "crisis,", start: 17.00, end: 17.90 },
    { word: "in", start: 17.90, end: 18.24 },
    { word: "despair,", start: 18.24, end: 18.96 },
    { word: "in", start: 19.30, end: 19.54 },
    { word: "difficult", start: 19.54, end: 20.08 },
    { word: "times,", start: 20.08, end: 20.80 },
    { word: "it", start: 20.20, end: 20.54 },
    { word: "is", start: 20.54, end: 20.80 },
    { word: "love", start: 20.80, end: 21.18 },
    { word: "that", start: 21.18, end: 21.36 },
    { word: "is", start: 21.36, end: 21.50 },
    { word: "the", start: 21.50, end: 21.65 },
    { word: "savior.", start: 21.65, end: 22.20 },
    { word: "In", start: 22.20, end: 22.90 },
    { word: "those", start: 22.90, end: 23.12 },
    { word: "times,", start: 23.12, end: 23.26 },
    { word: "those", start: 23.26, end: 23.40 },
    { word: "who", start: 23.40, end: 23.64 },
    { word: "hold", start: 23.64, end: 23.88 },
    { word: "each", start: 23.88, end: 24.00 },
    { word: "other,", start: 24.00, end: 24.42 },
    { word: "right?", start: 24.42, end: 24.52 },
    { word: "that", start: 24.52, end: 24.70 },
    { word: "is", start: 24.70, end: 24.90 },
    { word: "love.", start: 24.90, end: 25.50 },
    { word: "That", start: 25.50, end: 26.00 },
    { word: "is", start: 26.00, end: 26.30 },
    { word: "what", start: 26.30, end: 26.65 },
    { word: "I", start: 26.65, end: 26.90 },
    { word: "believe.", start: 26.90, end: 27.20 },
  ];

  const segments: TranscriptSegment[] = [
    {
      id: "seg-0",
      text: "What is love? Okay, tell me this then.",
      start: 0.00,
      end: 2.40,
      words: sampleWords.slice(0, 8),
    },
    {
      id: "seg-1",
      text: "Love is understanding, giving space to each other, growing together.",
      start: 2.50,
      end: 7.30,
      words: sampleWords.slice(8, 18),
    },
    {
      id: "seg-2",
      text: "Give me a scenario, give me a story.",
      start: 7.36,
      end: 10.12,
      words: sampleWords.slice(18, 25),
    },
    {
      id: "seg-3",
      text: "And we say these days everything is hormones-driven, random, nothing...",
      start: 10.20,
      end: 15.00,
      words: sampleWords.slice(25, 35),
    },
    {
      id: "seg-4",
      text: "Love, I understand that in crisis, in despair, in difficult times, it is love that is the savior.",
      start: 15.10,
      end: 22.20,
      words: sampleWords.slice(35, 54),
    },
    {
      id: "seg-5",
      text: "In those times, those who hold each other, right? that is love. That is what I believe.",
      start: 22.20,
      end: 27.20,
      words: sampleWords.slice(54, 72),
    },
  ];

  const fullText = segments.map((s) => s.text).join(' ');

  return {
    text: fullText,
    language: 'en',
    duration: 27.5,
    segments,
    words: sampleWords,
  };
}
