'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

/** Max size for an uploaded image (kept under the API's 6 MB JSON body limit). */
export const MAX_IMAGE_BYTES = 1_500_000;

interface ImageUrlFieldProps {
  label: string;
  /** Current value: an external https URL or an inline base64 data URL. */
  value: string;
  onChange: (value: string) => void;
  /** Where the preview image is rendered. Defaults to 'contain'. */
  fit?: 'contain' | 'cover';
  className?: string;
}

/**
 * A text input for an image URL plus an "Upload" button (read as a data URL).
 * Mirrors the branding logo/favicon control so every image field in the app
 * behaves the same way.
 */
export function ImageUrlField({ label, value, onChange, fit = 'contain', className }: ImageUrlFieldProps) {
  const [error, setError] = useState('');

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`Image too large. Please choose a file under ${Math.round(MAX_IMAGE_BYTES / 1_000_000)} MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setError('');
        onChange(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <Field label={label} error={error || undefined} className={className}>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => { setError(''); onChange(e.target.value); }}
          placeholder="https://… or upload a file"
          className="min-w-0 flex-1"
        />
        <label className="cursor-pointer shrink-0 rounded-md border border-slate-300 px-3 text-sm font-medium leading-10 text-slate-600 hover:bg-slate-50">
          Upload
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={onFile}
          />
        </label>
        {value && (
          <Button type="button" variant="ghost" onClick={() => onChange('')} className="shrink-0">
            Clear
          </Button>
        )}
      </div>
      {value && (
        <div className="mt-2 flex items-center gap-2">
          <img
            src={value}
            alt={`${label} preview`}
            className={`h-12 w-12 rounded border border-slate-200 bg-white ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              setError('Image could not be loaded from that URL.');
            }}
          />
          <span className="truncate text-xs text-slate-400">
            {value.startsWith('data:') ? 'Uploaded from disk' : value}
          </span>
        </div>
      )}
    </Field>
  );
}
