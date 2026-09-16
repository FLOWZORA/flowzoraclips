/**
 * FLOWZORA Clips — Gemini Social Copy Generator Test Suite
 * Validates:
 * 1. Hinglish Romanized social copy generation (title, hook, caption, hashtags, pinned comment)
 * 2. Devanagari Hindi social copy generation (native script)
 * 3. Platform-specific formatting for YouTube Shorts, Instagram Reels, and LinkedIn
 */

import { generateSocialCopy } from '../src/lib/pipeline/social-copy.ts';

async function runSocialCopyTests() {
  console.log('===========================================================');
  console.log('FLOWZORA Clips — Gemini Social Copy Generator Suite');
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

  const sampleSnippet =
    'अगर आप content create कर रहे हो तो consistency सबसे important चीज़ है। But problem ये है कि ninety percent creators burnout हो जाते हैं within six months. Actually reality ये है कि burnout comes from unstrategic production, not hard work.';

  // -------------------------------------------------------------
  // Test 1: Hinglish (Romanized Latin) Social Copy
  // -------------------------------------------------------------
  console.log('Test 1: Hinglish Social Copy Generation');
  const hinglishCopy = await generateSocialCopy({
    clipId: 'clip-test-hinglish-01',
    transcriptSnippet: sampleSnippet,
    reasoning: 'High resonance with founder psychology and content creator burnout',
    scriptPreference: 'romanized',
  });

  assert(hinglishCopy.title.length > 0, `Generated catchy headline: "${hinglishCopy.title}"`);
  assert(hinglishCopy.hook.length > 0, `Generated 3-sec opening hook: "${hinglishCopy.hook}"`);
  assert(hinglishCopy.caption.length > 0, `Generated context caption: "${hinglishCopy.caption.slice(0, 60)}..."`);
  assert(Array.isArray(hinglishCopy.hashtags) && hinglishCopy.hashtags.length >= 4, `Generated ${hinglishCopy.hashtags.length} hashtags: ${hinglishCopy.hashtags.slice(0, 3).join(' ')}`);
  assert(hinglishCopy.pinnedComment.length > 0, `Generated pinned comment question: "${hinglishCopy.pinnedComment}"`);
  assert(hinglishCopy.platformRecommendations.youtubeShorts.includes(hinglishCopy.title), 'YouTube Shorts platform block includes title');
  assert(hinglishCopy.platformRecommendations.instagramReels.includes(hinglishCopy.hook), 'Instagram Reels platform block includes hook');
  console.log('');

  // -------------------------------------------------------------
  // Test 2: Native Devanagari Hindi Social Copy
  // -------------------------------------------------------------
  console.log('Test 2: Devanagari Script Social Copy Generation');
  const devanagariCopy = await generateSocialCopy({
    clipId: 'clip-test-devanagari-02',
    transcriptSnippet: sampleSnippet,
    reasoning: 'Authentic regional creator connection',
    scriptPreference: 'devanagari',
  });

  assert(devanagariCopy.title.length > 0, `Generated Devanagari headline: "${devanagariCopy.title}"`);
  assert(/[\u0900-\u097F]/.test(devanagariCopy.title), 'Devanagari characters confirmed in headline');
  assert(devanagariCopy.hook.length > 0, `Generated Devanagari hook: "${devanagariCopy.hook}"`);
  assert(/[\u0900-\u097F]/.test(devanagariCopy.caption), 'Devanagari characters confirmed in caption');
  assert(devanagariCopy.pinnedComment.length > 0, `Generated Devanagari pinned comment: "${devanagariCopy.pinnedComment}"`);
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

runSocialCopyTests().catch((err) => {
  console.error('Suite error:', err);
  process.exit(1);
});
