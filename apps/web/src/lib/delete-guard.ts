import { ApiError } from '@/lib/api';

export interface DeleteGuardInfo {
  forceable: boolean;
  code: string;
  labels: string[];
}

const DELETE_CODES = new Set(['REFERENCES_EXIST', 'DELETE_BLOCKED']);

export function parseDeleteGuard(e: unknown): DeleteGuardInfo | null {
  if (!(e instanceof ApiError)) return null;
  if (!DELETE_CODES.has(e.code ?? '')) return null;
  const details = Array.isArray(e.details)
    ? e.details.filter((d): d is string => typeof d === 'string')
    : [];
  return { forceable: e.code === 'REFERENCES_EXIST', code: e.code ?? '', labels: details };
}