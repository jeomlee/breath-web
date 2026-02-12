// app/layout.tsx
import './globals.css';

export const metadata = {
  title: 'BREATH',
  description: '강박 없이, 계속을 위한 기록',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
