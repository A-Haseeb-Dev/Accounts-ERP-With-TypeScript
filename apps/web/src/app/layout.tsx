import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/context/auth-context';
import { Providers } from '@/components/providers';
import { ErrorBoundary } from '@/components/error-boundary';
import { BrandingDocumentMeta } from '@/components/branding-document-meta';
import './globals.css';

// These are the values shown until the saved branding loads (or when a company
// has never set any); `BrandingDocumentMeta` then replaces the title and
// favicon with the company's own.
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
      <ErrorBoundary>
        <Providers>
          <AuthProvider>
            <BrandingDocumentMeta />
            {children}
          </AuthProvider>
        </Providers>
      </ErrorBoundary>
    </body>
    </html>
  );
}