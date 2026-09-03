'use client';

import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadTableCSV, printElement } from '@/lib/report-export';

/**
 * Print / Download toolbar for report pages.
 *
 * - Print: opens the OS print dialog printing only the table with `id`,
 *   plus an optional small heading line.
 * - Download: exports the same table to a CSV file readable in Excel.
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
  const onPrint = () => {
    printElement(tableId, printTitle ?? title);
  };

  return (
    <>
      <Button variant="outline" size="md" onClick={onPrint} disabled={disabled}>
        <Printer className="h-4 w-4" /> Print
      </Button>
      <Button
        variant="outline"
        size="md"
        onClick={() => downloadTableCSV(tableId, filename)}
        disabled={disabled}
      >
        <Download className="h-4 w-4" /> Download
      </Button>
    </>
  );
}