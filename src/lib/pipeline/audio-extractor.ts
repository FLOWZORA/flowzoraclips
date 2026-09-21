import path from 'path';
import os from 'os';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';

const execFileAsync = promisify(execFile);

// Works in both CJS and ESM runtimes (bare `require` throws under ESM/tsx).
function getFfmpegPath(): string {
  const require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const installer = require('@ffmpeg-installer/ffmpeg');
  return installer.path as string;
}

export async function extractAudioBuffer(
  inputBuffer: Buffer | Uint8Array,
  inputFilename: string
): Promise<{ audioBuffer: Buffer; audioFilename: string }> {
  let ffmpegPath: string;
  try {
    ffmpegPath = getFfmpegPath();
  } catch (e) {
    throw new Error('FFmpeg not available.');
  }
  const tmpDir = os.tmpdir();
  const uid = 'flowzora_' + Date.now();
  const ext = path.extname(inputFilename).toLowerCase() || '.mp4';
  const inPath = path.join(tmpDir, uid + '_in' + ext);
  const outPath = path.join(tmpDir, uid + '_out.mp3');
  try {
    fs.writeFileSync(inPath, inputBuffer as Buffer);
    const mb = (inputBuffer.length / 1048576).toFixed(1);
    console.log('[AudioExtractor] ' + mb + ' MB video extraction started');
    await execFileAsync(ffmpegPath, ['-y','-i',inPath,'-vn','-acodec','libmp3lame','-ab','64k','-ac','1','-ar','16000',outPath]);
    const audioBuffer = fs.readFileSync(outPath);
    const mb2 = (audioBuffer.length / 1048576).toFixed(1);
    console.log('[AudioExtractor] Done: ' + mb2 + ' MB MP3');
    return { audioBuffer, audioFilename: uid + '_out.mp3' };
  } finally {
    try { fs.unlinkSync(inPath); } catch (_) {}
    try { fs.unlinkSync(outPath); } catch (_) {}
  }
}

export function isVideoFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ['.mp4','.mov','.avi','.mkv','.webm','.m4v','.wmv','.flv'].includes(ext);
}

export interface AudioChunk {
  buffer: Buffer;
  /** Nominal (non-overlapped) start of this chunk on the full timeline. */
  startSec: number;
  durationSec: number;
}

/**
 * Splits an extracted MP3 audio buffer into sequential ≤chunkTargetBytes
 * pieces for per-step background transcription. Every chunk after the first
 * starts overlapSec early so chunk boundaries never slice a word in half —
 * callers drop words inside the overlapped region from the later chunk.
 */
export async function splitAudioBufferIntoChunks(
  audioBuffer: Buffer | Uint8Array,
  opts?: { chunkTargetBytes?: number; maxChunks?: number; overlapSec?: number }
): Promise<{ chunks: AudioChunk[]; estimatedTotalSec: number }> {
  const chunkTargetBytes = opts?.chunkTargetBytes ?? 20 * 1024 * 1024;
  const maxChunks = opts?.maxChunks ?? 10; // 10 × 20 MB ≈ 400 min at 64kbps
  const overlapSec = opts?.overlapSec ?? 3;
  const BYTES_PER_SEC_64K = 8000; // 64kbps CBR mono MP3

  let ffmpegPath: string;
  try {
    ffmpegPath = getFfmpegPath();
  } catch (e) {
    throw new Error('FFmpeg not available for audio splitting.');
  }

  const totalBytes = audioBuffer.length;
  const estimatedTotalSec = totalBytes / BYTES_PER_SEC_64K;
  const numChunks = Math.min(maxChunks, Math.max(1, Math.ceil(totalBytes / chunkTargetBytes)));

  const tmpDir = os.tmpdir();
  const uid = 'flowzora_split_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const inPath = path.join(tmpDir, uid + '_in.mp3');
  try {
    fs.writeFileSync(inPath, audioBuffer as Buffer);
    const chunks: AudioChunk[] = [];
    for (let i = 0; i < numChunks; i++) {
      const nominalStart = i * (estimatedTotalSec / numChunks);
      const nominalEnd = i === numChunks - 1 ? estimatedTotalSec : (i + 1) * (estimatedTotalSec / numChunks);
      const extractStart = i === 0 ? 0 : Math.max(0, nominalStart - overlapSec);
      const durSec = Math.max(1, nominalEnd - extractStart);
      const outPath = path.join(tmpDir, `${uid}_part${i}.mp3`);
      try {
        await execFileAsync(ffmpegPath, [
          '-y', '-ss', String(Math.floor(extractStart)), '-i', inPath,
          '-t', String(Math.ceil(durSec)),
          '-acodec', 'libmp3lame', '-ab', '64k', '-ac', '1', '-ar', '16000',
          outPath,
        ]);
        chunks.push({
          buffer: fs.readFileSync(outPath),
          startSec: nominalStart,
          durationSec: nominalEnd - nominalStart,
        });
      } finally {
        try { fs.unlinkSync(outPath); } catch (_) {}
      }
    }
    return { chunks, estimatedTotalSec };
  } finally {
    try { fs.unlinkSync(inPath); } catch (_) {}
  }
}

/**
 * Measures the true media duration in seconds by asking ffmpeg to parse the
 * container header (`ffmpeg -i` prints `Duration: HH:MM:SS.cs` to stderr).
 *
 * This exists because estimating duration from file size (e.g. "1 MB ≈ 1 min")
 * is wrong for video: bitrate varies wildly by codec/resolution, so a 52 MB
 * file can be 23 minutes, not 53. Never gate users on a size-based guess.
 *
 * Returns null when probing fails so callers can fall back to a heuristic.
 */
export async function probeMediaDurationSec(
  inputBuffer: Buffer | Uint8Array,
  inputFilename: string
): Promise<number | null> {
  let ffmpegPath: string;
  try {
    ffmpegPath = getFfmpegPath();
  } catch (e) {
    return null;
  }
  const tmpDir = os.tmpdir();
  const uid = 'flowzora_probe_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const ext = path.extname(inputFilename).toLowerCase() || '.mp4';
  const inPath = path.join(tmpDir, uid + '_in' + ext);
  try {
    fs.writeFileSync(inPath, inputBuffer as Buffer);
    try {
      // No output file: ffmpeg exits non-zero and reports stream info on stderr.
      await execFileAsync(ffmpegPath, ['-i', inPath]);
    } catch (probeErr: any) {
      const output = String(probeErr?.stderr || probeErr?.stdout || probeErr?.message || '');
      const match = output.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (match) {
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        const seconds = Number(match[3]);
        const total = hours * 3600 + minutes * 60 + seconds;
        if (Number.isFinite(total) && total > 0) {
          console.log('[AudioExtractor] Probed media duration: ' + total.toFixed(1) + 's (' + inputFilename + ')');
          return total;
        }
      }
      console.warn('[AudioExtractor] Could not parse media duration for ' + inputFilename);
      return null;
    }
    return null;
  } finally {
    try { fs.unlinkSync(inPath); } catch (_) {}
  }
}
