export type SourceLanguage = 'hindi' | 'hinglish' | 'english' | 'auto';
export type ScriptPreference = 'devanagari' | 'romanized' | 'english';
export type AspectRatio = '9:16' | '1:1' | '16:9';

export type JobStage =
  | 'queued'
  | 'transcribing'
  | 'detecting_fillers'
  | 'generating_candidates'
  | 'scoring'
  | 'reframing'
  | 'captioning'
  | 'completed'
  | 'failed';

export interface WordTimestamp {
  word: string;
  start: number; // in seconds
  end: number;   // in seconds
  speaker?: string;
  isFiller?: boolean;
  devanagari?: string;
}

export interface TranscriptSegment {
  id: string;
  text: string;
  start: number;
  end: number;
  speaker?: string;
  words: WordTimestamp[];
}

export interface ScoreDimensions {
  hookStrength: number;        // 0 to 10
  standaloneCoherence: number; // 0 to 10
  emotionalPayoff: number;     // 0 to 10
  topicTrendAlignment: number; // 0 to 10
}

/** How a score was actually produced. */
export type ScoringEngine = 'gemini' | 'groq' | 'heuristic';

/** Why Gemini scoring was skipped, when it was. */
export type ScoringFallbackReason = 'no_api_key' | 'quota_exceeded' | 'api_error' | 'empty_response';

export interface CandidateScore {
  dimensions: ScoreDimensions;
  compositeScore: number;      // Calculated weighted score (0-100)
  reasoning: string;           // Transparent 1-line explanation of why this clip works
  scoringEngine: ScoringEngine;          // 'heuristic' means the AI ranking did NOT run
  fallbackReason?: ScoringFallbackReason; // present only when scoringEngine is 'heuristic'
  signalBonus?: number;        // zero-cost audio-signal boost (0-8) fused into compositeScore
}

/** Pipeline-level summary of whether AI ranking actually ran. */
export interface ScoringReport {
  engine: ScoringEngine | 'mixed';
  degraded: boolean;              // true when any clip fell back to heuristics
  geminiScored: number;
  groqScored: number;             // Gemini-quota backup via Groq LLM (still real AI ranking)
  heuristicScored: number;
  fallbackReason?: ScoringFallbackReason;
  message?: string;               // human-readable, safe to surface in a UI
}

export interface CandidateClip {
  id: string;
  videoId: string;
  startTime: number;
  endTime: number;
  duration: number;
  transcriptSnippet: string;
  score: CandidateScore;
  rank: number;
  aspectRatio: AspectRatio;
  reframeFallbackUsed: boolean;
  outputUrl?: string;
  thumbnailUrl?: string;
  words?: WordTimestamp[];
}

export interface VideoJob {
  id: string;
  userId: string;
  title: string;
  sourceType: 'upload' | 'youtube';
  sourceUrl: string;
  language: SourceLanguage;
  scriptPreference: ScriptPreference;
  durationSeconds: number;
  status: JobStage;
  costAccruedUsd: number;
  createdAt: string;
  updatedAt: string;
  clips?: CandidateClip[];
}
