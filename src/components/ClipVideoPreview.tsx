'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  ScanFace,
  Layers,
  Volume2,
  VolumeX,
  Download,
  Share2,
  Loader2,
} from 'lucide-react';
import { AspectRatio, ScriptPreference, CandidateClip } from '@/lib/pipeline/types';
import SocialCopyModal from '@/components/SocialCopyModal';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface ClipVideoPreviewProps {
  clip: CandidateClip;
  scriptPreference: ScriptPreference;
  initialAspectRatio?: AspectRatio;
  onScriptChange?: (script: ScriptPreference) => void;
  onClose?: () => void;
  sourceMediaUrl?: string;
  sourceMediaType?: 'video' | 'audio';
}

export default function ClipVideoPreview({
  clip,
  scriptPreference: initialScript,
  initialAspectRatio = '9:16',
  onScriptChange,
  onClose,
  sourceMediaUrl = '',
  sourceMediaType = 'video',
}: ClipVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ambientVideoRef = useRef<HTMLVideoElement>(null);
  const ytIframeRef = useRef<HTMLIFrameElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(initialAspectRatio);
  const [scriptPreference, setScriptPreference] = useState<ScriptPreference>(initialScript);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // relative time: 0 to clipDuration
  const [showUnmuteHint, setShowUnmuteHint] = useState(false);

  // Scrubber / Slider state and sync refs
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const isScrubbingRef = useRef(false);
  const isSeekingOrLoopingRef = useRef(false);
  const seekCooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastReportedTimeRef = useRef(0);
  const latestYtTimeRef = useRef(0);

  const clipStart = Math.max(0, clip.startTime || 0);
  const rawDuration = clip.duration || ((clip.endTime || 0) - clipStart) || 15;
  const clipDuration = Math.min(35, Math.max(1, rawDuration));
  const clipEnd = clip.endTime && clip.endTime > clipStart
    ? Math.min(clip.endTime, clipStart + 35)
    : clipStart + clipDuration;

  // Memoize words with stable dependencies so phrases don't recompute every render.
  // Pipeline words have absolute Whisper timestamps → subtract clipStart to get relative.
  // Fallback: synthesize evenly-spaced relative timestamps from transcriptSnippet.
  const stableWords = React.useMemo(() => {
    const rawWords: any[] = (clip as any).words;
    const snippetParts = (clip.transcriptSnippet || '').split(/\s+/).filter(Boolean);

    // If rawWords exists and has a credible number of words (not an empty or 1-word stub)
    const hasValidWords = Array.isArray(rawWords) && rawWords.length > 0;
    const isTruncated = hasValidWords && snippetParts.length >= 6 && rawWords.length < Math.min(snippetParts.length * 0.4, 4);

    if (hasValidWords && !isTruncated) {
      const firstStart = Number(rawWords[0]?.start ?? 0);
      // Auto-detect whether timestamps are absolute (source media timestamps) or already relative to clipStart
      const isAbsolute =
        clipStart > 0.5 &&
        (firstStart >= clipStart - 3.0 || firstStart > clipDuration);
      const offset = isAbsolute ? clipStart : 0;

      // Map to relative timestamps, sanitize negative or NaN values, and sort chronologically
      const mapped = rawWords
        .map((w: any) => {
          const rawStart = Number(w.start ?? 0);
          let rawEnd = Number(w.end ?? rawStart + 0.3);
          // Safety cap: single word should never exceed 1.8s (Whisper silence artifact)
          if (rawEnd - rawStart > 1.8) {
            rawEnd = rawStart + 1.1;
          }
          const s = Math.max(0, Number.isFinite(rawStart) ? rawStart - offset : 0);
          const e = Math.max(s + 0.1, Number.isFinite(rawEnd) ? rawEnd - offset : s + 0.3);
          return {
            ...w,
            relStart: Number(s.toFixed(2)),
            relEnd: Number(e.toFixed(2)),
          };
        })
        .sort((a: any, b: any) => a.relStart - b.relStart);

      // Enforce strictly monotonic progression with minimum spacing and non-overlapping bounds
      for (let i = 0; i < mapped.length; i++) {
        if (i > 0) {
          if (mapped[i].relStart < mapped[i - 1].relStart + 0.10) {
            mapped[i].relStart = Number((mapped[i - 1].relStart + 0.10).toFixed(2));
          }
          if (mapped[i - 1].relEnd > mapped[i].relStart) {
            mapped[i - 1].relEnd = mapped[i].relStart;
          }
        }
        if (mapped[i].relEnd <= mapped[i].relStart + 0.12) {
          mapped[i].relEnd = Number((mapped[i].relStart + 0.20).toFixed(2));
        }
        if (mapped[i].relEnd > mapped[i].relStart + 1.6) {
          mapped[i].relEnd = Number((mapped[i].relStart + 1.1).toFixed(2));
        }
      }

      return mapped;
    }

    // Synthetic fallback: distribute transcript snippet words evenly across clipDuration
    if (snippetParts.length === 0) return [];
    const step = clipDuration / snippetParts.length;
    return snippetParts.map((w: string, i: number) => ({
      word: w,
      devanagari: w,
      start: i * step,
      end: (i + 0.9) * step,
      relStart: Number((i * step).toFixed(2)),
      relEnd: Number(((i + 0.9) * step).toFixed(2)),
    }));
  }, [clip.id, clipStart, clipDuration, (clip as any).words, clip.transcriptSnippet]);

  const isDevanagari = scriptPreference === 'devanagari';

  const isYouTube = Boolean(
    sourceMediaUrl &&
    (sourceMediaUrl.includes('youtube.com') || sourceMediaUrl.includes('youtu.be'))
  );

  let ytVideoId = '';
  if (isYouTube) {
    const match = sourceMediaUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (match) ytVideoId = match[1];
  }

  // Helper to send commands to YouTube player via YT.Player API or iframe postMessage
  const sendYtCommand = (func: string, args: any[] = []) => {
    if (ytPlayerRef.current && typeof ytPlayerRef.current[func] === 'function') {
      try {
        ytPlayerRef.current[func](...args);
        return;
      } catch (_) {}
    }
    if (ytIframeRef.current?.contentWindow) {
      try {
        ytIframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func, args }),
          '*'
        );
      } catch (_) {}
    }
  };

  // Initialize YouTube Iframe API for YouTube video control & sync
  useEffect(() => {
    if (!isYouTube || !ytVideoId) return;

    let active = true;
    let pollInterval: any = null;

    const initYT = () => {
      if (!active) return;
      if (window.YT && window.YT.Player && ytIframeRef.current) {
        try {
          if (ytPlayerRef.current) {
            try { ytPlayerRef.current.destroy(); } catch (_) {}
          }
          ytPlayerRef.current = new window.YT.Player(ytIframeRef.current, {
            events: {
              onReady: (event: any) => {
                if (!active) return;
                try {
                  event.target.seekTo(clipStart, true);
                  event.target.playVideo();
                  setIsPlaying(true);
                } catch (_) {}
              },
              onStateChange: (event: any) => {
                if (!active) return;
                // 1: PLAYING, 2: PAUSED, 0: ENDED
                if (event.data === 1) setIsPlaying(true);
                if (event.data === 2) setIsPlaying(false);
                if (event.data === 0) {
                  // Loop smoothly back to clip start
                  if (!isSeekingOrLoopingRef.current && !isScrubbingRef.current) {
                    isSeekingOrLoopingRef.current = true;
                    try {
                      event.target.seekTo(clipStart, true);
                      event.target.playVideo();
                      setCurrentTime(0);
                      lastReportedTimeRef.current = 0;
                      latestYtTimeRef.current = clipStart;
                      setIsPlaying(true);
                    } catch (_) {}
                    if (seekCooldownTimerRef.current) clearTimeout(seekCooldownTimerRef.current);
                    seekCooldownTimerRef.current = setTimeout(() => {
                      isSeekingOrLoopingRef.current = false;
                    }, 500);
                  }
                }
              },
            },
          });
        } catch (err) {
          console.warn('[YouTube Player] Init error:', err);
        }
      }
    };

    if (typeof window !== 'undefined') {
      if (window.YT && window.YT.Player) {
        initYT();
      } else {
        if (!document.getElementById('yt-iframe-api-script')) {
          const tag = document.createElement('script');
          tag.id = 'yt-iframe-api-script';
          tag.src = 'https://www.youtube.com/iframe_api';
          document.body.appendChild(tag);
        }
        pollInterval = setInterval(() => {
          if (window.YT && window.YT.Player) {
            clearInterval(pollInterval);
            initYT();
          }
        }, 80);
      }
    }

    return () => {
      active = false;
      if (pollInterval) clearInterval(pollInterval);
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch (_) {}
        ytPlayerRef.current = null;
      }
    };
  }, [isYouTube, ytVideoId, clip.id, clipStart]);

  // Real-time postMessage listener from YouTube iframe for state updates (play, pause, mute, latest time)
  useEffect(() => {
    if (!isYouTube) return;

    const handleMessage = (e: MessageEvent) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data && data.event === 'infoDelivery' && data.info) {
          if (typeof data.info.currentTime === 'number') {
            latestYtTimeRef.current = data.info.currentTime;
          }
          if (typeof data.info.playerState === 'number') {
            if (data.info.playerState === 1) setIsPlaying(true);
            if (data.info.playerState === 2) setIsPlaying(false);
          }
          if (typeof data.info.muted === 'boolean') {
            setIsMuted(data.info.muted);
          }
        }
      } catch (_) {}
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isYouTube]);

  // Throttled time synchronization loop for YouTube with loop-lock protection
  useEffect(() => {
    if (!isYouTube || !isPlaying) return;

    let animId: number;
    let lastCheck = 0;

    const syncLoop = (timestamp: number) => {
      if (timestamp - lastCheck >= 30) {
        lastCheck = timestamp;

        if (!isScrubbingRef.current) {
          let raw = 0;
          if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
            try {
              const t = ytPlayerRef.current.getCurrentTime();
              if (typeof t === 'number' && !isNaN(t) && t > 0) raw = t;
            } catch (_) {}
          }
          if (raw === 0 && latestYtTimeRef.current > 0) {
            raw = latestYtTimeRef.current;
          }

          if (raw > 0) {
            if (isSeekingOrLoopingRef.current) {
              // Clear cooldown lock once player time is near clipStart
              if (raw <= clipStart + 0.8 && raw >= Math.max(0, clipStart - 1.0)) {
                isSeekingOrLoopingRef.current = false;
                if (seekCooldownTimerRef.current) clearTimeout(seekCooldownTimerRef.current);
              }
            } else {
              // Check loop condition
              if (raw >= clipEnd - 0.12) {
                isSeekingOrLoopingRef.current = true;
                sendYtCommand('seekTo', [clipStart, true]);
                sendYtCommand('playVideo');
                setCurrentTime(0);
                lastReportedTimeRef.current = 0;
                latestYtTimeRef.current = clipStart;

                if (seekCooldownTimerRef.current) clearTimeout(seekCooldownTimerRef.current);
                seekCooldownTimerRef.current = setTimeout(() => {
                  isSeekingOrLoopingRef.current = false;
                }, 500);
              } else {
                const rel = Math.max(0, Math.min(clipDuration, raw - clipStart));
                if (Math.abs(rel - lastReportedTimeRef.current) >= 0.04) {
                  lastReportedTimeRef.current = rel;
                  setCurrentTime(Number(rel.toFixed(2)));
                }
              }
            }
          }
        }
      }
      animId = requestAnimationFrame(syncLoop);
    };

    animId = requestAnimationFrame(syncLoop);
    return () => {
      cancelAnimationFrame(animId);
      if (seekCooldownTimerRef.current) clearTimeout(seekCooldownTimerRef.current);
    };
  }, [isYouTube, isPlaying, clipStart, clipEnd, clipDuration]);

  // Synchronize HTML5 video playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let active = true;

    const setupMedia = () => {
      if (!active) return;
      const duration = video.duration || 0;
      const startPos = clipStart < duration ? clipStart : 0;
      video.currentTime = startPos;
      setCurrentTime(0);

      // Attempt unmuted play first
      video.muted = false;
      video.volume = 1.0;
      video
        .play()
        .then(() => {
          if (active) {
            setIsPlaying(true);
            setIsMuted(false);
            setShowUnmuteHint(false);
          }
        })
        .catch((err) => {
          console.warn('Browser autoplay policy blocked unmuted audio:', err);
          if (active) {
            video.muted = true;
            setIsMuted(true);
            setShowUnmuteHint(true);
            video
              .play()
              .then(() => {
                if (active) setIsPlaying(true);
              })
              .catch((playErr) => {
                console.warn('Autoplay error:', playErr);
                if (active) setIsPlaying(false);
              });
          }
        });
    };

    video.addEventListener('loadedmetadata', setupMedia);
    if (video.readyState >= 1) {
      setupMedia();
    }

    return () => {
      active = false;
      video.removeEventListener('loadedmetadata', setupMedia);
    };
  }, [clip.id, sourceMediaUrl, clipStart]);

  // Throttled time synchronization with HTML5 video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isYouTube) return;

    let animId: number;
    let lastCheck = 0;
    const syncTime = (timestamp: number) => {
      if (timestamp - lastCheck >= 30) {
        lastCheck = timestamp;
        if (video && !video.paused && !video.ended && !isScrubbingRef.current) {
          const vDur = video.duration || 0;
          const startPos = vDur > 0 && clipStart < vDur ? clipStart : 0;
          const endPos = vDur > 0 ? Math.min(vDur, clipEnd > startPos ? clipEnd : startPos + clipDuration) : (clipStart + clipDuration);

          if (isSeekingOrLoopingRef.current) {
            if (video.currentTime <= startPos + 0.5) {
              isSeekingOrLoopingRef.current = false;
            }
          } else if (vDur > 0 && video.currentTime >= endPos - 0.08) {
            isSeekingOrLoopingRef.current = true;
            video.currentTime = startPos;
            if (ambientVideoRef.current) ambientVideoRef.current.currentTime = startPos;
            setCurrentTime(0);
            lastReportedTimeRef.current = 0;
            video.play().catch(() => {});
            if (ambientVideoRef.current) ambientVideoRef.current.play().catch(() => {});
            setTimeout(() => { isSeekingOrLoopingRef.current = false; }, 400);
          } else {
            const rel = Math.max(0, video.currentTime - startPos);
            if (Math.abs(rel - lastReportedTimeRef.current) >= 0.04) {
              lastReportedTimeRef.current = rel;
              setCurrentTime(rel);
            }
            if (ambientVideoRef.current && Math.abs(ambientVideoRef.current.currentTime - video.currentTime) > 0.3) {
              ambientVideoRef.current.currentTime = video.currentTime;
            }
            if (ambientVideoRef.current && ambientVideoRef.current.paused && !video.paused) {
              ambientVideoRef.current.play().catch(() => {});
            }
          }
        }
      }
      animId = requestAnimationFrame(syncTime);
    };

    animId = requestAnimationFrame(syncTime);
    return () => cancelAnimationFrame(animId);
  }, [clip.id, clipStart, clipEnd, clipDuration, isYouTube, isPlaying]);

  const togglePlay = () => {
    if (isYouTube) {
      if (isPlaying) {
        sendYtCommand('pauseVideo');
        setIsPlaying(false);
      } else {
        sendYtCommand('playVideo');
        setIsPlaying(true);
      }
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      if (ambientVideoRef.current) ambientVideoRef.current.pause();
      setIsPlaying(false);
    } else {
      video
        .play()
        .then(() => {
          setIsPlaying(true);
          if (ambientVideoRef.current) ambientVideoRef.current.play().catch(() => {});
        })
        .catch((err) => console.warn('Play error:', err));
    }
  };

  const toggleMute = () => {
    if (isYouTube) {
      const nextMuted = !isMuted;
      if (nextMuted) {
        sendYtCommand('mute');
        setIsMuted(true);
      } else {
        sendYtCommand('unMute');
        setIsMuted(false);
        setShowUnmuteHint(false);
      }
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const nextMuted = !isMuted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted) {
      video.volume = 1.0;
      setShowUnmuteHint(false);
    }
  };

  const handleRestart = () => {
    isSeekingOrLoopingRef.current = true;
    if (seekCooldownTimerRef.current) clearTimeout(seekCooldownTimerRef.current);
    seekCooldownTimerRef.current = setTimeout(() => {
      isSeekingOrLoopingRef.current = false;
    }, 500);

    setCurrentTime(0);
    lastReportedTimeRef.current = 0;
    latestYtTimeRef.current = clipStart;

    if (isYouTube) {
      sendYtCommand('seekTo', [clipStart, true]);
      sendYtCommand('playVideo');
      setIsPlaying(true);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const vDur = video.duration || 0;
    const startPos = clipStart < vDur ? clipStart : 0;
    video.currentTime = startPos;
    if (ambientVideoRef.current) ambientVideoRef.current.currentTime = startPos;
    video
      .play()
      .then(() => {
        setIsPlaying(true);
        if (ambientVideoRef.current) ambientVideoRef.current.play().catch(() => {});
      })
      .catch(() => {});
  };

  const handleSeekCommit = (targetRel: number) => {
    const clampedRel = Math.max(0, Math.min(clipDuration, targetRel));
    setCurrentTime(Number(clampedRel.toFixed(2)));
    lastReportedTimeRef.current = clampedRel;

    // Lock automatic time sync for 450ms so player doesn't snap back to old time while seeking
    isSeekingOrLoopingRef.current = true;
    if (seekCooldownTimerRef.current) clearTimeout(seekCooldownTimerRef.current);
    seekCooldownTimerRef.current = setTimeout(() => {
      isSeekingOrLoopingRef.current = false;
    }, 450);

    if (isYouTube) {
      latestYtTimeRef.current = clipStart + clampedRel;
      sendYtCommand('seekTo', [clipStart + clampedRel, true]);
      if (isPlaying) {
        sendYtCommand('playVideo');
      }
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const vDur = video.duration || 0;
    const startPos = clipStart < vDur ? clipStart : 0;
    video.currentTime = startPos + clampedRel;
    if (ambientVideoRef.current) {
      ambientVideoRef.current.currentTime = startPos + clampedRel;
    }
    if (isPlaying && video.paused) {
      video.play().catch(() => {});
    }
  };

  const calcRelativeTimeFromPointer = (clientX: number, target: HTMLElement): number => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * clipDuration;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    isScrubbingRef.current = true;
    setIsScrubbing(true);
    const newTime = calcRelativeTimeFromPointer(e.clientX, e.currentTarget);
    setScrubTime(newTime);
    setCurrentTime(Number(newTime.toFixed(2)));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return;
    e.stopPropagation();
    const newTime = calcRelativeTimeFromPointer(e.clientX, e.currentTarget);
    setScrubTime(newTime);
    setCurrentTime(Number(newTime.toFixed(2)));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return;
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    const finalTime = calcRelativeTimeFromPointer(e.clientX, e.currentTarget);
    isScrubbingRef.current = false;
    setIsScrubbing(false);
    setScrubTime(null);
    handleSeekCommit(finalTime);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    isScrubbingRef.current = false;
    setIsScrubbing(false);
    setScrubTime(null);
  };

  const formatTime = (seconds: number) => {
    const clamped = Math.max(0, seconds);
    const m = Math.floor(clamped / 60);
    const s = Math.floor(clamped % 60);
    const tenths = Math.floor((clamped % 1) * 10);
    return `${m}:${s < 10 ? '0' : ''}${s}.${tenths}`;
  };


  // Group words into natural subtitle phrases (punctuation / pause / max-5-word boundaries).
  // Group words into natural subtitle phrases (smart chunking: 3–5 words, avoiding 1-word stubs).
  // Strictly non-overlapping contiguous time intervals so phrases switch cleanly.
  const phrases = React.useMemo(() => {
    if (!stableWords || stableWords.length === 0) return [];
    const rawChunks: Array<{ words: any[]; start: number; speechEnd: number }> = [];
    let chunk: any[] = [];

    for (let i = 0; i < stableWords.length; i++) {
      const w = stableWords[i];
      chunk.push(w);

      const wordText = (isDevanagari && w.devanagari) ? w.devanagari : w.word;
      const isSentenceEnd = /[.?!|।॥\u0964\u0965]\s*$/.test(wordText) || /[.?!]\s*$/.test(w.word);
      const isClauseEnd = /[,;:…\u2026\-]\s*$/.test(wordText) || /[,;:]\s*$/.test(w.word);
      const nextWord = stableWords[i + 1];
      const hasLongPause = nextWord && (nextWord.relStart - w.relEnd >= 0.55);
      const hasBreathPause = nextWord && (nextWord.relStart - w.relEnd >= 0.28);

      // Smart chunking: prevent 1-word stubs!
      // Require at least 2 words before splitting on sentence/long pause, and at least 3 words before splitting on minor comma
      const shouldSplitSentence = isSentenceEnd && chunk.length >= 2;
      const shouldSplitClause = isClauseEnd && chunk.length >= 3;
      const shouldSplitPause = (hasLongPause && chunk.length >= 2) || (hasBreathPause && chunk.length >= 3);
      const maxWords = chunk.length >= 4;
      const isLast = i === stableWords.length - 1;

      if (shouldSplitSentence || shouldSplitClause || shouldSplitPause || maxWords || isLast) {
        rawChunks.push({
          words: chunk,
          start: chunk[0].relStart,
          speechEnd: chunk[chunk.length - 1].relEnd,
        });
        chunk = [];
      }
    }

    // Assign clean display windows to each phrase:
    // Continuous handoff: hold completed phrase until next phrase begins!
    // Strictly non-overlapping intervals (displayEnd === next.start) so phrases switch cleanly without gaps.
    const result: Array<{
      words: any[];
      start: number;
      speechEnd: number;
      displayEnd: number;
    }> = [];

    for (let i = 0; i < rawChunks.length; i++) {
      const current = rawChunks[i];
      const next = rawChunks[i + 1];

      let displayEnd: number;
      if (next) {
        const pauseGap = next.start - current.speechEnd;
        // If there's a prolonged silence (>1.6s dead air), close caption
        if (pauseGap > 1.6) {
          displayEnd = Math.min(next.start, current.speechEnd + 1.0);
        } else {
          // Continuous handoff: hold completed phrase until next phrase begins!
          displayEnd = next.start;
        }
        displayEnd = Math.min(next.start, Math.max(current.start + 0.15, displayEnd));
      } else {
        displayEnd = Math.min(clipDuration, current.speechEnd + 1.0);
        displayEnd = Math.max(current.start + 0.15, displayEnd);
      }

      result.push({
        words: current.words,
        start: current.start,
        speechEnd: current.speechEnd,
        displayEnd,
      });
    }

    return result;
  }, [clip.id, clipDuration, stableWords, isDevanagari, scriptPreference]);



  const effectiveCurrentTime = isScrubbing && scrubTime !== null ? scrubTime : currentTime;
  const progressPercent = Math.min(100, Math.max(0, (effectiveCurrentTime / clipDuration) * 100));

  // Find the active caption phrase for current playback time.
  const activePhrase = React.useMemo(() => {
    if (phrases.length === 0) return null;

    for (let i = 0; i < phrases.length; i++) {
      const p = phrases[i];
      const prevEnd = i > 0 ? phrases[i - 1].displayEnd : 0;
      // Anticipation window: up to 0.4s before start if previous phrase already ended
      const effectiveStart = i === 0 ? p.start - 0.5 : Math.max(prevEnd, p.start - 0.4);
      if (effectiveCurrentTime >= effectiveStart && effectiveCurrentTime < p.displayEnd) {
        return p;
      }
    }

    // If past all phrases but within 0.8s of the last phrase's displayEnd, keep the last phrase
    const lastPhrase = phrases[phrases.length - 1];
    if (effectiveCurrentTime >= lastPhrase.displayEnd && effectiveCurrentTime < lastPhrase.displayEnd + 0.8) {
      return lastPhrase;
    }

    return null;
  }, [phrases, effectiveCurrentTime]);

  const visibleWords = activePhrase ? activePhrase.words : [];

  // Simulated scene-aware speaker status (e.g. middle segment demonstrating slide/b-roll fallback)
  const isFallbackSegment =
    clip.reframeFallbackUsed ||
    (effectiveCurrentTime > clipDuration * 0.4 && effectiveCurrentTime < clipDuration * 0.65);

  // Preview mode: 'canvas' shows the platform target canvas (9:16 phone simulator by default).
  // 'full' shows complete 16:9 widescreen video with zero blank space.
  const [previewMode, setPreviewMode] = useState<'full' | 'canvas'>('canvas');

  // Default to 'fit' (Full Video 100% visible, uncropped, never cutting off speakers)
  const [framingMode, setFramingMode] = useState<'fit' | 'crop'>('fit');

  // Viewport sizing: 'full' fits 16:9 video cleanly with zero blank space. 'canvas' follows target aspect ratio.
  const aspectRatioClass =
    previewMode === 'full'
      ? 'w-full max-w-[min(94vw,520px)] aspect-video h-auto max-h-[350px]'
      : aspectRatio === '9:16'
      ? 'h-[min(72vh,540px)] aspect-[9/16] w-auto max-w-none'
      : aspectRatio === '1:1'
      ? 'h-[min(65vh,460px)] aspect-square w-auto max-w-none'
      : 'w-[min(90vw,520px)] aspect-video h-auto max-h-[350px]';

  const [isExporting, setIsExporting] = useState(false);
  const [socialCopyOpen, setSocialCopyOpen] = useState(false);

  // Aspect Ratio & Platform mapping with verified canonical dimensions
  type PlatformId = 'instagram_reel' | 'tiktok' | 'yt_shorts' | 'instagram_feed' | 'youtube';
  const [platform, setPlatform] = useState<PlatformId>(
    initialAspectRatio === '1:1' ? 'instagram_feed' : initialAspectRatio === '16:9' ? 'youtube' : 'instagram_reel'
  );

  const PLATFORMS: Array<{
    id: PlatformId;
    label: string;
    sub: string;
    ratio: AspectRatio;
    ratioLabel: string;
    resolution: string;
    icon: React.ReactNode;
    activeClass: string;
    hoverClass: string;
  }> = [
    {
      id: 'instagram_reel',
      label: 'Instagram Reel',
      sub: '9:16 Vertical',
      ratio: '9:16',
      ratioLabel: '9:16',
      resolution: '1080×1920',
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      ),
      activeClass: 'border-[#E1306C] bg-gradient-to-br from-[#E1306C]/25 to-[#833AB4]/15 text-white ring-1 ring-[#E1306C]/70 shadow-[0_0_14px_rgba(225,48,108,0.3)]',
      hoverClass: 'border-[#2B3040] bg-[#0A0B10] text-[#9AA2B6] hover:border-[#E1306C]/50 hover:text-white',
    },
    {
      id: 'tiktok',
      label: 'TikTok',
      sub: '9:16 Vertical',
      ratio: '9:16',
      ratioLabel: '9:16',
      resolution: '1080×1920',
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.17 8.17 0 004.78 1.52V6.75a4.85 4.85 0 01-1.01-.06z"/>
        </svg>
      ),
      activeClass: 'border-[#69C9D0] bg-gradient-to-br from-[#010101]/90 to-[#69C9D0]/20 text-white ring-1 ring-[#69C9D0]/70 shadow-[0_0_14px_rgba(105,201,208,0.3)]',
      hoverClass: 'border-[#2B3040] bg-[#0A0B10] text-[#9AA2B6] hover:border-[#69C9D0]/50 hover:text-white',
    },
    {
      id: 'yt_shorts',
      label: 'YouTube Shorts',
      sub: '9:16 Vertical',
      ratio: '9:16',
      ratioLabel: '9:16',
      resolution: '1080×1920',
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      ),
      activeClass: 'border-[#FF0000] bg-gradient-to-br from-[#FF0000]/25 to-[#0A0B10] text-white ring-1 ring-[#FF0000]/70 shadow-[0_0_14px_rgba(255,0,0,0.3)]',
      hoverClass: 'border-[#2B3040] bg-[#0A0B10] text-[#9AA2B6] hover:border-[#FF0000]/50 hover:text-white',
    },
    {
      id: 'instagram_feed',
      label: 'Instagram Post',
      sub: '1:1 Square',
      ratio: '1:1',
      ratioLabel: '1:1',
      resolution: '1080×1080',
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      ),
      activeClass: 'border-[#E1306C] bg-[#E1306C]/15 text-white ring-1 ring-[#E1306C]/60 shadow-[0_0_10px_rgba(225,48,108,0.2)]',
      hoverClass: 'border-[#2B3040] bg-[#0A0B10] text-[#9AA2B6] hover:border-[#E1306C]/50 hover:text-white',
    },
    {
      id: 'youtube',
      label: 'YouTube Video',
      sub: '16:9 Landscape',
      ratio: '16:9',
      ratioLabel: '16:9',
      resolution: '1920×1080',
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      ),
      activeClass: 'border-[#FF0000] bg-[#FF0000]/15 text-white ring-1 ring-[#FF0000]/60 shadow-[0_0_10px_rgba(255,0,0,0.2)]',
      hoverClass: 'border-[#2B3040] bg-[#0A0B10] text-[#9AA2B6] hover:border-[#FF0000]/50 hover:text-white',
    },
  ];

  const activePlatform = PLATFORMS.find((p) => p.id === platform) || PLATFORMS[0];

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
          fitMode: framingMode,
          sourceVideoUrl: sourceMediaUrl || '',
        }),
      });

      const json = await res.json();
      if (json.success && json.export?.downloadUrl) {
        const a = document.createElement('a');
        a.href = json.export.downloadUrl;
        a.download = `flowzora_${clip.id}_${activePlatform.id}_${activePlatform.ratioLabel.replace(':', 'x')}.mp4`;
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
        <div className="relative w-fit max-w-[96vw] md:max-w-3xl max-h-[min(94vh,700px)] rounded-2xl border border-[#2B3040] bg-[#12141F] p-3.5 sm:p-5 shadow-2xl flex flex-col md:flex-row items-center md:items-stretch gap-4 sm:gap-6 overflow-y-auto md:overflow-hidden mx-auto">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-2.5 right-2.5 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-[#1E2230]/90 text-[#9AA2B6] hover:text-white transition-colors cursor-pointer"
            aria-label="Close preview"
          >
            ✕
          </button>

          {/* Left Column: Viewport & View Mode Controls */}
          <div className="flex flex-col items-center justify-center shrink-0 min-w-0 h-full py-0">
            {/* View Mode Toggle: Target 9:16 Canvas vs Full Video (Widescreen) */}
            <div className="flex items-center gap-1 p-1 bg-[#0A0B10] rounded-xl border border-[#2B3040] mb-2 w-full max-w-[min(94vw,520px)] select-none">
              <button
                type="button"
                onClick={() => setPreviewMode('canvas')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  previewMode === 'canvas'
                    ? 'bg-[#10B981] text-black shadow-md'
                    : 'text-[#9AA2B6] hover:text-white hover:bg-white/5'
                }`}
              >
                <ScanFace className="h-3.5 w-3.5" />
                <span>{activePlatform.ratioLabel} Canvas (Default)</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('full')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  previewMode === 'full'
                    ? 'bg-[#10B981] text-black shadow-md'
                    : 'text-[#9AA2B6] hover:text-white hover:bg-white/5'
                }`}
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Full Video (Widescreen)</span>
              </button>
            </div>

            <div
              className={`relative transition-all duration-300 rounded-2xl overflow-hidden border-2 border-[#2B3040] bg-black shadow-2xl mx-auto select-none ${aspectRatioClass}`}
            >
              {/* Top overlay metadata badge */}
              <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between pointer-events-none">
                <span className="rounded-md bg-black/75 backdrop-blur-sm px-2 py-0.5 text-[9px] sm:text-[10px] font-black text-[#10B981] border border-white/10">
                  RANK #{clip.rank} • {clip.score.compositeScore}/100
                </span>

                {/* Dynamic Scene-Aware Status Badge */}
                <div className="flex items-center gap-1 rounded-md bg-[#10B981]/90 backdrop-blur-sm px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-black shadow">
                  <ScanFace className="h-3 w-3" />
                  <span>{previewMode === 'full' ? 'Full Video (16:9)' : `${activePlatform.ratioLabel} • ${framingMode === 'fit' ? 'Full Video' : 'Crop'}`}</span>
                </div>
              </div>

              {/* Video Player & Visual Area */}
              <div
                className="relative w-full h-full flex items-center justify-center cursor-pointer group overflow-hidden bg-black"
                onClick={togglePlay}
              >
                {/* Ambient Blurred Background Video for studio-grade full visibility when in 'fit' mode */}
                {sourceMediaUrl && previewMode === 'canvas' && framingMode === 'fit' && aspectRatio !== '16:9' && !isYouTube && (
                  <video
                    ref={ambientVideoRef}
                    src={sourceMediaUrl}
                    playsInline
                    muted
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover scale-150 blur-3xl opacity-60 z-0 pointer-events-none"
                  />
                )}

                {/* YouTube Iframe or HTML5 Native Video Tag */}
                {isYouTube && ytVideoId ? (
                  <iframe
                    ref={ytIframeRef}
                    id="flowzora-yt-iframe"
                    src={`https://www.youtube.com/embed/${ytVideoId}?enablejsapi=1&autoplay=1&start=${Math.floor(clipStart)}&controls=0&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&widgetid=1`}
                    className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    onLoad={() => {
                      setTimeout(() => {
                        if (ytIframeRef.current?.contentWindow) {
                          ytIframeRef.current.contentWindow.postMessage('{"event":"listening"}', '*');
                        }
                      }, 350);
                    }}
                  />
                ) : sourceMediaUrl ? (
                  <video
                    ref={videoRef}
                    src={sourceMediaUrl}
                    playsInline
                    preload="auto"
                    onEnded={handleRestart}
                    className={`transition-opacity duration-300 ${
                      previewMode === 'full'
                        ? 'relative w-full h-full object-contain z-10'
                        : framingMode === 'fit' && aspectRatio !== '16:9'
                        ? 'relative w-full h-full object-contain z-10'
                        : 'absolute inset-0 w-full h-full object-cover z-0'
                    } ${sourceMediaType === 'audio' ? 'opacity-0' : 'opacity-100'}`}
                  />
                ) : (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center bg-[#0F111A]">
                    <ScanFace className="h-10 w-10 text-[#9AA2B6] mb-2 opacity-50" />
                    <p className="text-sm font-semibold text-white">No source video loaded</p>
                    <p className="text-xs text-[#9AA2B6] mt-1">Please upload a media file or enter a YouTube URL to preview clips.</p>
                  </div>
                )}

                {/* Audio-only Mode Fallback Waveform Visualizer */}
                {sourceMediaType === 'audio' && (
                  <div className="absolute inset-0 bg-gradient-to-b from-[#1E2230] via-[#141620] to-[#0A0B10] z-0 flex flex-col items-center justify-center">
                    <div className="flex items-center gap-1.5 opacity-80">
                      {Array.from({ length: 14 }).map((_, i) => (
                        <div
                          key={i}
                          className="w-1.5 bg-[#10B981] rounded-full transition-all duration-150"
                          style={{
                            height: isPlaying
                              ? `${15 + ((i * 19 + Math.round(effectiveCurrentTime * 10)) % 65)}px`
                              : '8px',
                          }}
                        />
                      ))}
                    </div>
                    <span className="mt-4 text-[11px] font-mono text-[#9AA2B6]">Audio Track Active</span>
                  </div>
                )}

                {/* Subtle dark gradient overlay for high caption readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none z-10" />

                {/* Unmute Prompt Floating Button (if browser blocked unmuted autoplay) */}
                {isMuted && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMute();
                    }}
                    className="absolute top-10 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full bg-black/85 hover:bg-[#10B981] text-white hover:text-black px-3 py-1 text-xs font-bold border border-white/20 shadow-2xl backdrop-blur-md transition-all cursor-pointer group/btn animate-bounce"
                    title="Click to enable sound"
                  >
                    <VolumeX className="h-3.5 w-3.5 text-[#EF4444] group-hover/btn:text-black transition-colors" />
                    <span>Tap to Unmute</span>
                  </button>
                )}

                {/* Play/Pause Overlay indicator when paused */}
                {!isPlaying && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[2px] transition-all">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#10B981] text-black shadow-2xl transition-transform transform scale-105">
                      <Play className="h-5 w-5 ml-0.5 fill-black" />
                    </div>
                  </div>
                )}

                {/* Word-Level Animated Karaoke Captions */}
                {visibleWords.length > 0 && (
                  <div className="absolute bottom-8 sm:bottom-10 left-2.5 right-2.5 z-20 text-center pointer-events-none transition-opacity duration-200">
                    <div className="inline-block rounded-xl bg-black/85 backdrop-blur-md px-3 py-1.5 border border-white/15 shadow-2xl max-w-full">
                      <div className="flex flex-wrap items-center justify-center gap-1 leading-snug">
                        {visibleWords.map((w: any, idx: number) => {
                          const nextW = visibleWords[idx + 1];
                          const wordEnd = Math.max(w.relEnd, w.relStart + 0.12);
                          // Smooth continuous karaoke transition: active word hands off to next word, or turns white after speaking
                          const activeEnd = nextW ? Math.min(nextW.relStart, wordEnd + 0.35) : wordEnd + 0.35;

                          const isCurrent = effectiveCurrentTime >= w.relStart && effectiveCurrentTime < activeEnd;
                          const isPast = effectiveCurrentTime >= activeEnd;
                          const isUpcoming = effectiveCurrentTime < w.relStart;
                          const displayText = isDevanagari && w.devanagari ? w.devanagari : w.word;

                          return (
                            <span
                              key={`${activePhrase?.start ?? 0}_${idx}_${w.relStart}`}
                              className={`transition-all duration-100 font-bold inline-block ${
                                isCurrent && !isUpcoming
                                  ? 'text-[#10B981] scale-110 drop-shadow-[0_0_12px_rgba(16,185,129,0.95)] font-black'
                                  : isPast
                                  ? 'text-white'
                                  : 'text-white/60 font-medium'
                              } ${isDevanagari ? 'text-sm font-["Noto_Sans_Devanagari"]' : 'text-xs'}`}
                            >
                              {displayText}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* On-Video Audio/Video Scrubber Bar */}
                <div
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  className="absolute bottom-0 left-0 right-0 h-4 -mb-1 flex items-end cursor-pointer touch-none z-30 group/bar select-none"
                  title="Click or drag to scrub video"
                >
                  <div className="w-full h-1.5 bg-white/20 group-hover/bar:h-2.5 transition-all relative">
                    <div
                      className="h-full bg-[#10B981] relative"
                      style={{ width: `${progressPercent}%` }}
                    >
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2.5 h-2.5 bg-white rounded-full shadow border border-[#10B981] opacity-0 group-hover/bar:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Controls & Actions */}
          <div className="w-full md:w-[320px] lg:w-[340px] shrink-0 flex flex-col justify-between overflow-y-auto max-h-[min(88vh,640px)] pr-1 gap-2.5">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white mb-0.5 font-[var(--font-outfit)] leading-tight">
                Interactive Clip Studio
              </h3>
              <p className="text-[11px] text-[#9AA2B6]">
                Preview word-level captions, canvas ratio, &amp; export.
              </p>

              {/* Aspect Ratio Section */}
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-semibold text-[#EDEDED] block">
                    Aspect Ratio:
                  </label>
                  <span className="text-[10px] font-mono text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded border border-[#10B981]/25 font-semibold">
                    {activePlatform.ratioLabel} • {activePlatform.resolution}
                  </span>
                </div>

                {/* Short-Form Vertical (9:16) — Instagram Reel, TikTok, YouTube Shorts */}
                <div className="space-y-1">
                  <div className="text-[9px] font-mono text-[#A1A1A1] flex items-center justify-between px-0.5">
                    <span>Vertical Shorts (9:16)</span>
                    <span className="text-[#10B981] text-[9px] font-sans">1080×1920</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {PLATFORMS.slice(0, 3).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setPlatform(p.id); setAspectRatio(p.ratio); }}
                        className={`flex flex-col items-center justify-center gap-0.5 rounded-lg border py-1.5 px-1 text-center transition-all cursor-pointer min-h-[50px] ${
                          platform === p.id ? p.activeClass : p.hoverClass
                        }`}
                        title={`${p.label} — Aspect Ratio ${p.ratio} (${p.resolution})`}
                      >
                        {p.icon}
                        <span className="text-[10px] font-bold leading-tight line-clamp-1">{p.label}</span>
                        <span className={`text-[8px] font-mono font-semibold px-1 py-0.2 rounded ${
                          platform === p.id ? 'bg-white/20 text-white' : 'bg-[#1E2230] text-[#A1A1A1]'
                        }`}>
                          {p.ratio}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Other Aspect Ratios (1:1 & 16:9) */}
                <div className="mt-2 space-y-1">
                  <div className="text-[9px] font-mono text-[#626B82] px-0.5">
                    Other Aspect Ratios
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {PLATFORMS.slice(3, 5).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setPlatform(p.id); setAspectRatio(p.ratio); }}
                        className={`flex items-center justify-between gap-1 rounded-lg border py-1 px-2 text-[10px] font-semibold transition-all cursor-pointer min-h-[34px] ${
                          platform === p.id ? p.activeClass : p.hoverClass
                        }`}
                        title={`${p.label} — Aspect Ratio ${p.ratio} (${p.resolution})`}
                      >
                        <div className="flex items-center gap-1 min-w-0">
                          {p.icon}
                          <div className="text-left truncate">
                            <span className="leading-tight font-bold block truncate text-[10px]">{p.label}</span>
                          </div>
                        </div>
                        <span className={`shrink-0 text-[8px] font-mono font-semibold px-1 py-0.2 rounded ${
                          platform === p.id ? 'bg-white/20 text-white' : 'bg-[#1E2230] text-[#A1A1A1]'
                        }`}>
                          {p.ratio}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Framing Style Toggle (Full Video vs Crop) */}
                <div className="mt-2 flex items-center justify-between text-[10px] font-medium bg-[#0A0B10] p-1 rounded-lg border border-[#2B3040]">
                  <span className="text-[#A1A1A1] pl-1 font-mono">Framing:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setFramingMode('fit')}
                      className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                        framingMode === 'fit'
                          ? 'bg-[#10B981] text-black shadow'
                          : 'text-[#9AA2B6] hover:text-white'
                      }`}
                      title="Show complete full video without cropping"
                    >
                      Full Video (Fit)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFramingMode('crop')}
                      className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                        framingMode === 'crop'
                          ? 'bg-[#10B981] text-black shadow'
                          : 'text-[#9AA2B6] hover:text-white'
                      }`}
                      title="Crop sides to fill 9:16 vertical canvas"
                    >
                      Crop to Fill
                    </button>
                  </div>
                </div>
              </div>

              {/* Caption Script Toggle */}
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-[#EDEDED] block">
                    Caption Script:
                  </label>
                  <span className="text-[9px] font-mono text-[#10B981] bg-[#10B981]/10 px-1.5 py-0.2 rounded border border-[#10B981]/25 font-semibold">
                    {scriptPreference === 'devanagari' ? 'देवनागरी' : scriptPreference === 'english' ? 'English' : 'Romanized Hindi'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#0A0B10] p-0.5 border border-[#2B3040]">
                  <button
                    type="button"
                    onClick={() => {
                      setScriptPreference('english');
                      if (onScriptChange) onScriptChange('english');
                    }}
                    className={`rounded py-1 px-1.5 text-[10px] font-bold transition-all text-center cursor-pointer ${
                      scriptPreference === 'english'
                        ? 'bg-[#10B981] text-black font-bold shadow'
                        : 'text-[#9AA2B6] hover:text-white'
                    }`}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScriptPreference('romanized');
                      if (onScriptChange) onScriptChange('romanized');
                    }}
                    className={`rounded py-1 px-1.5 text-[10px] font-bold transition-all text-center cursor-pointer ${
                      scriptPreference === 'romanized'
                        ? 'bg-[#10B981] text-black font-bold shadow'
                        : 'text-[#9AA2B6] hover:text-white'
                    }`}
                  >
                    Romanized Hindi
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScriptPreference('devanagari');
                      if (onScriptChange) onScriptChange('devanagari');
                    }}
                    className={`rounded py-1 px-1.5 text-[10px] font-bold transition-all text-center cursor-pointer ${
                      scriptPreference === 'devanagari'
                        ? 'bg-[#10B981] text-black font-bold shadow font-["Noto_Sans_Devanagari"]'
                        : 'text-[#9AA2B6] hover:text-white font-["Noto_Sans_Devanagari"]'
                    }`}
                  >
                    देवनागरी
                  </button>
                </div>
              </div>

              {/* Gemini Score Reasoning */}
              <div className="mt-2.5 rounded-lg border border-[#2B3040] bg-[#0A0B10] p-2">
                <div className="flex items-center justify-between text-[11px] mb-0.5">
                  <span className="font-bold text-[#10B981]">Virality Score</span>
                  <span className="font-extrabold text-white">{clip.score.compositeScore}/100</span>
                </div>
                <p className="text-[10px] italic text-[#9AA2B6] border-l border-[#10B981] pl-1.5 line-clamp-2">
                  "{clip.score.reasoning}"
                </p>
              </div>
            </div>

            {/* Bottom Player Controls & Export */}
            <div className="mt-2 pt-2 border-t border-[#242938]">
              {/* Interactive Timeline Video Slider */}
              <div className="mb-2 bg-[#0A0B10] p-2 rounded-xl border border-[#2B3040]">
                <div className="flex items-center justify-between text-[10px] font-mono mb-1.5 select-none">
                  <div className="flex items-center gap-1">
                    <span className="text-[#10B981] font-bold tabular-nums">
                      {formatTime(effectiveCurrentTime)}
                    </span>
                    <span className="text-[#626B82]">/</span>
                    <span className="text-[#9AA2B6] tabular-nums">
                      {formatTime(clipDuration)}
                    </span>
                  </div>
                  <span className={`text-[9px] uppercase tracking-wider font-semibold ${
                    isScrubbing ? 'text-[#F59E0B]' : isPlaying ? 'text-[#10B981]' : 'text-[#9AA2B6]'
                  }`}>
                    {isScrubbing ? 'Seeking...' : isPlaying ? 'Playing' : 'Paused'}
                  </span>
                </div>

                {/* Slider track with pointer events */}
                <div
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  className="relative h-5 flex items-center cursor-pointer touch-none select-none group"
                  title="Drag or click to seek video"
                >
                  {/* Track background */}
                  <div className="w-full h-1.5 rounded-full bg-[#1E2230] group-hover:h-2 transition-all relative overflow-hidden border border-white/5">
                    {/* Active progress */}
                    <div
                      className="h-full bg-gradient-to-r from-[#10B981] to-[#34D399] rounded-full"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  {/* Draggable thumb */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_10px_rgba(16,185,129,0.9)] border-2 border-[#10B981] group-hover:scale-125 transition-transform"
                    style={{ left: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-center gap-2.5 mb-2.5">
                <button
                  type="button"
                  onClick={handleRestart}
                  className="rounded-lg bg-[#1E2230] p-1.5 text-[#9AA2B6] hover:text-white transition-colors cursor-pointer"
                  title="Restart"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[#10B981] text-black hover:bg-[#059669] shadow-lg transition-transform active:scale-95 cursor-pointer"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                </button>
                <button
                  type="button"
                  onClick={toggleMute}
                  className="rounded-lg bg-[#1E2230] p-1.5 text-[#9AA2B6] hover:text-white transition-colors cursor-pointer"
                  title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
                >
                  {isMuted ? (
                    <VolumeX className="h-3.5 w-3.5 text-[#EF4444]" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5 text-[#10B981]" />
                  )}
                </button>
                <div className="text-[11px] text-[#9AA2B6] tabular-nums font-medium font-mono">
                  {effectiveCurrentTime.toFixed(1)}s / {clipDuration.toFixed(1)}s
                </div>
              </div>

              <div className="space-y-1.5">
                <button
                  onClick={handleExportDownload}
                  disabled={isExporting}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#10B981] py-2 text-xs font-bold text-black hover:bg-[#059669] shadow-md transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Rendering &amp; Downloading MP4...</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5 text-black" />
                      <span>Download for {activePlatform.label} ({activePlatform.ratioLabel})</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setSocialCopyOpen(true)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[#2B3040] bg-[#0A0B10] py-1.5 text-[11px] font-bold text-[#10B981] hover:border-[#10B981] transition-colors cursor-pointer"
                >
                  <Share2 className="h-3 w-3 text-[#10B981]" />
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
