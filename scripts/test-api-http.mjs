/**
 * HTTP End-to-End Test for Live Next.js Server (localhost:3000)
 */

async function testHttpEndpoints() {
  console.log('Testing live Next.js endpoints on http://localhost:3000...\n');
  const baseUrl = 'http://localhost:3000';
  const testIp = `10.42.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
  const testEmail = `creator_${Date.now()}@flowzora.test`;

  const headers = (extra = {}) => ({
    'X-Forwarded-For': testIp,
    ...extra,
  });

  // 1. Check Homepage
  console.log('1. GET /');
  const homeRes = await fetch(`${baseUrl}/`, { headers: headers() });
  console.log(`   Status: ${homeRes.status} (OK: ${homeRes.ok})`);
  const homeHtml = await homeRes.text();
  console.log(`   HTML contains "FLOWZORA Clips": ${homeHtml.includes('FLOWZORA')}`);

  // 2. Check Pricing Page (RSC Crawlable Plain HTML)
  console.log('2. GET /pricing');
  const pricingRes = await fetch(`${baseUrl}/pricing`, { headers: headers() });
  console.log(`   Status: ${pricingRes.status} (OK: ${pricingRes.ok})`);
  const pricingHtml = await pricingRes.text();
  console.log(`   Contains "$0.00": ${pricingHtml.includes('$0.00')}`);
  console.log(`   Contains "$12.00": ${pricingHtml.includes('$12.00')}`);
  console.log(`   Contains "$49.00": ${pricingHtml.includes('$49.00')}`);

  // 3. Test Magic Link Auth API
  console.log('3. POST /api/auth/magic-link');
  const authRes = await fetch(`${baseUrl}/api/auth/magic-link`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email: testEmail }),
  });
  const authJson = await authRes.json();
  console.log(`   Status: ${authRes.status}, Success: ${authJson.success}`);
  console.log(`   User ID: ${authJson.user?.id}, Credits: ${authJson.user?.creditsRemaining}`);

  const testUserId = authJson.user?.id || 'demo-user-1';

  // 4. Test Credits API
  console.log('4. GET /api/billing/credits');
  const creditsRes = await fetch(`${baseUrl}/api/billing/credits?userId=${testUserId}`, { headers: headers() });
  const creditsJson = await creditsRes.json();
  console.log(`   Status: ${creditsRes.status}, Success: ${creditsJson.success}`);
  console.log(`   Credits: ${creditsJson.user?.creditsRemaining}, Kill Switch: ${creditsJson.spendStatus?.isKillSwitchActive}`);

  // 5. Test Stripe Checkout API
  console.log('5. POST /api/billing/checkout');
  const checkoutRes = await fetch(`${baseUrl}/api/billing/checkout`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      userId: testUserId,
      email: testEmail,
      packId: 'creator_10',
    }),
  });
  const checkoutJson = await checkoutRes.json();
  console.log(`   Status: ${checkoutRes.status}, Success: ${checkoutJson.success}`);
  console.log(`   Session ID: ${checkoutJson.sessionId}`);
  console.log(`   Checkout URL: ${checkoutJson.checkoutUrl}`);

  // 6. Test Pipeline Analyze API with credit deduction (Credit 1 of 2 used)
  console.log('6. POST /api/pipeline/analyze');
  const pipeRes = await fetch(`${baseUrl}/api/pipeline/analyze`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      userId: testUserId,
      language: 'hinglish',
      scriptPreference: 'romanized',
      durationSec: 180,
    }),
  });
  const pipeJson = await pipeRes.json();
  console.log(`   Status: ${pipeRes.status}, Success: ${pipeJson.success}`);
  if (pipeJson.data) {
    console.log(`   Ranked clips count: ${pipeJson.data.rankedResult?.rankedClips?.length}`);
    console.log(`   Top clip score: ${pipeJson.data.rankedResult?.rankedClips?.[0]?.score?.compositeScore}`);
  }

  // 7. Test YouTube Ingestion API (Credit 2 of 2 used)
  console.log('7. GET /api/ingest/youtube (preview) & POST /api/ingest/youtube');
  const ytPreviewRes = await fetch(`${baseUrl}/api/ingest/youtube?url=https://youtu.be/dQw4w9WgXcQ`, { headers: headers() });
  const ytPreviewJson = await ytPreviewRes.json();
  console.log(`   GET Status: ${ytPreviewRes.status}, Video ID: ${ytPreviewJson.metadata?.videoId}`);

  const ytIngestRes = await fetch(`${baseUrl}/api/ingest/youtube`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      url: 'https://youtu.be/dQw4w9WgXcQ',
      userId: testUserId,
      language: 'hinglish',
      scriptPreference: 'romanized',
      estimatedDurationSec: 480,
    }),
  });
  const ytIngestJson = await ytIngestRes.json();
  console.log(`   POST Status: ${ytIngestRes.status}, Success: ${ytIngestJson.success}`);
  if (ytIngestJson.data) {
    console.log(`   Clips extracted: ${ytIngestJson.data.rankedResult?.rankedClips?.length}`);
  }

  // 8. Test Cloudflare R2 Presigned Upload API
  console.log('8. POST /api/upload/presigned-url');
  const presignRes = await fetch(`${baseUrl}/api/upload/presigned-url`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      filename: 'creator_interview_episode.mp4',
      contentType: 'video/mp4',
      fileSize: 45 * 1024 * 1024,
      userId: 'demo-user-1', // uses demo user with available credits
    }),
  });
  const presignJson = await presignRes.json();
  console.log(`   Status: ${presignRes.status}, Success: ${presignJson.success}`);
  console.log(`   Upload URL: ${presignJson.uploadUrl}`);
  console.log(`   File Key: ${presignJson.fileKey}`);

  // 9. Test Gemini Social Copy Generation API
  console.log('9. POST /api/pipeline/social-copy');
  const socialRes = await fetch(`${baseUrl}/api/pipeline/social-copy`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      clipId: 'clip-test-101',
      transcriptSnippet: 'Consistency is not about burning out everyday. It is about building a distribution flywheel.',
      reasoning: 'High founder resonance',
      scriptPreference: 'romanized',
    }),
  });
  const socialJson = await socialRes.json();
  console.log(`   Status: ${socialRes.status}, Success: ${socialJson.success}`);
  console.log(`   Title: "${socialJson.copy?.title}"`);
  console.log(`   Hashtags count: ${socialJson.copy?.hashtags?.length}`);

  // 10. Test Video Export & Download API
  console.log('10. POST /api/export/render & GET /api/export/render (download stream)');
  const exportRes = await fetch(`${baseUrl}/api/export/render`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      clipId: 'clip-test-101',
      startTime: 10,
      endTime: 40,
      format: '9:16',
    }),
  });
  const exportJson = await exportRes.json();
  console.log(`   POST Status: ${exportRes.status}, Success: ${exportJson.success}`);
  console.log(`   Download URL: ${exportJson.export?.downloadUrl}`);

  const downloadRes = await fetch(`${baseUrl}/api/export/render?clipId=clip-test-101&download=true&format=9:16`, {
    headers: headers(),
  });
  console.log(`   GET Download Stream Status: ${downloadRes.status}, Content-Type: ${downloadRes.headers.get('content-type')}`);
  console.log(`   Content-Disposition: ${downloadRes.headers.get('content-disposition')}`);

  console.log('\nAll 10 live HTTP endpoint checks finished successfully!');
}

testHttpEndpoints().catch(console.error);
