import { WordTimestamp, SourceLanguage } from './types';
import { isFillerWord } from './filler-words';

export interface FillerDetectionReport {
  totalWords: number;
  fillerCount: number;
  fillerPercentage: number;
  annotatedWords: WordTimestamp[];
  detectedFillersSummary: Record<string, number>;
  cleanedText: string;
}

/**
 * Flags filler words in the transcript using word-level timestamps.
 * Covers both English ("um", "uh", "like") and Hindi/Hinglish ("मतलब", "यार", "तो", "actually", "basically").
 */
export function detectAndAnnotateFillers(
  words: WordTimestamp[],
  language: SourceLanguage = 'hinglish'
): FillerDetectionReport {
  let fillerCount = 0;
  const detectedSummary: Record<string, number> = {};

  const annotatedWords: WordTimestamp[] = words.map((w) => {
    const isFiller = isFillerWord(w.word, language);
    if (isFiller) {
      fillerCount++;
      const lower = w.word.toLowerCase();
      detectedSummary[lower] = (detectedSummary[lower] || 0) + 1;
    }
    return {
      ...w,
      isFiller,
    };
  });

  const totalWords = words.length;
  const fillerPercentage = totalWords > 0 ? Number(((fillerCount / totalWords) * 100).toFixed(1)) : 0;

  // Cleaned text omitting filler words for subtitle readability
  const cleanedText = annotatedWords
    .filter((w) => !w.isFiller)
    .map((w) => w.word)
    .join(' ');

  return {
    totalWords,
    fillerCount,
    fillerPercentage,
    annotatedWords,
    detectedFillersSummary: detectedSummary,
    cleanedText,
  };
}
