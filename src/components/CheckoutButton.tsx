'use client';

import React, { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';

interface CheckoutButtonProps {
  packId: 'creator_10' | 'pro_50';
  label: string;
  className?: string;
  userId?: string;
  email?: string;
}

export default function CheckoutButton({
  packId,
  label,
  className = '',
  userId = 'demo-user-1',
  email = 'creator@flowzoraclips.com',
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCheckout = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      // Check for user in localStorage if available
      let resolvedUserId = userId;
      let resolvedEmail = email;
      if (typeof window !== 'undefined') {
        const storedUser = localStorage.getItem('flowzora_user');
        if (storedUser) {
          try {
            const parsed = JSON.parse(storedUser);
            if (parsed.id) resolvedUserId = parsed.id;
            if (parsed.email) resolvedEmail = parsed.email;
          } catch (_) {}
        }
      }

      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: resolvedUserId,
          email: resolvedEmail,
          packId,
        }),
      });

      const json = await res.json();
      if (json.success && json.checkoutUrl) {
        // Redirect to Stripe checkout URL (or simulated test page)
        window.location.href = json.checkoutUrl;
      } else {
        setErrorMsg(json.error || 'Checkout initiation failed');
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      setErrorMsg(err.message || 'Network error');
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <button
        onClick={handleCheckout}
        disabled={loading}
        className={`w-full flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer ${className}`}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-white" />
            <span>Redirecting to Stripe...</span>
          </>
        ) : (
          <>
            <CreditCard className="h-3.5 w-3.5" />
            <span>{label}</span>
          </>
        )}
      </button>
      {errorMsg && (
        <p className="mt-1.5 text-center text-[11px] text-[#EF4444] font-medium">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
