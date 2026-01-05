import 'bulma/css/bulma.min.css';
import './globals.css';

import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';

import AdBanner from '@/components/AdBanner';
import AppProviders from '@/components/providers/AppProviders';

const font = Space_Grotesk({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Product Pulse',
  description: 'An adaptive, AI-powered shopping feed that learns from every swipe.',
  metadataBase: new URL('https://product-pulse.local'),
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={font.className}>
        <AppProviders>
          <div className="app-shell">{children}</div>
          <AdBanner />
        </AppProviders>
      </body>
    </html>
  );
}


