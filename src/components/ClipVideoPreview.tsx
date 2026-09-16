'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Smartphone,
  Square,
  Tv,
  ScanFace,
  Layers,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Share2,
  Loader2,
} from 'lucide-react';
import { AspectRatio, ScriptPreference, CandidateClip } from '@/lib/pipeline/types';
import SocialCopyModal from '@/components/SocialCopyModal';

interface ClipVideoPreviewProps {
  clip: CandidateClip;
  scriptPreference: ScriptPreference;
  onScriptChange?: (script: ScriptPreference) => void;
  onClose?: () => void;
}

export default function ClipVideoPreview({
  clip,
  scriptPreference: initialScript,
  onScriptChange,
  onClose,
}: ClipVideoPreviewProps) {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [scriptPreference, setScriptPreference] = useState<ScriptPreference>(initialScript);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0); // 0 to clip.duration

  // Extract or generate words for simulation
  const words = (clip as any).words && (clip as any).words.length > 0
    ? (clip as any).words
    : clip.transcriptSnippet.split(/\s+/).map((w: string, i: number, arr: string[]) => {
        const step = clip.duration / arr.length;
        return {
          word: w,
          start: Number((i * step).toFixed(2)),
          end: Number(((i + 1) * step).toFixed(2)),
        };
      });

  // Dual-script translation/mock for demonstration if needed
  const isDevanagari = scriptPreference === 'devanagari';

  // Playback timer loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= clip.duration) {
            return 0; // loop
          }
          return Number((prev + 0.1).toFixed(1));
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, clip.duration]);

  // Determine active word
  const activeWordIdx = words.findIndex(
    (w: any) => currentTime >= w.start && currentTime <= w.end
  );

  // Determine visible word window (3-4 words centered on active word)
  const currentWindowStart = Math.max(0, activeWordIdx - 1);
  const visibleWords = words.slice(currentWindowStart, currentWindowStart + 4);

  // Simulated scene-aware speaker status
  // Show fallback in middle 30% of clip to visually demonstrate slide/b-roll handling
  const isFallbackSegment = currentTime > clip.duration * 0.4 && currentTime < clip.duration * 0.65;

  const aspectRatioClass =
    aspectRatio === '9:16'
      ? 'w-[280px] h-[498px]'
      : aspectRatio === '1:1'
      ? 'w-[340px] h-[340px]'
      : 'w-[460px] h-[258px]';

  const [isExporting, setIsExporting] = useState(false);
  const [socialCopyOpen, setSocialCopyOpen] = useState(false);

  const handleExportDownload = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/export/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: clip.id,
          startTime: clip.startTime,
          endTime: clip.endTime,
          scriptPreference,
          format: aspectRatio,
        }),
      });

      const json = await res.json();
      if (json.success && json.export?.downloadUrl) {
        // Trigger browser file download
        const a = document.createElement('a');
        a.href = json.export.downloadUrl;
        a.download = `flowzora_${clip.id}_${aspectRatio.replace(':', 'x')}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Export download failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4">
        <div className="relative w-full max-w-4xl max-h-[95vh] overflow-y-auto rounded-2xl border border-[#2B3040] bg-[#141620] p-4 sm:p-6 shadow-2xl flex flex-col md:flex-row gap-6">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-30 rounded-full bg-[#1E2230] p-1.5 text-[#9AA2B6] hover:text-white transition-colors"
          >
            ✕
          </button>

          {/* Left Column: Phone Simulator Viewport */}
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className={`relative transition-all duration-300 rounded-2xl overflow-hidden border-2 border-[#2B3040] bg-black shadow-2xl ${aspectRatioClass}`}>
              {/* Top overlay metadata badge */}
              <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
                <span className="rounded-md bg-black/70 backdrop-blur-sm px-2 py-0.5 text-[10px] font-black text-[#FF5722] border border-white/10">
                  RANK #{clip.rank} • {clip.score.compositeScore}/100
                </span>

                {/* Dynamic Scene-Aware Status Badge */}
                {isFallbackSegment ? (
                  <div className="flex items-center gap-1 rounded-md bg-[#3B82F6]/90 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold text-white shadow animate-pulse">
                    <Layers className="h-3 w-3" />
                    <span>Slide / B-Roll (Center Crop)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 rounded-md bg-[#10B981]/90 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold text-white shadow">
                    <ScanFace className="h-3 w-3" />
                    <span>Speaker Tracked (9:16)</span>
                  </div>
                )}
              </div>

              {/* Video Placeholder Gradient & Animated Visualizer */}
              <div className="relative w-full h-full flex items-center justify-center">
                {/* Background Podcast Stage Visualizer */}
                <div className="absolute inset-0 bg-gradient-to-b from-[#1E2230] via-[#141620] to-[#0A0B10] opacity-80" />
                
                {/* Animated Speaking Waveform */}
                <div className="relative z-10 flex items-center gap-1.5 opacity-60">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1.5 bg-[#FF5722] rounded-full transition-all duration-150"
                      style={{
                        height: isPlaying ? `${15 + ((i * 19 + Math.round(currentTime * 10)) % 65)}px` : '8px',
                      }}
                    />
                  ))}
                </div>

                {/* Word-Level Animated Karaoke Captions */}
                <div className="absolute bottom-16 left-4 right-4 z-20 text-center">
                  <div className="inline-block rounded-xl bg-black/60 backdrop-blur-md px-3 py-2 border border-white/10 shadow-xl max-w-full">
                    <div className="flex flex-wrap items-center justify-center gap-1.5 leading-snug">
                      {visibleWords.map((w: any, idx: number) => {
                        const isActive = currentTime >= w.start && currentTime <= w.end;
                        return (
                          <span
                            key={idx}
                            className={`transition-all duration-150 font-bold ${
                              isActive
                                ? 'text-[#FF5722] scale-110 drop-shadow-[0_0_12px_rgba(255,87,34,0.6)] font-extrabold'
                                : 'text-white/85'
                            } ${isDevanagari ? 'text-base font-["Noto_Sans_Devanagari"]' : 'text-sm'}`}
                          >
                            {w.word}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Audio progress bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20">
                  <div
                    className="h-full bg-[#FF5722] transition-all duration-100"
                    style={{ width: `${(currentTime / (clip.duration || 1)) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Controls & Actions */}
          <div className="w-full md:w-80 flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-white mb-1 font-[var(--font-outfit)]">
                Interactive Clip Studio
              </h3>
              <p className="text-xs text-[#9AA2B6]">
                Preview word-level captions, toggle between Romanized/Devanagari script, and download ready-to-post MP4.
              </p>

              {/* Aspect Ratio Switcher */}
              <div className="mt-5">
                <label className="text-xs font-semibold text-[#9AA2B6] mb-2 block">
                  Export Aspect Ratio:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setAspectRatio('9:16')}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-bold transition-all ${
                      aspectRatio === '9:16'
                        ? 'border-[#FF5722] bg-[#FF5722]/15 text-white shadow-sm'
                        : 'border-[#2B3040] bg-[#0A0B10] text-[#9AA2B6] hover:text-white'
                    }`}
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    <span>9:16 Reels</span>
                  </button>

                  <button
                    onClick={() => setAspectRatio('1:1')}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-bold transition-all ${
                      aspectRatio === '1:1'
                        ? 'border-[#FF5722] bg-[#FF5722]/15 text-white shadow-sm'
                        : 'border-[#2B3040] bg-[#0A0B10] text-[#9AA2B6] hover:text-white'
                    }`}
                  >
                    <Square className="h-3.5 w-3.5" />
                    <span>1:1 Post</span>
                  </button>

                  <button
                    onClick={() => setAspectRatio('16:9')}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-bold transition-all ${
                      aspectRatio === '16:9'
                        ? 'border-[#FF5722] bg-[#FF5722]/15 text-white shadow-sm'
                        : 'border-[#2B3040] bg-[#0A0B10] text-[#9AA2B6] hover:text-white'
                    }`}
                  >
                    <Tv className="h-3.5 w-3.5" />
                    <span>16:9 Wide</span>
                  </button>
                </div>
              </div>

              {/* Dual Script Toggle */}
              <div className="mt-5">
                <label className="text-xs font-semibold text-[#9AA2B6] mb-2 block">
                  Caption Typography Script:
                </label>
                <div className="flex rounded-lg bg-[#0A0B10] p-1 border border-[#2B3040]">
                  <button
                    onClick={() => {
                      setScriptPreference('romanized');
                      if (onScriptChange) onScriptChange('romanized');
                    }}
                    className={`flex-1 rounded py-1.5 text-xs font-semibold transition-all ${
                      scriptPreference === 'romanized'
                        ? 'bg-[#FF5722] text-white shadow'
                        : 'text-[#9AA2B6] hover:text-white'
                    }`}
                  >
                    Romanized (Latin)
                  </button>
                  <button
                    onClick={() => {
                      setScriptPreference('devanagari');
                      if (onScriptChange) onScriptChange('devanagari');
                    }}
                    className={`flex-1 rounded py-1.5 text-xs font-semibold transition-all ${
                      scriptPreference === 'devanagari'
                        ? 'bg-[#FF5722] text-white shadow'
                        : 'text-[#9AA2B6] hover:text-white'
                    }`}
                  >
                    देवनागरी (Devanagari)
                  </button>
                </div>
              </div>

              {/* Gemini Score Reasoning */}
              <div className="mt-5 rounded-xl border border-[#2B3040] bg-[#0A0B10] p-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-[#FFB800]">Gemini Virality Score</span>
                  <span className="font-extrabold text-white">{clip.score.compositeScore}/100</span>
                </div>
                <p className="text-xs italic text-[#9AA2B6] border-l border-[#FF5722] pl-2 mt-1">
                  "{clip.score.reasoning}"
                </p>
              </div>
            </div>

            {/* Bottom Player Controls & Export */}
            <div className="mt-6 pt-4 border-t border-[#242938]">
              <div className="flex items-center justify-center gap-3 mb-4">
                <button
                  onClick={() => setCurrentTime(0)}
                  className="rounded-lg bg-[#1E2230] p-2 text-[#9AA2B6] hover:text-white"
                  title="Restart"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FF5722] text-white hover:bg-[#F44336] shadow-lg transition-transform active:scale-95"
                >
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
                </button>
                <div className="text-xs text-[#9AA2B6] tabular-nums font-medium">
                  {currentTime.toFixed(1)}s / {clip.duration}s
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={handleExportDownload}
                  disabled={isExporting}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#FF5722] py-2.5 text-xs font-bold text-white hover:bg-[#F44336] shadow-md transition-colors disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Rendering & Downloading MP4...</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 text-white" />
                      <span>Download {aspectRatio} MP4 Video</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setSocialCopyOpen(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#2B3040] bg-[#0A0B10] py-2.5 text-xs font-bold text-[#FFB800] hover:border-[#FFB800] transition-colors"
                >
                  <Share2 className="h-3.5 w-3.5 text-[#FFB800]" />
                  <span>Generate Viral Social Copy</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Social Copy Generator Modal */}
      <SocialCopyModal
        isOpen={socialCopyOpen}
        onClose={() => setSocialCopyOpen(false)}
        clip={clip}
        defaultScriptPreference={scriptPreference}
      />
    </>
  );
}
