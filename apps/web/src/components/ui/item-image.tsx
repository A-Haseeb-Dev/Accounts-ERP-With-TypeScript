'use client';

import { useState } from 'react';

interface ItemImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
}

/**
 * Thumbnail for an item image (external URL or inline data URL).
 *
 * Renders nothing when the image is missing or fails to load, so a dead URL
 * never leaves a broken-image icon in lists and reports. Tracks failures per
 * src, so replacing a bad URL with a good one recovers without a remount.
 * Lazy-loads because item images are often multi-hundred-KB data URLs.
 */
export function ItemImage({ src, alt = '', className }: ItemImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return null;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={className}
    />
  );
}
