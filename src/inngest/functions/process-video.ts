import { inngest, PROCESS_VIDEO_EVENT, ProcessVideoEventData } from '../client';
import { getJob, updateJob } from '@/lib/jobs/store';
import { getBufferFromR2, uploadBufferToR2 } from '@/lib/storage/r2';
import {
  extractAudioBuffer,
  isVideoFile,
  probeMediaDurationSec,
  splitAudioBufferIntoChunks,
} from '@/lib/pipeline/audio-extractor';
import {
  transcribeSingleChunk,
  resolveTranscriptionConfig,
  WhisperTranscriptionResult,
} from '@/lib/pipeline/whisper';
import { detectAndAnnotateFillers } from '@/lib/pipeline/filler-detect';
import { generateCandidateSegments, CandidateWindow } from '@/lib/pipeline/candidate-generator';
import {
  scoreCandidatesBatch,
  buildScoringReport,
  calculateHeuristicScore,
} from '@/lib/pipeline/gemini-scorer';
import { dedupeAndRankCandidates } from '@/lib/pipeline/ranker';
import { refundCreditOnFailure } from '@/lib/billing/credits';
import { recordApiSpend } from '@/lib/billing/kill-switch';
import { inMemoryClips } from '@/lib/pipeline/video-exporter';
import { CandidateScore, SourceLanguage, ScriptPreference } from '@/lib/pipeline/types';

const CHUNK_TARGET_BYTES = 20 * 1024 * 1024;
const MAX_CHUNKS = 10; // 10 × 20 MB ≈ 400 min at 64kbps — headroom past 180 min
const SCORE_BATCH_SIZE = 12;
/** Above this many candidates (multi-hour videos), heuristic-prefilter before Gemini. */
const GEMINI_CANDIDATE_CAP = 150;

/**
 * Background pipeline for long videos (up to ~3 hours). Each heavy unit is
 * its own step so every serverless invocation stays small: one audio chunk
 * transcribed per step, one 12-candidate batch scored per step. Large
 * intermediates (audio chunks, transcript) ride in R2 — never in step
 * payloads.
 */
export const processVideo = inngest.createFunction(
  { id: 'process-video', triggers: [{ event: PROCESS_VIDEO_EVENT }], retries: 2 },
  async ({ event, step }) => {
    const data = event.data as ProcessVideoEventData;
    const { jobId, userId, fileKey, filename } = data;
    const language = (data.language || 'auto') as SourceLanguage;
    const scriptPreference = (data.scriptPreference || 'romanized') as ScriptPreference;

    try {
      return await runProcessVideo(data, language, scriptPreference, step);
    } catch (err: any) {
      // Final attempt failed (retries exhausted): mark the job and refund.
      await updateJob(jobId, {
        status: 'failed',
        progress: 100,
        stageDetail: '',
        error: err?.message || 'Background processing failed. Your credit was refunded — please try again.',
      }).catch(() => {});
      await refundCreditOnFailure(userId, data.billingJobId).catch(() => {});
      throw err;
    }
  }
);

async function runProcessVideo(
  data: ProcessVideoEventData,
  language: SourceLanguage,
  scriptPreference: ScriptPreference,
  // Inngest step tools (contextually typed at the call site; kept loose here
  // so this helper stays decoupled from the Inngest generic machinery).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  step: any
): Promise<{ jobId: string; rankedCount: number }> {
  const { jobId, fileKey, filename } = data;

    // ---- Step 1: load media, extract audio, split into R2-backed chunks ----
    const prep = await step.run('load-media', async () => {
      await updateJob(jobId, { status: 'extracting', progress: 4, stageDetail: 'Extracting audio…' });
      const source = await getBufferFromR2(fileKey);
      if (!source || source.length === 0) {
        throw new Error('Could not retrieve media file from storage. Please re-upload and try again.');
      }

      let audioBuffer: Buffer;
      let audioFilename = filename;
      if (isVideoFile(filename)) {
        try {
          const extracted = await extractAudioBuffer(source, filename);
          audioBuffer = extracted.audioBuffer;
          audioFilename = extracted.audioFilename;
        } catch (extractErr: any) {
          throw new Error(`Audio extraction failed: ${extractErr.message}`);
        }
      } else {
        audioBuffer = source;
      }

      const probed = await probeMediaDurationSec(source, filename).catch(() => null);
      const { chunks, estimatedTotalSec } = await splitAudioBufferIntoChunks(audioBuffer, {
        chunkTargetBytes: CHUNK_TARGET_BYTES,
        maxChunks: MAX_CHUNKS,
      });
      const durationSec = probed && probed > 0 ? Math.round(probed) : Math.round(estimatedTotalSec);

      // Persist chunks to R2 so later steps (separate invocations) can fetch them.
      const chunkKeys: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const key = `jobs/${jobId}/chunk-${i}.mp3`;
        await uploadBufferToR2(key, chunks[i].buffer, 'audio/mpeg');
        chunkKeys.push(key);
      }
      await updateJob(jobId, {
        durationSec,
        progress: 8,
        stageDetail: `Audio ready — ${chunks.length} part${chunks.length > 1 ? 's' : ''} to transcribe…`,
      });
      return {
        chunkKeys,
        offsets: chunks.map((c) => Number(c.startSec.toFixed(2))),
        durationSec,
        audioFilename,
      };
    });

    // ---- Steps 2..N: transcribe one chunk per step (sequential, durable) ----
    const config = resolveTranscriptionConfig();
    if (!config.apiKey) {
      throw new Error(
        'Transcription API key is not configured. Please set GROQ_API_KEY (free) or OPENAI_API_KEY.'
      );
    }
    const numChunks = prep.chunkKeys.length;
    const chunkResults: WhisperTranscriptionResult[] = [];
    for (let i = 0; i < numChunks; i++) {
      const chunkKey = prep.chunkKeys[i];
      const nominalStart = prep.offsets[i];
      const part = await step.run(`transcribe-chunk-${i}`, async () => {
        const chunkBuffer = await getBufferFromR2(chunkKey);
        if (!chunkBuffer || chunkBuffer.length === 0) {
          throw new Error(`Missing audio chunk ${i + 1}/${numChunks} in storage.`);
        }
        const result = await transcribeSingleChunk(chunkBuffer, prep.audioFilename, language, config);
        // Re-offset onto the full timeline; drop words inside the overlap
        // region (covered by the previous chunk, which heard them whole).
        const words = result.words
          .map((w) => ({
            word: w.word,
            start: Number((w.start + nominalStart).toFixed(2)),
            end: Number((w.end + nominalStart).toFixed(2)),
          }))
          .filter((w) => i === 0 || w.start >= nominalStart - 0.15);
        const segments = result.segments
          .map((s) => ({
            ...s,
            start: Number((s.start + nominalStart).toFixed(2)),
            end: Number((s.end + nominalStart).toFixed(2)),
            words: s.words.map((w) => ({
              word: w.word,
              start: Number((w.start + nominalStart).toFixed(2)),
              end: Number((w.end + nominalStart).toFixed(2)),
            })),
          }))
          .filter((s) => i === 0 || s.end >= nominalStart - 0.15);
        return { ...result, words, segments };
      });
      chunkResults.push(part);
      await updateJob(jobId, {
        status: 'transcribing',
        progress: Math.round(8 + ((i + 1) / numChunks) * 52),
        stageDetail:
          numChunks > 1
            ? `Transcribing part ${i + 1} of ${numChunks}…`
            : 'Transcription complete — finding highlights…',
      });
    }

    // ---- Step: merge transcript, fillers, candidates (+ heuristic prefilter) ----
    const merged = await step.run('merge-transcript', async () => {
      const allWords = chunkResults.flatMap((r) => r.words);
      const allSegments = chunkResults.flatMap((r) => r.segments).map((s, idx) => ({ ...s, id: `seg-${idx}` }));
      const fullText = chunkResults.map((r) => r.text).join(' ').trim();
      const duration =
        allWords.length > 0
          ? Number(allWords[allWords.length - 1].end.toFixed(2))
          : prep.durationSec;
      const transcription: WhisperTranscriptionResult = {
        text: fullText,
        language: chunkResults[0]?.language || 'en',
        duration,
        segments: allSegments,
        words: allWords,
      };

      const fillerReport = detectAndAnnotateFillers(allWords, language);
      let candidates = generateCandidateSegments(allSegments, fillerReport.annotatedWords, duration);

      // A 3-hour video yields ~900 windows — far beyond what Gemini can score
      // in reasonable time/cost. Prefilter with the (free, instant) heuristic
      // engine and Gemini-score only the top slice. Short videos (≤ cap)
      // keep every candidate, unchanged behavior.
      let prefiltered = false;
      if (candidates.length > GEMINI_CANDIDATE_CAP) {
        const scored = candidates.map((c) => ({ c, s: calculateHeuristicScore(c).compositeScore }));
        scored.sort((a, b) => b.s - a.s);
        const keep = new Set(scored.slice(0, GEMINI_CANDIDATE_CAP).map((x) => x.c.id));
        candidates = candidates.filter((c) => keep.has(c.id));
        prefiltered = true;
      }

      // Stash the merged transcript in R2 — too large for step payloads.
      await uploadBufferToR2(
        `jobs/${jobId}/transcript.json`,
        Buffer.from(JSON.stringify({ transcription, fillerReport, candidates, prefiltered }), 'utf-8'),
        'application/json'
      );
      await updateJob(jobId, {
        status: 'scoring',
        progress: 64,
        stageDetail: `Scoring ${candidates.length} highlight candidates…`,
      });
      return { candidateCount: candidates.length, duration, prefiltered };
    });

    // ---- Steps: Gemini-score candidates in small batches ----
    const scoreEntries: Array<[string, CandidateScore]> = [];
    const numBatches = Math.ceil(merged.candidateCount / SCORE_BATCH_SIZE);
    for (let b = 0; b < numBatches; b++) {
      const batchIndex = b;
      const entries = await step.run(`score-batch-${b}`, async () => {
        const stored = await getBufferFromR2(`jobs/${jobId}/transcript.json`);
        if (!stored) throw new Error('Missing transcript in storage.');
        const { candidates } = JSON.parse(stored.toString('utf-8')) as {
          candidates: CandidateWindow[];
        };
        const slice = candidates.slice(batchIndex * SCORE_BATCH_SIZE, (batchIndex + 1) * SCORE_BATCH_SIZE);
        const scoreMap = await scoreCandidatesBatch(slice, language);
        return [...scoreMap.entries()];
      });
      scoreEntries.push(...entries);
      await updateJob(jobId, {
        status: 'scoring',
        progress: Math.round(64 + ((b + 1) / Math.max(1, numBatches)) * 26),
        stageDetail: `Scoring highlights (batch ${b + 1} of ${numBatches})…`,
      });
    }

    // ---- Step: rank, persist result, settle billing ----
    const final = await step.run('finalize', async () => {
      const stored = await getBufferFromR2(`jobs/${jobId}/transcript.json`);
      if (!stored) throw new Error('Missing transcript in storage.');
      const { transcription, fillerReport, candidates } = JSON.parse(stored.toString('utf-8')) as {
        transcription: WhisperTranscriptionResult;
        fillerReport: ReturnType<typeof detectAndAnnotateFillers>;
        candidates: CandidateWindow[];
      };
      const scoreMap = new Map<string, CandidateScore>(scoreEntries);
      const scoring = buildScoringReport(scoreMap.values());
      const rankedResult = dedupeAndRankCandidates(candidates, scoreMap, transcription.duration, 72);

      for (const c of rankedResult.rankedClips) {
        inMemoryClips.set(c.id, c);
      }

      const result = {
        duration: transcription.duration,
        language,
        scriptPreference,
        transcription,
        fillerReport,
        candidatesGenerated: candidates.length,
        rankedResult,
        scoring,
      };
      const resultKey = `jobs/${jobId}/result.json`;
      await uploadBufferToR2(resultKey, Buffer.from(JSON.stringify(result), 'utf-8'), 'application/json');

      const isGroq = Boolean(
        process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.includes('YourGroqApiKey')
      );
      const durationMinutes = (transcription.duration || 60) / 60;
      const estimatedCostUsd = Number((durationMinutes * (isGroq ? 0 : 0.006) + 0.0005).toFixed(4));
      await recordApiSpend(estimatedCostUsd).catch(() => {});

      return { rankedCount: rankedResult.rankedClips.length, resultKey };
    });

    await updateJob(jobId, {
      status: 'completed',
      progress: 100,
      stageDetail: '',
      resultKey: final.resultKey,
    });

    return { jobId, rankedCount: final.rankedCount };
}
