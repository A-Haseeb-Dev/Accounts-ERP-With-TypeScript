'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/context/auth-context';
import { Eye, FileText } from 'lucide-react';

type Settings = Record<string, string>;

const DEFAULT_TITLE = 'Terms & Conditions';

export default function TermsPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canManage = can('system.settings.manage');

  const { data, isLoading } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => apiFetch('/system/settings'),
    enabled: canManage,
  });

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      apiFetch('/system/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          values: {
            'terms.title': mergedTitle(),
            'terms.content': mergedContent(),
          },
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (e: Error) => setError(e.message),
  });

  function mergedTitle(): string {
    return title !== '' ? title : (data?.['terms.title'] ?? DEFAULT_TITLE);
  }
  function mergedContent(): string {
    return content !== '' ? content : (data?.['terms.content'] ?? '');
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    save.mutate();
  };

  if (!canManage) {
    return (
      <div>
        <PageHeader title="Terms & Conditions" description="Software terms and conditions." />
        <Card><p className="p-5 text-sm text-slate-500">You do not have permission to view this page.</p></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Terms & Conditions" description="The software licence, usage and support terms your company publishes for its users." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <form onSubmit={submit} className="space-y-4 p-5">
            <Field label="Page Title" hint="Shown as the heading when this page is printed or shared.">
              <Input value={mergedTitle()} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field
              label="Terms & Conditions Text"
              hint="Use plain text. Blank lines become paragraphs. Covers licence, data ownership, user responsibility, support and any late-fee / return policies you want on record."
            >
              <Textarea
                className="h-96 resize-y font-mono text-xs"
                value={mergedContent()}
                onChange={(e) => setContent(e.target.value)}
                placeholder={'1. Software is licensed to the company, not sold.\n2. The company keeps full ownership of its own data.\n3. Users must keep login credentials private.\n4. ...\n\nEdit this text to match your own terms.'}
              />
            </Field>
            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
            <div className="flex justify-end gap-2">
              {saved && <span className="mr-auto self-center text-sm text-teal-600">Saved</span>}
              <Button type="submit" loading={save.isPending}>{save.isPending ? 'Saving…' : 'Save Terms'}</Button>
            </div>
          </form>
        </Card>

        <Card>
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
            <Eye className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">Preview</span>
          </div>
          <div className="p-5">
            {mergedContent() ? (
              <div className="prose prose-sm max-w-none">
                <h2 className="mb-2 text-lg font-bold text-slate-900">{mergedTitle()}</h2>
                <div className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{mergedContent()}</div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
                <FileText className="h-8 w-8" />
                <p className="text-sm">Type your terms on the left to see the live preview.</p>
              </div>
            )}
          </div>
        </Card>
      </div>
      {isLoading && <p className="mt-2 text-xs text-slate-400">Loading saved terms…</p>}
    </div>
  );
}