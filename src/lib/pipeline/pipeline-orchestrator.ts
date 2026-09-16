import { SourceLanguage, ScriptPreference } from './types';
import { transcribeAudio, WhisperTranscriptionResult } from './whisper';
import { detectAndAnnotateFillers, FillerDetectionReport } from './filler-detect';
import { generateCandidateSegments, CandidateWindow } from './candidate-generator';
import { scoreCandidatesBatch } from './gemini-scorer';
import { dedupeAndRankCandidates, RankedClipResult } from './ranker';

export interface PipelineExecutionOptions {
  audioBuffer?: Buffer | Uint8Array;
  filename?: string;
  sourceText?: string;
  language?: SourceLanguage;
  scriptPreference?: ScriptPreference;
  qualityThreshold?: number;
}

export interface PipelineExecutionResult {
  duration: number;
  language: SourceLanguage;
  scriptPreference: ScriptPreference;
  transcription: WhisperTranscriptionResult;
  fillerReport: FillerDetectionReport;
  candidatesGenerated: number;
  rankedResult: RankedClipResult;
}

/**
 * Master orchestrator for Step 2 text-only pipeline.
 * Chains: Transcription -> Filler Tagging -> Sentence Boundary Snapping -> Gemini Scoring -> Deduplication & Ranking.
 */
export async function runTextPipeline(
  options: PipelineExecutionOptions = {}
): Promise<PipelineExecutionResult> {
  const language = options.language || 'hinglish';
  const scriptPreference = options.scriptPreference || 'romanized';

  console.log(`[FLOWZORA Pipeline] Starting text-only pipeline for language=${language}, script=${scriptPreference}`);

  // Stage 1: Transcription with word-level timestamps (OpenAI Whisper)
  const transcription = await transcribeAudio(
    options.audioBuffer,
    options.filename || 'audio.mp3',
    language
  );
  console.log(`[FLOWZORA Pipeline] Transcription complete. Duration: ${transcription.duration}s, Words: ${transcription.words.length}`);

  // Stage 2: Filler-Word Flagging (English + Hindi/Hinglish)
  const fillerReport = detectAndAnnotateFillers(transcription.words, language);
  console.log(`[FLOWZORA Pipeline] Filler detection complete. Fillers found: ${fillerReport.fillerCount} (${fillerReport.fillerPercentage}%)`);

  // Stage 3: Semantic Candidate Segment Generation (Snapped to sentence boundaries)
  const candidates: CandidateWindow[] = generateCandidateSegments(
    transcription.segments,
    fillerReport.annotatedWords,
    transcription.duration
  );
  console.log(`[FLOWZORA Pipeline] Generated ${candidates.length} boundary-aligned candidate segments.`);

  // Stage 4: Structured Scoring via Gemini API (Gemini 2.5 Flash)
  console.log(`[FLOWZORA Pipeline] Scoring candidates across 4 dimensions via Gemini API...`);
  const scoreMap = await scoreCandidatesBatch(candidates, language);

  // Stage 5: Overlap Deduplication & Quality-Driven Ranking
  const rankedResult = dedupeAndRankCandidates(
    candidates,
    scoreMap,
    transcription.duration,
    options.qualityThreshold || 72
  );
  console.log(`[FLOWZORA Pipeline] Ranking complete: ${rankedResult.rankedClips.length} top clips returned (${rankedResult.dedupedCount} duplicates pruned).`);

  return {
    duration: transcription.duration,
    language,
    scriptPreference,
    transcription,
    fillerReport,
    candidatesGenerated: candidates.length,
    rankedResult,
  };
}
