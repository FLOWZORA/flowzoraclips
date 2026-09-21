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
import { exportClipInBrowser, isBrowserMp4RecordingSupported } from '@/lib/pipeline/client-video-exporter';

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
  sourceVideoKey?: string;
}

export default function ClipVideoPreview({
  clip,
  scriptPreference: initialScript,
  initialAspectRatio = '9:16',
  onScriptChange,
  onClose,
  sourceMediaUrl = '',
  sourceMediaType = 'video',
  sourceVideoKey = '',
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
  const latestScrubTimeRef = useRef<number | null>(null);
  const ytScrubThrottleRef = useRef<number>(0);
  const isSeekingRef = useRef(false);
  const targetSeekPosRef = useRef<number | null>(null);
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoopingRef = useRef(false);
  const loopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

      // Map to relative timestamps, sanitize negative or NaN values, and sort chronologically.
      // Words spoken entirely before clipStart (e.g. after a trim/nudge moved
      // the start forward) are excluded — clamping them to 0 would show the
      // wrong text over the opening frames.
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
            _relEnd: Number.isFinite(rawEnd) ? Number((rawEnd - offset).toFixed(2)) : e,
          };
        })
        .sort((a: any, b: any) => a.relStart - b.relStart)
        .filter((w: any) => w._relEnd > 0.15)
        .map((w: any) => {
          const { _relEnd, ...rest } = w;
          return rest;
        });

      // Every word predates the clip start — fall through to the synthetic
      // snippet fallback below rather than rendering wrong words at 0s.
      if (mapped.length > 0) {
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
                  if (!isLoopingRef.current && !isSeekingRef.current && !isScrubbingRef.current) {
                    isLoopingRef.current = true;
                    try {
                      event.target.seekTo(clipStart, true);
                      event.target.playVideo();
                      setCurrentTime(0);
                      lastReportedTimeRef.current = 0;
                      latestYtTimeRef.current = clipStart;
                      setIsPlaying(true);
                    } catch (_) {}
                    if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
                    loopTimeoutRef.current = setTimeout(() => {
                      isLoopingRef.current = false;
                    }, 1200);
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
            const rawTime = data.info.currentTime;
            // Only update latestYtTime if not in the middle of a seek / loop
            if (isSeekingRef.current && targetSeekPosRef.current !== null) {
              if (Math.abs(rawTime - targetSeekPosRef.current) <= 0.6) {
                isSeekingRef.current = false;
                targetSeekPosRef.current = null;
                latestYtTimeRef.current = rawTime;
              }
            } else if (isLoopingRef.current) {
              if (rawTime <= clipStart + 0.6) {
                isLoopingRef.current = false;
                latestYtTimeRef.current = rawTime;
              }
            } else {
              latestYtTimeRef.current = rawTime;
            }
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
  }, [isYouTube, clipStart]);

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
            // If we are waiting for a seek to land, verify if YouTube reached near the target
            if (isSeekingRef.current && targetSeekPosRef.current !== null) {
              if (Math.abs(raw - targetSeekPosRef.current) <= 0.6) {
                isSeekingRef.current = false;
                targetSeekPosRef.current = null;
              } else {
                // Ignore stale playback timestamp before the seek completes!
                animId = requestAnimationFrame(syncLoop);
                return;
              }
            }

            // If we are looping back to start
            if (isLoopingRef.current) {
              if (raw <= clipStart + 0.6) {
                isLoopingRef.current = false;
              } else {
                // Ignore stale timestamp near clipEnd while YouTube is rewinding
                animId = requestAnimationFrame(syncLoop);
                return;
              }
            }

            // Natural end-of-clip loop detection
            if (raw >= clipEnd - 0.12) {
              isLoopingRef.current = true;
              sendYtCommand('seekTo', [clipStart, true]);
              sendYtCommand('playVideo');
              setCurrentTime(0);
              lastReportedTimeRef.current = 0;
              latestYtTimeRef.current = clipStart;

              if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
              loopTimeoutRef.current = setTimeout(() => {
                isLoopingRef.current = false;
              }, 1200);
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
      animId = requestAnimationFrame(syncLoop);
    };

    animId = requestAnimationFrame(syncLoop);
    return () => {
      cancelAnimationFrame(animId);
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
    };
  }, [isYouTube, isPlaying, clipStart, clipEnd, clipDuration]);

  // Helper function to sync HTML5 video progress with relative clip timeline
  const syncVideoProgress = (video: HTMLVideoElement) => {
    if (isScrubbingRef.current) return;

    const vDur = video.duration || 0;
    const startPos = vDur > 0 && clipStart < vDur ? clipStart : 0;
    const endPos = vDur > 0
      ? Math.min(vDur, clipEnd > startPos ? clipEnd : startPos + clipDuration)
      : (clipStart + clipDuration);

    // Loop at end of highlight clip
    if (vDur > 0 && endPos > startPos && video.currentTime >= endPos - 0.08) {
      video.currentTime = startPos;
      if (ambientVideoRef.current) ambientVideoRef.current.currentTime = startPos;
      setCurrentTime(0);
      lastReportedTimeRef.current = 0;
      video.play().catch(() => {});
      if (ambientVideoRef.current) ambientVideoRef.current.play().catch(() => {});
      return;
    }

    // Relative progression calculation:
    // If video is playing after startPos, relative is (currentTime - startPos).
    // If video is playing from beginning (< startPos), relative is currentTime directly.
    let rel = 0;
    if (startPos > 0 && video.currentTime >= startPos - 0.1) {
      rel = video.currentTime - startPos;
    } else {
      rel = video.currentTime;
    }
    const clampedRel = Math.max(0, Math.min(clipDuration, rel));

    if (Math.abs(clampedRel - lastReportedTimeRef.current) >= 0.03) {
      lastReportedTimeRef.current = clampedRel;
      setCurrentTime(Number(clampedRel.toFixed(2)));
    }

    // Keep ambient video in sync
    if (ambientVideoRef.current) {
      if (Math.abs(ambientVideoRef.current.currentTime - video.currentTime) > 0.3) {
        ambientVideoRef.current.currentTime = video.currentTime;
      }
      if (ambientVideoRef.current.paused && !video.paused) {
        ambientVideoRef.current.play().catch(() => {});
      } else if (!ambientVideoRef.current.paused && video.paused) {
        ambientVideoRef.current.pause();
      }
    }
  };

  // Synchronize HTML5 video playback initialization & start position
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isYouTube) return;

    let active = true;

    const setupMedia = () => {
      if (!active) return;
      const duration = video.duration || 0;
      const startPos = duration > 0 && clipStart < duration ? clipStart : 0;
      if (startPos > 0 && Math.abs(video.currentTime - startPos) > 0.5) {
        try { video.currentTime = startPos; } catch (_) {}
      }
      setCurrentTime(0);
      lastReportedTimeRef.current = 0;

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
    video.addEventListener('canplay', setupMedia, { once: true });
    if (video.readyState >= 1) {
      setupMedia();
    }

    return () => {
      active = false;
      video.removeEventListener('loadedmetadata', setupMedia);
      video.removeEventListener('canplay', setupMedia);
    };
  }, [clip.id, sourceMediaUrl, clipStart, isYouTube]);

  // Continuous 60fps time synchronization with HTML5 video
  useEffect(() => {
    if (isYouTube) return;

    let animId: number;
    let lastCheck = 0;
    const syncTime = (timestamp: number) => {
      if (timestamp - lastCheck >= 25) {
        lastCheck = timestamp;
        const video = videoRef.current;
        if (video && !video.paused && !video.ended && !isScrubbingRef.current) {
          syncVideoProgress(video);
        }
      }
      animId = requestAnimationFrame(syncTime);
    };

    animId = requestAnimationFrame(syncTime);
    return () => cancelAnimationFrame(animId);
  }, [clip.id, clipStart, clipEnd, clipDuration, isYouTube]);

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
    isLoopingRef.current = true;
    targetSeekPosRef.current = clipStart;
    if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
    loopTimeoutRef.current = setTimeout(() => {
      isLoopingRef.current = false;
    }, 1200);

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
    isScrubbingRef.current = false;
    setIsScrubbing(false);
    latestScrubTimeRef.current = null;
    setScrubTime(null);
    setCurrentTime(Number(clampedRel.toFixed(2)));
    lastReportedTimeRef.current = clampedRel;

    if (isYouTube) {
      const targetAbs = clipStart + clampedRel;
      targetSeekPosRef.current = targetAbs;
      isSeekingRef.current = true;
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      seekTimeoutRef.current = setTimeout(() => {
        isSeekingRef.current = false;
        targetSeekPosRef.current = null;
      }, 1500);

      latestYtTimeRef.current = targetAbs;
      sendYtCommand('seekTo', [targetAbs, true]);
      if (isPlaying) {
        sendYtCommand('playVideo');
      }
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const vDur = video.duration || 0;
    const startPos = clipStart < vDur ? clipStart : 0;
    const targetAbs = startPos + clampedRel;
    targetSeekPosRef.current = targetAbs;
    isSeekingRef.current = true;
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    seekTimeoutRef.current = setTimeout(() => {
      isSeekingRef.current = false;
      targetSeekPosRef.current = null;
    }, 1000);

    video.currentTime = targetAbs;
    if (ambientVideoRef.current) {
      ambientVideoRef.current.currentTime = targetAbs;
    }
    if (isPlaying && video.paused) {
      video.play().catch(() => {});
    }
  };

  const handleScrubChange = (val: number) => {
    if (isNaN(val)) return;
    const clamped = Math.max(0, Math.min(clipDuration, val));
    isScrubbingRef.current = true;
    setIsScrubbing(true);
    latestScrubTimeRef.current = clamped;
    setScrubTime(clamped);
    setCurrentTime(clamped);

    if (isYouTube) {
      const now = Date.now();
      if (now - ytScrubThrottleRef.current > 120) {
        ytScrubThrottleRef.current = now;
        sendYtCommand('seekTo', [clipStart + clamped, false]);
      }
    } else if (videoRef.current) {
      const vDur = videoRef.current.duration || 0;
      const startPos = clipStart < vDur ? clipStart : 0;
      videoRef.current.currentTime = startPos + clamped;
      if (ambientVideoRef.current) {
        ambientVideoRef.current.currentTime = startPos + clamped;
      }
    }
  };

  const handleJump = (deltaSeconds: number) => {
    const target = Math.max(0, Math.min(clipDuration, effectiveCurrentTime + deltaSeconds));
    handleSeekCommit(target);
  };

  // Global pointer/touch release listener so slider scrubbing NEVER gets stuck
  useEffect(() => {
    const handleGlobalRelease = () => {
      if (isScrubbingRef.current) {
        isScrubbingRef.current = false;
        setIsScrubbing(false);
        const finalTime = latestScrubTimeRef.current;
        latestScrubTimeRef.current = null;
        setScrubTime(null);
        if (finalTime !== null && !isNaN(finalTime)) {
          handleSeekCommit(finalTime);
        }
      }
    };

    window.addEventListener('pointerup', handleGlobalRelease);
    window.addEventListener('pointercancel', handleGlobalRelease);
    window.addEventListener('mouseup', handleGlobalRelease);
    window.addEventListener('touchend', handleGlobalRelease);

    return () => {
      window.removeEventListener('pointerup', handleGlobalRelease);
      window.removeEventListener('pointercancel', handleGlobalRelease);
      window.removeEventListener('mouseup', handleGlobalRelease);
      window.removeEventListener('touchend', handleGlobalRelease);
    };
  }, [clipStart, clipDuration, isYouTube, isPlaying]);

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
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);  const [socialCopyOpen, setSocialCopyOpen] = useState(false);

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
      sub: 'Vertical 9:16',
      ratio: '9:16',
      ratioLabel: '9:16',
      resolution: '1080×1920',
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
      ),
      activeClass: 'border-[#10B981] bg-[#10B981]/15 text-white ring-1 ring-[#10B981]/60 shadow-[0_0_10px_rgba(16,185,129,0.2)]',
      hoverClass: 'border-[#2B3040] bg-[#0A0B10] text-[#9AA2B6] hover:border-[#10B981]/50 hover:text-white',
    },
    {
      id: 'tiktok',
      label: 'TikTok',
      sub: 'Vertical 9:16',
      ratio: '9:16',
      ratioLabel: '9:16',
      resolution: '1080×1920',
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" />
        </svg>
      ),
      activeClass: 'border-[#00F2FE] bg-[#00F2FE]/15 text-white ring-1 ring-[#00F2FE]/60 shadow-[0_0_10px_rgba(0,242,254,0.2)]',
      hoverClass: 'border-[#2B3040] bg-[#0A0B10] text-[#9AA2B6] hover:border-[#00F2FE]/50 hover:text-white',
    },
    {
      id: 'yt_shorts',
      label: 'YouTube Shorts',
      sub: 'Vertical 9:16',
      ratio: '9:16',
      ratioLabel: '9:16',
      resolution: '1080×1920',
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z" />
        </svg>
      ),
      activeClass: 'border-[#FF0000] bg-[#FF0000]/15 text-white ring-1 ring-[#FF0000]/60 shadow-[0_0_10px_rgba(255,0,0,0.2)]',
      hoverClass: 'border-[#2B3040] bg-[#0A0B10] text-[#9AA2B6] hover:border-[#FF0000]/50 hover:text-white',
    },
    {
      id: 'instagram_feed',
      label: 'Instagram Feed',
      sub: 'Square 1:1',
      ratio: '1:1',
      ratioLabel: '1:1',
      resolution: '1080×1080',
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        </svg>
      ),
      activeClass: 'border-[#FF5722] bg-[#FF5722]/15 text-white ring-1 ring-[#FF5722]/60 shadow-[0_0_10px_rgba(255,87,34,0.2)]',
      hoverClass: 'border-[#2B3040] bg-[#0A0B10] text-[#9AA2B6] hover:border-[#FF5722]/50 hover:text-white',
    },
    {
      id: 'youtube',
      label: 'YouTube (Standard)',
      sub: 'Landscape 16:9',
      ratio: '16:9',
      ratioLabel: '16:9',
      resolution: '1920×1080',
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
        </svg>
      ),
      activeClass: 'border-[#FF0000] bg-[#FF0000]/15 text-white ring-1 ring-[#FF0000]/60 shadow-[0_0_10px_rgba(255,0,0,0.2)]',
      hoverClass: 'border-[#2B3040] bg-[#0A0B10] text-[#9AA2B6] hover:border-[#FF0000]/50 hover:text-white',
    },
  ];

  const activePlatform = PLATFORMS.find((p) => p.id === platform) || PLATFORMS[0];

  const handleExportDownload = async () => {
    setExportError(null);
    setIsExporting(true);
    setExportProgress(0);
    // Guard: a clip with no caption data would download with zero subtitles.
    if (((clip as any).words?.length || 0) === 0 && !(clip.transcriptSnippet || '').trim()) {
      setExportError('No captions were generated for this clip — close the studio and re-run "Generate Ranked Highlights", then try again.');
      setIsExporting(false);
      setExportProgress(null);
      return;
    }
    try {
      const exportFormat = aspectRatio || activePlatform.ratio || '9:16';
      const isYouTube = Boolean(
        sourceMediaUrl &&
        (sourceMediaUrl.includes('youtube.com') || sourceMediaUrl.includes('youtu.be'))
      );

      // 1. High-speed client-side rendering with burned-in animated subtitles for local/uploaded files
      // (only where the browser records real MP4 — otherwise use the server
      // ffmpeg render so the download plays everywhere, not just browsers)
      if (sourceMediaUrl && !isYouTube && isBrowserMp4RecordingSupported()) {
        try {
          const result = await exportClipInBrowser({
            sourceMedia: sourceMediaUrl,
            clipId: clip.id,
            startTime: clipStart,
            endTime: clipEnd,
            words: (clip as any).words || stableWords || [],
            transcriptSnippet: clip.transcriptSnippet || '',
            scriptPreference,
            format: exportFormat,
            fitMode: framingMode,
            onProgress: (pct) => setExportProgress(pct),
          });

          const a = document.createElement('a');
          a.href = result.downloadUrl;
          a.download = result.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setIsExporting(false);
          setExportProgress(null);
          return;
        } catch (browserErr) {
          console.warn('[Export] Browser export error, falling back to server:', browserErr);
        }
      }

      // 2. Server-side export fallback
      const res = await fetch('/api/export/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: clip.id,
          startTime: clipStart,
          endTime: clipEnd,
          scriptPreference,
          format: exportFormat,
          fitMode: framingMode,
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
        a.download = `flowzora_${clip.id}_${activePlatform.id}_${activePlatform.ratioLabel.replace(':', 'x')}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        const json = await res.json();
        if (json.success && json.export?.downloadUrl) {
          const a = document.createElement('a');
          a.href = json.export.downloadUrl;
          a.download = `flowzora_${clip.id}_${activePlatform.id}_${activePlatform.ratioLabel.replace(':', 'x')}.mp4`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          const fallbackUrl = `/api/export/render?clipId=${clip.id}&download=true&format=${exportFormat}&startTime=${clipStart}&endTime=${clipEnd}&sourceVideoUrl=${encodeURIComponent(sourceMediaUrl || '')}${sourceVideoKey ? `&sourceVideoKey=${encodeURIComponent(sourceVideoKey)}` : ''}&fitMode=${framingMode}`;
          window.location.href = fallbackUrl;
        }
      }
    } catch (err) {
      console.error('Export download failed:', err);
      const fallbackUrl = `/api/export/render?clipId=${clip.id}&download=true&format=${aspectRatio || '9:16'}&startTime=${clipStart}&endTime=${clipEnd}&sourceVideoUrl=${encodeURIComponent(sourceMediaUrl || '')}${sourceVideoKey ? `&sourceVideoKey=${encodeURIComponent(sourceVideoKey)}` : ''}&fitMode=${framingMode}`;
      window.location.href = fallbackUrl;
    } finally {
      setIsExporting(false);
      setExportProgress(null);
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
                    onTimeUpdate={(e) => syncVideoProgress(e.currentTarget)}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
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
                    <p className="text-xs text-[#9AA2B6] mt-1">Please upload a media file to preview clips.</p>
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

                {/* NOTE: Seeking is handled exclusively by the Master Timeline
                    Scrubber deck below the video frame. No on-video overlay bar
                    (a single slider avoids dual-control conflicts). */}
              </div>
            </div>

            {/* Master Timeline Scrubber & Player Controls Deck Directly Below Video Frame */}
            <div className="w-full max-w-[min(94vw,520px)] mt-2.5 bg-[#0A0B10] p-2.5 sm:p-3 rounded-2xl border border-[#2B3040] shadow-xl select-none">
              {/* Header: Current time / Duration & State */}
              <div className="flex items-center justify-between text-xs font-mono mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[#10B981] font-bold tabular-nums text-xs sm:text-sm">
                    {formatTime(effectiveCurrentTime)}
                  </span>
                  <span className="text-[#626B82]">/</span>
                  <span className="text-[#9AA2B6] tabular-nums text-xs sm:text-sm">
                    {formatTime(clipDuration)}
                  </span>
                </div>
                <span
                  className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                    isScrubbing
                      ? 'bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40'
                      : isPlaying
                      ? 'bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/40'
                      : 'bg-[#1E2230] text-[#9AA2B6] border border-white/10'
                  }`}
                >
                  {isScrubbing ? 'Seeking...' : isPlaying ? 'Playing' : 'Paused'}
                </span>
              </div>

              {/* Master Range Slider (single seek control for the clip) */}
              <div className="relative w-full flex items-center py-2">
                <input
                  type="range"
                  min={0}
                  max={clipDuration}
                  step={0.05}
                  value={Number(effectiveCurrentTime.toFixed(2))}
                  onPointerDown={() => {
                    isScrubbingRef.current = true;
                    setIsScrubbing(true);
                  }}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    handleScrubChange(val);
                  }}
                  onPointerUp={(e) => {
                    const val = parseFloat((e.target as HTMLInputElement).value);
                    handleSeekCommit(val);
                  }}
                  onTouchEnd={(e) => {
                    const val = parseFloat((e.target as HTMLInputElement).value);
                    handleSeekCommit(val);
                  }}
                  className="w-full h-2.5 rounded-full appearance-none cursor-pointer bg-[#1E2230] touch-none select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]/60 shadow-inner transition-all [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[#10B981] [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-[#10B981] [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:cursor-grab [&::-moz-range-track]:bg-transparent"
                  style={{
                    background: `linear-gradient(to right, #10B981 0%, #34D399 ${progressPercent}%, #1E2230 ${progressPercent}%, #1E2230 100%)`,
                  }}
                  title="Slide to seek through clip"
                  aria-label="Seek through clip"
                />
              </div>

              {/* Playback action buttons */}
              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[#1E2230]">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleRestart}
                    className="rounded-xl bg-[#161822] hover:bg-[#1E2230] p-2 text-[#9AA2B6] hover:text-white transition-colors cursor-pointer"
                    title="Restart Clip"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleJump(-5)}
                    className="flex items-center gap-0.5 rounded-xl bg-[#161822] hover:bg-[#1E2230] px-2 py-1 text-xs font-mono font-bold text-[#9AA2B6] hover:text-white transition-colors cursor-pointer"
                    title="Rewind 5s"
                  >
                    -5s
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-[#10B981] text-black hover:bg-[#059669] shadow-lg shadow-[#10B981]/25 transition-transform active:scale-95 cursor-pointer font-bold"
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause className="h-5 w-5 fill-black" /> : <Play className="h-5 w-5 ml-0.5 fill-black" />}
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleJump(5)}
                    className="flex items-center gap-0.5 rounded-xl bg-[#161822] hover:bg-[#1E2230] px-2 py-1 text-xs font-mono font-bold text-[#9AA2B6] hover:text-white transition-colors cursor-pointer"
                    title="Forward 5s"
                  >
                    +5s
                  </button>
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="rounded-xl bg-[#161822] hover:bg-[#1E2230] p-2 text-[#9AA2B6] hover:text-white transition-colors cursor-pointer"
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? (
                      <VolumeX className="h-4 w-4 text-[#EF4444]" />
                    ) : (
                      <Volume2 className="h-4 w-4 text-[#10B981]" />
                    )}
                  </button>
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

            {/* Bottom Actions: Export */}
            <div className="mt-2 pt-2 border-t border-[#242938]">
              {exportError && (
                <p className="mb-1.5 rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/10 px-2 py-1.5 text-[11px] font-semibold text-white">
                  {exportError}
                </p>
              )}
              <div className="space-y-1.5">
                <button
                  onClick={handleExportDownload}
                  disabled={isExporting}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#10B981] py-2 text-xs font-bold text-black hover:bg-[#059669] shadow-md transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span className="font-mono">
                        {exportProgress !== null
                          ? `Rendering ${activePlatform.ratioLabel} with Subtitles (${exportProgress}%)...`
                          : 'Rendering & Downloading MP4...'}
                      </span>
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
