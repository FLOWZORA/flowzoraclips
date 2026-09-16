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
      <header className="sticky top-0 z-40 border-b border-[#242938] bg-[#0A0B10]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2.5 text-decoration-none">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FF5722] text-white font-black text-lg shadow-sm">
              F
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-white font-[var(--font-outfit)]">
                FLOWZORA
              </span>
              <span className="ml-1 text-xs font-semibold uppercase tracking-wider text-[#FFB800] bg-[#FFB800]/10 px-1.5 py-0.5 rounded">
                Clips
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#9AA2B6]">
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

          {/* Right Actions: Credit Counter + Auth */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Live Credit Counter Pill */}
            <div className="flex items-center gap-1.5 rounded-full border border-[#2B3040] bg-[#141620] px-3 py-1 text-xs font-medium text-white shadow-inner">
              <Zap className="h-3.5 w-3.5 text-[#FFB800] fill-[#FFB800]" />
              <span>
                <strong className="text-white">{user?.creditsRemaining ?? 2}</strong>{' '}
                <span className="text-[#9AA2B6]">
                  {user?.plan === 'creator_topup' ? 'Top-Up vids' : 'Free vids left'}
                </span>
              </span>
            </div>

            {/* Auth / Sign In Button */}
            {user?.email ? (
              <div className="flex items-center gap-2">
                <span className="hidden lg:inline-block text-xs text-[#9AA2B6] max-w-[120px] truncate" title={user.email}>
                  {user.email}
                </span>
                <button
                  onClick={handleSignOut}
                  className="rounded-lg border border-[#2B3040] bg-[#141620] p-1.5 text-[#9AA2B6] hover:text-white transition-colors"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAuthModalOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-[#2B3040] bg-[#141620] px-3 py-1.5 text-xs font-semibold text-white hover:border-[#FF5722] transition-colors"
              >
                <User className="h-3.5 w-3.5 text-[#FF5722]" />
                <span className="hidden sm:inline">Sign In</span>
              </button>
            )}

            <a
              href="#app"
              className="inline-flex items-center justify-center rounded-lg bg-[#FF5722] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#F44336] transition-colors shadow-sm"
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
