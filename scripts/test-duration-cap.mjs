import fs from 'fs';
import path from 'path';
import { generateCandidateSegments } from '../src/lib/pipeline/candidate-generator.ts';
import { dedupeAndRankCandidates } from '../src/lib/pipeline/ranker.ts';

// Test 1: Synthetic long monologue with 200 words over 120 seconds
const syntheticWords = [];
for (let i = 0; i < 200; i++) {
  const start = Number((i * 0.6).toFixed(2));
  const end = Number((start + 0.5).toFixed(2));
  // Punctuate every 30 words or so (~18s)
  const isPunct = (i % 28 === 0 && i > 0);
  const word = isPunct ? `word${i}.` : `word${i}`;
  syntheticWords.push({ word, start, end, confidence: 0.95 });
}

const totalDuration = syntheticWords[syntheticWords.length - 1].end;
console.log(`Generated synthetic transcript: ${syntheticWords.length} words, ${totalDuration}s total duration`);

const candidates = generateCandidateSegments([], syntheticWords, totalDuration);
console.log(`Generated ${candidates.length} candidates:`);

let allUnder35 = true;
candidates.forEach((c, idx) => {
  console.log(`  Candidate #${idx}: ${c.startTime}s -> ${c.endTime}s (Duration: ${c.duration}s)`);
  if (c.duration > 35) {
    allUnder35 = false;
    console.error(`  FAIL: Candidate #${idx} duration ${c.duration} > 35s!`);
  }
});

// Test 2: Pass candidates into dedupeAndRankCandidates
const scoreMap = new Map();
candidates.forEach((c) => {
  scoreMap.set(c.id, {
    compositeScore: 85,
    dimensions: { hookStrength: 8, standaloneCoherence: 8, emotionalPayoff: 8, topicTrendAlignment: 8 },
    reasoning: 'Test candidate',
  });
});

const ranked = dedupeAndRankCandidates(candidates, scoreMap, totalDuration, 70);
console.log(`\nRanked clips (${ranked.rankedClips.length}):`);
ranked.rankedClips.forEach((c) => {
  console.log(`  Rank #${c.rank}: ${c.startTime}s -> ${c.endTime}s (Duration: ${c.duration}s)`);
  if (c.duration > 35) {
    allUnder35 = false;
    console.error(`  FAIL: Ranked clip #${c.rank} duration ${c.duration} > 35s!`);
  }
});

if (allUnder35) {
  console.log('\n[PASS] All candidates and ranked clips are strictly <= 35 seconds long!');
} else {
  console.error('\n[FAIL] Found clips exceeding 35 seconds!');
  process.exit(1);
}
