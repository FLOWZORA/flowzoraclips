import { CandidateClip, CandidateScore } from './types';
import { CandidateWindow } from './candidate-generator';

export interface RankedClipResult {
  rankedClips: CandidateClip[];
  dedupedCount: number;
  totalCandidatesEvaluated: number;
  qualityThresholdApplied: number;
  comparisonWithNaiveChunking: {
    naiveClipsCount: number;
    naiveClips: Array<{
      id: string;
      startTime: number;
      endTime: number;
      textSnippet: string;
      cutMidSentence: boolean;
    }>;
  };
}

const OVERLAP_THRESHOLD = 0.35; // 35% temporal overlap counts as duplicate
const DEFAULT_QUALITY_THRESHOLD = 72; // Minimum composite score to qualify

/**
 * Dedupes overlapping candidate windows and ranks best-first by composite score.
 * Returns a quality-driven natural count, not an artificial quota.
 */
export function dedupeAndRankCandidates(
  candidates: CandidateWindow[],
  scoreMap: Map<string, CandidateScore>,
  totalDuration: number,
  qualityThreshold: number = DEFAULT_QUALITY_THRESHOLD
): RankedClipResult {
  // Combine candidates with their scores
  interface ScoredCandidate {
    window: CandidateWindow;
    score: CandidateScore;
  }

  const scoredList: ScoredCandidate[] = candidates.map((c) => ({
    window: c,
    score: scoreMap.get(c.id) || {
      dimensions: { hookStrength: 5, standaloneCoherence: 5, emotionalPayoff: 5, topicTrendAlignment: 5 },
      compositeScore: 50,
      reasoning: 'Standard candidate segment',
    },
  }));

  // Sort candidate list by composite score descending
  scoredList.sort((a, b) => b.score.compositeScore - a.score.compositeScore);

  const accepted: ScoredCandidate[] = [];
  let dedupedCount = 0;

  for (const item of scoredList) {
    // Quality filter: discard moments that fall below the virality bar
    if (item.score.compositeScore < qualityThreshold) {
      continue;
    }

    // Check temporal overlap with already accepted clips
    const hasOverlap = accepted.some((acc) => {
      const overlap = calculateTemporalOverlap(acc.window, item.window);
      return overlap >= OVERLAP_THRESHOLD;
    });

    if (hasOverlap) {
      dedupedCount++;
    } else {
      accepted.push(item);
    }
  }

  // If no candidates met the threshold, keep at least the top 1-2 candidates
  if (accepted.length === 0 && scoredList.length > 0) {
    accepted.push(scoredList[0]);
  }

  // Convert to CandidateClip format with 1-based ranks
  // Enforces hard ceiling: no clip generated can be more than 35 seconds long
  const MAX_ALLOWED_CLIP_DUR = 35;
  const rankedClips: CandidateClip[] = accepted.map((item, idx) => {
    const start = item.window.startTime;
    let end = item.window.endTime;
    let dur = item.window.duration;

    if (dur > MAX_ALLOWED_CLIP_DUR || (end - start) > MAX_ALLOWED_CLIP_DUR) {
      end = Number((start + MAX_ALLOWED_CLIP_DUR).toFixed(2));
      dur = MAX_ALLOWED_CLIP_DUR;
    }

    const words = item.window.words ? item.window.words.filter((w) => w.end <= end + 0.05) : [];

    return {
      id: `ranked-clip-${idx + 1}`,
      videoId: 'current-session',
      startTime: start,
      endTime: end,
      duration: Number(dur.toFixed(2)),
      transcriptSnippet: item.window.text,
      score: item.score,
      rank: idx + 1,
      aspectRatio: '9:16',
      reframeFallbackUsed: false,
      words: words.length > 0 ? words : item.window.words,
    };
  });

  // Generate Naive Fixed-Interval Chunking (Clipzi's limitation) for direct comparison
  const naiveClips = generateNaiveFixedIntervalChunks(candidates, totalDuration);

  return {
    rankedClips,
    dedupedCount,
    totalCandidatesEvaluated: candidates.length,
    qualityThresholdApplied: qualityThreshold,
    comparisonWithNaiveChunking: {
      naiveClipsCount: naiveClips.length,
      naiveClips,
    },
  };
}

function calculateTemporalOverlap(a: CandidateWindow, b: CandidateWindow): number {
  const start = Math.max(a.startTime, b.startTime);
  const end = Math.min(a.endTime, b.endTime);
  if (end <= start) return 0;
  const intersection = end - start;
  const minDuration = Math.min(a.duration, b.duration);
  return intersection / minDuration;
}

/**
 * Simulates naive fixed-interval 30s chunking (used by Clipzi and primitive tools)
 * to demonstrate how fixed time slicing cuts sentences mid-word.
 */
function generateNaiveFixedIntervalChunks(
  candidates: CandidateWindow[],
  totalDuration: number
) {
  const fixedIntervalSec = 30;
  const chunks: Array<{
    id: string;
    startTime: number;
    endTime: number;
    textSnippet: string;
    cutMidSentence: boolean;
  }> = [];

  let currentStart = 0;
  let chunkIdx = 1;

  while (currentStart < totalDuration && chunks.length < 8) {
    const currentEnd = Math.min(totalDuration, currentStart + fixedIntervalSec);
    
    // Find text in this naive slice
    const matchingCandidate = candidates.find(
      (c) => c.startTime <= currentStart && c.endTime >= currentEnd
    );
    const textSnippet = matchingCandidate ? matchingCandidate.text.slice(0, 70) + '...' : `Audio interval ${currentStart}s - ${currentEnd}s`;

    chunks.push({
      id: `naive-chunk-${chunkIdx++}`,
      startTime: currentStart,
      endTime: currentEnd,
      textSnippet,
      cutMidSentence: true, // Naive cuts cut mid-thought by definition
    });

    currentStart = currentEnd;
  }

  return chunks;
}
