'use client';

import React, { useState, useRef } from 'react';
import {
  Upload,
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
  Loader2,
  ChevronDown,
  X,
} from 'lucide-react';
import { CandidateClip, AspectRatio, SourceLanguage } from '@/lib/pipeline/types';
import ClipVideoPreview from '@/components/ClipVideoPreview';
// import CheckoutButton from '@/components/CheckoutButton';
import SocialCopyModal from '@/components/SocialCopyModal';
import { exportClipInBrowser, isBrowserMp4RecordingSupported } from '@/lib/pipeline/client-video-exporter';

interface NaiveClip {
  id: string;
  startTime: number;
  endTime: number;
  textSnippet: string;
  cutMidSentence: boolean;
}

/** Human label for the transcription backend badge. */
function providerLabel(provider: string): string {
  if (provider === 'cloudflare') return 'Cloudflare Workers AI';
  if (provider === 'openai') return 'OpenAI Whisper';
  if (provider === 'mixed') return 'Cloudflare + Groq fallback';
  return 'Groq Whisper';
}

export default function HeroUploader() {
  // Spoken language of the source media. Drives the Whisper language hint +
  // context prompt (matched vocabulary = fewer wrong words), filler-word
  // detection, and Gemini scoring context. 'auto' lets Whisper detect per
  // request and is the safest default when the language mix is unknown.
  const [language, setLanguage] = useState<SourceLanguage>('auto');
  const scriptPreference = 'english';
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceMediaUrl, setSourceMediaUrl] = useState<string>('');
  const [sourceMediaType, setSourceMediaType] = useState<'video' | 'audio'>('video');
  const [sourceVideoKey, setSourceVideoKey] = useState<string>('');
  // Real media duration in seconds, probed from the file header (never guessed
  // from file size). Must stay in sync with MAX_SERVERLESS_DURATION_SEC in
  // src/lib/billing/credits.ts.
  const MAX_VIDEO_DURATION_SEC = 10800; // 180 minutes (3 hours)
  const [sourceDurationSec, setSourceDurationSec] = useState<number | null>(null);

  React.useEffect(() => {
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      setSourceMediaUrl(url);
      setSourceMediaType(selectedFile.type.startsWith('video') ? 'video' : 'audio');
      setSourceVideoKey('');
      setSourceDurationSec(null);
      // Probe the true duration from the container header so the UI and the
      // presign gate use the real length, not a size-based guess.
      let cancelled = false;
      const probeEl = document.createElement(
        selectedFile.type.startsWith('audio') ? 'audio' : 'video'
      );
      probeEl.preload = 'metadata';
      probeEl.onloadedmetadata = () => {
        if (!cancelled && Number.isFinite(probeEl.duration) && probeEl.duration > 0) {
          setSourceDurationSec(probeEl.duration);
        }
        probeEl.removeAttribute('src');
      };
      probeEl.onerror = () => {
        if (!cancelled) setSourceDurationSec(null);
      };
      probeEl.src = url;
      return () => {
        cancelled = true;
        probeEl.removeAttribute('src');
        URL.revokeObjectURL(url);
      };
    } else {
      setSourceMediaUrl('');
      setSourceMediaType('video');
      setSourceVideoKey('');
      setSourceDurationSec(null);
    }
  }, [selectedFile]);

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [viewMode, setViewMode] = useState<'flowzora' | 'naive'>('flowzora');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [requiresTopup, setRequiresTopup] = useState(false);

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
  // Transcription backend behind the latest result (cloudflare/groq/openai/mixed).
  const [transcriptionProvider, setTranscriptionProvider] = useState<string>('cloudflare');

  const handleRunPipeline = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setRequiresTopup(false);
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
      // CASE: Highlight Extraction Pipeline with R2 Direct Upload
      // -------------------------------------------------------------
      if (!selectedFile) {
        setErrorMessage('Please select a video or audio file to upload before extracting clips.');
        setIsProcessing(false);
        return;
      }

      const fileSizeMB = selectedFile.size / (1024 * 1024);

      // Fail fast on the REAL probed duration (not file size) before uploading.
      if (sourceDurationSec !== null && sourceDurationSec > MAX_VIDEO_DURATION_SEC) {
        setErrorMessage(
          `Video length (${Math.round(sourceDurationSec / 60)} min) exceeds the ${Math.round(MAX_VIDEO_DURATION_SEC / 60)}-minute processing limit. Longer videos cannot be processed in one run — trim the clip, or upload a shorter section (up to 3 hours).`
        );
        setIsProcessing(false);
        return;
      }

      let uploadedR2FileKey: string | null = null;

      // STEP 1: Direct Cloudflare R2 Upload (bypasses Vercel 4.5MB serverless limit)
      try {
        setStatusMessage(`Preparing cloud storage for ${fileSizeMB.toFixed(1)} MB media...`);
        const presignRes = await fetch('/api/upload/presigned-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: selectedFile.name,
            contentType: selectedFile.type || 'video/mp4',
            fileSize: selectedFile.size,
            userId: activeUserId,
            // Real probed duration so the presign gate enforces the true length.
            ...(sourceDurationSec !== null
              ? { estimatedDurationSec: Math.round(sourceDurationSec) }
              : {}),
          }),
        });

        const presignText = await presignRes.text();
        let presignData: any = null;
        try {
          presignData = JSON.parse(presignText);
        } catch (_) {}

        if (presignData?.success && presignData.uploadUrl && !presignData.isSimulated) {
          setStatusMessage(`Uploading media (${fileSizeMB.toFixed(1)} MB) to Cloudflare R2...`);
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', presignData.uploadUrl);
            xhr.setRequestHeader('Content-Type', selectedFile.type || 'video/mp4');
            xhr.upload.onprogress = (evt) => {
              if (evt.lengthComputable) {
                const pct = Math.round((evt.loaded / evt.total) * 100);
                setStatusMessage(`Uploading media (${fileSizeMB.toFixed(1)} MB): ${pct}%...`);
              }
            };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
              } else {
                reject(new Error(`Cloud storage upload failed with status ${xhr.status}`));
              }
            };
            xhr.onerror = () => reject(new Error('Network error during cloud storage upload'));
            xhr.send(selectedFile);
          });

          uploadedR2FileKey = presignData.fileKey;
        } else if (fileSizeMB > 4.5) {
          // File exceeds Vercel 4.5MB limit and R2 is not configured
          setErrorMessage(
            `File size (${fileSizeMB.toFixed(1)} MB) exceeds Vercel's 4.5 MB serverless limit. To process files over 4.5 MB, please configure Cloudflare R2 environment variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) in your Vercel project dashboard.`
          );
          setIsProcessing(false);
          return;
        }
      } catch (uploadErr: any) {
        console.warn('[Upload] Direct R2 upload error:', uploadErr.message);
        if (fileSizeMB > 4.5) {
          setErrorMessage(
            `Direct upload error: ${uploadErr.message}. For files larger than 4.5 MB, please ensure Cloudflare R2 is configured in Vercel.`
          );
          setIsProcessing(false);
          return;
        }
      }

      // STEP 2: Highlight Extraction Pipeline
      // Small files (<=4.5MB, sent inline) run synchronously. Anything uploaded
      // to R2 goes through the background job queue so multi-hour videos never
      // hit serverless timeouts — poll until the job completes.
      const isQueuedFlow = Boolean(uploadedR2FileKey);
      if (!isQueuedFlow) {
        setStatusMessage('Transcribing speech with word-level timestamps...');
        setTimeout(() => setStatusMessage('Detecting filler words...'), 350);
        setTimeout(() => setStatusMessage('Snapping windows to semantic sentence boundaries...'), 700);
        setTimeout(() => setStatusMessage('Evaluating Hook, Coherence, Emotion & Trend via Gemini 2.5 Flash...'), 1100);
      } else {
        setStatusMessage('Starting background processing job…');
      }

      let res: Response;
      if (uploadedR2FileKey) {
        // Enqueue a background job referencing the R2 object key — zero Vercel
        // 4.5MB limit issue, no serverless timeout for long videos.
        res = await fetch('/api/pipeline/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileKey: uploadedR2FileKey,
            filename: selectedFile.name,
            language,
            scriptPreference,
            userId: activeUserId,
            // Real probed duration so the enqueue gate enforces the true length.
            ...(sourceDurationSec !== null
              ? { estimatedDurationSec: Math.round(sourceDurationSec) }
              : {}),
          }),
        });
      } else {
        // File <= 4.5MB can be sent directly via multipart form
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('language', language);
        formData.append('scriptPreference', scriptPreference);
        formData.append('userId', activeUserId);
        res = await fetch('/api/pipeline/analyze', {
          method: 'POST',
          body: formData,
        });
      }

      const resText = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(resText);
      } catch {
        if (res.status === 413) {
          setErrorMessage('File size exceeds serverless upload limit (4.5 MB). Please configure Cloudflare R2.');
        } else {
          setErrorMessage(resText.slice(0, 160) || `Server error (${res.status})`);
        }
        setIsProcessing(false);
        return;
      }

      if (!res.ok || !json.success) {
        const msg = json.error || 'Pipeline analysis failed';
        setErrorMessage(msg);
        if (msg.toLowerCase().includes('top-up') || msg.toLowerCase().includes('exceeds') || msg.toLowerCase().includes('credits')) {
          setRequiresTopup(true);
        }
        return;
      }

      // Background job path: poll until completed (up to ~90 min for 3h videos).
      if (json.queued && json.jobId) {
        const jobId = json.jobId as string;
        const POLL_INTERVAL_MS = 5000;
        const MAX_POLLS = 1080; // ~90 minutes
        for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          let pollRes: Response;
          try {
            pollRes = await fetch(`/api/pipeline/jobs/${encodeURIComponent(jobId)}`);
          } catch {
            continue; // transient network blip — keep polling
          }
          const pollText = await pollRes.text();
          let pollJson: any = null;
          try {
            pollJson = JSON.parse(pollText);
          } catch {
            continue;
          }
          if (!pollRes.ok || pollJson.success === false) {
            const jobFailed = pollJson?.job?.status === 'failed';
            const msg = pollJson.error || 'Background processing failed';
            setErrorMessage(jobFailed ? msg : `${msg} (job ${jobId})`);
            if (msg.toLowerCase().includes('top-up') || msg.toLowerCase().includes('credits')) {
              setRequiresTopup(true);
            }
            setIsProcessing(false);
            return;
          }
          const job = pollJson.job;
          if (job) {
            const pct = typeof job.progress === 'number' ? ` (${job.progress}%)` : '';
            setStatusMessage(`${job.stageDetail || 'Processing in background…'}${pct}`);
          }
          if (pollJson.data) {
            json = pollJson;
            break;
          }
        }
        if (!json.data) {
          setErrorMessage(
            `Still processing in the background after ~90 minutes (job ${jobId}). Your upload is saved — please check back and re-run processing later.`
          );
          setIsProcessing(false);
          return;
        }
      }

      if (json.success && json.data) {
        const d = json.data;
        const sanitizeClips = (clips: CandidateClip[]) =>
          (clips || []).map((c) => {
            // Safety ceiling matching the pipeline (context-complete clips up to 90s)
            const dur = Math.min(90, c.duration || (c.endTime - c.startTime));
            const safeEnd = Number((c.startTime + dur).toFixed(1));
            return {
              ...c,
              duration: Number(dur.toFixed(1)),
              endTime: safeEnd,
            };
          });

        setRankedClips(sanitizeClips(d.rankedResult.rankedClips || []));
        setNaiveClips(d.rankedResult.comparisonWithNaiveChunking?.naiveClips || []);
        setStats({
          duration: d.duration,
          words: d.transcription.words.length,
          fillersCount: d.fillerReport.fillerCount,
          dedupedCount: d.rankedResult.dedupedCount,
        });
        setTranscriptionProvider(
          d.transcriptionProvider || d.transcription?.provider || 'cloudflare'
        );
        setShowResults(true);

        if (json.sourceVideoKey) {
          setSourceVideoKey(json.sourceVideoKey);
        } else if (d?.sourceVideoKey) {
          setSourceVideoKey(d.sourceVideoKey);
        }

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
          let newStart = type === 'start' ? Math.max(0, c.startTime + deltaSec) : c.startTime;
          let newEnd = type === 'end' ? c.endTime + deltaSec : c.endTime;
          // Guard minimum clip length of 3s
          if (newEnd - newStart < 3) return c;
          // Strict hard ceiling: no clip can be more than 90 seconds long
          if (newEnd - newStart > 35) {
            if (type === 'end') {
              newEnd = newStart + 35;
            } else {
              newStart = newEnd - 35;
            }
          }
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

  const [exportingClipId, setExportingClipId] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<number | null>(null);

  const handleExportClip = async (clip: CandidateClip) => {
    setExportingClipId(clip.id);
    setExportProgress(0);

    // Guard: a clip with no caption data would download with zero subtitles.
    // Surface it instead of producing a silent-looking file.
    if ((clip.words?.length || 0) === 0 && !(clip.transcriptSnippet || '').trim()) {
      setErrorMessage(
        'No captions were generated for this clip, so there is nothing to burn into the download. Please re-run "Generate Ranked Highlights" and try again.'
      );
      setExportingClipId(null);
      setExportProgress(null);
      return;
    }

    // 1. High-speed client-side rendering with burned-in animated subtitles for uploaded files
    // (only where the browser records real MP4 — otherwise fall through to the
    // server ffmpeg render so the download plays everywhere, not just browsers)
    if ((selectedFile || sourceMediaUrl) && isBrowserMp4RecordingSupported()) {
      try {
        const mediaSource = selectedFile || sourceMediaUrl;
        const result = await exportClipInBrowser({
          sourceMedia: mediaSource,
          clipId: clip.id,
          startTime: clip.startTime,
          endTime: clip.endTime,
          words: clip.words || [],
          transcriptSnippet: clip.transcriptSnippet || '',
          scriptPreference,
          format: '9:16', // Instagram Reels / YouTube Shorts vertical format
          fitMode: 'fit',
          onProgress: (pct) => setExportProgress(pct),
        });

        const a = document.createElement('a');
        a.href = result.downloadUrl;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setExportingClipId(null);
        setExportProgress(null);
        return;
      } catch (clientErr) {
        console.warn('[Export] Browser canvas export encountered issue, attempting server fallback:', clientErr);
      }
    }

    // 2. Server-side export fallback
    try {
      const exportFormat = '9:16';
      const res = await fetch('/api/export/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: clip.id,
          startTime: clip.startTime,
          endTime: clip.endTime,
          scriptPreference,
          format: exportFormat,
          fitMode: 'fit',
          words: clip.words || [],
          transcriptSnippet: clip.transcriptSnippet || '',
          sourceVideoUrl: sourceMediaUrl || '',
          sourceVideoKey: sourceVideoKey || '',
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('video/mp4')) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `flowzora_${clip.id}_reels_shorts_9x16.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        const json = await res.json();
        if (json.success && json.export?.downloadUrl) {
          const a = document.createElement('a');
          a.href = json.export.downloadUrl;
          a.download = `flowzora_${clip.id}_reels_shorts_9x16.mp4`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          // Direct GET fallback
          const fallbackUrl = `/api/export/render?clipId=${clip.id}&download=true&format=9:16&startTime=${clip.startTime}&endTime=${clip.endTime}&sourceVideoUrl=${encodeURIComponent(sourceMediaUrl || '')}${sourceVideoKey ? `&sourceVideoKey=${encodeURIComponent(sourceVideoKey)}` : ''}&fitMode=fit`;
          window.location.href = fallbackUrl;
        }
      }
    } catch (err) {
      console.error('Export download failed:', err);
      const fallbackUrl = `/api/export/render?clipId=${clip.id}&download=true&format=9:16&startTime=${clip.startTime}&endTime=${clip.endTime}&sourceVideoUrl=${encodeURIComponent(sourceMediaUrl || '')}${sourceVideoKey ? `&sourceVideoKey=${encodeURIComponent(sourceVideoKey)}` : ''}&fitMode=fit`;
      window.location.href = fallbackUrl;
    } finally {
      setExportingClipId(null);
      setExportProgress(null);
    }
  };

  return (
    <div id="app" className="w-full max-w-5xl mx-auto">
      {/* Main Tool Container */}
      <div className="rounded-xl border border-[#262626] bg-[#0A0A0A] shadow-[0_0_60px_-15px_rgba(0,0,0,0.8)] p-4 sm:p-6 lg:p-8">
        {/* Top Controls Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-[#262626] pb-5">
          {/* Input label (YouTube URL ingest was removed: see git history) */}
          <div className="flex items-center gap-2 text-white">
            <Upload className="h-4 w-4" />
            <span className="text-sm font-semibold">Upload your video or audio</span>
          </div>

          {/* Aspect Ratio Selector */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 w-full lg:w-auto">
            <div className="flex items-center gap-1.5 flex-1 sm:flex-initial">
              <label className="text-[11px] font-mono text-[#A1A1A1] shrink-0">LANGUAGE:</label>
              <div className="relative flex-1">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as SourceLanguage)}
                  className="w-full appearance-none rounded-md border border-[#262626] bg-[#111111] pl-2.5 pr-7 py-1.5 text-xs text-[#EDEDED] focus:outline-none focus:border-[#555555] transition-colors cursor-pointer min-h-[34px]"
                  title="Spoken language of your video — matched transcription vocabulary means more accurate subtitles"
                >
                  <option value="auto" className="bg-[#111111] text-[#EDEDED]">Auto (Detect)</option>
                  <option value="english" className="bg-[#111111] text-[#EDEDED]">English</option>
                  <option value="hinglish" className="bg-[#111111] text-[#EDEDED]">Hinglish</option>
                  <option value="hindi" className="bg-[#111111] text-[#EDEDED]">Hindi</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#A1A1A1]" />
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-1 sm:flex-initial">
              <label className="text-[11px] font-mono text-[#A1A1A1] shrink-0">RATIO:</label>
              <div className="relative flex-1">
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                  className="w-full appearance-none rounded-md border border-[#262626] bg-[#111111] pl-2.5 pr-7 py-1.5 text-xs text-[#EDEDED] focus:outline-none focus:border-[#555555] transition-colors cursor-pointer min-h-[34px]"
                >
                  <option value="9:16" className="bg-[#111111] text-[#EDEDED]">9:16 (Reels / TikTok / Shorts)</option>
                  <option value="1:1" className="bg-[#111111] text-[#EDEDED]">1:1 (Square Post)</option>
                  <option value="16:9" className="bg-[#111111] text-[#EDEDED]">16:9 (Landscape)</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#A1A1A1]" />
              </div>
            </div>
          </div>
        </div>

        {/* Input Body */}
        <div className="mt-6">
          <div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files?.[0]) {
                  setSelectedFile(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`relative rounded-xl border border-dashed transition-all p-5 sm:p-8 text-center cursor-pointer group ${
                isDragging
                  ? 'border-white bg-[#111111] scale-[1.01]'
                  : selectedFile
                  ? 'border-[#383838] bg-[#0A0A0A]'
                  : 'border-[#262626] bg-[#050505] hover:border-[#404040] hover:bg-[#080808]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,audio/mpeg,audio/wav"
                onChange={(e) => {
                  if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              />
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[#111111] border border-[#262626] text-[#EDEDED] group-hover:scale-105 transition-transform pointer-events-none">
                <Upload className="h-5 w-5" />
              </div>
              <p className="mt-3 text-xs sm:text-sm font-medium text-white pointer-events-none">
                {selectedFile ? (
                  <span>
                    {selectedFile.name}{' '}
                    <span className="text-xs font-mono text-[#A1A1A1]">
                      ({(selectedFile.size / (1024 * 1024)).toFixed(1)}&nbsp;MB
                      {sourceDurationSec !== null && (
                        <span>
                          {' • '}
                          {(sourceDurationSec / 60).toFixed(1)}&nbsp;min
                        </span>
                      )}
                      )
                    </span>
                  </span>
                ) : (
                  <span>
                    Drop podcast or video here, or <span className="underline underline-offset-4 text-white">tap to browse</span>
                  </span>
                )}
              </p>
              <p className="mt-1 text-[11px] sm:text-xs text-[#A1A1A1] pointer-events-none">
                Cloudflare R2 Direct Uploads • MP4, MOV, MP3, WAV
              </p>

              {/* If file is selected, show change/remove controls */}
              {selectedFile && (
                <div className="mt-4 flex items-center justify-center gap-2 z-30 relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-md border border-[#262626] bg-[#141414] hover:bg-[#202020] px-3 py-1 text-xs font-medium text-[#EDEDED] transition-colors"
                  >
                    Change File
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="rounded-md border border-[#262626] bg-[#141414] hover:bg-[#202020] p-1 text-[#A1A1A1] hover:text-white transition-colors"
                    title="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Real-time Upload Progress Bar */}
              {uploadProgress !== null && (
                <div className="mt-4 w-full max-w-md mx-auto pointer-events-none">
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
          </div>
        </div>

        {/* Free Beta Notice & Safeguard */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#9AA2B6] px-1">
          <div className="flex items-center gap-1.5 text-[#10B981]">
            <Sparkles className="h-4 w-4" />
            <span>100% Free Public Beta • No Sign-In Required • Unlimited Clips</span>
          </div>
          <div>English AI Subtitles • Scene-Aware 9:16 Reframe</div>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="mt-4 rounded-xl border border-[#EF4444]/40 bg-[#EF4444]/10 p-4 flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-[#EF4444]" />
            <p className="text-xs font-semibold text-white break-words">{errorMessage}</p>
          </div>
        )}


        {/* Action Button & Processing Indicator */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          {statusMessage ? (
            <div className="flex items-center gap-2 text-xs text-[#10B981] animate-pulse">
              <Sparkles className="h-4 w-4" />
              <span>{statusMessage}</span>
            </div>
          ) : (
            <div className="text-xs text-[#9AA2B6]">
              {showResults ? (
                <span>
                  Analyzed {stats.words} words across {stats.duration}s • {stats.fillersCount} filler words flagged • {stats.dedupedCount} duplicates pruned
                  <span
                    className={`ml-2 inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                      transcriptionProvider === 'cloudflare'
                        ? 'border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]'
                        : 'border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B]'
                    }`}
                    title={
                      transcriptionProvider === 'cloudflare'
                        ? 'Transcribed free with Cloudflare Workers AI Whisper'
                        : transcriptionProvider === 'mixed'
                          ? 'Started on Cloudflare Workers AI, finished on the Groq fallback'
                          : transcriptionProvider === 'openai'
                            ? 'Transcribed with OpenAI Whisper (paid fallback)'
                            : 'Transcribed with Groq Whisper (fallback — Cloudflare was unavailable)'
                    }
                  >
                    via {providerLabel(transcriptionProvider)}
                  </span>
                </span>
              ) : (
                <span>Ready to transcribe and rank with Gemini API</span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleRunPipeline}
            disabled={isProcessing}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-full bg-white text-black hover:bg-[#E5E5E5] px-7 py-2.5 text-xs font-semibold shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:outline-none disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#10B981]" />
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

              <div className="grid grid-cols-1 xs:grid-cols-2 sm:flex sm:items-center rounded-lg bg-[#111111] p-1 border border-[#262626] w-full sm:w-auto gap-1">
                <button
                  type="button"
                  onClick={() => setViewMode('flowzora')}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 sm:py-1.5 text-xs font-medium transition-all cursor-pointer min-h-[36px] ${
                    viewMode === 'flowzora'
                      ? 'bg-[#222222] text-white shadow-sm border border-[#333333]'
                      : 'text-[#A1A1A1] hover:text-white'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 text-[#10B981] shrink-0" />
                  <span>FLOWZORA (Semantic)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('naive')}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 sm:py-1.5 text-xs font-medium transition-all cursor-pointer min-h-[36px] ${
                    viewMode === 'naive'
                      ? 'bg-[#222222] text-white shadow-sm border border-[#333333]'
                      : 'text-[#A1A1A1] hover:text-white'
                  }`}
                >
                  <SplitSquareVertical className="h-3.5 w-3.5 text-[#EF4444] shrink-0" />
                  <span>Generic Other Tools</span>
                </button>
              </div>
            </div>

            {/* VIEW MODE 1: FLOWZORA Ranked Highlights */}
            {viewMode === 'flowzora' && (
              <div>
                {/* Timeline Waveform Visualization */}
                <div className="mb-6 rounded-xl border border-[#2B3040] bg-[#0A0B10] p-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-xs text-[#9AA2B6] mb-2">
                    <span className="font-semibold text-white">Full Source Audio ({stats.duration}s)</span>
                    <span className="text-[#10B981] font-bold">
                      {rankedClips.length} Quality-Gated Highlights Found
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
                        'bg-[#10B981] border-[#10B981] text-black',
                        'bg-[#059669] border-[#059669] text-white',
                        'bg-[#047857] border-[#047857] text-white',
                        'bg-[#34D399] border-[#34D399] text-black',
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
                    <span className="hidden sm:inline">Semantic sentence boundary snapping • No mid-sentence cuts</span>
                    <span className="sm:hidden text-[10px]">Semantic Snapping</span>
                    <span>{stats.duration}s</span>
                  </div>
                </div>

                {/* Ranked Highlights Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                  {rankedClips.map((clip) => (
                    <div
                      key={clip.id}
                      className="flex flex-col justify-between rounded-xl border border-[#262626] bg-[#050505] p-4 sm:p-5 hover:border-[#383838] transition-all shadow-md"
                    >
                      <div>
                        {/* Header: Rank + Composite Score */}
                        <div className="flex items-center justify-between mb-3">
                          <span className="flex items-center gap-1.5 rounded-md bg-[#10B981]/10 border border-[#10B981]/20 px-2.5 py-1 text-xs font-mono font-semibold text-[#10B981]">
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
                        <div className="mt-3 text-xs italic text-[#A1A1A1] border-l-2 border-[#10B981] pl-2.5 py-0.5">
                          “{clip.score.reasoning}”
                        </div>

                        {/* Transcript Snippet */}
                        <p className="mt-3 text-xs text-[#EDEDED] leading-relaxed line-clamp-3 bg-[#111111] border border-[#262626] p-2.5 rounded-lg">
                          “{clip.transcriptSnippet}”
                        </p>
                      </div>

                      {/* Trimmer Controls & Action */}
                      <div className="mt-5 pt-3 border-t border-[#262626]">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#A1A1A1] mb-3">
                          <span className="font-mono text-[11px] text-[#707070]">NUDGE:</span>
                          <div className="flex flex-wrap items-center gap-1 font-mono text-xs">
                            <button
                              type="button"
                              onClick={() => handleNudge(clip.id, 'start', -1)}
                              className="rounded-md bg-[#111111] border border-[#262626] px-2 py-1 sm:py-0.5 hover:bg-[#222222] text-[#EDEDED] transition-colors cursor-pointer min-h-[28px]"
                              title="Start -1s"
                            >
                              -1s
                            </button>
                            <button
                              type="button"
                              onClick={() => handleNudge(clip.id, 'start', 1)}
                              className="rounded-md bg-[#111111] border border-[#262626] px-2 py-1 sm:py-0.5 hover:bg-[#222222] text-[#EDEDED] transition-colors cursor-pointer min-h-[28px]"
                              title="Start +1s"
                            >
                              +1s
                            </button>
                            <span className="text-[#383838] hidden xs:inline">|</span>
                            <button
                              type="button"
                              onClick={() => handleNudge(clip.id, 'end', -1)}
                              className="rounded-md bg-[#111111] border border-[#262626] px-2 py-1 sm:py-0.5 hover:bg-[#222222] text-[#EDEDED] transition-colors cursor-pointer min-h-[28px]"
                              title="End -1s"
                            >
                              End -1s
                            </button>
                            <button
                              type="button"
                              onClick={() => handleNudge(clip.id, 'end', 1)}
                              className="rounded-md bg-[#111111] border border-[#262626] px-2 py-1 sm:py-0.5 hover:bg-[#222222] text-[#EDEDED] transition-colors cursor-pointer min-h-[28px]"
                              title="End +1s"
                            >
                              End +1s
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewClip(clip)}
                            className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-white py-2 text-xs font-semibold text-black hover:bg-[#E5E5E5] transition-colors shadow-sm cursor-pointer min-h-[38px]"
                          >
                            <Play className="h-3 w-3 fill-black" />
                            <span>Preview Studio ({aspectRatio})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSocialCopyClip(clip)}
                            className="flex items-center justify-center gap-1 rounded-md border border-[#262626] bg-[#111111] px-3 py-2 text-xs font-medium text-[#EDEDED] hover:border-[#383838] transition-colors cursor-pointer min-h-[38px]"
                            title="Generate Social Copy"
                          >
                            <Sparkles className="h-3.5 w-3.5 text-[#10B981]" />
                            <span className="hidden xs:inline">Social</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportClip(clip)}
                            disabled={exportingClipId === clip.id}
                            className="flex items-center justify-center gap-1.5 rounded-md border border-[#262626] bg-[#111111] px-3 py-2 text-xs font-semibold text-[#EDEDED] hover:border-[#10B981] hover:text-[#10B981] transition-colors min-h-[38px] cursor-pointer disabled:opacity-60"
                            title="Download 9:16 vertical MP4 (Reels & Shorts with Subtitles)"
                          >
                            {exportingClipId === clip.id ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#10B981]" />
                                <span className="text-[11px] text-[#10B981] font-mono">
                                  {exportProgress !== null ? `${exportProgress}%` : 'Exporting...'}
                                </span>
                              </>
                            ) : (
                              <>
                                <Download className="h-3.5 w-3.5 text-[#10B981]" />
                                <span className="hidden xs:inline">Reels/Shorts</span>
                              </>
                            )}
                          </button>
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
                      The Problem with Fixed 60s Chunking (Generic Other Tools)
                    </h3>
                    <p className="text-xs text-[#A1A1A1] mt-1 leading-relaxed">
                      Naive tools cut audio at strict 60-second timer intervals (0:00–1:00, 1:00–2:00, etc.) without analyzing sentences or pauses. This chops words in half, leaves thoughts unfinished, and creates awkward clips that require tedious manual re-trimming.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {naiveClips.map((nc) => (
                    <div
                      key={nc.id}
                      className="rounded-lg border border-[#EF4444]/20 bg-[#110505] p-3 text-xs opacity-75"
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#EF4444] mb-1">
                        <span>Fixed 60s Chunk</span>
                        <span>{nc.startTime}s – {nc.endTime}s</span>
                      </div>
                      <p className="text-[#A1A1A1] line-clamp-3 italic">
                        "{nc.textSnippet}"
                      </p>
                      {nc.cutMidSentence && (
                        <div className="mt-2 text-[10px] text-[#EF4444] flex items-center gap-1 font-semibold">
                          <span>⚠ Chops mid-sentence</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Interactive Video & Animated Caption Preview Modal */}
      {previewClip && (
        <ClipVideoPreview
          clip={previewClip}
          scriptPreference={scriptPreference}
          initialAspectRatio={aspectRatio}
          onScriptChange={() => {}}
          onClose={() => setPreviewClip(null)}
          sourceMediaUrl={sourceMediaUrl}
          sourceMediaType={sourceMediaType}
          sourceVideoKey={sourceVideoKey}
        />
      )}

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
