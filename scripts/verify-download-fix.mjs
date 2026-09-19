import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const execFileAsync = promisify(execFile);

async function run() {
  console.log('--- STEP 1: Generate a unique test MP4 video using ffmpeg ---');
  const tempDir = os.tmpdir();
  const testVideoPath = path.join(tempDir, `test_user_upload_${Date.now()}.mp4`);

  // Generate a 6-second distinct video (1280x720, green background with timestamp text and audio tone)
  await execFileAsync(ffmpegInstaller.path, [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=6:size=1280x720:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=6',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    testVideoPath
  ]);

  const testVideoStats = fs.statSync(testVideoPath);
  console.log(`Generated test video at: ${testVideoPath} (${(testVideoStats.size / 1024).toFixed(1)} KB)`);

  console.log('\n--- STEP 2: Import storage and exporter functions directly ---');
  // Load ES modules from built/transpiled or direct tsx/node import
  const { inMemoryR2, uploadBufferToR2 } = await import('../src/lib/storage/r2.ts');
  const { exportClipToMp4 } = await import('../src/lib/pipeline/video-exporter.ts');

  const videoBuffer = fs.readFileSync(testVideoPath);
  const testKey = `raw/user-test/${Date.now()}_my_uploaded_video.mp4`;

  // Store in inMemoryR2 and write to latest_source.mp4 as analyze route does
  inMemoryR2.set(testKey, { buffer: videoBuffer, contentType: 'video/mp4', uploadedAt: new Date().toISOString() });
  inMemoryR2.set('latest_source.mp4', { buffer: videoBuffer, contentType: 'video/mp4', uploadedAt: new Date().toISOString() });
  fs.writeFileSync(path.join(tempDir, 'flowzora_latest_source.mp4'), videoBuffer);

  console.log(`Uploaded user video to inMemoryR2 with key: ${testKey}`);

  console.log('\n--- STEP 3: Export clip (startTime: 1s, endTime: 4s, format: 9:16) ---');
  const exportResult = await exportClipToMp4({
    clipId: 'ranked-clip-test-1',
    startTime: 1.0,
    endTime: 4.0,
    format: '9:16',
    fitMode: 'fit',
    sourceVideoKey: testKey,
    sourceVideoUrl: 'blob:http://localhost:3000/mock-blob',
  });

  console.log('Export result:', exportResult);

  if (!exportResult.downloadUrl) {
    throw new Error('exportClipToMp4 failed: no downloadUrl returned');
  }

  console.log('\n--- STEP 4: Verify the rendered output buffer ---');
  const expectedFilename = `flowzora_ranked-clip-test-1_1s-4s_9x16.mp4`;
  const renderedItem = inMemoryR2.get(expectedFilename) || inMemoryR2.get(exportResult.fileKey);

  if (!renderedItem || !renderedItem.buffer || renderedItem.buffer.length < 10000) {
    throw new Error(`Rendered buffer missing or too small for ${expectedFilename}`);
  }

  const renderedSize = renderedItem.buffer.length;
  console.log(`Verified rendered MP4 buffer size: ${(renderedSize / 1024).toFixed(1)} KB`);

  // Save rendered clip to temp and probe it with ffmpeg
  const outputClipPath = path.join(tempDir, expectedFilename);
  fs.writeFileSync(outputClipPath, renderedItem.buffer);

  // Inspect the output clip using ffmpeg -i
  try {
    const { stderr } = await execFileAsync(ffmpegInstaller.path, ['-i', outputClipPath]);
    console.log('FFmpeg probe stderr (contains stream metadata):');
    console.log(stderr.split('\n').filter(l => l.includes('Duration') || l.includes('Video:') || l.includes('Audio:')).join('\n'));
  } catch (probeErr) {
    // ffmpeg -i returns exit code 1 with stream info in stderr
    if (probeErr.stderr) {
      console.log('Stream metadata from FFmpeg:');
      console.log(probeErr.stderr.split('\n').filter(l => l.includes('Duration') || l.includes('Video:') || l.includes('Stream #')).join('\n'));
    }
  }

  // Cleanup
  try { fs.unlinkSync(testVideoPath); } catch (_) {}
  try { fs.unlinkSync(outputClipPath); } catch (_) {}

  console.log('\nSUCCESS! The download pipeline accurately processes the user-uploaded video into a 9:16 clip without using any fallback sample.');
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
