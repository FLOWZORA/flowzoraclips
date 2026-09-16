import type { Metadata } from 'next';
import { Outfit, Plus_Jakarta_Sans, Noto_Sans_Devanagari } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const notoSansDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  variable: '--font-devanagari',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://flowzoraclips.com'),
  title: 'FLOWZORA Clips — AI Highlight Clipping for Hindi, Hinglish & English Creators',
  description:
    'Turn long podcasts and talk shows into ranked, ready-to-post 9:16 vertical clips. Genuine Hindi/Hinglish transcription accuracy with multi-dimensional transparent scoring.',
  openGraph: {
    title: 'FLOWZORA Clips — AI Highlight Clipping for Hindi & Hinglish Creators',
    description:
      'Turn long podcasts into ranked, ready-to-post 9:16 vertical clips. Transparent 4-dimension scoring, scene-aware reframing, and dual-script captions.',
    url: 'https://flowzoraclips.com',
    siteName: 'FLOWZORA Clips',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FLOWZORA Clips — AI Highlight Clipping for Hindi & Hinglish Creators',
    description:
      'Turn long podcasts into ranked, ready-to-post 9:16 vertical clips. Transparent 4-dimension scoring and scene-aware reframing.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`scroll-smooth ${outfit.variable} ${plusJakartaSans.variable} ${notoSansDevanagari.variable}`}
    >
      <body className="bg-[#0A0B10] text-[#FFFFFF] font-sans antialiased selection:bg-[#FF5722]/30 selection:text-[#FF5722]">
        <div className="flex min-h-screen flex-col">{children}</div>
      </body>
    </html>
  );
}
