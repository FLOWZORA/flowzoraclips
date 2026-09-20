import { extractYouTubeAudioStream, getYouTubeMetadata } from '../src/lib/pipeline/youtube.ts';

async function testVideo(url) {
  console.log(`\n========================================`);
  console.log(`Testing: ${url}`);
  console.log(`========================================`);

  const metadata = await getYouTubeMetadata(url);
  console.log('Title:', metadata.title);
  console.log('Duration:', metadata.formattedDuration);

  const t0 = Date.now();
  const { audioBuffer, filename } = await extractYouTubeAudioStream(url, 'demo-user-1', false, metadata);
  const elapsed = Date.now() - t0;

  console.log('Success! Extracted file:', filename);
  console.log('Audio Size:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');
  console.log('Time Taken:', elapsed, 'ms');
  return audioBuffer.length > 1024;
}

async function main() {
  const v1 = await testVideo('https://www.youtube.com/watch?v=QGLvwQX-Aos'); // Druski / Theo Von #489
  const v2 = await testVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ'); // Rick Astley

  if (v1 && v2) {
    console.log('\n========================================');
    console.log('>>> ALL VERIFICATION TESTS PASSED! <<<');
    console.log('========================================');
    process.exit(0);
  } else {
    console.error('\n>>> TESTS FAILED <<<');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in tests:', err);
  process.exit(1);
});
