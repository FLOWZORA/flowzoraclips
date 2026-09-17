import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Noto_Sans_Devanagari } from 'next/font/google';
import GlobalAmbientBackground from '@/components/GlobalAmbientBackground';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#000000',
};

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
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico' },
    ],
    apple: '/favicon.svg',
  },
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
      className={`scroll-smooth ${GeistSans.variable} ${GeistMono.variable} ${notoSansDevanagari.variable}`}
    >
      <body className="bg-[#000000] text-[#EDEDED] font-sans antialiased selection:bg-[#10B981]/30 selection:text-[#10B981] relative min-h-screen">
        <GlobalAmbientBackground />
        <div className="relative z-10 flex min-h-screen flex-col">{children}</div>
      </body>
    </html>
  );
}
