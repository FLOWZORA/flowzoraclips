'use client';

import React, { useState } from 'react';
import {
  Upload,
  Link2,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Flame,
  SplitSquareVertical,
  Layers,
  Play,
  Share2,
  Download,
} from 'lucide-react';
import { CandidateClip } from '@/lib/pipeline/types';
import ClipVideoPreview from '@/components/ClipVideoPreview';
import CheckoutButton from '@/components/CheckoutButton';
import AuthModal from '@/components/AuthModal';
import SocialCopyModal from '@/components/SocialCopyModal';

interface NaiveClip {
  id: string;
  startTime: number;
  endTime: number;
  textSnippet: string;
  cutMidSentence: boolean;
}

export default function HeroUploader() {
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('upload');
  const [language, setLanguage] = useState<'hinglish' | 'hindi' | 'english' | 'auto'>('hinglish');
  const [scriptPreference, setScriptPreference] = useState<'romanized' | 'devanagari'>('romanized');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeMetadata, setYoutubeMetadata] = useState<{
    videoId: string;
    title: string;
    author: string;
    durationSec: number;
    formattedDuration: string;
    thumbnailUrl: string;
    isEligibleForFreeTier: boolean;
  } | null>(null);
  const [isFetchingYtMetadata, setIsFetchingYtMetadata] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [viewMode, setViewMode] = useState<'flowzora' | 'naive'>('flowzora');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [requiresTopup, setRequiresTopup] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [rankedClips, setRankedClips] = useState<CandidateClip[]>([]);
  const [naiveClips, setNaiveClips] = useState<NaiveClip[]>([]);
  const [previewClip, setPreviewClip] = useState<CandidateClip | null>(null);
  const [socialCopyClip, setSocialCopyClip] = useState<CandidateClip | null>(null);
  const [stats, setStats] = useState({
    duration: 0,
    words: 0,
    fillersCount: 0,
    dedupedCount: 0,
  });

  // Handle YouTube URL change with debounced preview fetch
  const handleUrlChange = async (url: string) => {
    setYoutubeUrl(url);
    setErrorMessage(null);
    setRequiresTopup(false);

    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      setIsFetchingYtMetadata(true);
      try {
        const res = await fetch(`/api/ingest/youtube?url=${encodeURIComponent(url.trim())}`);
        const json = await res.json();
        if (json.success && json.metadata) {
          setYoutubeMetadata(json.metadata);
          if (!json.metadata.isEligibleForFreeTier) {
            setRequiresTopup(true);
            setErrorMessage(`Video duration (${json.metadata.formattedDuration}) exceeds the 10-minute Free Tier cap. A Creator Top-Up is required to process.`);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch YouTube preview metadata:', err);
      } finally {
        setIsFetchingYtMetadata(false);
      }
    } else {
      setYoutubeMetadata(null);
    }
  };

  const handleRunPipeline = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setRequiresTopup(false);
    setRequiresAuth(false);
    setUploadProgress(null);
    setStatusMessage('Preparing processing pipeline...');

    try {
      // Check stored user id
      let activeUserId = 'demo-user-1';
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('flowzora_user');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed.id) activeUserId = parsed.id;
          } catch (_) {}
        }
      }

      // -------------------------------------------------------------
      // CASE 1: YouTube Ingestion
      // -------------------------------------------------------------
      if (activeTab === 'url') {
        if (!youtubeUrl || !youtubeUrl.trim()) {
          setErrorMessage('Please enter a valid YouTube video or podcast URL.');
          setIsProcessing(false);
          return;
        }

        setStatusMessage('Fetching YouTube metadata & extracting audio stream...');

        const res = await fetch('/api/ingest/youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: youtubeUrl.trim(),
            userId: activeUserId,
            language,
            scriptPreference,
          }),
        });

        const json = await res.json();
        if (!res.ok || !json.success) {
          const msg = json.error || 'YouTube ingestion failed.';
          setErrorMessage(msg);
          if (msg.toLowerCase().includes('top-up') || msg.toLowerCase().includes('exceeds') || msg.toLowerCase().includes('credits')) {
            setRequiresTopup(true);
          } else if (msg.toLowerCase().includes('sign in') || msg.toLowerCase().includes('authentication')) {
            setRequiresAuth(true);
          }
          return;
        }

        if (json.data) {
          const d = json.data;
          setRankedClips(d.rankedResult.rankedClips || []);
          setNaiveClips(d.rankedResult.comparisonWithNaiveChunking?.naiveClips || []);
          setStats({
            duration: d.duration,
            words: d.transcription.words.length,
            fillersCount: d.fillerReport.fillerCount,
            dedupedCount: d.rankedResult.dedupedCount,
          });
          setShowResults(true);

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('flowzora_auth_changed'));
          }
        }
        return;
      }

      // -------------------------------------------------------------
      // CASE 2: Direct File Upload to Cloudflare R2
      // -------------------------------------------------------------
      if (selectedFile) {
        setStatusMessage('Requesting Cloudflare R2 presigned upload URL...');

        const presignRes = await fetch('/api/upload/presigned-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: selectedFile.name,
            contentType: selectedFile.type || 'video/mp4',
            fileSize: selectedFile.size,
            userId: activeUserId,
          }),
        });

        const presignData = await presignRes.json();
        if (!presignRes.ok || !presignData.success) {
          setErrorMessage(presignData.error || 'Upload request was denied.');
          if (presignData.error?.includes('10 minutes') || presignData.error?.includes('credits')) {
            setRequiresTopup(true);
          }
          return;
        }

        setStatusMessage(`Direct streaming to R2 (${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)...`);

        // Upload directly to Cloudflare R2 via presigned PUT URL
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', presignData.uploadUrl);
          xhr.setRequestHeader('Content-Type', selectedFile.type || 'video/mp4');

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 100);
              setUploadProgress(percent);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              setUploadProgress(100);
              resolve();
            } else {
              reject(new Error(`Storage upload failed with status ${xhr.status}. Check R2 bucket permissions.`));
            }
          };

          xhr.onerror = () =>
            reject(
              new Error(
                'Direct upload blocked by Cloudflare R2 CORS. Please add the CORS policy to your R2 bucket "flowzoraclips" in Cloudflare Dashboard, or use the YouTube URL tab for instant server-side processing.'
              )
            );
          xhr.send(selectedFile);
        });
      }

      // -------------------------------------------------------------
      // CASE 3: Highlight Extraction Pipeline
      // -------------------------------------------------------------
      setStatusMessage('Transcribing speech with word-level timestamps...');
      setTimeout(() => setStatusMessage('Detecting English & Hindi filler words...'), 350);
      setTimeout(() => setStatusMessage('Snapping windows to semantic sentence boundaries...'), 700);
      setTimeout(() => setStatusMessage('Evaluating Hook, Coherence, Emotion & Trend via Gemini 2.5 Flash...'), 1100);

      const res = await fetch('/api/pipeline/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language,
          scriptPreference,
          userId: activeUserId,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        const msg = json.error || 'Pipeline analysis failed';
        setErrorMessage(msg);
        if (msg.toLowerCase().includes('top-up') || msg.toLowerCase().includes('exceeds') || msg.toLowerCase().includes('credits')) {
          setRequiresTopup(true);
        } else if (msg.toLowerCase().includes('sign in') || msg.toLowerCase().includes('authentication')) {
          setRequiresAuth(true);
        }
        return;
      }

      if (json.success && json.data) {
        const d = json.data;
        setRankedClips(d.rankedResult.rankedClips || []);
        setNaiveClips(d.rankedResult.comparisonWithNaiveChunking?.naiveClips || []);
        setStats({
          duration: d.duration,
          words: d.transcription.words.length,
          fillersCount: d.fillerReport.fillerCount,
          dedupedCount: d.rankedResult.dedupedCount,
        });
        setShowResults(true);

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('flowzora_auth_changed'));
        }
      }
    } catch (err: any) {
      console.error('Pipeline call failed:', err);
      setErrorMessage(err.message || 'Pipeline analysis failed');
    } finally {
      setIsProcessing(false);
      setStatusMessage('');
      setUploadProgress(null);
    }
  };

  const handleNudge = (clipId: string, type: 'start' | 'end', deltaSec: number) => {
    setRankedClips((prev) =>
      prev.map((c) => {
        if (c.id === clipId) {
          const newStart = type === 'start' ? Math.max(0, c.startTime + deltaSec) : c.startTime;
          const newEnd = type === 'end' ? c.endTime + deltaSec : c.endTime;
          return {
            ...c,
            startTime: Number(newStart.toFixed(1)),
            endTime: Number(newEnd.toFixed(1)),
            duration: Number((newEnd - newStart).toFixed(1)),
          };
        }
        return c;
      })
    );
  };

  return (
    <div id="app" className="w-full max-w-5xl mx-auto">
      {/* Main Tool Container */}
      <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] shadow-[0_0_60px_-15px_rgba(0,0,0,0.8)] p-4 sm:p-6 lg:p-8">
        {/* Top Controls Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#262626] pb-5">
          {/* Input Method Switcher */}
          <div className="flex items-center gap-1 rounded-lg bg-[#111111] p-1 border border-[#262626]">
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition-all ${
                activeTab === 'upload'
                  ? 'bg-[#222222] text-white shadow-sm border border-[#333333]'
                  : 'text-[#A1A1A1] hover:text-white'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Audio / Video
            </button>
            <button
              onClick={() => setActiveTab('url')}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition-all ${
                activeTab === 'url'
                  ? 'bg-[#222222] text-white shadow-sm border border-[#333333]'
                  : 'text-[#A1A1A1] hover:text-white'
              }`}
            >
              <Link2 className="h-3.5 w-3.5" />
              YouTube URL
            </button>
          </div>

          {/* Language & Script Selector */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-mono text-[#A1A1A1]">AUDIO:</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as any)}
                className="rounded-md border border-[#262626] bg-[#111111] px-2.5 py-1.5 text-xs text-[#EDEDED] focus:outline-none focus:border-[#555555] transition-colors"
              >
                <option value="hinglish">Hinglish (Hindi + English)</option>
                <option value="hindi">Hindi (हिन्दी)</option>
                <option value="english">English</option>
                <option value="auto">Auto-detect</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-mono text-[#A1A1A1]">CAPTIONS:</label>
              <select
                value={scriptPreference}
                onChange={(e) => setScriptPreference(e.target.value as any)}
                className="rounded-md border border-[#262626] bg-[#111111] px-2.5 py-1.5 text-xs text-[#EDEDED] focus:outline-none focus:border-[#555555] transition-colors"
              >
                <option value="romanized">Romanized (Latin Script)</option>
                <option value="devanagari">Devanagari (देवनागरी)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Input Body */}
        <div className="mt-6">
          {activeTab === 'upload' ? (
            <div className="relative rounded-xl border border-dashed border-[#262626] bg-[#050505] p-8 text-center hover:border-[#404040] hover:bg-[#080808] transition-all cursor-pointer group">
              <input
                type="file"
                accept="video/mp4,video/quicktime,audio/mpeg,audio/wav"
                onChange={(e) => {
                  if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[#111111] border border-[#262626] text-[#EDEDED] group-hover:scale-105 transition-transform">
                <Upload className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-medium text-white">
                {selectedFile ? (
                  <span>
                    {selectedFile.name}{' '}
                    <span className="text-xs font-mono text-[#A1A1A1]">
                      ({(selectedFile.size / (1024 * 1024)).toFixed(1)}&nbsp;MB)
                    </span>
                  </span>
                ) : (
                  'Drop long-form podcast or video here, or click to browse'
                )}
              </p>
              <p className="mt-1 text-xs text-[#A1A1A1]">
                Direct Cloudflare R2 Presigned Uploads • Supports MP4, MOV, MP3, WAV
              </p>

              {/* Real-time Upload Progress Bar */}
              {uploadProgress !== null && (
                <div className="mt-4 w-full max-w-md mx-auto">
                  <div className="flex justify-between text-xs text-[#A1A1A1] mb-1 font-mono">
                    <span>Streaming to Cloudflare R2…</span>
                    <span className="font-semibold text-white tabular-nums">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-[#1A1A1A] rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-white h-1.5 transition-all duration-150"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#262626] bg-[#050505] p-4 flex flex-col sm:flex-row items-center gap-3">
                <input
                  type="url"
                  placeholder="Paste YouTube podcast URL (e.g. https://youtube.com/watch?v=…)"
                  value={youtubeUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  className="w-full rounded-md bg-[#111111] border border-[#262626] px-3.5 py-2.5 text-sm text-[#EDEDED] placeholder-[#666666] focus:outline-none focus:border-[#555555] transition-colors"
                />
                <button
                  type="button"
                  onClick={handleRunPipeline}
                  disabled={isProcessing}
                  className="w-full sm:w-auto shrink-0 rounded-md bg-white px-5 py-2.5 text-xs font-semibold text-black hover:bg-[#E5E5E5] transition-colors disabled:opacity-50"
                >
                  {isProcessing ? 'Extracting…' : 'Fetch & Extract'}
                </button>
              </div>

              {/* YouTube Video Preview Card */}
              {youtubeMetadata && (
                <div className="rounded-xl border border-[#262626] bg-[#050505] p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <img
                    src={youtubeMetadata.thumbnailUrl}
                    alt={youtubeMetadata.title}
                    className="w-full sm:w-36 h-20 object-cover rounded-lg border border-[#2B3040] shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-white truncate" title={youtubeMetadata.title}>
                      {youtubeMetadata.title}
                    </h4>
                    <p className="text-xs text-[#9AA2B6] mt-0.5">{youtubeMetadata.author}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded bg-[#1E2230] px-2 py-0.5 text-[11px] font-medium text-white">
                        ⏱ {youtubeMetadata.formattedDuration}
                      </span>
                      {youtubeMetadata.isEligibleForFreeTier ? (
                        <span className="rounded bg-[#10B981]/15 text-[#10B981] px-2 py-0.5 text-[11px] font-bold">
                          ✓ Free Tier Eligible (≤10m)
                        </span>
                      ) : (
                        <span className="rounded bg-[#FF5722]/15 text-[#FF5722] px-2 py-0.5 text-[11px] font-bold">
                          ⚠ Top-Up Required (&gt;10m)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Free Tier Notice & Safeguard */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#9AA2B6] px-1">
          <div className="flex items-center gap-1.5 text-[#10B981]">
            <ShieldCheck className="h-4 w-4" />
            <span>Monthly Recurring Free Tier: 2 videos / month (≤10 min each)</span>
          </div>
          <div>No credit card required for free clips</div>
        </div>

        {/* Error / Upgrade Prompt Banner */}
        {errorMessage && (
          <div className="mt-4 rounded-xl border border-[#EF4444]/40 bg-[#EF4444]/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-5 w-5 text-[#EF4444] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-white">{errorMessage}</p>
                {requiresTopup && (
                  <p className="text-[11px] text-[#9AA2B6] mt-0.5">
                    Free accounts are hard-capped at 10 minutes. Top-up packs allow up to 60-minute videos.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              {requiresTopup && (
                <CheckoutButton
                  packId="creator_10"
                  label="Buy 10 Credits ($12)"
                  className="rounded-lg bg-[#FF5722] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#F44336]"
                />
              )}
              {requiresAuth && (
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="rounded-lg bg-[#FF5722] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#F44336]"
                >
                  Sign In with Magic Link
                </button>
              )}
            </div>
          </div>
        )}

        {/* Action Button & Processing Indicator */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          {statusMessage ? (
            <div className="flex items-center gap-2 text-xs text-[#FFB800] animate-pulse">
              <Sparkles className="h-4 w-4" />
              <span>{statusMessage}</span>
            </div>
          ) : (
            <div className="text-xs text-[#9AA2B6]">
              {showResults ? (
                <span>
                  Analyzed {stats.words} words across {stats.duration}s • {stats.fillersCount} filler words flagged • {stats.dedupedCount} duplicates pruned
                </span>
              ) : (
                <span>Ready to transcribe and rank with Gemini API</span>
              )}
            </div>
          )}

          <button
            onClick={handleRunPipeline}
            disabled={isProcessing}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-full bg-white text-black hover:bg-[#E5E5E5] px-7 py-2.5 text-xs font-semibold shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:outline-none disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#FFB800]" />
            {isProcessing ? 'Processing Pipeline…' : 'Generate Ranked Highlights'}
          </button>
        </div>

        {/* Results Area */}
        {showResults && (
          <div className="mt-10 border-t border-[#262626] pt-8">
            {/* View Mode Toggle: Competitive Wedge Demonstration */}
            <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-[#262626] bg-[#050505] p-4">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-[#A1A1A1]">
                  Highlight Extraction Engine
                </span>
                <p className="text-xs text-[#707070] mt-0.5">
                  Compare FLOWZORA's semantic boundary snapping against naive fixed-interval cuts
                </p>
              </div>

              <div className="flex items-center rounded-lg bg-[#111111] p-1 border border-[#262626]">
                <button
                  onClick={() => setViewMode('flowzora')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    viewMode === 'flowzora'
                      ? 'bg-[#222222] text-white shadow-sm border border-[#333333]'
                      : 'text-[#A1A1A1] hover:text-white'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 text-[#FFB800]" />
                  FLOWZORA (Semantic + Gemini)
                </button>
                <button
                  onClick={() => setViewMode('naive')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    viewMode === 'naive'
                      ? 'bg-[#222222] text-white shadow-sm border border-[#333333]'
                      : 'text-[#A1A1A1] hover:text-white'
                  }`}
                >
                  <SplitSquareVertical className="h-3.5 w-3.5 text-[#EF4444]" />
                  Clipzi / Naive 60s Cuts
                </button>
              </div>
            </div>

            {/* VIEW MODE 1: FLOWZORA Ranked Highlights */}
            {viewMode === 'flowzora' && (
              <div>
                {/* Timeline Waveform Visualization */}
                <div className="mb-6 rounded-xl border border-[#2B3040] bg-[#0A0B10] p-4">
                  <div className="flex items-center justify-between text-xs text-[#9AA2B6] mb-2">
                    <span className="font-semibold text-white">Full Source Audio ({stats.duration}s)</span>
                    <span className="text-[#10B981] font-bold">
                      {rankedClips.length} Quality-Gated Highlights Found (Deduplicated)
                    </span>
                  </div>

                  {/* Waveform Track */}
                  <div className="relative h-10 w-full rounded-lg bg-[#141620] overflow-hidden flex items-center px-1">
                    <div className="flex items-center gap-0.5 w-full h-6 opacity-30">
                      {Array.from({ length: 90 }).map((_, i) => (
                        <div
                          key={i}
                          className="w-1 bg-[#9AA2B6] rounded-full"
                          style={{ height: `${20 + ((i * 17) % 80)}%` }}
                        />
                      ))}
                    </div>

                    {/* Placed Highlight Slices */}
                    {rankedClips.map((clip, i) => {
                      const leftPercent = Math.min(90, Math.max(2, (clip.startTime / stats.duration) * 100));
                      const widthPercent = Math.min(30, Math.max(8, (clip.duration / stats.duration) * 100));
                      const colors = [
                        'bg-[#FF5722] border-[#FF5722]',
                        'bg-[#FFB800] border-[#FFB800] text-[#0A0B10]',
                        'bg-[#3B82F6] border-[#3B82F6]',
                        'bg-[#10B981] border-[#10B981]',
                      ];
                      const color = colors[i % colors.length];

                      return (
                        <div
                          key={clip.id}
                          className={`absolute h-7 rounded border flex items-center justify-center text-[10px] font-black shadow-sm ${color}`}
                          style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                          title={`Rank #${clip.rank}: ${clip.startTime}s - ${clip.endTime}s (Score: ${clip.score.compositeScore})`}
                        >
                          #{clip.rank}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-[#626B82]">
                    <span>00:00</span>
                    <span>Semantic sentence boundary snapping • No mid-sentence cuts</span>
                    <span>{stats.duration}s</span>
                  </div>
                </div>

                {/* Ranked Highlights Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                  {rankedClips.map((clip) => (
                    <div
                      key={clip.id}
                      className="flex flex-col justify-between rounded-xl border border-[#262626] bg-[#050505] p-5 hover:border-[#383838] transition-all shadow-md"
                    >
                      <div>
                        {/* Header: Rank + Composite Score */}
                        <div className="flex items-center justify-between mb-3">
                          <span className="flex items-center gap-1.5 rounded-md bg-[#FF5722]/10 border border-[#FF5722]/20 px-2.5 py-1 text-xs font-mono font-semibold text-[#FF5722]">
                            <Flame className="h-3.5 w-3.5" />
                            RANK #{clip.rank}
                          </span>
                          <div className="flex items-center gap-1.5 font-mono">
                            <span className="text-xs text-[#A1A1A1]">SCORE:</span>
                            <span className="text-base font-bold text-white tabular-nums">
                              {clip.score.compositeScore}
                            </span>
                            <span className="text-[10px] text-[#707070]">/100</span>
                          </div>
                        </div>

                        {/* Timing */}
                        <div className="text-xs text-[#A1A1A1] font-mono mb-2">
                          <span className="text-[#707070]">TIME:</span> <strong className="text-white tabular-nums">{clip.startTime}s – {clip.endTime}s</strong> ({clip.duration}s)
                        </div>

                        {/* 4 Dimension Matrix */}
                        <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#111111] border border-[#262626] p-2.5 text-xs font-mono">
                          <div>
                            <span className="text-[#707070]">Hook:</span>{' '}
                            <span className="font-semibold text-white tabular-nums">{clip.score.dimensions.hookStrength}/10</span>
                          </div>
                          <div>
                            <span className="text-[#707070]">Coherence:</span>{' '}
                            <span className="font-semibold text-white tabular-nums">{clip.score.dimensions.standaloneCoherence}/10</span>
                          </div>
                          <div>
                            <span className="text-[#707070]">Emotion:</span>{' '}
                            <span className="font-semibold text-white tabular-nums">{clip.score.dimensions.emotionalPayoff}/10</span>
                          </div>
                          <div>
                            <span className="text-[#707070]">Trend:</span>{' '}
                            <span className="font-semibold text-white tabular-nums">{clip.score.dimensions.topicTrendAlignment}/10</span>
                          </div>
                        </div>

                        {/* Gemini Transparent Reasoning */}
                        <div className="mt-3 text-xs italic text-[#A1A1A1] border-l-2 border-[#FF5722] pl-2.5 py-0.5">
                          “{clip.score.reasoning}”
                        </div>

                        {/* Transcript Snippet */}
                        <p className="mt-3 text-xs text-[#EDEDED] leading-relaxed line-clamp-3 bg-[#111111] border border-[#262626] p-2.5 rounded-lg">
                          “{clip.transcriptSnippet}”
                        </p>
                      </div>

                      {/* Trimmer Controls & Action */}
                      <div className="mt-5 pt-3 border-t border-[#262626]">
                        <div className="flex items-center justify-between text-xs text-[#A1A1A1] mb-3">
                          <span className="font-mono text-[11px] text-[#707070]">NUDGE:</span>
                          <div className="flex items-center gap-1.5 font-mono text-xs">
                            <button
                              onClick={() => handleNudge(clip.id, 'start', -1)}
                              className="rounded-md bg-[#111111] border border-[#262626] px-2 py-0.5 hover:bg-[#222222] text-[#EDEDED] transition-colors"
                              title="Start -1s"
                            >
                              -1s
                            </button>
                            <button
                              onClick={() => handleNudge(clip.id, 'start', 1)}
                              className="rounded-md bg-[#111111] border border-[#262626] px-2 py-0.5 hover:bg-[#222222] text-[#EDEDED] transition-colors"
                              title="Start +1s"
                            >
                              +1s
                            </button>
                            <span className="text-[#383838]">|</span>
                            <button
                              onClick={() => handleNudge(clip.id, 'end', -1)}
                              className="rounded-md bg-[#111111] border border-[#262626] px-2 py-0.5 hover:bg-[#222222] text-[#EDEDED] transition-colors"
                              title="End -1s"
                            >
                              End -1s
                            </button>
                            <button
                              onClick={() => handleNudge(clip.id, 'end', 1)}
                              className="rounded-md bg-[#111111] border border-[#262626] px-2 py-0.5 hover:bg-[#222222] text-[#EDEDED] transition-colors"
                              title="End +1s"
                            >
                              End +1s
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setPreviewClip(clip)}
                            className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-white py-2 text-xs font-semibold text-black hover:bg-[#E5E5E5] transition-colors shadow-sm"
                          >
                            <Play className="h-3 w-3 fill-black" />
                            Preview 9:16
                          </button>
                          <button
                            onClick={() => setSocialCopyClip(clip)}
                            className="flex items-center justify-center gap-1 rounded-md border border-[#262626] bg-[#111111] px-2.5 py-2 text-xs font-medium text-[#EDEDED] hover:border-[#383838] transition-colors"
                            title="Generate Social Copy"
                          >
                            <Sparkles className="h-3.5 w-3.5 text-[#FFB800]" />
                            <span className="hidden sm:inline">Social</span>
                          </button>
                          <a
                            href={`/api/export/render?clipId=${clip.id}&download=true&format=9:16`}
                            download={`flowzora_${clip.id}.mp4`}
                            className="flex items-center justify-center gap-1 rounded-md border border-[#262626] bg-[#111111] px-2.5 py-2 text-xs font-medium text-[#EDEDED] hover:border-[#383838] transition-colors"
                            title="Download 9:16 MP4"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Export</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VIEW MODE 2: Naive Fixed Chunking Comparison */}
            {viewMode === 'naive' && (
              <div className="rounded-xl border border-[#EF4444]/30 bg-[#050505] p-6">
                <div className="flex items-start gap-3 mb-6">
                  <AlertTriangle className="h-5 w-5 text-[#EF4444] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      The Problem with Fixed 60s Chunking (Clipzi's Approach)
                    </h3>
                    <p className="text-xs text-[#A1A1A1] mt-1 leading-relaxed">
                      Naive tools cut audio at strict 60-second timer intervals (0:00–1:00, 1:00–2:00, etc.) without analyzing sentences or pauses. This chops words in half, leaves thoughts unfinished, and creates awkward clips that require tedious manual re-trimming.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {naiveClips.map((chunk) => (
                    <div
                      key={chunk.id}
                      className="rounded-lg border border-[#262626] bg-[#0A0A0A] p-3 text-xs opacity-80 font-mono"
                    >
                      <div className="flex items-center justify-between text-[#EF4444] font-semibold text-[11px] mb-1">
                        <span>{chunk.id}</span>
                        <span className="tabular-nums">{chunk.startTime}s – {chunk.endTime}s</span>
                      </div>
                      <p className="text-[#A1A1A1] font-sans line-clamp-2 italic">
                        “{chunk.textSnippet}”
                      </p>
                      <div className="mt-2 text-[10px] text-[#EF4444] flex items-center gap-1">
                        <span>✕ Truncated mid-sentence</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Interactive 9:16 Video & Animated Caption Preview Modal */}
      {previewClip && (
        <ClipVideoPreview
          clip={previewClip}
          scriptPreference={scriptPreference}
          onScriptChange={(s) => setScriptPreference(s)}
          onClose={() => setPreviewClip(null)}
        />
      )}

      {/* Creator Magic Link Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={() => {
          setErrorMessage(null);
          setRequiresAuth(false);
          handleRunPipeline();
        }}
      />

      {/* Gemini Social Copy Generator Modal */}
      <SocialCopyModal
        isOpen={!!socialCopyClip}
        onClose={() => setSocialCopyClip(null)}
        clip={socialCopyClip}
        defaultScriptPreference={scriptPreference}
      />
    </div>
  );
}
