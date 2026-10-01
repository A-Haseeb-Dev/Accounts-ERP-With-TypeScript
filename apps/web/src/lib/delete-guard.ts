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

/**
 * Message for a delete that failed for any reason other than "this record is
 * still referenced".
 *
 * Every delete must surface something. A mutation whose `onError` only handles
 * the guard case leaves the user clicking Confirm with no response at all,
 * which reads as "delete is broken" rather than "you do not have permission".
 */
export function deleteErrorMessage(e: unknown, noun = 'Record'): string {
  const raw = e instanceof Error ? e.message.trim() : '';
  if (raw && !/^Request failed( \(\d+\))?$/.test(raw)) return raw;
  return `Could not delete ${noun.toLowerCase()}.`;
}