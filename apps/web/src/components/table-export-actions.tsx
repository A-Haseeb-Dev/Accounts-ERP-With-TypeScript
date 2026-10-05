'use client';

import { FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadTablePDF, printElement } from '@/lib/report-export';
import { downloadTableXLSX } from '@/lib/export-xlsx';
import { useAuth } from '@/context/auth-context';

/**
 * Print / Excel / PDF toolbar for a list screen, gated by that screen's own
 * `<module>.<entity>.print` and `.export` permissions.
 *
 * `ReportActions` does the same job for the reports module, but every other
 * screen needed its own permission pair, so this takes them as props.
 *
 * Renders nothing when the user holds neither permission.
 */
export function TableExportActions({
  permission,
  tableId,
  filename,
  title,
  disabled = false,
}: {
  /** base permission, e.g. `sales.invoice` — `.print`/`.export` are appended. */
  permission: string;
  /** id of the wrapper element containing the table/grid to export. */
  tableId: string;
  /** base name for the downloaded files (".xlsx"/".pdf" is appended). */
  filename: string;
  /** printed heading, e.g. the document name + the active filters. */
  title: string;
  disabled?: boolean;
}) {
  const { can } = useAuth();

  const canPrint = can(`${permission}.print`);
  const canExport = can(`${permission}.export`);

  if (!canPrint && !canExport) return null;

  return (
    <>
      {canPrint && (
        <Button
          variant="outline"
          size="md"
          onClick={() => printElement(tableId, title)}
          disabled={disabled}
          title="Print"
        >
          Print
        </Button>
      )}
      {canExport && (
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
            onClick={() => downloadTablePDF(tableId, filename, title)}
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