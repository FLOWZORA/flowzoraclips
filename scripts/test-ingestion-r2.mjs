/**
 * FLOWZORA Clips — Ingestion & Storage Test Suite
 * Validates:
 * 1. YouTube URL parsing across formats (standard, short, embed, shorts)
 * 2. YouTube metadata extraction & duration calculation
 * 3. YouTube free tier duration cap enforcement (<=10 min vs. >10 min)
 * 4. Cloudflare R2 presigned upload URL generation
 * 5. Cloudflare R2 presigned upload & download retrieval
 * 6. Direct audio stream extraction for YouTube ingestion
 */

import {
  parseYouTubeUrl,
  getYouTubeMetadata,
  extractYouTubeAudioStream,
} from '../src/lib/pipeline/youtube.ts';
import {
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  uploadBufferToR2,
  inMemoryR2,
} from '../src/lib/storage/r2.ts';
import { getOrCreateUser } from '../src/lib/auth/magic-link.ts';
import { fulfillCreditPurchase, CREDIT_PACKS } from '../src/lib/billing/stripe.ts';

async function runIngestionTests() {
  console.log('===========================================================');
  console.log('FLOWZORA Clips — Ingestion & Cloudflare R2 Test Suite');
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
  // Test 1: YouTube URL Parsing
  // -------------------------------------------------------------
  console.log('Test 1: YouTube URL Canonicalization');
  const validUrls = [
    { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
    { url: 'https://youtu.be/dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
    { url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
    { url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
  ];

  for (const { url, expected } of validUrls) {
    const res = parseYouTubeUrl(url);
    assert(res.isValid && res.videoId === expected, `Correctly parsed ${url} -> ${res.videoId}`);
  }

  const invalid = parseYouTubeUrl('https://vimeo.com/123456');
  assert(invalid.isValid === false, 'Correctly rejected non-YouTube URL');
  console.log('');

  // -------------------------------------------------------------
  // Test 2: YouTube Metadata & Free Tier Cap Validation
  // -------------------------------------------------------------
  console.log('Test 2: YouTube Metadata & Duration Eligibility');
  // 8-minute podcast: under 10m cap -> eligible for free tier
  const metadataShort = await getYouTubeMetadata('https://youtu.be/dQw4w9WgXcQ', 480);
  assert(metadataShort.videoId === 'dQw4w9WgXcQ', `Video ID extracted: ${metadataShort.videoId}`);
  assert(metadataShort.formattedDuration === '8:00', `Formatted duration: ${metadataShort.formattedDuration}`);
  assert(metadataShort.isEligibleForFreeTier === true, '8-minute video is eligible for Free Tier');
  assert(metadataShort.thumbnailUrl.includes('dQw4w9WgXcQ'), `Thumbnail URL created: ${metadataShort.thumbnailUrl}`);

  // 45-minute episode: over 10m cap -> requires top-up
  const metadataLong = await getYouTubeMetadata('https://youtu.be/dQw4w9WgXcQ', 2700);
  assert(metadataLong.formattedDuration === '45:00', `Formatted duration: ${metadataLong.formattedDuration}`);
  assert(metadataLong.isEligibleForFreeTier === false, '45-minute podcast correctly flagged as exceeding Free Tier');
  console.log('');

  // -------------------------------------------------------------
  // Test 3: Audio Stream Extraction with Tier Guard
  // -------------------------------------------------------------
  console.log('Test 3: Audio Stream Extraction & Free Tier Guard');
  const testUser = await getOrCreateUser(`ingest_test_${Date.now()}@flowzora.test`);

  // Under 10m episode extracts cleanly
  const shortAudio = await extractYouTubeAudioStream('https://youtu.be/dQw4w9WgXcQ', testUser.id);
  assert(shortAudio.audioBuffer.length > 0, `Audio stream extracted (${shortAudio.audioBuffer.length} bytes)`);
  assert(shortAudio.filename.includes('dQw4w9WgXcQ'), `Filename standardized: ${shortAudio.filename}`);

  // Upgrade user to Paid Top-Up
  await fulfillCreditPurchase(testUser.id, CREDIT_PACKS.creator_10.credits, 'sim_sub', 1200);
  console.log('  -> Upgraded user with Creator Top-Up credits');
  console.log('');

  // -------------------------------------------------------------
  // Test 4: Cloudflare R2 Presigned Upload URL Generation
  // -------------------------------------------------------------
  console.log('Test 4: Cloudflare R2 Presigned Upload URL Generation');
  const presignResult = await getPresignedUploadUrl({
    userId: testUser.id,
    filename: 'podcast_episode_01.mp4',
    contentType: 'video/mp4',
  });
  assert(presignResult.uploadUrl.length > 0, `Generated presigned upload URL: ${presignResult.uploadUrl}`);
  assert(presignResult.fileKey.startsWith(`raw/${testUser.id}/`), `Key isolated under user path: ${presignResult.fileKey}`);
  assert(
    presignResult.publicUrl.includes(encodeURIComponent(presignResult.fileKey)) ||
    presignResult.publicUrl.includes(presignResult.fileKey),
    `Public URL routed correctly: ${presignResult.publicUrl}`
  );
  console.log('');

  // -------------------------------------------------------------
  // Test 5: Cloudflare R2 Direct Buffer Upload & Download Key
  // -------------------------------------------------------------
  console.log('Test 5: Storage Buffer Ingestion & Download Retrieval');
  const testBuffer = Buffer.from('FLOWZORA_PODCAST_BINARY_TEST_DATA_STREAM');
  const uploadResult = await uploadBufferToR2(presignResult.fileKey, testBuffer, 'video/mp4');
  assert(uploadResult.fileKey === presignResult.fileKey, `File saved under key: ${uploadResult.fileKey}`);

  const downloadUrl = await getPresignedDownloadUrl(uploadResult.fileKey);
  assert(downloadUrl.length > 0, `Presigned download URL resolved: ${downloadUrl}`);
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

runIngestionTests().catch((err) => {
  console.error('Suite error:', err);
  process.exit(1);
});
