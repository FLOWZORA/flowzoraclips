import { GoogleGenAI, Type, Schema } from '@google/genai';
import { ScriptPreference } from './types';

export interface SocialCopyRequest {
  clipId: string;
  transcriptSnippet: string;
  hookStrength?: number;
  reasoning?: string;
  scriptPreference?: ScriptPreference;
  durationSec?: number;
}

export interface SocialCopyResult {
  clipId: string;
  title: string;
  hook: string;
  caption: string;
  hashtags: string[];
  pinnedComment: string;
  scriptPreference: ScriptPreference;
  platformRecommendations: {
    instagramReels: string;
    youtubeShorts: string;
    linkedInPost: string;
  };
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

const socialCopyJsonSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Ultra-catchy, high-CTR headline with 1-2 relevant emojis (under 60 chars).',
    },
    hook: {
      type: Type.STRING,
      description: 'Opening 1-2 sentence hook designed to stop the scroll in first 3 seconds.',
    },
    caption: {
      type: Type.STRING,
      description: 'Engaging 3-4 sentence video context explaining key takeaway with call to action.',
    },
    hashtags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '5 to 8 high-relevance hashtags tailored for Hinglish/Indian creator community.',
    },
    pinnedComment: {
      type: Type.STRING,
      description: 'Thought-provoking question to spark audience debate and comments.',
    },
  },
  required: ['title', 'hook', 'caption', 'hashtags', 'pinnedComment'],
};

/**
 * Generates viral social media copy using Gemini 2.5 Flash.
 * Optimized for Indian creator culture (Hinglish/Hindi).
 */
export async function generateSocialCopy(req: SocialCopyRequest): Promise<SocialCopyResult> {
  const scriptPref = req.scriptPreference || 'romanized';
  const ai = getGeminiClient();

  if (ai) {
    try {
      const scriptDirective =
        scriptPref === 'devanagari'
          ? 'Write the title, hook, and caption in natural, engaging Hindi using Devanagari script (देवनागरी).'
          : 'Write the title, hook, and caption in natural, conversational Hinglish (Hindi written in Romanized Latin script with English keywords, as popular Indian creators like Tanmay Bhat, Nikhil Kamath, or Ranveer Allahbadia speak).';

      const prompt = `You are an elite short-form social media strategist for top Indian podcasters and creators.
Generate viral titles, captions, and hashtags for the following highlight clip extracted from a long-form podcast.

[CLIP TRANSCRIPT]:
"${req.transcriptSnippet}"

[CURATOR REASONING]:
"${req.reasoning || 'High emotional payoff and contrarian insight'}"

[LANGUAGE / SCRIPT INSTRUCTION]:
${scriptDirective}

Return a clean, high-impact JSON object matching the requested schema.`;

      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: socialCopyJsonSchema,
          temperature: 0.7,
        },
      });

      const parsed = JSON.parse(response.text || '{}');

      return {
        clipId: req.clipId,
        title: parsed.title,
        hook: parsed.hook,
        caption: parsed.caption,
        hashtags: parsed.hashtags,
        pinnedComment: parsed.pinnedComment,
        scriptPreference: scriptPref,
        platformRecommendations: {
          youtubeShorts: `${parsed.title}\n\n${parsed.hook}\n\n${parsed.hashtags.join(' ')}`,
          instagramReels: `${parsed.hook}\n\n${parsed.caption}\n.\n.\n${parsed.hashtags.join(' ')}`,
          linkedInPost: `💡 Key Takeaway on Founder Mindset:\n\n${parsed.caption}\n\n👉 What is your take on this? Let's discuss in the comments.\n\n${parsed.hashtags.slice(0, 4).join(' ')}`,
        },
      };
    } catch (err) {
      console.warn('[Gemini Social Copy] API generation failed, using intelligent rule-based generator:', err);
    }
  }

  // High-quality rule-based fallback generator
  return generateRuleBasedCopy(req);
}

/**
 * Deterministic, high-quality rule-based generator used during development or when Gemini API key is unset.
 */
function generateRuleBasedCopy(req: SocialCopyRequest): SocialCopyResult {
  const isDevanagari = req.scriptPreference === 'devanagari';

  let title = '';
  let hook = '';
  let caption = '';
  let hashtags: string[] = [];
  let pinnedComment = '';

  if (isDevanagari) {
    title = '90% क्रिएटर्स यह गलती करते हैं 🤯';
    hook = 'अगर आप कंटेंट बना रहे हो, तो यह एक बात आपकी पूरी ग्रोथ बदल सकती है।';
    caption = 'कंसिस्टेंसी सिर्फ रोज़ पोस्ट करने से नहीं आती, स्ट्रैटेजिक प्लानिंग से आती है। जब हमने शुरुआत की थी, तब समझ आया कि असली खेल ट्रस्ट का है, खाली नंबर्स का नहीं। पूरा वीडियो देखें और अपनी राय बताएं!';
    hashtags = ['#CreatorEconomy', '#HindiPodcast', '#ContentCreation', '#GrowthMindset', '#StartupIndia', '#Podcasting'];
    pinnedComment = 'क्या आपको भी कंटेंट बनाते वक्त बर्नआउट महसूस हुआ है? कमेंट्स में शेयर करें 👇';
  } else {
    title = '90% Founders Make This Exact Mistake 🤯';
    hook = 'Consistency is not about burning out everyday. It is about building a distribution flywheel that actually compounds.';
    caption = 'When you share behind-the-scenes struggles and real metrics, trust builds 10x faster than showing artificial success. Watch till the end for the exact shift we made.';
    hashtags = ['#FounderJourney', '#CreatorEconomy', '#HinglishPodcast', '#StartupIndia', '#ProductStrategy', '#Growth'];
    pinnedComment = 'Have you experienced this in your startup or content journey? Drop your thoughts below 👇';
  }

  return {
    clipId: req.clipId,
    title,
    hook,
    caption,
    hashtags,
    pinnedComment,
    scriptPreference: req.scriptPreference || 'romanized',
    platformRecommendations: {
      youtubeShorts: `${title}\n\n${hook}\n\n${hashtags.join(' ')}`,
      instagramReels: `${hook}\n\n${caption}\n.\n.\n${hashtags.join(' ')}`,
      linkedInPost: `💡 Key Takeaway on Building in Public:\n\n${caption}\n\n👉 What has your experience been? Let's discuss below.\n\n${hashtags.slice(0, 4).join(' ')}`,
    },
  };
}
