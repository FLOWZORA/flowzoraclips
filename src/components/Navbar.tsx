'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sparkles, Zap, LogOut, Menu, X } from 'lucide-react';

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black border border-[#262626] transition-transform group-hover:scale-105 shadow-sm overflow-hidden p-1">
              <svg viewBox="0 0 512 512" fill="none" className="h-full w-full">
                <path d="M 116 148 L 246 256 L 116 364 Z" stroke="#FFFFFF" strokeWidth="48" strokeLinejoin="round" strokeLinecap="round" fill="none" />
                <path d="M 276 148 L 406 256 L 276 364 Z" stroke="#FFFFFF" strokeWidth="48" strokeLinejoin="round" strokeLinecap="round" fill="none" />
              </svg>
            </div>
            <div className="flex items-center">
              <span className="font-semibold text-base tracking-tight text-white font-sans">
                flowzora<span className="text-[#A1A1A1] font-normal">clips</span>
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm text-[#A1A1A1]">
            <Link href="/#how-it-works" className="hover:text-white transition-colors">
              How It Works
            </Link>
            <Link href="/#scoring" className="hover:text-white transition-colors">
              Scoring
            </Link>
            <Link href="/#accuracy" className="hover:text-white transition-colors">
              Accuracy
            </Link>
            <Link href="/about" className="hover:text-white transition-colors">
              About
            </Link>
            <Link href="/contact" className="hover:text-white transition-colors">
              Contact
            </Link>
            <Link href="/#faq" className="hover:text-white transition-colors">
              FAQ
            </Link>
          </nav>

          {/* Right Actions: Free Beta Badge + Auth + Pill CTA */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            {/* 100% Free Beta Pill - visible on sm+ to prevent header crowding */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-[#10B981]/30 bg-[#10B981]/10 px-3 py-1 text-xs font-medium text-[#10B981]">
              <Sparkles className="h-3 w-3 text-[#10B981]" />
              <span>Free • No Sign-In Required</span>
            </div>

            {/* Optional signed-in user email indicator if already authenticated */}
            {user?.email && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="hidden lg:inline-block text-xs font-mono text-[#A1A1A1] max-w-[120px] truncate" title={user.email}>
                  {user.email}
                </span>
                <button
                  onClick={handleSignOut}
                  className="rounded-md border border-[#262626] bg-[#0A0A0A] p-2 text-[#A1A1A1] hover:text-white hover:border-[#383838] transition-colors focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:outline-none min-h-[36px] min-w-[36px] flex items-center justify-center"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Vercel-style Pill CTA */}
            <Link
              href="/#app"
              className="inline-flex items-center justify-center rounded-full bg-white px-3 sm:px-4 py-1.5 text-xs font-medium text-black hover:bg-[#E5E5E5] transition-all shadow-sm focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:outline-none cursor-pointer min-h-[36px]"
            >
              Create Clips
            </Link>

            {/* Mobile Menu Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden flex items-center justify-center rounded-md border border-[#262626] bg-[#0A0A0A] p-2 text-[#A1A1A1] hover:text-white transition-colors cursor-pointer min-h-[36px] min-w-[36px]"
              aria-label="Toggle Navigation Menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#262626] bg-[#0A0A0A]/95 backdrop-blur-md px-4 py-4 space-y-2 animate-in fade-in slide-in-from-top-2 duration-150">
            {/* Mobile Free Beta Badge */}
            <div className="flex sm:hidden items-center justify-between py-2 px-3 rounded-lg bg-[#10B981]/10 border border-[#10B981]/20 text-xs font-medium text-[#10B981] mb-2">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#10B981]" />
                Free • No Sign-In Required
              </span>
              <span className="text-[11px] font-mono text-[#10B981]/80">Unlimited</span>
            </div>

            <Link
              href="/#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center text-sm font-medium text-[#EDEDED] hover:text-white hover:bg-[#141414] py-2.5 px-3 rounded-lg transition-colors min-h-[44px]"
            >
              How It Works
            </Link>
            <Link
              href="/#scoring"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center text-sm font-medium text-[#A1A1A1] hover:text-white hover:bg-[#141414] py-2.5 px-3 rounded-lg transition-colors min-h-[44px]"
            >
              Transparent Scoring
            </Link>
            <Link
              href="/#accuracy"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center text-sm font-medium text-[#A1A1A1] hover:text-white hover:bg-[#141414] py-2.5 px-3 rounded-lg transition-colors min-h-[44px]"
            >
              Hindi/Hinglish Accuracy
            </Link>
            <Link
              href="/about"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center text-sm font-medium text-[#A1A1A1] hover:text-white hover:bg-[#141414] py-2.5 px-3 rounded-lg transition-colors min-h-[44px]"
            >
              About Us
            </Link>
            <Link
              href="/contact"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center text-sm font-medium text-[#A1A1A1] hover:text-white hover:bg-[#141414] py-2.5 px-3 rounded-lg transition-colors min-h-[44px]"
            >
              Contact Us
            </Link>
            <Link
              href="/#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center text-sm font-medium text-[#A1A1A1] hover:text-white hover:bg-[#141414] py-2.5 px-3 rounded-lg transition-colors min-h-[44px]"
            >
              FAQ
            </Link>

            {user?.email && (
              <div className="pt-2 border-t border-[#262626] flex items-center justify-between text-xs text-[#A1A1A1] px-3">
                <span className="truncate max-w-[200px]">{user.email}</span>
                <button
                  onClick={handleSignOut}
                  className="text-xs text-[#EF4444] hover:underline py-1"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        )}
      </header>
    </>
  );
}
