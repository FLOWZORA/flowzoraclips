import { AspectRatio, CandidateClip, ScriptPreference } from './types';
import { calculateSceneAwareReframe, SpeakerTrackingPoint } from './reframe';
import { generateAssSubtitles } from './caption-renderer';

export interface RenderJobRequest {
  clipId: string;
  sourceVideoUrl: string;
  startTime: number;
  endTime: number;
  aspectRatio: AspectRatio;
  scriptPreference: ScriptPreference;
  burnCaptions: boolean;
  trimFillers: boolean;
  trackingPoints?: SpeakerTrackingPoint[];
  outputFilename?: string;
}

export interface RenderJobSpecification {
  jobId: string;
  command: string;
  ffmpegArgs: string[];
  assSubtitleContent?: string;
  reframeMetadata: any;
  targetAspectRatio: AspectRatio;
  estimatedRenderDurationSec: number;
  railwayWorkerPayload: {
    clipId: string;
    sourceUrl: string;
    startTime: number;
    endTime: number;
    ffmpegCommand: string;
    subtitleAssKey?: string;
    outputR2Key: string;
  };
}

/**
 * Generates the complete FFmpeg rendering job specification for the Railway worker or local encoder.
 */
export function buildVideoRenderJob(
  request: RenderJobRequest,
  clip: CandidateClip
): RenderJobSpecification {
  const {
    clipId,
    sourceVideoUrl,
    startTime,
    endTime,
    aspectRatio = '9:16',
    scriptPreference = 'romanized',
    burnCaptions = true,
    trackingPoints = [],
    outputFilename = `${clipId}_${aspectRatio.replace(':', 'x')}.mp4`,
  } = request;

  const duration = Number((endTime - startTime).toFixed(2));

  // 1. Calculate scene-aware crop and reframe
  const reframe = calculateSceneAwareReframe(trackingPoints, aspectRatio, 1920, 1080);

  // 2. Generate animated ASS subtitle stream
  let assSubtitleContent: string | undefined;
  if (burnCaptions) {
    // Generate word timestamps relative to clip start time (0s)
    const relativeWords = (clip as any).words
      ? (clip as any).words.map((w: any) => ({
          ...w,
          start: Math.max(0, w.start - startTime),
          end: Math.max(0.1, w.end - startTime),
        }))
      : [];

    if (relativeWords.length > 0) {
      assSubtitleContent = generateAssSubtitles(relativeWords, {
        scriptPreference,
        videoWidth: reframe.outputWidth,
        videoHeight: reframe.outputHeight,
        highlightColorHex: '#10B981',
      });
    }
  }

  // 3. Assemble FFmpeg video filter chain
  const videoFilters: string[] = [];

  // Scene-aware crop and scale
  videoFilters.push(reframe.ffmpegCropFilter);

  // Burn-in subtitles if available
  if (burnCaptions && assSubtitleContent) {
    videoFilters.push(`ass=subtitles_${clipId}.ass`);
  }

  const filterString = videoFilters.join(',');

  // 4. Construct complete FFmpeg CLI arguments
  const ffmpegArgs = [
    '-ss', String(startTime),
    '-to', String(endTime),
    '-i', sourceVideoUrl,
    '-vf', `"${filterString}"`,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '20',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    outputFilename,
  ];

  const command = `ffmpeg ${ffmpegArgs.join(' ')}`;

  return {
    jobId: `render-${clipId}-${Date.now()}`,
    command,
    ffmpegArgs,
    assSubtitleContent,
    reframeMetadata: reframe,
    targetAspectRatio: aspectRatio,
    estimatedRenderDurationSec: Math.round(duration * 0.4), // ~0.4x realtime on Railway CPU/GPU
    railwayWorkerPayload: {
      clipId,
      sourceUrl: sourceVideoUrl,
      startTime,
      endTime,
      ffmpegCommand: command,
      subtitleAssKey: burnCaptions ? `subtitles/${clipId}.ass` : undefined,
      outputR2Key: `exports/${outputFilename}`,
    },
  };
}
