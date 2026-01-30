// app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BREATH',
  description: '강박 없이, 계속을 위한 기록.',
  metadataBase: new URL('https://breath-web.vercel.app'),
  openGraph: {
    title: 'BREATH',
    description: '강박 없이, 계속을 위한 기록.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
      </body>
    </html>
  );
}
