'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sparkles, User, Zap, LogOut } from 'lucide-react';
import AuthModal from './AuthModal';

export default function Navbar() {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [user, setUser] = useState<{
    id: string;
    email: string;
    creditsRemaining: number;
    plan: string;
  } | null>(null);

  const fetchUserCredits = async () => {
    try {
      let storedUser = null;
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('flowzora_user');
        if (raw) storedUser = JSON.parse(raw);
      }

      const userId = storedUser?.id || 'demo-user-1';
      const res = await fetch(`/api/billing/credits?userId=${userId}`);
      const json = await res.json();

      if (json.success && json.user) {
        setUser(json.user);
      } else if (storedUser) {
        setUser(storedUser);
      } else {
        // Default free tier preview
        setUser({
          id: 'demo-user-1',
          email: '',
          creditsRemaining: 2,
          plan: 'free',
        });
      }
    } catch (err) {
      console.error('Failed to load user status:', err);
    }
  };

  useEffect(() => {
    fetchUserCredits();

    const handleAuthChange = () => {
      fetchUserCredits();
    };

    window.addEventListener('flowzora_auth_changed', handleAuthChange);
    return () => window.removeEventListener('flowzora_auth_changed', handleAuthChange);
  }, []);

  const handleSignOut = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('flowzora_user');
      setUser({
        id: 'demo-user-1',
        email: '',
        creditsRemaining: 2,
        plan: 'free',
      });
      window.dispatchEvent(new Event('flowzora_auth_changed'));
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[#262626] bg-[#000000]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#FF5722] text-white font-bold text-sm shadow-sm transition-transform group-hover:scale-105">
              F
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-base tracking-tight text-white">
                FLOWZORA
              </span>
              <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-[#FFB800] bg-[#FFB800]/10 border border-[#FFB800]/20 px-1.5 py-0.5 rounded-[4px]">
                Clips
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm text-[#A1A1A1]">
            <a href="#how-it-works" className="hover:text-white transition-colors">
              How It Works
            </a>
            <a href="#scoring" className="hover:text-white transition-colors">
              Transparent Scoring
            </a>
            <a href="#accuracy" className="hover:text-white transition-colors">
              Hindi/Hinglish Accuracy
            </a>
            <Link href="/pricing" className="hover:text-white transition-colors">
              Pricing
            </Link>
          </nav>

          {/* Right Actions: Credit Counter + Auth + Pill CTA */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Live Credit Counter Pill */}
            <div className="flex items-center gap-1.5 rounded-full border border-[#262626] bg-[#0A0A0A] px-3 py-1 text-xs font-mono text-[#EDEDED]">
              <Zap className="h-3 w-3 text-[#FFB800] fill-[#FFB800]" />
              <span className="tabular-nums">
                <strong className="text-white">{user?.creditsRemaining ?? 2}</strong>{' '}
                <span className="text-[#A1A1A1] font-sans">
                  {user?.plan === 'creator_topup' ? 'Top-Up vids' : 'Free vids'}
                </span>
              </span>
            </div>

            {/* Auth / Sign In Button */}
            {user?.email ? (
              <div className="flex items-center gap-2">
                <span className="hidden lg:inline-block text-xs font-mono text-[#A1A1A1] max-w-[120px] truncate" title={user.email}>
                  {user.email}
                </span>
                <button
                  onClick={handleSignOut}
                  className="rounded-md border border-[#262626] bg-[#0A0A0A] p-1.5 text-[#A1A1A1] hover:text-white hover:border-[#383838] transition-colors focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:outline-none"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAuthModalOpen(true)}
                className="flex items-center gap-1.5 rounded-md border border-[#262626] bg-[#0A0A0A] px-2.5 py-1.5 text-xs font-medium text-[#EDEDED] hover:text-white hover:border-[#383838] transition-colors focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:outline-none"
              >
                <User className="h-3 w-3 text-[#A1A1A1]" />
                <span className="hidden sm:inline">Sign In</span>
              </button>
            )}

            {/* Vercel-style Pill CTA */}
            <a
              href="#app"
              className="inline-flex items-center justify-center rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black hover:bg-[#E5E5E5] transition-all shadow-sm focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:outline-none"
            >
              Create Clips
            </a>
          </div>
        </div>
      </header>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={(u) => {
          setUser(u);
          setAuthModalOpen(false);
        }}
      />
    </>
  );
}
