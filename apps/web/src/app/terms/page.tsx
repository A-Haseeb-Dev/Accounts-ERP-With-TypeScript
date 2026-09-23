'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, FileText, Loader2 } from 'lucide-react';
import { API_URL } from '@/lib/api';

interface TermsData {
  title: string;
  content: string;
}

export default function PublicTermsPage() {
  const [data, setData] = useState<TermsData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/api/public/terms`)
      .then((r) => {
        if (!r.ok) throw new Error('Could not load the terms and conditions.');
        return r.json();
      })
      .then((body) => setData(body?.data ?? { title: 'Terms & Conditions', content: '' }))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the terms and conditions.'));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-slate-900">HAS ERP</p>
            <p className="text-[11px] text-slate-500">Inventory · Sales · Accounting</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        ) : !data ? (
          <div className="flex items-center gap-2 py-12 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-2 border-b border-slate-100 pb-5">
              <FileText className="h-5 w-5 text-teal-600" />
              <h1 className="text-xl font-bold text-slate-900">{data.title}</h1>
            </div>
            {data.content ? (
              <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{data.content}</div>
            ) : (
              <p className="text-sm text-slate-400">Terms and conditions have not been published yet.</p>
            )}
          </article>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          <Link href="/login" className="text-slate-500 underline-offset-2 hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </main>
    </div>
  );
}