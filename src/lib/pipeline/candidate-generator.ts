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
const MIN_CLIP_DURATION_SEC = 15;
const MAX_CLIP_DURATION_SEC = 35;
const TARGET_STRIDE_SEC = 12;

/**
 * Generates sliding-window candidate segments aligned to natural semantic sentence and pause boundaries.
 * Explicitly avoids naive fixed-interval slicing (generic other tools' limitation).
 * Enforces strict hard ceiling: all generated clips are <= 35 seconds long.
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
        // Prefer natural punctuation ending over mere pause if possible (between 20s and 35s)
        if (boundaries[j].isPunctuation && duration >= 22) {
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
    } else {
      // If no boundary matched within [MIN, MAX], find the last word that fits within MAX_CLIP_DURATION_SEC
      let fallbackWordIdx = -1;
      for (let k = startWordIdx; k < words.length; k++) {
        if (words[k].end - startSec <= MAX_CLIP_DURATION_SEC) {
          fallbackWordIdx = k;
        } else {
          break;
        }
      }
      if (fallbackWordIdx !== -1 && (words[fallbackWordIdx].end - startSec) >= MIN_CLIP_DURATION_SEC) {
        const endWordIdx = fallbackWordIdx;
        const endSec = words[endWordIdx].end;
        const clipWords = words.slice(startWordIdx, endWordIdx + 1);
        const clipText = clipWords.map((w) => w.word).join(' ');
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
          snappedToBoundary: false,
        });
      }
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

  // Fallback 1: If strict boundary snapping found no clips, generate standard slice <= 35s
  if (candidates.length === 0 && totalDuration >= MIN_CLIP_DURATION_SEC) {
    const chunkDur = Math.min(MAX_CLIP_DURATION_SEC, totalDuration);
    const sliceWords = words.filter((w) => w.end <= chunkDur);
    const finalWords = sliceWords.length > 0 ? sliceWords : words.slice(0, 25);
    const finalDur = finalWords.length > 0 ? finalWords[finalWords.length - 1].end : chunkDur;
    candidates.push({
      id: 'candidate-0',
      startTime: 0,
      endTime: Number(finalDur.toFixed(2)),
      duration: Number(finalDur.toFixed(2)),
      text: finalWords.map((w) => w.word).join(' '),
      words: finalWords,
      firstSentence: finalWords.slice(0, 15).map((w) => w.word).join(' '),
      lastSentence: finalWords.slice(-15).map((w) => w.word).join(' '),
      snappedToBoundary: false,
    });
  }

  // Fallback 2: Audio with words shorter than MIN_CLIP_DURATION_SEC
  if (candidates.length === 0 && words.length > 0) {
    const chunkDur = Math.min(MAX_CLIP_DURATION_SEC, totalDuration || words[words.length - 1].end);
    const sliceWords = words.filter((w) => w.end <= chunkDur);
    const finalDur = sliceWords.length > 0 ? sliceWords[sliceWords.length - 1].end : chunkDur;
    candidates.push({
      id: 'candidate-0',
      startTime: 0,
      endTime: Number(finalDur.toFixed(2)),
      duration: Number(finalDur.toFixed(2)),
      text: sliceWords.map((w) => w.word).join(' '),
      words: sliceWords,
      firstSentence: sliceWords.slice(0, 10).map((w) => w.word).join(' '),
      lastSentence: sliceWords.slice(-10).map((w) => w.word).join(' '),
      snappedToBoundary: false,
    });
  }

  // Absolute safety invariant: Hard cap every candidate to maximum 35 seconds
  return candidates.map((c) => {
    if (c.duration > MAX_CLIP_DURATION_SEC) {
      const clampedEnd = Number((c.startTime + MAX_CLIP_DURATION_SEC).toFixed(2));
      const clampedWords = c.words.filter((w) => w.end <= clampedEnd);
      return {
        ...c,
        endTime: clampedEnd,
        duration: MAX_CLIP_DURATION_SEC,
        words: clampedWords.length > 0 ? clampedWords : c.words,
        text: (clampedWords.length > 0 ? clampedWords : c.words).map((w) => w.word).join(' '),
      };
    }
    return c;
  });
}
