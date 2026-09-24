import { WordTimestamp, CandidateScore } from './types';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';

const execFileAsync = promisify(execFile);

function getFfmpegPath(): string | null {
  try {
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require('@ffmpeg-installer/ffmpeg');
    return installer.path as string;
  } catch {
    return null;
  }
}

export interface SignalRange {
  start: number;
  end: number;
}

export interface AudioSignals {
  /** High-energy moments (laughter, applause, emphatic speech). Empty when audio was unavailable. */
  energyPeaks: SignalRange[];
  /** Fast, dense speech windows (excitement / high information rate). */
  excitement: SignalRange[];
  /** True when loudness analysis ran; false = transcript-only signals. */
  audioAnalyzed: boolean;
}

/**
 * Zero-cost multimodal-lite signals: speech dynamics from word timestamps
 * (always) + loudness peaks via local ffmpeg ebur128 (best-effort, when
 * audio bytes are available). No new API keys, no new bills.
 *
 * Never throws — returns transcript-only signals when ffmpeg is missing.
 */
export async function analyzeAudioSignals(
  words: WordTimestamp[],
  duration: number,
  audioBuffer?: Buffer | Uint8Array
): Promise<AudioSignals> {
  const excitement = speechExcitementRanges(words, duration);
  let energyPeaks: SignalRange[] = [];
  let audioAnalyzed = false;

  if (audioBuffer && audioBuffer.length > 0) {
    try {
      energyPeaks = await loudnessPeaks(audioBuffer, duration);
      audioAnalyzed = true;
    } catch (err: any) {
      console.warn(`[Signals] Loudness analysis skipped (${err?.message || err}); using transcript signals only.`);
    }
  }

  console.log(
    `[Signals] ${energyPeaks.length} energy peaks, ${excitement.length} excitement windows` +
      (audioAnalyzed ? '' : ' (transcript-only)') +
      '.'
  );
  return { energyPeaks, excitement, audioAnalyzed };
}

/**
 * Fast-speech windows from word timestamps: 5s sliding windows (1s step),
 * top-quintile words-per-second merged into ranges. Rapid dense speech
 * correlates with excitement, arguments, and punchlines.
 */
function speechExcitementRanges(words: WordTimestamp[], duration: number): SignalRange[] {
  if (!words || words.length === 0 || duration <= 0) return [];
  const WIN = 5;
  const rates: Array<{ start: number; wps: number }> = [];
  for (let t = 0; t < duration; t += 1) {
    const end = Math.min(duration, t + WIN);
    let count = 0;
    for (const w of words) {
      if (w.start >= end) break;
      if (w.start >= t) count++;
    }
    rates.push({ start: t, wps: count / Math.max(1, end - t) });
  }
  if (rates.length === 0) return [];
  const sorted = [...rates].map((r) => r.wps).sort((a, b) => a - b);
  const cutoff = sorted[Math.floor(sorted.length * 0.8)] ?? 0;
  if (cutoff <= 0) return [];
  // Merge adjacent hot windows.
  const ranges: SignalRange[] = [];
  for (const r of rates) {
    if (r.wps < cutoff) continue;
    const last = ranges[ranges.length - 1];
    if (last && r.start - last.end <= 2) {
      last.end = Math.min(duration, r.start + WIN);
    } else {
      ranges.push({ start: r.start, end: Math.min(duration, r.start + WIN) });
    }
  }
  return ranges;
}

/**
 * Per-second loudness via `ffmpeg -filter:a ebur128=peak=true -f null -`,
 * parsing momentary-loudness lines from stderr. Frames louder than
 * mean + 1.2σ become energy peaks (laughter, applause, emphasis).
 */
async function loudnessPeaks(
  audioBuffer: Buffer | Uint8Array,
  duration: number
): Promise<SignalRange[]> {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) throw new Error('ffmpeg unavailable');
  const tmpDir = os.tmpdir();
  const uid = `flowzora_sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inPath = path.join(tmpDir, `${uid}_in.mp3`);
  try {
    fs.writeFileSync(inPath, audioBuffer as Buffer);
    const { stderr } = await execFileAsync(
      ffmpegPath,
      ['-hide_banner', '-i', inPath, '-filter:a', 'ebur128=peak=true', '-f', 'null', '-'],
      { timeout: 120_000, maxBuffer: 64 * 1024 * 1024 }
    );
    // Lines look like: [Parsed_ebur128_0 @ 0x...] t: 12.3 M: -18.2 S: -19.0 I: -21.4 ...
    const momentary: Array<{ t: number; m: number }> = [];
    for (const line of String(stderr || '').split('\n')) {
      const m = /t:\s*([\d.]+)\s+M:\s*(-?[\d.]+)/.exec(line);
      if (m) momentary.push({ t: Number(m[1]), m: Number(m[2]) });
    }
    if (momentary.length < 10) return [];
    const mean = momentary.reduce((a, b) => a + b.m, 0) / momentary.length;
    const variance =
      momentary.reduce((a, b) => a + (b.m - mean) ** 2, 0) / momentary.length;
    const threshold = mean + 1.2 * Math.sqrt(variance);
    const ranges: SignalRange[] = [];
    for (const f of momentary) {
      if (f.m < threshold) continue;
      const last = ranges[ranges.length - 1];
      if (last && f.t - last.end <= 1.5) {
        last.end = Math.min(duration, f.t + 0.4);
      } else {
        ranges.push({ start: Math.max(0, f.t - 0.2), end: Math.min(duration, f.t + 0.4) });
      }
    }
    return ranges.filter((r) => r.end - r.start >= 0.4);
  } finally {
    try {
      fs.unlinkSync(inPath);
    } catch {}
  }
}

function overlapFraction(range: SignalRange, start: number, end: number): number {
  const s = Math.max(range.start, start);
  const e = Math.min(range.end, end);
  if (e <= s || end <= start) return 0;
  return (e - s) / (end - start);
}

/**
 * Signal bonus (0–8) for one candidate window:
 *   +4 energy peak inside (laughter/applause/emphasis),
 *   +2 fast-speech overlap ≥ 30%,
 *   +1 clean entry (starts just after a ≥0.6s pause),
 *   +1 clean exit (ends at a ≥0.4s pause — resolved thought).
 */
export function signalBonusForWindow(
  signals: AudioSignals,
  words: WordTimestamp[],
  startTime: number,
  endTime: number
): { bonus: number; notes: string[] } {
  let bonus = 0;
  const notes: string[] = [];

  if (signals.energyPeaks.some((r) => overlapFraction(r, startTime, endTime) > 0)) {
    bonus += 4;
    notes.push('energy peak');
  }
  const hotOverlap = signals.excitement.reduce(
    (a, r) => a + overlapFraction(r, startTime, endTime),
    0
  );
  if (hotOverlap >= 0.3) {
    bonus += 2;
    notes.push('high speech energy');
  }

  // Pause context from word timings around the window edges.
  let gapBefore = 0;
  let gapAfter = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.end <= startTime + 0.05 && w.end > startTime - 5) {
      const next = words[i + 1];
      if (next && next.start >= startTime - 0.05) gapBefore = next.start - w.end;
    }
    if (w.start >= endTime - 0.05 && w.start < endTime + 5) {
      const prev = words[i - 1];
      if (prev && prev.end <= endTime + 0.05) gapAfter = w.start - prev.end;
    }
  }
  if (gapBefore >= 0.6) {
    bonus += 1;
    notes.push('clean entry');
  }
  if (gapAfter >= 0.4) {
    bonus += 1;
    notes.push('resolved exit');
  }
  return { bonus: Math.min(8, bonus), notes };
}

/**
 * Applies signal bonuses to a freshly scored map. Uniform across engines
 * (Gemini, Groq, heuristic) — signals are evidence, not a judge.
 * Never throws; returns the original map untouched on any failure.
 */
export async function applySignalBonuses(
  scoreMap: Map<string, CandidateScore>,
  candidates: Array<{ id: string; startTime: number; endTime: number }>,
  words: WordTimestamp[],
  duration: number,
  audioBuffer?: Buffer | Uint8Array
): Promise<{ map: Map<string, CandidateScore>; signals: AudioSignals | null }> {
  try {
    if (scoreMap.size === 0 || candidates.length === 0) return { map: scoreMap, signals: null };
    const signals = await analyzeAudioSignals(words, duration, audioBuffer);
    const out = new Map<string, CandidateScore>();
    for (const [id, score] of scoreMap) {
      const c = candidates.find((x) => x.id === id);
      if (!c) {
        out.set(id, score);
        continue;
      }
      const { bonus, notes } = signalBonusForWindow(signals, words, c.startTime, c.endTime);
      if (bonus > 0) {
        out.set(id, {
          ...score,
          compositeScore: Math.min(100, score.compositeScore + bonus),
          signalBonus: bonus,
          reasoning:
            notes.length > 0 ? `${score.reasoning} [audio: ${notes.join(', ')}]` : score.reasoning,
        });
      } else {
        out.set(id, score);
      }
    }
    const boosted = [...out.values()].filter((s) => (s.signalBonus || 0) > 0).length;
    console.log(`[Signals] Bonus applied to ${boosted}/${out.size} candidates.`);
    return { map: out, signals };
  } catch (err: any) {
    console.warn(`[Signals] Fusion skipped (${err?.message || err}).`);
    return { map: scoreMap, signals: null };
  }
}
