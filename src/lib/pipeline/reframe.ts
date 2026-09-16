import { AspectRatio } from './types';

export interface SpeakerTrackingPoint {
  timestamp: number; // in seconds
  speakerId?: string;
  faceDetected: boolean;
  confidence: number;
  // Normalized coordinates (0.0 to 1.0)
  bbox?: {
    x: number; // center x
    y: number; // center y
    width: number;
    height: number;
  };
  isSlideOrScreenShare?: boolean;
}

export interface ReframeMetadata {
  aspectRatio: AspectRatio;
  sourceWidth: number;
  sourceHeight: number;
  cropWidth: number;
  cropHeight: number;
  cropX: number;
  cropY: number;
  outputWidth: number;
  outputHeight: number;
  ffmpegCropFilter: string;
  fallbackUsed: boolean;
  fallbackType: 'none' | 'last_known_good' | 'center_crop';
  fallbackReason?: 'slide_or_cutaway' | 'screen_share' | 'no_face_detected';
  smoothedPanCoordinates: Array<{ timestamp: number; cropX: number }>;
}

/**
 * Calculates scene-aware vertical reframing coordinates.
 * Actively tracks speaker framing while implementing resilient fallbacks for slides and b-roll.
 */
export function calculateSceneAwareReframe(
  trackingPoints: SpeakerTrackingPoint[],
  targetAspectRatio: AspectRatio = '9:16',
  sourceWidth: number = 1920,
  sourceHeight: number = 1080,
  smoothingFactor: number = 0.18 // Exponential moving average weight
): ReframeMetadata {
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let outputWidth = 1080;
  let outputHeight = 1920;

  // 1. Determine crop dimensions based on target aspect ratio
  if (targetAspectRatio === '9:16') {
    // Crop 9:16 from 16:9 source (e.g. 608x1080 from 1920x1080), then upscale to 1080x1920
    cropHeight = sourceHeight;
    cropWidth = Math.round(sourceHeight * (9 / 16));
    // Ensure width is even for video codecs
    if (cropWidth % 2 !== 0) cropWidth -= 1;
    outputWidth = 1080;
    outputHeight = 1920;
  } else if (targetAspectRatio === '1:1') {
    // 1080x1080 square
    cropHeight = sourceHeight;
    cropWidth = sourceHeight;
    outputWidth = 1080;
    outputHeight = 1080;
  } else {
    // 16:9 (original horizontal)
    cropWidth = sourceWidth;
    cropHeight = sourceHeight;
    outputWidth = 1920;
    outputHeight = 1080;
  }

  const defaultCenterX = Math.round((sourceWidth - cropWidth) / 2);

  // 2. Process tracking points and compute smoothed camera pan
  let lastKnownGoodX = defaultCenterX;
  let currentSmoothedX = defaultCenterX;
  let fallbackUsed = false;
  let fallbackType: 'none' | 'last_known_good' | 'center_crop' = 'none';
  let fallbackReason: 'slide_or_cutaway' | 'screen_share' | 'no_face_detected' | undefined;

  const smoothedPanCoordinates: Array<{ timestamp: number; cropX: number }> = [];

  if (!trackingPoints || trackingPoints.length === 0) {
    fallbackUsed = true;
    fallbackType = 'center_crop';
    fallbackReason = 'no_face_detected';
  } else {
    for (let i = 0; i < trackingPoints.length; i++) {
      const pt = trackingPoints[i];
      let targetX = defaultCenterX;

      if (pt.isSlideOrScreenShare) {
        // Presentation slide or screen share: do not center on speaker edge; preserve content
        fallbackUsed = true;
        fallbackType = 'center_crop';
        fallbackReason = 'slide_or_cutaway';
        targetX = defaultCenterX;
      } else if (pt.faceDetected && pt.bbox && pt.confidence > 0.45) {
        // Active face detected: center the 9:16 window on speaker's X coordinate
        const speakerPixelX = pt.bbox.x * sourceWidth;
        const idealCropX = speakerPixelX - cropWidth / 2;
        // Clamp crop boundaries so frame doesn't exceed video edge
        targetX = Math.round(Math.max(0, Math.min(sourceWidth - cropWidth, idealCropX)));
        lastKnownGoodX = targetX;
      } else {
        // Face absent (cutaway, gesture, turn away, b-roll)
        fallbackUsed = true;
        const timeSinceLastFrame = i > 0 ? pt.timestamp - trackingPoints[i - 1].timestamp : 0;
        if (timeSinceLastFrame < 1.8 && lastKnownGoodX !== defaultCenterX) {
          // Gracefully hold last-known-good frame for temporary face turns
          targetX = lastKnownGoodX;
          fallbackType = 'last_known_good';
          fallbackReason = 'no_face_detected';
        } else {
          // Revert smoothly to center crop
          targetX = defaultCenterX;
          fallbackType = 'center_crop';
          fallbackReason = 'slide_or_cutaway';
        }
      }

      // Exponential moving average smoothing for cinematic camera glide
      currentSmoothedX = Math.round(
        currentSmoothedX + (targetX - currentSmoothedX) * smoothingFactor
      );

      smoothedPanCoordinates.push({
        timestamp: pt.timestamp,
        cropX: currentSmoothedX,
      });
    }
  }

  const finalCropX = smoothedPanCoordinates.length > 0
    ? smoothedPanCoordinates[Math.floor(smoothedPanCoordinates.length / 2)].cropX
    : defaultCenterX;

  // Construct standard FFmpeg filter expression
  const ffmpegCropFilter = targetAspectRatio === '16:9'
    ? `scale=${outputWidth}:${outputHeight}`
    : `crop=${cropWidth}:${cropHeight}:${finalCropX}:0,scale=${outputWidth}:${outputHeight}`;

  return {
    aspectRatio: targetAspectRatio,
    sourceWidth,
    sourceHeight,
    cropWidth,
    cropHeight,
    cropX: finalCropX,
    cropY: 0,
    outputWidth,
    outputHeight,
    ffmpegCropFilter,
    fallbackUsed,
    fallbackType,
    fallbackReason,
    smoothedPanCoordinates,
  };
}
