import { WordTimestamp, ScriptPreference, AspectRatio } from './types';

export interface ClientExportOptions {
  sourceMedia: File | string;
  clipId: string;
  startTime: number;
  endTime: number;
  words?: WordTimestamp[];
  transcriptSnippet?: string;
  scriptPreference?: ScriptPreference;
  format?: AspectRatio;
  fitMode?: 'fit' | 'crop';
  onProgress?: (percent: number) => void;
}

export interface ClientExportResult {
  blob: Blob;
  downloadUrl: string;
  filename: string;
  extension: 'mp4' | 'webm';
}

/**
 * High-performance, in-browser video renderer that burns animated karaoke subtitles
 * directly into 9:16 vertical (Instagram Reels / YouTube Shorts) video frames.
 *
 * Runs 100% client-side using HTML5 Canvas, Web Audio API, and MediaRecorder.
 * Completely immune to Vercel serverless timeouts and 4.5MB payload limits.
 */
export async function exportClipInBrowser(
  options: ClientExportOptions
): Promise<ClientExportResult> {
  const {
    sourceMedia,
    clipId,
    startTime = 0,
    endTime = 30,
    words = [],
    transcriptSnippet = '',
    scriptPreference = 'romanized',
    format = '9:16',
    fitMode = 'fit',
    onProgress,
  } = options;

  const duration = Math.max(1, Math.min(35, endTime - startTime));
  const safeEndTime = startTime + duration;

  // 1. Prepare video element and attach invisibly to DOM to prevent background tab frame throttling
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.preload = 'auto';
  video.muted = false;
  video.volume = 1.0;
  video.style.position = 'fixed';
  video.style.top = '-9999px';
  video.style.left = '-9999px';
  video.style.width = '2px';
  video.style.height = '2px';
  video.style.opacity = '0';
  video.style.pointerEvents = 'none';
  document.body.appendChild(video);

  let objectUrlToRevoke: string | null = null;
  if (typeof sourceMedia === 'string') {
    video.src = sourceMedia;
  } else {
    objectUrlToRevoke = URL.createObjectURL(sourceMedia);
    video.src = objectUrlToRevoke;
  }

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video media in browser'));
    setTimeout(() => reject(new Error('Timeout loading video metadata in browser')), 15000);
  });

  // 2. Prepare canvas dimensions for requested aspect ratio
  // 9:16 (1080x1920 vertical for Reels & Shorts)
  // 1:1 (1080x1080 square for Instagram Feed)
  // 16:9 (1920x1080 landscape)
  const isVertical = format === '9:16';
  const isSquare = format === '1:1';
  const targetW = isVertical ? 1080 : isSquare ? 1080 : 1920;
  const targetH = isVertical ? 1920 : isSquare ? 1080 : 1080;

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    video.remove();
    if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
    throw new Error('Could not initialize canvas 2D rendering context');
  }
  const renderCtx: CanvasRenderingContext2D = ctx;

  // 3. Prepare Subtitle Timestamps (relative to clip 0s)
  const firstStart = Number(words[0]?.start ?? (words[0] as any)?.relStart ?? 0);
  const isAbsolute = startTime > 0.5 && (firstStart >= startTime - 3.0 || firstStart > duration);
  const offset = isAbsolute ? startTime : 0;

  let mappedWords = (words || []).map((w: any) => {
    const rawS = Number(w.start ?? w.relStart ?? 0);
    const rawE = Number(w.end ?? w.relEnd ?? rawS + 0.35);
    return {
      word: String(w.word || ''),
      devanagari: String(w.devanagari || w.word || ''),
      relStart: Math.max(0, Number((rawS - offset).toFixed(2))),
      relEnd: Math.max(0.12, Number((rawE - offset).toFixed(2))),
    };
  }).filter((w) => w.relStart <= duration + 0.5);

  // If words are missing, synthesize from transcriptSnippet
  if (mappedWords.length === 0 && transcriptSnippet) {
    const parts = transcriptSnippet.split(/\s+/).filter(Boolean);
    if (parts.length > 0) {
      const step = duration / parts.length;
      mappedWords = parts.map((part, i) => ({
        word: part,
        devanagari: part,
        relStart: Number((i * step).toFixed(2)),
        relEnd: Number(((i + 0.9) * step).toFixed(2)),
      }));
    }
  }

  // Group words into natural subtitle phrases with continuous handoff
  const phrases: Array<{
    start: number;
    speechEnd: number;
    displayEnd: number;
    words: typeof mappedWords;
  }> = [];

  let chunk: typeof mappedWords = [];
  const isDevanagari = scriptPreference === 'devanagari';

  for (let i = 0; i < mappedWords.length; i++) {
    const w = mappedWords[i];
    chunk.push(w);

    const wordText = isDevanagari && w.devanagari ? w.devanagari : w.word;
    const isSentenceEnd = /[.?!|।॥\u0964\u0965]\s*$/.test(wordText) || /[.?!]\s*$/.test(w.word);
    const isClauseEnd = /[,;:…\u2026\-]\s*$/.test(wordText) || /[,;:]\s*$/.test(w.word);
    const nextWord = mappedWords[i + 1];
    const hasLongPause = nextWord && (nextWord.relStart - w.relEnd >= 0.55);
    const hasBreathPause = nextWord && (nextWord.relStart - w.relEnd >= 0.28);

    const shouldSplitSentence = isSentenceEnd && chunk.length >= 2;
    const shouldSplitClause = isClauseEnd && chunk.length >= 3;
    const shouldSplitPause = (hasLongPause && chunk.length >= 2) || (hasBreathPause && chunk.length >= 3);
    const maxWords = chunk.length >= 4;
    const isLast = i === mappedWords.length - 1;

    if (shouldSplitSentence || shouldSplitClause || shouldSplitPause || maxWords || isLast) {
      const start = chunk[0].relStart;
      const speechEnd = chunk[chunk.length - 1].relEnd;
      phrases.push({
        start,
        speechEnd,
        displayEnd: speechEnd + 0.8,
        words: chunk,
      });
      chunk = [];
    }
  }

  // Adjust displayEnd for continuous handoff between phrases
  for (let i = 0; i < phrases.length; i++) {
    const next = phrases[i + 1];
    if (next) {
      const pauseGap = next.start - phrases[i].speechEnd;
      if (pauseGap <= 1.5) {
        phrases[i].displayEnd = next.start;
      } else {
        phrases[i].displayEnd = Math.min(next.start, phrases[i].speechEnd + 1.0);
      }
    } else {
      phrases[i].displayEnd = Math.min(duration, phrases[i].speechEnd + 1.2);
    }
  }

  // 4. Set up Canvas & Audio Stream Capture
  const canvasStream = canvas.captureStream(30);

  let audioTrack: MediaStreamTrack | null = null;
  let audioCtx: AudioContext | null = null;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      audioCtx = new AudioCtx();
      const sourceNode = audioCtx.createMediaElementSource(video);
      const destNode = audioCtx.createMediaStreamDestination();
      // Connect ONLY to destNode so the user does NOT hear audio blasting through speakers during export
      sourceNode.connect(destNode);
      const tracks = destNode.stream.getAudioTracks();
      if (tracks.length > 0) audioTrack = tracks[0];
    }
  } catch (_) {
    try {
      // @ts-ignore
      const vs = typeof video.captureStream === 'function' ? video.captureStream() : null;
      const tracks = vs?.getAudioTracks();
      if (tracks && tracks.length > 0) audioTrack = tracks[0];
    } catch (_) {}
  }

  const outputStream = new MediaStream(
    audioTrack ? [...canvasStream.getVideoTracks(), audioTrack] : canvasStream.getVideoTracks()
  );

  // 5. Select Best Supported Recording Codec
  let mimeType = 'video/webm';
  let extension: 'mp4' | 'webm' = 'mp4';
  const candidateTypes: Array<{ mime: string; ext: 'mp4' | 'webm' }> = [
    { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ];

  for (const c of candidateTypes) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mime)) {
      mimeType = c.mime;
      extension = c.ext;
      break;
    }
  }

  const recordedChunks: Blob[] = [];
  const recorder = new MediaRecorder(outputStream, {
    mimeType,
    videoBitsPerSecond: 5_000_000, // 5 Mbps high bitrate for crystal-clear vertical reels
  });

  recorder.ondataavailable = (evt) => {
    if (evt.data && evt.data.size > 0) {
      recordedChunks.push(evt.data);
    }
  };

  // 6. Seek video to startTime
  video.currentTime = startTime;
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
    setTimeout(() => resolve(), 3500);
  });

  const fontName = isDevanagari ? '"Nirmala UI", "Noto Sans Devanagari", sans-serif' : 'Arial, sans-serif';
  const fontSize = isVertical ? 54 : 44;
  const subtitleY = isVertical ? targetH - 360 : targetH - 160;

  return new Promise<ClientExportResult>((resolve, reject) => {
    let animId: number;
    let isFinished = false;

    const cleanup = () => {
      isFinished = true;
      cancelAnimationFrame(animId);
      video.pause();
      video.remove();
      if (audioCtx && audioCtx.state !== 'closed') {
        try { audioCtx.close(); } catch (_) {}
      }
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };

    recorder.onstop = () => {
      cleanup();
      const blob = new Blob(recordedChunks, { type: mimeType });
      const downloadUrl = URL.createObjectURL(blob);
      const filename = `flowzora_${clipId}_reels_shorts_${format.replace(':', 'x')}.${extension}`;

      if (onProgress) onProgress(100);
      resolve({
        blob,
        downloadUrl,
        filename,
        extension,
      });
    };

    recorder.onerror = (err) => {
      cleanup();
      reject(err);
    };

    // Hard ceiling safety timeout: (duration + 5s)
    const safetyTimeout = setTimeout(() => {
      if (!isFinished) {
        try { recorder.stop(); } catch (_) {}
      }
    }, (duration + 5) * 1000);

    recorder.start(100);

    // Start video playback
    video.play().catch(() => {
      // In case unmuted was blocked by browser policy
      video.muted = true;
      video.play().catch(() => {});
    });

    function renderFrame() {
      if (isFinished) return;

      const currentSec = video.currentTime;
      const relTime = Math.max(0, currentSec - startTime);

      if (onProgress) {
        const pct = Math.min(99, Math.round((relTime / duration) * 100));
        onProgress(pct);
      }

      if (currentSec >= safeEndTime || video.ended) {
        clearTimeout(safetyTimeout);
        isFinished = true;
        try {
          recorder.stop();
        } catch (_) {}
        return;
      }

      // Render 9:16 canvas frame
      renderCtx.clearRect(0, 0, targetW, targetH);
      const vw = video.videoWidth || 1920;
      const vh = video.videoHeight || 1080;

      if (isVertical && fitMode === 'fit') {
        // 1. Ambient blurred background
        renderCtx.save();
        renderCtx.filter = 'blur(28px) brightness(0.65)';
        const scaleCover = Math.max(targetW / vw, targetH / vh);
        const bgW = vw * scaleCover;
        const bgH = vh * scaleCover;
        renderCtx.drawImage(video, (targetW - bgW) / 2, (targetH - bgH) / 2, bgW, bgH);
        renderCtx.restore();

        // 2. Sharp centered foreground
        const scaleFit = Math.min(targetW / vw, targetH / vh);
        const fgW = vw * scaleFit;
        const fgH = vh * scaleFit;
        renderCtx.drawImage(video, (targetW - fgW) / 2, (targetH - fgH) / 2, fgW, fgH);
      } else if (fitMode === 'crop') {
        const scaleCover = Math.max(targetW / vw, targetH / vh);
        const w = vw * scaleCover;
        const h = vh * scaleCover;
        renderCtx.drawImage(video, (targetW - w) / 2, (targetH - h) / 2, w, h);
      } else {
        renderCtx.drawImage(video, 0, 0, targetW, targetH);
      }

      // 3. Render Animated Karaoke Subtitles
      const activePhrase = phrases.find(
        (p) => relTime >= p.start - 0.25 && relTime < p.displayEnd
      );

      if (activePhrase && activePhrase.words.length > 0) {
        renderCtx.save();
        renderCtx.font = `bold ${fontSize}px ${fontName}`;
        renderCtx.textAlign = 'left';
        renderCtx.textBaseline = 'middle';

        const wordMetrics = activePhrase.words.map((w, idx) => {
          const nextW = activePhrase.words[idx + 1];
          const text = (isDevanagari && w.devanagari ? w.devanagari : w.word) + (idx < activePhrase.words.length - 1 ? ' ' : '');
          const width = renderCtx.measureText(text).width;
          const wordEnd = Math.max(w.relEnd, w.relStart + 0.15);
          const activeEnd = nextW ? Math.min(nextW.relStart, wordEnd + 0.35) : wordEnd + 0.35;
          const isCurrent = relTime >= w.relStart && relTime < activeEnd;
          const isPast = relTime >= activeEnd;
          return { text, width, isCurrent, isPast };
        });

        const totalWidth = wordMetrics.reduce((sum, m) => sum + m.width, 0);
        const startX = (targetW - totalWidth) / 2;

        // Dark pill background
        const paddingX = 28;
        const paddingY = 16;
        const boxH = fontSize + paddingY * 2;
        const boxW = totalWidth + paddingX * 2;
        const boxX = startX - paddingX;
        const boxY = subtitleY - boxH / 2;

        renderCtx.fillStyle = 'rgba(10, 11, 16, 0.88)';
        if (typeof renderCtx.roundRect === 'function') {
          renderCtx.beginPath();
          renderCtx.roundRect(boxX, boxY, boxW, boxH, 20);
          renderCtx.fill();
          renderCtx.lineWidth = 2;
          renderCtx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
          renderCtx.stroke();
        } else {
          renderCtx.fillRect(boxX, boxY, boxW, boxH);
        }

        // Render each word with Flowzora emerald active highlight & white outline
        let curX = startX;
        wordMetrics.forEach((m) => {
          renderCtx.lineWidth = 7;
          renderCtx.strokeStyle = '#0A0B10';
          renderCtx.lineJoin = 'round';
          renderCtx.strokeText(m.text, curX, subtitleY);

          if (m.isCurrent) {
            renderCtx.fillStyle = '#10B981'; // Flowzora active emerald green
            renderCtx.shadowColor = 'rgba(16, 185, 129, 0.9)';
            renderCtx.shadowBlur = 12;
          } else if (m.isPast) {
            renderCtx.fillStyle = '#FFFFFF'; // Crisp white
            renderCtx.shadowColor = 'transparent';
            renderCtx.shadowBlur = 0;
          } else {
            renderCtx.fillStyle = 'rgba(255, 255, 255, 0.7)'; // Upcoming
            renderCtx.shadowColor = 'transparent';
            renderCtx.shadowBlur = 0;
          }

          renderCtx.fillText(m.text, curX, subtitleY);
          curX += m.width;
        });

        renderCtx.restore();
      }

      animId = requestAnimationFrame(renderFrame);
    }

    animId = requestAnimationFrame(renderFrame);
  });
}
