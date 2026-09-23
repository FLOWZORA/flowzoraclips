import { GoogleGenAI, Type } from '@google/genai';
import { CandidateScore, ScoreDimensions, ScoringEngine, ScoringFallbackReason, ScoringReport } from './types';
import { CandidateWindow } from './candidate-generator';
import { recordApiUsage, estimateTokens } from '@/lib/usage/usage-tracker';

const SCORING_SYSTEM_INSTRUCTION = `You are an elite short-form video editor and algorithmic viral strategist specializing in Hindi, Hinglish, and English creator content (YouTube Shorts, Instagram Reels, TikTok).
Your job is to evaluate candidate audio/video segments from long-form podcasts (each clip must be up to 35 seconds long) and assign rigorous, explainable scores from 0.0 to 10.0 across 4 specific dimensions:

1. hookStrength (0.0 to 10.0):
   - How compelling are the first 3-5 seconds?
   - Does it begin with a counter-intuitive statement, a high-stakes question, an emotional outburst, or an unresolved curiosity loop?
   - Low score if it starts with rambling, polite throat-clearing, or mid-sentence filler.

2. standaloneCoherence (0.0 to 10.0):
   - Can a complete stranger understand this clip without having watched the rest of the 45-minute podcast?
   - Does it have a self-contained beginning, middle, and end without dangling pronouns or unreferenced names?

3. emotionalPayoff (0.0 to 10.0):
   - Does the clip deliver on the promise of the hook?
   - Does it provide an actionable "aha!" takeaway, an inspirational punchline, a hilarious laugh, or raw vulnerability?

4. topicTrendAlignment (0.0 to 10.0):
   - How strongly does this topic resonate with Indian and global digital creators and Gen-Z/Millennial audiences?
   - High scoring topics: founder discipline, financial independence, career pivots, creator burnout, relationship realities, tech & AI.

Output strict JSON with exact numerical floats and a 1-line transparent reasoning explanation.`;

/**
 * Score a single candidate segment. Strict order — never reversed:
 *   1. Gemini first (primary).
 *   2. Groq LLM backup ONLY when Gemini hits its limit or errors.
 *   3. Offline heuristic last resort.
 * Groq reuses the existing GROQ_API_KEY (free tier, OpenAI-compatible chat
 * endpoint) — no new key needed.
 */
export async function scoreCandidateWithGemini(
  candidate: CandidateWindow,
  contextLanguage: string = 'hinglish'
): Promise<CandidateScore> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  // Defaults to no_api_key; overwritten if a call is attempted and fails.
  let fallbackReason: ScoringFallbackReason = 'no_api_key';

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `Candidate Segment (${candidate.duration}s):
Duration: ${candidate.startTime}s to ${candidate.endTime}s
Opening Hook Line: "${candidate.firstSentence}"
Closing Payoff Line: "${candidate.lastSentence}"
Full Transcript:
"""
${candidate.text}
"""

Evaluate this candidate and respond with structured JSON.`;

      const configuredModel = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
      const model = configuredModel === 'gemini-2.5-flash' || configuredModel === 'gemini-2.0-flash'
        ? 'gemini-3.6-flash'
        : configuredModel;

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SCORING_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hookStrength: { type: Type.NUMBER, description: 'Score 0 to 10 for hook impact' },
              standaloneCoherence: { type: Type.NUMBER, description: 'Score 0 to 10 for self-contained coherence' },
              emotionalPayoff: { type: Type.NUMBER, description: 'Score 0 to 10 for satisfying conclusion or punchline' },
              topicTrendAlignment: { type: Type.NUMBER, description: 'Score 0 to 10 for topic virality and trend resonance' },
              reasoning: { type: Type.STRING, description: '1-sentence transparent explanation of why this moment works or fails' },
            },
            required: ['hookStrength', 'standaloneCoherence', 'emotionalPayoff', 'topicTrendAlignment', 'reasoning'],
          },
          temperature: 0.2,
        },
      });

      const responseText = response.text?.trim();
      if (responseText) {
        const parsed = JSON.parse(responseText);
        const dimensions: ScoreDimensions = {
          hookStrength: clampScore(parsed.hookStrength),
          standaloneCoherence: clampScore(parsed.standaloneCoherence),
          emotionalPayoff: clampScore(parsed.emotionalPayoff),
          topicTrendAlignment: clampScore(parsed.topicTrendAlignment),
        };

        const compositeScore = calculateCompositeScore(dimensions);

        // Usage ledger (estimate-based, never throws — see usage-tracker).
        await recordApiUsage({ provider: 'gemini', kind: 'request', amount: 1 });
        return {
          dimensions,
          compositeScore,
          reasoning: parsed.reasoning || 'Strong contextual engagement and topic alignment.',
          scoringEngine: 'gemini',
        };
      }
      fallbackReason = 'empty_response';
    } catch (err: any) {
      // Classify so callers can distinguish "out of quota" (recoverable, and the
      // operator's to fix) from a genuine API fault.
      fallbackReason = classifyScoringError(err);
      console.warn(`Gemini live scoring failed (${fallbackReason}), falling back to heuristic scoring:`, err);
    }
  }

  // Deterministic heuristic scoring fallback when offline or without API key.
  // Tagged so a degraded run is never mistaken for a real AI ranking.
  // Backup: Groq LLM (same free GROQ_API_KEY as the transcription backup)
  // before giving up on AI ranking entirely.
  const groqScore = await scoreCandidateWithGroq(candidate, contextLanguage);
  if (groqScore) return groqScore;
  return { ...calculateHeuristicScore(candidate), fallbackReason };
}

/**
 * Backup scorer via Groq's free chat-completions endpoint (OpenAI-compatible).
 * Returns null (never throws) so the caller falls through to heuristics.
 */
async function scoreCandidateWithGroq(
  candidate: CandidateWindow,
  contextLanguage: string = 'hinglish'
): Promise<CandidateScore | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.includes('YourGroqApiKey')) return null;
  const model = process.env.GROQ_SCORING_MODEL || 'llama-3.3-70b-versatile';
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SCORING_SYSTEM_INSTRUCTION },
          {
            role: 'user',
            content: `Candidate Segment (${candidate.duration}s, language: ${contextLanguage}):
Duration: ${candidate.startTime}s to ${candidate.endTime}s
Opening Hook Line: "${candidate.firstSentence}"
Closing Payoff Line: "${candidate.lastSentence}"
Full Transcript:
"""
${candidate.text}
"""
Evaluate this candidate and respond with ONLY a JSON object with keys: hookStrength, standaloneCoherence, emotionalPayoff, topicTrendAlignment (numbers 0-10) and reasoning (1 sentence).`,
          },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[Scoring] Groq backup failed (${res.status}): ${errText.slice(0, 200)}`);
      return null;
    }
    const data: any = await res.json();
    const content: string = data?.choices?.[0]?.message?.content?.trim() || '';
    if (!content) return null;
    const parsed = JSON.parse(content);
    const dimensions: ScoreDimensions = {
      hookStrength: clampScore(parsed.hookStrength),
      standaloneCoherence: clampScore(parsed.standaloneCoherence),
      emotionalPayoff: clampScore(parsed.emotionalPayoff),
      topicTrendAlignment: clampScore(parsed.topicTrendAlignment),
    };
    // Usage ledger: estimated prompt+response tokens (never throws).
    await recordApiUsage({
      provider: 'groq-scoring',
      kind: 'token',
      amount: estimateTokens(candidate.text + candidate.firstSentence + candidate.lastSentence + content) + 500,
    });
    return {
      dimensions,
      compositeScore: calculateCompositeScore(dimensions),
      reasoning: parsed.reasoning || 'Strong contextual engagement and topic alignment.',
      scoringEngine: 'groq',
    };
  } catch (err: any) {
    console.warn('[Scoring] Groq backup error, falling back to heuristic scoring:', err?.message || err);
    return null;
  }
}

/** Maps an SDK error onto a stable reason code. */
function classifyScoringError(err: any): ScoringFallbackReason {
  const status = err?.status ?? err?.error?.code ?? err?.code;
  const text = `${err?.message ?? ''} ${JSON.stringify(err?.error ?? '')}`;
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(text)) return 'quota_exceeded';
  return 'api_error';
}

/** Aggregates per-clip engines into one report for the API response. */
export function buildScoringReport(scores: Iterable<CandidateScore>): ScoringReport {
  const list = [...scores];
  let geminiScored = 0;
  let groqScored = 0;
  let heuristicScored = 0;
  let fallbackReason: ScoringFallbackReason | undefined;

  for (const s of list) {
    if (s.scoringEngine === 'gemini') geminiScored++;
    else if (s.scoringEngine === 'groq') groqScored++;
    else {
      heuristicScored++;
      fallbackReason = fallbackReason ?? s.fallbackReason;
    }
  }

  const degraded = heuristicScored > 0;
  const aiEngines = new Set(
    list.map((s) => s.scoringEngine).filter((e) => e !== 'heuristic')
  );
  const engine: ScoringReport['engine'] = degraded
    ? aiEngines.size > 0
      ? 'mixed'
      : 'heuristic'
    : aiEngines.size === 1
      ? ([...aiEngines][0] as ScoringEngine)
      : 'mixed';

  const MESSAGES: Record<ScoringFallbackReason, string> = {
    quota_exceeded:
      'Gemini daily quota exhausted (Groq backup also unavailable) — clips were ranked by the offline heuristic, not the AI model. Quota resets at midnight Pacific.',
    no_api_key:
      'No Gemini API key configured — clips were ranked by the offline heuristic, not the AI model.',
    api_error:
      'Gemini API call failed — clips were ranked by the offline heuristic, not the AI model.',
    empty_response:
      'Gemini returned an empty response — clips were ranked by the offline heuristic, not the AI model.',
  };

  return {
    engine,
    degraded,
    geminiScored,
    groqScored,
    heuristicScored,
    fallbackReason,
    message: degraded && fallbackReason ? MESSAGES[fallbackReason] : undefined,
  };
}

/**
 * Score multiple candidate windows in parallel.
 */
export async function scoreCandidatesBatch(
  candidates: CandidateWindow[],
  contextLanguage: string = 'hinglish'
): Promise<Map<string, CandidateScore>> {
  const scoreMap = new Map<string, CandidateScore>();

  // Run scoring concurrently in chunks of 4 to manage rate limits
  const chunkSize = 4;
  for (let i = 0; i < candidates.length; i += chunkSize) {
    const chunk = candidates.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (c) => {
        const score = await scoreCandidateWithGemini(c, contextLanguage);
        return { id: c.id, score };
      })
    );

    results.forEach(({ id, score }) => scoreMap.set(id, score));
  }

  return scoreMap;
}

function clampScore(val: any): number {
  const num = typeof val === 'number' ? val : parseFloat(val) || 5;
  return Number(Math.max(0, Math.min(10, num)).toFixed(1));
}

export function calculateCompositeScore(d: ScoreDimensions): number {
  // Weighted virality formula:
  // Hook 35%, Coherence 25%, Emotion 20%, Trend 20% -> scaled to 0-100
  const raw = d.hookStrength * 3.5 + d.standaloneCoherence * 2.5 + d.emotionalPayoff * 2.0 + d.topicTrendAlignment * 2.0;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

/**
 * High-fidelity heuristic scoring engine based on linguistic patterns,
 * question markers, numbers, emotional keywords, and speech pace.
 *
 * Exported so the background job pipeline can pre-filter the hundreds of
 * candidates a multi-hour video produces down to a Gemini-scorable set.
 */
export function calculateHeuristicScore(candidate: CandidateWindow): CandidateScore {
  const text = candidate.text.toLowerCase();
  const first = candidate.firstSentence.toLowerCase();
  const last = candidate.lastSentence.toLowerCase();

  // Hook indicators: contrarian words, questions, numbers, strong assertions
  let hook = 6.5;
  if (/(\?|kyun|why|how|kaise|kya|what|problem|truth|secret|fail|mistake|burnout)/i.test(first)) hook += 2.0;
  if (/(\d+|ninety|percent|crore|lakh|million|zero|ten)/i.test(first)) hook += 1.2;
  if (/^(agar|if|when|jab|actually|reality)/i.test(first.trim())) hook += 0.8;

  // Coherence indicators: has clear sentences, reasonable length (ideal short-form vertical is 18-35s)
  let coherence = 7.0;
  if (candidate.duration >= 18 && candidate.duration <= 35) coherence += 1.5;
  if (candidate.snappedToBoundary) coherence += 1.0;
  if (/^(and|so|but|aur|phir)\s+/i.test(candidate.text.trim())) coherence -= 1.0;

  // Emotional payoff indicators: actionable closure, summary words
  let emotion = 6.5;
  if (/(isliye|conclusion|lesson|saved|growth|trust|game|win|reality|ticking|cash-flow)/i.test(last)) emotion += 2.2;
  if (/(!|important|flywheel|shift)/i.test(last)) emotion += 1.0;

  // Topic trend alignment: startup, creator, monetization, mental health
  let trend = 7.0;
  if (/(creator|content|burnout|algorithm|metrics|customer|startup|funding|product|revenue)/i.test(text)) trend += 2.2;
  if (/(viral|short|reels|flywheel|scale)/i.test(text)) trend += 0.8;

  const dimensions: ScoreDimensions = {
    hookStrength: clampScore(hook),
    standaloneCoherence: clampScore(coherence),
    emotionalPayoff: clampScore(emotion),
    topicTrendAlignment: clampScore(trend),
  };

  const compositeScore = calculateCompositeScore(dimensions);

  let reasoning = 'Strong semantic coherence and clear subject focus.';
  if (dimensions.hookStrength >= 8.5 && dimensions.emotionalPayoff >= 8.0) {
    reasoning = 'Contrarian opening statement paired with a clear, actionable payoff punchline.';
  } else if (dimensions.topicTrendAlignment >= 9.0) {
    reasoning = 'High resonance with current creator economy challenges and founder psychology.';
  } else if (dimensions.standaloneCoherence >= 9.0) {
    reasoning = 'Self-contained thought that delivers complete context within vertical video bounds.';
  }

  return {
    dimensions,
    compositeScore,
    reasoning,
    scoringEngine: 'heuristic',
  };
}
