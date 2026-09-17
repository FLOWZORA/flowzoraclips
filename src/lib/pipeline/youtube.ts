import {
  validateProcessingEligibility,
  IS_COMPLETELY_FREE,
  MAX_PAID_VIDEO_DURATION_SEC,
  MAX_FREE_VIDEO_DURATION_SEC,
} from '../billing/credits';

export interface YouTubeVideoMetadata {
  videoId: string;
  url: string;
  title: string;
  author: string;
  durationSec: number;
  formattedDuration: string;
  thumbnailUrl: string;
  isEligibleForFreeTier: boolean;
}

/**
 * Parses and extracts the canonical video ID from any YouTube URL format:
 * - https://www.youtube.com/watch?v=dQw4w9WgXcQ
 * - https://youtu.be/dQw4w9WgXcQ
 * - https://www.youtube.com/shorts/dQw4w9WgXcQ
 * - https://www.youtube.com/embed/dQw4w9WgXcQ
 */
export function parseYouTubeUrl(url: string): { videoId: string | null; isValid: boolean } {
  if (!url || typeof url !== 'string') {
    return { videoId: null, isValid: false };
  }

  const cleanUrl = url.trim();

  // Standard watch regex
  const watchRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i;
  const match = cleanUrl.match(watchRegex);

  if (match && match[1]) {
    return { videoId: match[1], isValid: true };
  }

  return { videoId: null, isValid: false };
}

/**
 * Formats duration in seconds to MM:SS or HH:MM:SS.
 */
export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Fetches YouTube video metadata using YouTube's official oEmbed service (no API key required).
 */
export async function getYouTubeMetadata(url: string, durationSecEstimate: number = 480): Promise<YouTubeVideoMetadata> {
  const { videoId, isValid } = parseYouTubeUrl(url);

  if (!isValid || !videoId) {
    throw new Error('Invalid YouTube URL. Please provide a link in the format https://youtube.com/watch?v=... or https://youtu.be/...');
  }

  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  let title = 'Hindi / Hinglish Creator Podcast Episode';
  let author = 'Indian Creator Studio';

  try {
    const res = await fetch(oembedUrl, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      if (data.title) title = data.title;
      if (data.author_name) author = data.author_name;
    }
  } catch (err) {
    console.warn(`[YouTube Ingestion] Failed to query oEmbed for ${videoId}, using fallback metadata.`);
  }

  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const formattedDuration = formatDuration(durationSecEstimate);
  const isEligibleForFreeTier = IS_COMPLETELY_FREE
    ? durationSecEstimate <= MAX_PAID_VIDEO_DURATION_SEC
    : durationSecEstimate <= MAX_FREE_VIDEO_DURATION_SEC;

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title,
    author,
    durationSec: durationSecEstimate,
    formattedDuration,
    thumbnailUrl,
    isEligibleForFreeTier,
  };
}

/**
 * Extracts the audio stream from a YouTube video URL.
 * In development, returns buffered audio stream ready for Whisper transcription.
 */
export async function extractYouTubeAudioStream(
  url: string,
  userId: string = 'demo-user-1',
  checkEligibility: boolean = true
): Promise<{
  audioBuffer: Buffer;
  filename: string;
  metadata: YouTubeVideoMetadata;
}> {
  const metadata = await getYouTubeMetadata(url);

  // Validate free tier hard cap (<=10 min) if requested
  if (checkEligibility) {
    const eligibility = await validateProcessingEligibility(userId, metadata.durationSec);
    if (!eligibility.allowed) {
      throw new Error(eligibility.reason || 'Video duration exceeds plan limits.');
    }
  }

  console.log(`[YouTube Ingest] Extracting audio for "${metadata.title}" (${metadata.videoId})...`);

  // Real audio extraction using yt-dlp
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const tempDir = path.resolve(process.cwd(), 'scratch');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const outPrefix = path.join(tempDir, `yt_${metadata.videoId}_${Date.now()}`);
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'extract-yt-audio.py');
    const metaPath = `${outPrefix}.meta.json`;

    await execFileAsync('python', [scriptPath, url, outPrefix], {
      timeout: 45000,
    });

    if (fs.existsSync(metaPath)) {
      const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      try { fs.unlinkSync(metaPath); } catch (_) {}

      if (parsed.success && parsed.filePath && fs.existsSync(parsed.filePath)) {
        const audioBuffer = fs.readFileSync(parsed.filePath);
        const ext = path.extname(parsed.filePath) || '.m4a';
        try { fs.unlinkSync(parsed.filePath); } catch (_) {}

        console.log(`[YouTube Ingest] Successfully extracted ${audioBuffer.length} bytes of real audio for "${metadata.title}"`);
        return {
          audioBuffer,
          filename: `youtube_${metadata.videoId}${ext}`,
          metadata,
        };
      }
    }
  } catch (err: any) {
    console.error(`[YouTube Ingest] Real audio extraction via yt-dlp failed: ${err.message}`);
    throw new Error(
      `Failed to extract audio from YouTube URL: ${err.message}. ` +
      `Please ensure Python and yt-dlp are installed, or download the video and upload it directly.`
    );
  }

  throw new Error(
    `Failed to extract audio for YouTube video (${metadata.videoId}). Please check the URL or upload the file directly.`
  );
}
