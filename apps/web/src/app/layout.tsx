import type { Metadata } from 'next';
import { AuthProvider } from '@/context/auth-context';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'HAS ERP',
  description: 'Modern web-based ERP / inventory / sales / accounting management system',
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