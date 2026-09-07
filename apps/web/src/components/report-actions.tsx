'use client';

import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadTableCSV, printElement } from '@/lib/report-export';
import { useAuth } from '@/context/auth-context';

/**
 * Print / Download toolbar for report pages, gated by permissions:
 *
 * - Print: opens the OS print dialog printing only the table with `id`,
 *   plus an optional small heading line. Requires `reports.print`.
 * - Download: exports the same table to a CSV file readable in Excel.
 *   Requires `reports.export`.
 */
export function ReportActions({
  tableId,
  filename,
  title,
  printTitle,
  disabled = false,
}: {
  /** id of the wrapper element containing the printable <table>. */
  tableId: string;
  /** base name used for the downloaded file (".csv" is appended). */
  filename: string;
  /** printed heading, e.g. the report name + filters. */
  title: string;
  /** shorter title for the print dialog header. */
  printTitle?: string;
  disabled?: boolean;
}) {
  const { can } = useAuth();

  if (!can('reports.print') && !can('reports.export')) return null;

  return (
    <>
      {can('reports.print') && (
        <Button variant="outline" size="md" onClick={() => printElement(tableId, printTitle ?? title)} disabled={disabled}>
          <Printer className="h-4 w-4" /> Print
        </Button>
      )}
      {can('reports.export') && (
        <Button
          variant="outline"
          size="md"
          onClick={() => downloadTableCSV(tableId, filename)}
          disabled={disabled}
        >
          <Download className="h-4 w-4" /> Download
        </Button>
      )}
    </>
  );
}