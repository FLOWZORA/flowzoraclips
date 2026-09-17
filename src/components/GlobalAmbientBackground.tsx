import React from 'react';

export default function GlobalAmbientBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-50 overflow-hidden select-none"
    >
      {/* 1. Upper Timeline & Waveform Track (Hero & Top Page Header) */}
      <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[650px] opacity-25 mix-blend-screen [mask-image:radial-gradient(ellipse_at_top,black_50%,transparent_85%)]">
        <img
          src="/images/ambient/timeline-waveform.jpg"
          alt=""
          loading="eager"
          decoding="async"
          className="w-full h-full object-cover object-center filter contrast-125 saturate-125"
        />
      </div>

      {/* 2. Floating Vertical 9:16 Video Clips (Right Mid-Atmosphere) */}
      <div className="absolute top-[28%] -right-24 w-[850px] h-[850px] opacity-15 mix-blend-screen [mask-image:radial-gradient(circle_at_center,black_40%,transparent_75%)]">
        <img
          src="/images/ambient/vertical-clips.jpg?v=2"
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover object-center filter contrast-115"
        />
      </div>

      {/* 3. Deep Audio Waveform & Timeline Scrubber (Bottom Left Atmosphere) */}
      <div className="absolute top-[60%] -left-32 w-[950px] h-[800px] opacity-15 mix-blend-screen [mask-image:radial-gradient(circle_at_center,black_35%,transparent_75%)]">
        <img
          src="/images/ambient/timeline-waveform.jpg"
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover object-left filter contrast-115"
        />
      </div>

      {/* 4. Lower Footer Video Clips & Shimmering Waves */}
      <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-full max-w-6xl h-[550px] opacity-10 mix-blend-screen [mask-image:radial-gradient(ellipse_at_bottom,black_40%,transparent_75%)]">
        <img
          src="/images/ambient/vertical-clips.jpg?v=2"
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover object-center filter contrast-110"
        />
      </div>

      {/* 5. Ambient Mesh Glow Elements in Pure Emerald Green */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[700px] h-[400px] -translate-y-12 rounded-full bg-gradient-to-tr from-[#10B981]/15 via-[#059669]/10 to-transparent blur-[140px]" />
      <div className="absolute top-[45%] right-10 w-[550px] h-[450px] rounded-full bg-gradient-to-br from-[#10B981]/12 via-[#047857]/08 to-transparent blur-[140px]" />
      <div className="absolute bottom-20 left-10 w-[600px] h-[400px] rounded-full bg-gradient-to-tr from-[#34D399]/10 via-[#10B981]/08 to-transparent blur-[140px]" />
    </div>
  );
}
