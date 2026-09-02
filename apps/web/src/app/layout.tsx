import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/context/auth-context';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'HAS ERP',
  description: 'Modern web-based ERP / inventory / sales / accounting management system',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AuthProvider>{children}</AuthProvider>
        </Providers>
      </body>
    </html>
  );
}