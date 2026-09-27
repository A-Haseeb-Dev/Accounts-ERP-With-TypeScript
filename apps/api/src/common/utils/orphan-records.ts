/**
 * Guards reports against records that outlived their source document.
 *
 * Documents (sales, purchases, returns) each post a voucher that carries the
 * document number in `Voucher.reference`, and post stock movements that carry
 * the document id in `InventoryTransaction.referenceId`. Normally the
 * application removes those together, so nothing is left behind.
 *
 * If a row is deleted straight from the database, though, no application code
 * runs and the voucher survives. Because the voucher stores only the document
 * *number* (not a foreign key), a surviving voucher is indistinguishable from a
 * legitimate one and would keep inflating the trial balance and ledgers.
 *
 * These helpers detect that case so the reports can ignore those records. They
 * are read-only: nothing is deleted, so the audit trail is preserved and a
 * repair remains possible.
 */

/**
 * Document number prefixes that a voucher may be posted against. Only these
 * shapes are checked - a manually entered free-text reference is never treated
 * as a document link.
 */
const DOCUMENT_TABLES_BY_PREFIX: { prefix: string; table: string }[] = [
  { prefix: 'SI', table: 'Sale' },
  { prefix: 'SR', table: 'SalesReturn' },
  { prefix: 'PI', table: 'Purchase' },
  { prefix: 'PR', table: 'PurchaseReturn' },
];

/** `referenceType` values used by InventoryTransaction for document moves. */
const INVENTORY_SOURCE_TABLES: string[] = [
  'Sale',
  'Purchase',
  'SalesReturn',
  'PurchaseReturn',
  'StockTransfer',
];

/**
 * Voucher references that look like a document number but whose document no
 * longer exists. Empty array means nothing is orphaned.
 */
export async function findOrphanVoucherReferences(prisma: any): Promise<string[]> {
  const shape = DOCUMENT_TABLES_BY_PREFIX.map((d) => d.prefix).join('|');
  const conditions = DOCUMENT_TABLES_BY_PREFIX.map(
    (d) =>
      `(v."reference" LIKE '${d.prefix}-%' AND NOT EXISTS (SELECT 1 FROM "${d.table}" t WHERE t.number = v."reference"))`,
  ).join(' OR ');

  const rows = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT v."reference"
       FROM "Voucher" v
      WHERE v."reference" ~ '^(${shape})-'
        AND (${conditions})`,
  );
  return rows.map((r: { reference: string }) => r.reference);
}

/** Stock movements whose source document no longer exists, grouped by type. */
export async function findOrphanInventoryReferences(
  prisma: any,
): Promise<{ referenceType: string; referenceId: string }[]> {
  const conditions = INVENTORY_SOURCE_TABLES.map(
    (table) =>
      `(t."referenceType" = '${table}' AND NOT EXISTS (SELECT 1 FROM "${table}" x WHERE x.id = t."referenceId"))`,
  ).join(' OR ');

  return prisma.$queryRawUnsafe(
    `SELECT DISTINCT t."referenceType", t."referenceId"
       FROM "InventoryTransaction" t
      WHERE ${conditions}`,
  );
}

/**
 * Prisma fragments to add to a `Voucher` where-clause so orphaned documents
 * drop out of the figures. Returns `[]` when there is nothing to exclude, which
 * avoids relying on `in: []` semantics.
 */
export async function orphanVoucherExclusions(prisma: any): Promise<Record<string, unknown>[]> {
  const refs = await findOrphanVoucherReferences(prisma);
  if (refs.length === 0) return [];
  return [{ reference: { notIn: refs } }];
}

/** Same idea for `InventoryTransaction`, one fragment per source type. */
export async function orphanInventoryExclusions(prisma: any): Promise<Record<string, unknown>[]> {
  const orphans = await findOrphanInventoryReferences(prisma);
  if (orphans.length === 0) return [];

  const byType = new Map<string, string[]>();
  for (const o of orphans) {
    const list = byType.get(o.referenceType) ?? [];
    list.push(o.referenceId);
    byType.set(o.referenceType, list);
  }

  return [...byType.entries()].map(([referenceType, ids]) => ({
    NOT: { referenceType, referenceId: { in: ids } },
  }));
}
