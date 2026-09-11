'use client';

import { FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadTablePDF, printElement } from '@/lib/report-export';
import { downloadTableXLSX } from '@/lib/export-xlsx';
import { useAuth } from '@/context/auth-context';

/**
 * Print / Download toolbar for report pages, gated by permissions:
 *
 * - Print: opens the OS print dialog printing only the table with `id`,
 *   plus an optional small heading line. Requires `reports.print`.
 * - Excel / PDF: export the same table to an .xlsx spreadsheet or a
 *   table-laid-out PDF file. Require `reports.export`.
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
  /** base name used for the downloaded files (".xlsx"/".pdf" is appended). */
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
        <>
          <Button
            variant="outline"
            size="md"
            onClick={() => downloadTableXLSX(tableId, filename)}
            disabled={disabled}
            title="Download as Excel (.xlsx)"
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button
            variant="outline"
            size="md"
            onClick={() => downloadTablePDF(tableId, filename, printTitle ?? title)}
            disabled={disabled}
            title="Download as PDF"
          >
            <FileText className="h-4 w-4" /> PDF
          </Button>
        </>
      )}
    </>
  );
}