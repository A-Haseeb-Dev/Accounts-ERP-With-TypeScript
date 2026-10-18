'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

/** Max size for an uploaded image (kept under the API's 6 MB JSON body limit). */
export const MAX_IMAGE_BYTES = 1_500_000;

/** Longest edge kept for an uploaded photo — plenty for the 40px thumbnails. */
const MAX_DIMENSION = 512;

/**
 * Downscales a raster data URL to `MAX_DIMENSION` on its longest edge and
 * re-encodes it as JPEG. Item images travel inside every `/items` response as
 * base64, so an untrimmed phone photo would make the items list and the
 * transaction item picker fetch megabytes per item. SVGs and already-small
 * images are passed through untouched.
 */
async function shrinkDataUrl(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith('data:image/') || dataUrl.startsWith('data:image/svg')) return dataUrl;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = dataUrl;
    });
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (!longest || longest <= MAX_DIMENSION) return dataUrl;
    const scale = MAX_DIMENSION / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', 0.82);
    return out.startsWith('data:image/') ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}

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
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        setError('');
        onChange(await shrinkDataUrl(reader.result));
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
            key={value}
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
