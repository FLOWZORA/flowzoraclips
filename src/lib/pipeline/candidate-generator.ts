import { TranscriptSegment, WordTimestamp } from './types';

export interface CandidateWindow {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  text: string;
  words: WordTimestamp[];
  firstSentence: string;
  lastSentence: string;
  snappedToBoundary: boolean;
}

const SENTENCE_END_REGEX = /[.?!।|]\s*$/;
const MIN_CLIP_DURATION_SEC = 28;
const MAX_CLIP_DURATION_SEC = 85;
const TARGET_STRIDE_SEC = 15;

/**
 * Generates sliding-window candidate segments aligned to natural semantic sentence and pause boundaries.
 * Explicitly avoids naive fixed-interval slicing (Clipzi's limitation).
 */
export function generateCandidateSegments(
  segments: TranscriptSegment[],
  words: WordTimestamp[],
  totalDuration: number
): CandidateWindow[] {
  if (!words || words.length === 0) return [];

  // 1. Identify all semantic boundary points (sentence ends or pauses >0.55s)
  interface BoundaryPoint {
    wordIndex: number;
    timestamp: number;
    textBefore: string;
    isPunctuation: boolean;
  }

  const boundaries: BoundaryPoint[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const isPunct = SENTENCE_END_REGEX.test(w.word);
    const hasLongPause = i < words.length - 1 && words[i + 1].start - w.end >= 0.55;

    if (isPunct || hasLongPause || i === words.length - 1) {
      boundaries.push({
        wordIndex: i,
        timestamp: w.end,
        textBefore: w.word,
        isPunctuation: isPunct,
      });
    }
  }

  const candidates: CandidateWindow[] = [];
  let candidateIndex = 0;

  // 2. Iterate sliding window start points
  let currentStartBoundaryIdx = 0;

  while (currentStartBoundaryIdx < boundaries.length) {
    // Start of the clip is the word immediately following the previous boundary (or word 0)
    const startWordIdx = currentStartBoundaryIdx === 0 ? 0 : boundaries[currentStartBoundaryIdx - 1].wordIndex + 1;
    if (startWordIdx >= words.length) break;

    const startSec = words[startWordIdx].start;

    // Search forward for valid ending boundaries within [MIN_CLIP_DURATION_SEC, MAX_CLIP_DURATION_SEC]
    let bestEndBoundaryIdx = -1;

    for (let j = currentStartBoundaryIdx; j < boundaries.length; j++) {
      const endSec = boundaries[j].timestamp;
      const duration = endSec - startSec;

      if (duration >= MIN_CLIP_DURATION_SEC && duration <= MAX_CLIP_DURATION_SEC) {
        bestEndBoundaryIdx = j;
        // Prefer natural punctuation ending over mere pause if possible
        if (boundaries[j].isPunctuation && duration >= 35) {
          break;
        }
      } else if (duration > MAX_CLIP_DURATION_SEC) {
        break;
      }
    }

    if (bestEndBoundaryIdx !== -1) {
      const endWordIdx = boundaries[bestEndBoundaryIdx].wordIndex;
      const endSec = boundaries[bestEndBoundaryIdx].timestamp;
      const clipWords = words.slice(startWordIdx, endWordIdx + 1);
      const clipText = clipWords.map((w) => w.word).join(' ');

      // Split into sentences for hook and payoff analysis
      const sentences = clipText.split(/(?<=[.?!।|])\s+/).filter(Boolean);
      const firstSentence = sentences[0] || clipText.slice(0, 80);
      const lastSentence = sentences[sentences.length - 1] || clipText.slice(-80);

      candidates.push({
        id: `candidate-${candidateIndex++}`,
        startTime: Number(startSec.toFixed(2)),
        endTime: Number(endSec.toFixed(2)),
        duration: Number((endSec - startSec).toFixed(2)),
        text: clipText,
        words: clipWords,
        firstSentence,
        lastSentence,
        snappedToBoundary: true,
      });
    }

    // Step forward by approximate TARGET_STRIDE_SEC
    let nextBoundaryIdx = currentStartBoundaryIdx + 1;
    while (
      nextBoundaryIdx < boundaries.length &&
      boundaries[nextBoundaryIdx].timestamp - startSec < TARGET_STRIDE_SEC
    ) {
      nextBoundaryIdx++;
    }

    if (nextBoundaryIdx <= currentStartBoundaryIdx) {
      currentStartBoundaryIdx++;
    } else {
      currentStartBoundaryIdx = nextBoundaryIdx;
    }
  }

  // Fallback: If strict boundary snapping found fewer than 2 clips (e.g. monologue with no punctuation),
  // generate standard semantic slices
  if (candidates.length === 0 && totalDuration >= MIN_CLIP_DURATION_SEC) {
    const chunkDur = Math.min(60, totalDuration);
    candidates.push({
      id: 'candidate-0',
      startTime: 0,
      endTime: chunkDur,
      duration: chunkDur,
      text: words.map((w) => w.word).join(' '),
      words,
      firstSentence: words.slice(0, 15).map((w) => w.word).join(' '),
      lastSentence: words.slice(-15).map((w) => w.word).join(' '),
      snappedToBoundary: false,
    });
  }

  return candidates;
}
