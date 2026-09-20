import { WordTimestamp, ScriptPreference } from './types';

export interface CaptionLine {
  id: string;
  start: number; // in seconds
  end: number;   // in seconds
  words: Array<{
    word: string;
    start: number;
    end: number;
    durationCs: number; // centiseconds (1/100th sec) for ASS karaoke
    isFiller?: boolean;
  }>;
  text: string;
}

export interface ASSSubtitleConfig {
  scriptPreference: ScriptPreference;
  fontSize?: number;
  highlightColorHex?: string; // e.g. '#10B981'
  textColorHex?: string;      // e.g. '#FFFFFF'
  outlineColorHex?: string;    // e.g. '#0A0B10'
  videoWidth?: number;
  videoHeight?: number;
  marginV?: number;
}

/**
 * Groups word-level timestamps into natural 3–5 word display lines for 9:16 vertical shorts.
 */
export function chunkWordsIntoCaptionLines(
  words: WordTimestamp[],
  maxWordsPerLine: number = 4
): CaptionLine[] {
  const lines: CaptionLine[] = [];
  let currentWords: WordTimestamp[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    currentWords.push(w);

    const isLastWordInList = i === words.length - 1;
    const hasPunctuation = /[.?!।|]/.test(w.word);
    const hasLongPauseAfter = i < words.length - 1 && words[i + 1].start - w.end >= 0.45;

    if (currentWords.length >= maxWordsPerLine || hasPunctuation || hasLongPauseAfter || isLastWordInList) {
      const lineStart = currentWords[0].start;
      const lineEnd = currentWords[currentWords.length - 1].end;

      const mappedWords = currentWords.map((item) => ({
        word: item.word,
        start: item.start,
        end: item.end,
        durationCs: Math.max(1, Math.round((item.end - item.start) * 100)),
        isFiller: item.isFiller,
      }));

      lines.push({
        id: `line-${lines.length + 1}`,
        start: lineStart,
        end: lineEnd,
        words: mappedWords,
        text: mappedWords.map((m) => m.word).join(' '),
      });

      currentWords = [];
    }
  }

  return lines;
}

/**
 * Converts a hex color string ('#RRGGBB') to ASS BGR format '&H00BBGGRR'.
 */
function hexToAssColor(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '&H00FFFFFF';
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

/**
 * Converts seconds to ASS timestamp format (H:MM:SS.cs).
 */
function secondsToAssTimestamp(sec: number): string {
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = Math.floor(sec % 60);
  const centiseconds = Math.floor((sec % 1) * 100);

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(centiseconds, 2)}`;
}

/**
 * Generates an Advanced SubStation Alpha (.ass) subtitle file with word-by-word karaoke animation.
 * Fully supports Hindi Devanagari ligatures and Latin Romanized Hinglish.
 */
export function generateAssSubtitles(
  words: WordTimestamp[],
  config: ASSSubtitleConfig
): string {
  const {
    scriptPreference,
    fontSize = 58,
    highlightColorHex = '#10B981',
    textColorHex = '#FFFFFF',
    outlineColorHex = '#0A0B10',
    videoWidth = 1080,
    videoHeight = 1920,
    marginV = videoHeight >= 1920 ? 360 : 180, // Positioned safely in lower third, above Reels/Shorts bottom controls
  } = config;

  // On Windows DirectWrite & Linux Fontconfig, Nirmala UI / Arial guarantees zero missing glyphs for Latin & Devanagari
  const fontName = scriptPreference === 'devanagari' ? 'Nirmala UI' : 'Arial';
  // In ASS Karaoke (\k), characters start in SecondaryColour and transition to PrimaryColour as they are spoken
  const primaryAssColor = hexToAssColor(highlightColorHex); // Active word highlight (Emerald Green)
  const secondaryAssColor = hexToAssColor(textColorHex);     // Base text color (Crisp White)
  const outlineAssColor = hexToAssColor(outlineColorHex);

  const lines = chunkWordsIntoCaptionLines(words, 4);

  let assContent = `[Script Info]
Title: FLOWZORA Clips Animated Captions
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryAssColor},${secondaryAssColor},${outlineAssColor},&H80000000,-1,0,0,0,100,100,1,0,1,4.5,2.0,2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  lines.forEach((line) => {
    const startStr = secondsToAssTimestamp(line.start);
    const endStr = secondsToAssTimestamp(line.end);

    // Build karaoke animation string using {\k<duration_cs>} tags
    const karaokeTokens = line.words
      .map((w: any) => {
        const text = scriptPreference === 'devanagari' && w.devanagari ? w.devanagari : w.word;
        return `{\\k${w.durationCs}}${text}`;
      })
      .join(' ');

    assContent += `Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${karaokeTokens}\n`;
  });

  return assContent;
}
