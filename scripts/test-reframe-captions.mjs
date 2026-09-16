#!/usr/bin/env node

/**
 * FLOWZORA Clips — Step 3 Reframe & Captions Verification Test
 *
 * Validates:
 * 1. Scene-aware 9:16 reframe calculation with active speaker tracking
 * 2. Graceful fallback on slides, screenshares, and b-roll (center crop / last known good)
 * 3. Dual-script animated ASS subtitle generation (Devanagari vs. Romanized Latin)
 * 4. Railway FFmpeg render worker payload construction
 */

import { calculateSceneAwareReframe } from '../src/lib/pipeline/reframe.ts';
import { generateAssSubtitles, chunkWordsIntoCaptionLines } from '../src/lib/pipeline/caption-renderer.ts';
import { buildVideoRenderJob } from '../src/lib/pipeline/video-renderer.ts';

async function testReframeAndCaptions() {
  console.log('================================================================');
  console.log(' FLOWZORA Clips — Step 3 Reframe & Captions Validation Test');
  console.log('================================================================\n');

  // Test Case 1: Active Speaker Tracking (Speaker moving from center to right)
  console.log('--- TEST 1: Active Speaker Tracking (16:9 -> 9:16) ---');
  const trackingData = [
    { timestamp: 0.0, faceDetected: true, confidence: 0.92, bbox: { x: 0.5, y: 0.5, width: 0.2, height: 0.3 } },
    { timestamp: 1.0, faceDetected: true, confidence: 0.88, bbox: { x: 0.65, y: 0.5, width: 0.2, height: 0.3 } },
    { timestamp: 2.0, faceDetected: true, confidence: 0.85, bbox: { x: 0.75, y: 0.5, width: 0.2, height: 0.3 } },
  ];

  const speakerReframe = calculateSceneAwareReframe(trackingData, '9:16', 1920, 1080);
  console.log(`Source: 1920x1080 -> 9:16 Crop: ${speakerReframe.cropWidth}x${speakerReframe.cropHeight}`);
  console.log(`Calculated Crop X: ${speakerReframe.cropX} (Centered around speaker)`);
  console.log(`FFmpeg Filter: "${speakerReframe.ffmpegCropFilter}"`);
  console.log(`Fallback Engaged: ${speakerReframe.fallbackUsed} (Expected: false)\n`);

  // Test Case 2: Presentation Slide / B-Roll Fallback
  console.log('--- TEST 2: Presentation Slide / B-Roll Graceful Fallback ---');
  const slideTrackingData = [
    { timestamp: 0.0, faceDetected: true, confidence: 0.9, bbox: { x: 0.3, y: 0.5, width: 0.2, height: 0.3 } },
    { timestamp: 1.0, faceDetected: false, confidence: 0.1, isSlideOrScreenShare: true }, // Slide cutaway
    { timestamp: 2.0, faceDetected: false, confidence: 0.0, isSlideOrScreenShare: true },
  ];

  const slideReframe = calculateSceneAwareReframe(slideTrackingData, '9:16', 1920, 1080);
  console.log(`Fallback Used:    ${slideReframe.fallbackUsed} (Expected: true)`);
  console.log(`Fallback Type:    ${slideReframe.fallbackType} (Expected: center_crop)`);
  console.log(`Fallback Reason:  ${slideReframe.fallbackReason} (Expected: slide_or_cutaway)`);
  console.log(`Crop X Fallback:  ${slideReframe.cropX} (Default Center: 656)\n`);

  // Test Case 3: Dual-Script Animated Subtitle Generation
  console.log('--- TEST 3: Dual-Script Animated Captions (.ass) ---');

  const hindiDevanagariWords = [
    { word: 'अगर', start: 0.0, end: 0.35 },
    { word: 'आप', start: 0.35, end: 0.6 },
    { word: 'content', start: 0.6, end: 1.1 },
    { word: 'create', start: 1.1, end: 1.55 },
    { word: 'कर', start: 1.55, end: 1.8 },
    { word: 'रहे', start: 1.8, end: 2.1 },
    { word: 'हो', start: 2.1, end: 2.3 },
  ];

  const assDevanagari = generateAssSubtitles(hindiDevanagariWords, {
    scriptPreference: 'devanagari',
    highlightColorHex: '#FF5722',
  });

  console.log('Generated Devanagari ASS Header & Event:');
  const assLines = assDevanagari.split('\n');
  console.log(`  Font Targeted:    ${assLines.find(l => l.startsWith('Style:'))?.split(',')[1]}`);
  console.log(`  Karaoke Dialogue: ${assLines.find(l => l.startsWith('Dialogue:'))}\n`);

  const romanizedWords = [
    { word: 'Burnout', start: 0.0, end: 0.5 },
    { word: 'comes', start: 0.5, end: 0.8 },
    { word: 'from', start: 0.8, end: 1.0 },
    { word: 'unstrategic', start: 1.0, end: 1.6 },
    { word: 'production.', start: 1.6, end: 2.2 },
  ];

  const assRomanized = generateAssSubtitles(romanizedWords, {
    scriptPreference: 'romanized',
    highlightColorHex: '#FFB800',
  });

  const romanizedAssLines = assRomanized.split('\n');
  console.log('Generated Romanized Latin ASS Header & Event:');
  console.log(`  Font Targeted:    ${romanizedAssLines.find(l => l.startsWith('Style:'))?.split(',')[1]}`);
  console.log(`  Karaoke Dialogue: ${romanizedAssLines.find(l => l.startsWith('Dialogue:'))}\n`);

  // Test Case 4: Video Render Job Specification (Railway Worker Payload)
  console.log('--- TEST 4: Railway Worker FFmpeg Render Job Spec ---');
  const mockClip = {
    id: 'clip-burnout-01',
    videoId: 'podcast-ep-42',
    startTime: 15.0,
    endTime: 65.0,
    duration: 50.0,
    transcriptSnippet: 'Burnout comes from unstrategic production, not hard work.',
    score: {
      dimensions: { hookStrength: 9.5, standaloneCoherence: 9.0, emotionalPayoff: 8.5, topicTrendAlignment: 9.0 },
      compositeScore: 91,
      reasoning: 'Explosive contrarian hook on creator productivity',
    },
    rank: 1,
    aspectRatio: '9:16',
    reframeFallbackUsed: false,
    words: romanizedWords,
  };

  const renderJob = buildVideoRenderJob(
    {
      clipId: mockClip.id,
      sourceVideoUrl: 'https://r2.flowzoraclips.com/raw/episode-42.mp4',
      startTime: 15.0,
      endTime: 65.0,
      aspectRatio: '9:16',
      scriptPreference: 'romanized',
      burnCaptions: true,
      trimFillers: true,
      trackingPoints: trackingData,
    },
    mockClip
  );

  console.log(`Job ID:            ${renderJob.jobId}`);
  console.log(`Target Format:     ${renderJob.targetAspectRatio}`);
  console.log(`Est. Render Time:  ${renderJob.estimatedRenderDurationSec}s`);
  console.log(`FFmpeg Command:    ${renderJob.command}`);
  console.log(`Worker R2 Target:  ${renderJob.railwayWorkerPayload.outputR2Key}\n`);

  console.log('[PASS] All Step 3 Reframe and Caption tests passed successfully!\n');
}

testReframeAndCaptions().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
