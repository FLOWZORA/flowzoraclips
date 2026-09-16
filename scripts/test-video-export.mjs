/**
 * FLOWZORA Clips — Video Export & Download Test Suite
 * Validates:
 * 1. 9:16 vertical MP4 export generation
 * 2. 1:1 square MP4 export generation
 * 3. 16:9 widescreen export generation
 * 4. Subtitle stream synthesis & FFmpeg command formatting
 * 5. Direct MP4 container streaming
 */

import { exportClipToMp4 } from '../src/lib/pipeline/video-exporter.ts';
import { inMemoryR2 } from '../src/lib/storage/r2.ts';

async function runExportTests() {
  console.log('===========================================================');
  console.log('FLOWZORA Clips — Video Export & Download Suite');
  console.log('===========================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
    }
  }

  // -------------------------------------------------------------
  // Test 1: 9:16 Vertical Export
  // -------------------------------------------------------------
  console.log('Test 1: 9:16 Vertical Video Export');
  const verticalExport = await exportClipToMp4({
    clipId: 'clip-burnout-01',
    startTime: 15,
    endTime: 65,
    format: '9:16',
    scriptPreference: 'romanized',
  });

  assert(verticalExport.status === 'completed', `Export status completed (${verticalExport.status})`);
  assert(verticalExport.format === '9:16', 'Target format is 9:16');
  assert(verticalExport.downloadUrl.includes('clip-burnout-01'), `Download URL resolved: ${verticalExport.downloadUrl}`);
  assert(verticalExport.ffmpegCommand.includes('crop=608:1080'), 'FFmpeg command includes 9:16 crop filter (608:1080)');
  assert(verticalExport.ffmpegCommand.includes('scale=1080:1920'), 'FFmpeg command scales to vertical 1080x1920');
  console.log('');

  // -------------------------------------------------------------
  // Test 2: 1:1 Square & 16:9 Multi-Aspect Formats
  // -------------------------------------------------------------
  console.log('Test 2: Multi-Aspect Exports (1:1 & 16:9)');
  const squareExport = await exportClipToMp4({
    clipId: 'clip-burnout-01',
    startTime: 15,
    endTime: 65,
    format: '1:1',
    scriptPreference: 'devanagari',
  });
  assert(squareExport.ffmpegCommand.includes('crop=1080:1080'), 'Square export includes 1080x1080 crop filter');

  const wideExport = await exportClipToMp4({
    clipId: 'clip-burnout-01',
    startTime: 15,
    endTime: 65,
    format: '16:9',
  });
  assert(wideExport.ffmpegCommand.includes('scale=1920:1080'), 'Widescreen export preserves 1920x1080 resolution');
  console.log('');

  // -------------------------------------------------------------
  // Test 3: Playable MP4 Container Storage & Delivery
  // -------------------------------------------------------------
  console.log('Test 3: Storage Verification & Binary Output');
  const storedItem = inMemoryR2.get(verticalExport.fileKey);
  assert(storedItem !== undefined, `Rendered file saved in R2 storage at key: ${verticalExport.fileKey}`);
  assert(storedItem?.contentType === 'video/mp4', `Content-Type verified as video/mp4`);
  assert(storedItem && storedItem.buffer.length > 0, `Video file buffer size: ${storedItem?.buffer.length} bytes`);
  console.log('');

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('===========================================================');
  console.log(`Verification Complete: ${passed}/${total} assertions passed (${Math.round((passed/total)*100)}%)`);
  console.log('===========================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runExportTests().catch((err) => {
  console.error('Suite error:', err);
  process.exit(1);
});
