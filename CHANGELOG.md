# Changelog

All notable changes to HAS ERP are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
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