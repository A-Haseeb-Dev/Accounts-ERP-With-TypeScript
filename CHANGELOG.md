# Changelog

All notable changes to HAS ERP are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Professional invoice print layout** — the printable invoice/bill now shows
  the company logo, business address/phone/email/NTN (new Branding settings
  fields), a payment-status badge, line numbering, per-line Discount and Tax
  amounts, stored line totals instead of recomputed `qty × unit`, amount in
  words, and Prepared by / Received by signature lines. Line rows, the totals
  block, and the header are kept together on page breaks so long invoices print
  cleanly. A matching `BrandingSetting` migration adds the company contact
  fields.
- **Auto-generated customer and supplier codes** — the create forms now accept a
  blank Code field. When omitted, the API generates a sequential
  `CST-000001` / `SUP-000001` style code using the same collision-safe
  `SystemSetting` counter as invoices and vouchers. An explicit code is still
  accepted (and duplicate-checked); codes are immutable once assigned.
- **Related-data warnings before delete** — deleting a record now always warns
  with exact reference counts first. Customers, suppliers, towns, item types,
  and brands can then be hard-deleted after confirmation (customer/supplier
  delete cascades their invoices and returns; towns/types/brands just unlink,
  thanks to `SET NULL`). Accounting-critical records — main accounts with
  ledger entries, items with movement or document lines, stock locations in
  use, head/sub heads with active main accounts — show the same warning but
  still refuse deletion to protect the books (deactivate them instead).
  Backed by new `REFERENCES_EXIST` (409) and `DELETE_BLOCKED` (422) errors
  whose `details` list the related record counts.

### Fixed
- **Blank print output** — printing an invoice, bill, or report produced a blank
  page because the printable element (parked off-screen with
  `position: fixed; left: -200vw`) kept those styles when cloned into the print
  iframe, and the iframe itself was 0×0. The print helper now clones into a
  hidden A4-sized iframe and strips off-screen/positioning styles from the copy,
  so the document renders in-flow on paper. Print backgrounds are also forced on.

### Changed
- **API now type-checks clean** — fixed every remaining `tsc --noEmit` error in the
  controller/service unit specs: typed the Prisma mocks in `users` and
  `inventory` service specs against local delegate interfaces (replacing
  `Record<string, unknown>`), added the missing `fiscal` mock to the vouchers
  spec, typed the Express `Response` cookie mocks in the auth spec, and made
  the crypto `randomUUID` spy return a UUID-shaped value so it satisfies the
  strict UUID template type. `pnpm --filter @has-erp/api typecheck` and
  `pnpm --filter @has-erp/api test` (95 tests) both pass.
- **Fully typed legacy web layer** — replaced every remaining `Row =
  Record<string, unknown>` + `String()` runtime cast in the Next.js app with
  Prisma-schema-aligned shared types from `lib/types.ts`. This covers parties
  (customers, suppliers, towns), administration (items, item-types, brands,
  stock-locations, chart of accounts), transaction components (document
  page, printable invoice, stock transfers, vouchers, cash book), system
  (users, roles, branding, audit logs), and all reports (general journal,
  general ledger, product ledger, purchase/sales book, stock, trial balance).
  Verified via `pnpm --filter @has-erp/web typecheck` (the build intentionally
  skips type checks). No runtime behavior changes — this is a compile-time
  type-safety refactor.

### Added
- **Fiscal period lock** — admins can set a "Lock Vouchers Up To" date under
  Settings → Fiscal Period. The API then rejects creating, editing, deleting,
  posting, or cancelling any transaction (sales invoices, purchases, sales and
  purchase returns, stock transfers, and accounting vouchers) whose date falls
  on or before that boundary, protecting closed accounting periods from
  accidental changes.
- **Atomic, concurrency-safe document numbering** — voucher/sales/purchase
  numbers are now reserved via a single `INSERT … ON CONFLICT DO UPDATE …
  RETURNING` upsert against `SystemSetting`, so concurrent requests never receive
  a duplicated sequence number (verified with 20 parallel calls).
- **Professional print/download on all reports** — every report page now has a
  `Print` (isolated, styled A4 output) and `Download` (CSV) action.
- **Professional printable invoice/bill template** — the document detail view for
  sales invoices, bills, and returns now offers a branded A4 `Print` layout that
  uses the organization's business name, colors, terms, and footer from Settings →
  Branding. Shows line items, per-line amounts, subtotal, discount, tax, grand
  total, amount paid, and balance due.
- **Toast notifications** — non-blocking success/error feedback across create,
  update, delete, post, cancel, and save actions (all master lists, vouchers,
  documents, transfers). Packaged with [sonner].
- **Loading skeletons** — report tables show responsive placeholders instead of
  flashing empty while fetching.
- **Health endpoint** `GET /api/health` — public, unauthenticated liveness check
  returning service status and uptime (useful for hosting/monitoring).
- **Global error boundary** — any client render exception now shows a clean,
  branded fallback with "Try again" / "Reload page" instead of a blank page.
- **Report query error states** — the seven report pages display an inline error
  banner with a Retry action on failed requests.
- **Upgraded Audit Log viewer** — text search, module/action filters, date range,
  color-coded action badges, a full event detail modal (metadata, entity, user,
  IP, user-agent), and CSV export.
- **Typed accounts API layer** — shared domain types (`lib/types.ts`) and a typed
  API client (`lib/accounts-api.ts`); voucher create/update/delete now use it.

### Fixed
- **API `start`/`start:prod` scripts** pointed to `dist/main.js` but the build
  outputs `dist/src/main.js`; the scripts now point to the correct entrypoint.
- **Report pages rendered wrong response shape** — they now consume the API's
  actual `rows`/`balance`/`stock*` fields, so reports no longer come back empty.

---

## Prior highlights (rolled up)

- Chart of Accounts with hierarchical Head → Sub-Head → Main accounts and a typed
  code scheme (`A1-001-0001` style).
- Double-entry Vouchers with draft/post/cancel lifecycle and audit recording;
  view, edit, and hard-delete actions on draft vouchers (draft-only edit/delete).
- Cash Book with per-row voucher detail inspection.
- Role-based access control (RBAC) with granular permissions.
- Audit trail of every CRUD/posting/login action.
- Sales, purchases, inventory transfers, returns, and stock reporting.

[sonner]: https://sonner.emilkowal.ski