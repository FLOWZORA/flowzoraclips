'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  Sparkles,
  Share2,
  Video,
  FileText,
  MessageSquare,
  Hash,
  Loader2,
} from 'lucide-react';
import { CandidateClip } from '@/lib/pipeline/types';
import { SocialCopyResult } from '@/lib/pipeline/social-copy';

interface SocialCopyModalProps {
  isOpen: boolean;
  onClose: () => void;
  clip: CandidateClip | null;
  defaultScriptPreference?: 'romanized' | 'devanagari';
}

export default function SocialCopyModal({
  isOpen,
  onClose,
  clip,
  defaultScriptPreference = 'romanized',
}: SocialCopyModalProps) {
  const [activePlatform, setActivePlatform] = useState<'youtube' | 'instagram' | 'linkedin' | 'all'>('youtube');
  const [scriptPreference, setScriptPreference] = useState<'romanized' | 'devanagari'>(defaultScriptPreference);
  const [loading, setLoading] = useState(false);
  const [copyData, setCopyData] = useState<SocialCopyResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchSocialCopy = async (script: 'romanized' | 'devanagari') => {
    if (!clip) return;
    setLoading(true);

    try {
      const res = await fetch('/api/pipeline/social-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: clip.id,
          transcriptSnippet: clip.transcriptSnippet,
          reasoning: clip.score.reasoning,
          scriptPreference: script,
          durationSec: clip.duration,
        }),
      });

      const json = await res.json();
      if (json.success && json.copy) {
        setCopyData(json.copy);
      }
    } catch (err) {
      console.error('Failed to generate social copy:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && clip) {
      fetchSocialCopy(scriptPreference);
    }
  }, [isOpen, clip, scriptPreference]);

  if (!isOpen || !clip) return null;

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const currentPlatformText = () => {
    if (!copyData) return '';
    if (activePlatform === 'youtube') return copyData.platformRecommendations.youtubeShorts;
    if (activePlatform === 'instagram') return copyData.platformRecommendations.instagramReels;
    if (activePlatform === 'linkedin') return copyData.platformRecommendations.linkedInPost;
    return `${copyData.title}\n\n${copyData.hook}\n\n${copyData.caption}\n\n${copyData.hashtags.join(' ')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[#2B3040] bg-[#141620] p-6 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#9AA2B6] hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FF5722] text-white font-black text-xs">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-extrabold text-sm tracking-tight text-white font-[var(--font-outfit)]">
            Gemini Social Copy Generator
          </span>
          <span className="rounded-full bg-[#FF5722]/15 px-2 py-0.5 text-[10px] font-bold text-[#FF5722]">
            Rank #{clip.rank} • Score {clip.score.compositeScore}/100
          </span>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#242938] pb-4">
          <div>
            <h3 className="text-base font-extrabold text-white">
              Ready-to-Post Captions & Hashtags
            </h3>
            <p className="text-xs text-[#9AA2B6] mt-0.5">
              Engineered with Gemini 2.5 Flash for maximum short-form CTR and algorithmic distribution.
            </p>
          </div>

          {/* Script Toggle */}
          <div className="flex items-center gap-1 rounded-lg bg-[#0A0B10] p-1 border border-[#242938] shrink-0">
            <button
              onClick={() => setScriptPreference('romanized')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-all ${
                scriptPreference === 'romanized'
                  ? 'bg-[#FF5722] text-white shadow-sm'
                  : 'text-[#9AA2B6] hover:text-white'
              }`}
            >
              Hinglish
            </button>
            <button
              onClick={() => setScriptPreference('devanagari')}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-all ${
                scriptPreference === 'devanagari'
                  ? 'bg-[#FF5722] text-white shadow-sm'
                  : 'text-[#9AA2B6] hover:text-white'
              }`}
            >
              हिन्दी
            </button>
          </div>
        </div>

        {/* Platform Selector Tabs */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActivePlatform('youtube')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activePlatform === 'youtube'
                ? 'bg-[#FF0000]/20 text-[#FF4444] border border-[#FF0000]/40'
                : 'bg-[#0A0B10] text-[#9AA2B6] hover:text-white border border-[#242938]'
            }`}
          >
            <Video className="h-3.5 w-3.5" />
            <span>YouTube Shorts</span>
          </button>
          <button
            onClick={() => setActivePlatform('instagram')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activePlatform === 'instagram'
                ? 'bg-[#E1306C]/20 text-[#E1306C] border border-[#E1306C]/40'
                : 'bg-[#0A0B10] text-[#9AA2B6] hover:text-white border border-[#242938]'
            }`}
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>Instagram Reels</span>
          </button>
          <button
            onClick={() => setActivePlatform('linkedin')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activePlatform === 'linkedin'
                ? 'bg-[#0077B5]/20 text-[#0077B5] border border-[#0077B5]/40'
                : 'bg-[#0A0B10] text-[#9AA2B6] hover:text-white border border-[#242938]'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>LinkedIn Post</span>
          </button>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="my-12 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#FF5722] mb-3" />
            <p className="text-xs text-[#9AA2B6]">Synthesizing viral social copy with Gemini 2.5 Flash...</p>
          </div>
        ) : copyData ? (
          <div className="mt-4 space-y-4">
            {/* Quick 1-Click Complete Platform Block */}
            <div className="relative rounded-xl border border-[#2B3040] bg-[#0A0B10] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#FFB800]">
                  Full Formatted Copy ({activePlatform.toUpperCase()})
                </span>
                <button
                  onClick={() => handleCopy(currentPlatformText(), 'platform')}
                  className="flex items-center gap-1 rounded bg-[#FF5722] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#F44336] transition-colors"
                >
                  {copiedField === 'platform' ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy All</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="text-xs text-white whitespace-pre-wrap font-sans leading-relaxed bg-[#141620] p-3 rounded-lg border border-[#242938]">
                {currentPlatformText()}
              </pre>
            </div>

            {/* Individual Modular Elements */}
            <div className="grid grid-cols-1 gap-3">
              {/* Title */}
              <div className="rounded-lg border border-[#242938] bg-[#0A0B10] p-3">
                <div className="flex items-center justify-between text-xs text-[#9AA2B6] mb-1">
                  <span className="font-semibold text-white">Title / Headline:</span>
                  <button
                    onClick={() => handleCopy(copyData.title, 'title')}
                    className="text-[#FF5722] hover:underline flex items-center gap-1 text-[11px]"
                  >
                    {copiedField === 'title' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedField === 'title' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="text-xs font-bold text-[#FFB800]">{copyData.title}</p>
              </div>

              {/* Hook */}
              <div className="rounded-lg border border-[#242938] bg-[#0A0B10] p-3">
                <div className="flex items-center justify-between text-xs text-[#9AA2B6] mb-1">
                  <span className="font-semibold text-white">Opening Hook (First 3 Seconds):</span>
                  <button
                    onClick={() => handleCopy(copyData.hook, 'hook')}
                    className="text-[#FF5722] hover:underline flex items-center gap-1 text-[11px]"
                  >
                    {copiedField === 'hook' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedField === 'hook' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="text-xs text-white italic">"{copyData.hook}"</p>
              </div>

              {/* Hashtags */}
              <div className="rounded-lg border border-[#242938] bg-[#0A0B10] p-3">
                <div className="flex items-center justify-between text-xs text-[#9AA2B6] mb-1">
                  <span className="font-semibold text-white flex items-center gap-1">
                    <Hash className="h-3.5 w-3.5 text-[#FF5722]" /> Trending Hashtags:
                  </span>
                  <button
                    onClick={() => handleCopy(copyData.hashtags.join(' '), 'hashtags')}
                    className="text-[#FF5722] hover:underline flex items-center gap-1 text-[11px]"
                  >
                    {copiedField === 'hashtags' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedField === 'hashtags' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {copyData.hashtags.map((tag, i) => (
                    <span key={i} className="rounded bg-[#1E2230] px-2 py-0.5 text-[11px] text-[#9AA2B6]">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Pinned Comment */}
              <div className="rounded-lg border border-[#242938] bg-[#0A0B10] p-3">
                <div className="flex items-center justify-between text-xs text-[#9AA2B6] mb-1">
                  <span className="font-semibold text-white flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5 text-[#10B981]" /> Pinned Comment Question:
                  </span>
                  <button
                    onClick={() => handleCopy(copyData.pinnedComment, 'pinned')}
                    className="text-[#FF5722] hover:underline flex items-center gap-1 text-[11px]"
                  >
                    {copiedField === 'pinned' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedField === 'pinned' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="text-xs text-white">{copyData.pinnedComment}</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
