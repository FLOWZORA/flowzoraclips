'use client';

import React, { useState } from 'react';
import { Mail, CheckCircle2, AlertCircle, X, Sparkles, Shield, Loader2 } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess?: (user: any) => void;
}

export default function AuthModal({ isOpen, onClose, onLoginSuccess }: AuthModalProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid creator email address.');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (data.success && data.user) {
        setMessage(data.message || 'Magic link sent! Check your inbox.');
        // Store in localStorage for client-side state
        if (typeof window !== 'undefined') {
          localStorage.setItem('flowzora_user', JSON.stringify(data.user));
          window.dispatchEvent(new Event('flowzora_auth_changed'));
        }
        if (onLoginSuccess) {
          onLoginSuccess(data.user);
        }
      } else {
        setError(data.error || 'Failed to send magic link. Please try again.');
      }
    } catch (err: any) {
      console.error('Magic link submission error:', err);
      setError(err.message || 'Network error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-[#2B3040] bg-[#141620] p-6 sm:p-8 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#9AA2B6] hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Brand Header */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FF5722] text-white font-black text-sm">
            F
          </div>
          <span className="font-extrabold text-sm tracking-tight text-white font-[var(--font-outfit)]">
            FLOWZORA Clips
          </span>
        </div>

        <h3 className="text-xl font-extrabold text-white tracking-tight mt-3">
          Sign In to Access Your Free Clips
        </h3>
        <p className="mt-1.5 text-xs text-[#9AA2B6] leading-relaxed">
          No passwords required. We'll send a secure passwordless magic link to your email. Each account includes <strong>2 free video clips/month</strong> forever.
        </p>

        {message ? (
          <div className="mt-6 rounded-xl border border-[#10B981]/30 bg-[#10B981]/10 p-4 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-[#10B981] mb-2" />
            <h4 className="text-sm font-bold text-white">Check Your Inbox!</h4>
            <p className="mt-1 text-xs text-[#9AA2B6]">{message}</p>
            <button
              onClick={onClose}
              className="mt-4 w-full rounded-lg bg-[#1E2230] py-2 text-xs font-bold text-white hover:bg-[#2B3040] transition-colors"
            >
              Continue to App
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-[#9AA2B6] mb-1.5">
                Creator Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#626B82]" />
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="podcast@creator.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-[#2B3040] bg-[#0A0B10] pl-10 pr-4 py-2.5 text-sm text-white placeholder-[#626B82] focus:border-[#FF5722] focus:outline-none"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 p-2.5 text-xs text-[#EF4444]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF5722] to-[#FF3B30] py-2.5 text-xs font-bold text-white shadow-lg hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>Sending Magic Link...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-[#FFB800]" />
                  <span>Send Magic Link</span>
                </>
              )}
            </button>

            <div className="pt-2 flex items-center justify-center gap-1.5 text-[11px] text-[#626B82]">
              <Shield className="h-3.5 w-3.5 text-[#10B981]" />
              <span>Zero spam • Recurring 2 free videos monthly allotment</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
