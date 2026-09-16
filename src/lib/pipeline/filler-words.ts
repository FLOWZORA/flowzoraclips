/**
 * Filler-word detection dictionary for English and Hindi/Hinglish speech.
 * Used during transcript annotation to optionally trim fillers or clean captions.
 */

export const ENGLISH_FILLERS = new Set([
  'um',
  'uh',
  'er',
  'ah',
  'like',
  'you know',
  'basically',
  'actually',
  'literally',
  'sort of',
  'kind of',
  'i mean',
]);

export const HINDI_DEVANAGARI_FILLERS = new Set([
  'मतलब',
  'यार',
  'तो',
  'अरे',
  'जैसे',
  'जैसे कि',
  'वगैरह',
  'समझे',
  'हाँ',
  'ना',
]);

export const HINGLISH_ROMANIZED_FILLERS = new Set([
  'matlab',
  'yaar',
  'toh',
  'to',
  'arey',
  'jaise',
  'jaise ki',
  'vagairah',
  'vagerah',
  'samjhe',
  'na',
  'haan',
  'like',
  'basically',
  'actually',
]);

export function isFillerWord(word: string, language: 'hindi' | 'hinglish' | 'english' | 'auto'): boolean {
  const normalized = word.trim().toLowerCase().replace(/^[^\w\u0900-\u097F]+|[^\w\u0900-\u097F]+$/g, '');
  if (!normalized) return false;

  if (language === 'english') {
    return ENGLISH_FILLERS.has(normalized);
  }

  if (language === 'hindi') {
    return HINDI_DEVANAGARI_FILLERS.has(normalized) || ENGLISH_FILLERS.has(normalized);
  }

  // Hinglish or Auto: check all sets
  return (
    ENGLISH_FILLERS.has(normalized) ||
    HINGLISH_ROMANIZED_FILLERS.has(normalized) ||
    HINDI_DEVANAGARI_FILLERS.has(normalized)
  );
}
