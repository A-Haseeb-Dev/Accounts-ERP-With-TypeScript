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

/** A document type that can be the source of a voucher reference. */
interface DocumentSource {
  /** Numbering setting key, as passed to `NumberingService.next`. */
  settingKey: string;
  /** SystemSetting key holding a user-defined prefix override. */
  prefixSettingKey: string;
  /** Prefix used when the user has not overridden it. */
  defaultPrefix: string;
  /** Table that owns the document numbers. */
  table: string;
}

/**
 * Kept in the same order as `NumberingService`, and using the same defaults, so
 * a reference is only treated as a document link when it really looks like one.
 */
const DOCUMENT_SOURCES: DocumentSource[] = [
  { settingKey: 'sale', prefixSettingKey: 'numbering.invoicePrefix', defaultPrefix: 'SI', table: 'Sale' },
  { settingKey: 'purchase', prefixSettingKey: 'numbering.purchasePrefix', defaultPrefix: 'PI', table: 'Purchase' },
  { settingKey: 'sales_return', prefixSettingKey: 'numbering.salesReturnPrefix', defaultPrefix: 'SR', table: 'SalesReturn' },
  { settingKey: 'purchase_return', prefixSettingKey: 'numbering.purchaseReturnPrefix', defaultPrefix: 'PR', table: 'PurchaseReturn' },
];

/** `referenceType` values used by InventoryTransaction for document moves. */
const INVENTORY_SOURCE_TABLES: string[] = [
  'Sale',
  'Purchase',
  'SalesReturn',
  'PurchaseReturn',
  'StockTransfer',
];

/** Escapes a user-defined prefix for safe use inside a POSIX regex. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Per-report cache for the lookups below.
 *
 * A single report fans out into one query per account / per item, and each of
 * those needs the same two lookups. Without a memo that becomes hundreds of
 * identical round-trips per report. The memo lives only for the duration of one
 * report call, so it can never serve stale data to a later request.
 */
export interface OrphanMemo {
  voucher?: Record<string, unknown>[];
  inventory?: Record<string, unknown>[];
}

export function createOrphanMemo(): OrphanMemo {
  return {};
}

/**
 * Matches references that *start* with one of the document prefixes.
 *
 * The number template is user-configurable (`{prefix}/{company}-{year}-{seq}`
 * and friends), so the separator after the prefix cannot be assumed. Requiring
 * a non-alphanumeric character (or the end of the string) after the prefix keeps
 * a longer prefix from shadowing a shorter one: `SI-...` matches `SI` but
 * `SINV-...` does not.
 */
function prefixPattern(prefixes: string[]): string {
  return `(?:${prefixes.map(escapeRegex).join('|')})(?:[^0-9A-Za-z]|$)`;
}

/**
 * Reads the effective prefix for every document source, preferring the user's
 * Settings override and falling back to the built-in default.
 */
async function resolvePrefixes(prisma: any): Promise<{ prefix: string; table: string }[]> {
  const rows: { key: string; value: string | null }[] = await prisma.systemSetting.findMany({
    where: { key: { in: DOCUMENT_SOURCES.map((d) => d.prefixSettingKey) } },
    select: { key: true, value: true },
  });
  const configured = new Map(rows.map((r) => [r.key, r.value?.trim() || '']));

  return DOCUMENT_SOURCES.map((d) => ({
    prefix: configured.get(d.prefixSettingKey) || d.defaultPrefix,
    table: d.table,
  }));
}

/**
 * Voucher references that look like a document number but whose document no
 * longer exists. Empty array means nothing is orphaned.
 */
export async function findOrphanVoucherReferences(prisma: any): Promise<string[]> {
  const sources = await resolvePrefixes(prisma);
  if (sources.length === 0) return [];

  // A reference is a document link when it carries a document prefix, and it is
  // legitimate when that number still exists in the table it points at. When two
  // document types share a prefix, existing in either table is good enough.
  const linksAny = sources
    .map((s) => prefixPattern([s.prefix]))
    .join('|');
  const survives = sources
    .map(
      (s) =>
        `(v."reference" ~ '${prefixPattern([s.prefix])}' AND EXISTS (SELECT 1 FROM "${s.table}" t WHERE t.number = v."reference"))`,
    )
    .join(' OR ');

  // `reference` is nullable, and `NULL ~ pattern` is NULL, so vouchers without a
  // reference are never selected here.
  const rows = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT v."reference"
       FROM "Voucher" v
      WHERE v."reference" ~ '^${linksAny}'
        AND NOT (${survives})`,
  );
  return rows.map((r: { reference: string }) => r.reference);
}

/**
 * Stock movements whose source document no longer exists, grouped by type.
 *
 * Both `referenceType` and `referenceId` are nullable, so a manual adjustment
 * (no document link at all) must never be treated as an orphan.
 */
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
      WHERE t."referenceId" IS NOT NULL
        AND (${conditions})`,
  );
}

/**
 * Prisma fragments to add to a `Voucher` where-clause so orphaned documents
 * drop out of the figures. Returns `[]` when there is nothing to exclude, which
 * avoids relying on `in: []` semantics.
 */
export async function orphanVoucherExclusions(
  prisma: any,
  memo?: OrphanMemo,
): Promise<Record<string, unknown>[]> {
  if (memo?.voucher) return memo.voucher;
  const refs = await findOrphanVoucherReferences(prisma);
  if (refs.length === 0) {
    if (memo) memo.voucher = [];
    return [];
  }
  // `reference NOT IN (...)` is NULL - and therefore drops the row - when
  // `reference` is NULL, which would silently erase every voucher posted
  // without a document number. Keep those explicitly.
  const exclusions = [{ OR: [{ reference: null }, { reference: { notIn: refs } }] }];
  if (memo) memo.voucher = exclusions;
  return exclusions;
}

/** Same idea for `InventoryTransaction`, one fragment per source type. */
export async function orphanInventoryExclusions(
  prisma: any,
  memo?: OrphanMemo,
): Promise<Record<string, unknown>[]> {
  if (memo?.inventory) return memo.inventory;
  const orphans = await findOrphanInventoryReferences(prisma);
  if (orphans.length === 0) {
    if (memo) memo.inventory = [];
    return [];
  }

  const byType = new Map<string, string[]>();
  for (const o of orphans) {
    const list = byType.get(o.referenceType) ?? [];
    list.push(o.referenceId);
    byType.set(o.referenceType, list);
  }

  const exclusions = [...byType.entries()].map(([referenceType, ids]) => ({
    // Same NULL trap as above: `NOT (referenceType = ... AND referenceId IN ...)`
    // evaluates to NULL for a manual movement, which would drop it. Movements
    // that carry no document link are always kept.
    OR: [
      { referenceType: null },
      { referenceId: null },
      { NOT: { referenceType, referenceId: { in: ids } } },
    ],
  }));
  if (memo) memo.inventory = exclusions;
  return exclusions;
}
