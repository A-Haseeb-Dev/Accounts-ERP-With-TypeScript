// Domain types used by the web app. These mirror the Prisma schema as it is
// serialized over JSON: Decimal fields become numbers and DateTime fields become
// ISO strings. Relations only appear when the API includes them (Prisma `include`).

export type Status = 'active' | 'inactive' | 'suspended';
export type DocStatus = 'draft' | 'posted' | 'cancelled';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid';

export type ItemTypeName =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'REVENUE'
  | 'EXPENSE';
export type AccountStatus = 'active' | 'inactive';
export type VoucherType = 'JOURNAL' | 'CREDIT' | 'DEBIT';
export type VoucherStatus = DocStatus;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------- Chart of Accounts ----------

export interface HeadAccount {
  id: string;
  code: string;
  name: string;
  description?: string;
  accountType?: ItemTypeName;
  type?: ItemTypeName;
  status: AccountStatus;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubHead {
  id: string;
  code: string;
  name: string;
  description?: string;
  status: AccountStatus;
  headAccountId: string;
  createdAt: string;
  updatedAt: string;
  headAccount?: { id: string; code: string; name: string; type?: ItemTypeName; accountType?: ItemTypeName };
}

export interface MainAccount {
  id: string;
  code: string;
  name: string;
  accountType?: ItemTypeName;
  type?: ItemTypeName;
  description?: string;
  subHeadId?: string;
  openingBalance?: number;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
  subHead?: { id: string; code: string; name: string; head?: { id: string; code: string; name: string; type?: ItemTypeName; accountType?: ItemTypeName } };
}

export interface AccountNode {
  id: string;
  code: string;
  name: string;
  type?: ItemTypeName;
  level: 'head' | 'subhead' | 'main';
  parentId?: string;
}

export interface VoucherEntry {
  id?: string;
  mainAccountId: string;
  debit: number;
  credit: number;
  narration?: string;
  mainAccount?: { id: string; code: string; name: string };
}

export interface Voucher {
  id: string;
  number: string;
  voucherType: VoucherType;
  voucherDate: string;
  reference?: string;
  description?: string;
  status: VoucherStatus;
  totalDebit: number;
  totalCredit: number;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
  entries: VoucherEntry[];
  createdBy?: { id: string; fullName: string };
}

// ---------- Parties ----------

export interface Town {
  id: string;
  name: string;
  city?: string;
  description?: string;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone?: string;
  address?: string;
  townId?: string;
  mainAccountId?: string;
  openingBalance: number;
  creditLimit: number;
  description?: string;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
  town?: Town;
  mainAccount?: MainAccount;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  phone?: string;
  address?: string;
  townId?: string;
  mainAccountId?: string;
  openingBalance: number;
  description?: string;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
  town?: Town;
  mainAccount?: MainAccount;
}

// ---------- Products ----------

export interface ItemType {
  id: string;
  name: string;
  description?: string;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Brand {
  id: string;
  name: string;
  description?: string;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StockLocation {
  id: string;
  code: string;
  name: string;
  description?: string;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Item {
  id: string;
  code: string;
  barcode?: string;
  name: string;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  minStockLevel: number;
  description?: string;
  status: AccountStatus;
  itemTypeId?: string;
  brandId?: string;
  defaultLocationId?: string;
  createdAt: string;
  updatedAt: string;
  itemType?: ItemType;
  brand?: Brand;
  defaultLocation?: StockLocation;
}

// ---------- Documents / Transactions ----------

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  itemId: string;
  quantity: number;
  unitCost: number;
  discount: number;
  tax: number;
  lineTotal: number;
  item?: Item;
}

export interface Purchase {
  id: string;
  number: string;
  purchaseDate: string;
  reference?: string;
  note?: string;
  supplierId: string;
  stockLocationId: string;
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  status: DocStatus;
  postedAt?: string;
  createdAt: string;
  updatedAt: string;
  supplier?: Supplier;
  stockLocation?: StockLocation;
  items: PurchaseItem[];
}

export interface PurchaseReturn {
  id: string;
  number: string;
  returnDate: string;
  reference?: string;
  note?: string;
  purchaseId?: string;
  supplierId: string;
  stockLocationId: string;
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  status: DocStatus;
  createdAt: string;
  updatedAt: string;
  supplier?: Supplier;
  stockLocation?: StockLocation;
  items: { id: string; itemId: string; quantity: number; unitCost: number; discount: number; tax: number; lineTotal: number; item?: Item }[];
}

export interface SaleItem {
  id: string;
  saleId: string;
  itemId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  lineTotal: number;
  item?: Item;
}

export interface Sale {
  id: string;
  number: string;
  saleDate: string;
  reference?: string;
  note?: string;
  customerId: string;
  stockLocationId: string;
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  status: DocStatus;
  postedAt?: string;
  createdAt: string;
  updatedAt: string;
  customer?: Customer;
  stockLocation?: StockLocation;
  items: SaleItem[];
}

export interface SalesReturn {
  id: string;
  number: string;
  returnDate: string;
  reference?: string;
  note?: string;
  saleId?: string;
  customerId: string;
  stockLocationId: string;
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  status: DocStatus;
  createdAt: string;
  updatedAt: string;
  customer?: Customer;
  stockLocation?: StockLocation;
  items: { id: string; itemId: string; quantity: number; unitPrice: number; discount: number; tax: number; lineTotal: number; item?: Item }[];
}

export interface StockTransfer {
  id: string;
  number: string;
  transferDate: string;
  fromLocationId: string;
  toLocationId: string;
  note?: string;
  status: DocStatus;
  createdAt: string;
  updatedAt: string;
  fromLocation?: StockLocation;
  toLocation?: StockLocation;
  items: { id: string; itemId: string; quantity: number; item?: Item }[];
}

// ---------- Administration ----------

export interface User {
  id: string;
  fullName: string;
  username: string;
  email?: string;
  phone?: string;
  status: string;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
  roles?: { id: string; role: { id: string; name: string; isSystem: boolean } }[];
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  permissions?: { id: string; permission: { id: string; name: string; module: string; action: string } }[];
  _count?: { users: number };
}

export interface Permission {
  id: string;
  name: string;
  module: string;
  action: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  userId?: string;
  action: string;
  module: string;
  entity?: string;
  entityId?: string;
  message?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  user?: { id: string; fullName: string; username: string };
}

export interface BrandingSetting {
  id: string;
  businessName: string;
  shortName: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  address?: string;
  phone?: string;
  email?: string;
  ntn?: string;
  invoiceFooter?: string;
  invoiceTerms?: string;
  reportFooter?: string;
  updatedAt: string;
}

export interface SettingsMap {
  currency?: string;
  dateFormat?: string;
  timezone?: string;
  invoicePrefix?: string;
  purchasePrefix?: string;
  voucherPrefix?: string;
  negativeInventory?: string;
  defaultStockLocationId?: string;
  defaultCustomerId?: string;
  defaultSupplierId?: string;
  lockedUntil?: string;
  [key: string]: string | undefined;
}

// ---------- Reports ----------

export interface ReportRow {
  [key: string]: unknown;
  head?: string;
  description?: string;
  date?: string;
  debit?: number;
  credit?: number;
  balance?: number;
}

export interface DocumentRows<T> {
  rows: T[];
  totalDebit?: number;
  totalCredit?: number;
  balance?: number;
  totalNet?: number;
  totalStockValue?: number;
}

export interface LedgerRow {
  id?: string;
  date?: string;
  voucherNumber?: string;
  description?: string;
  debit?: number;
  credit?: number;
  balance: number;
}

export interface ProductLedgerRow {
  date?: string;
  transactionType?: string;
  referenceType?: string;
  referenceId?: string;
  unitCost?: number;
  stockIn?: number;
  stockOut?: number;
  balance?: number;
}

export interface StockReportRow {
  itemId?: string;
  itemCode: string;
  itemName: string;
  itemType?: string;
  brand?: string;
  quantity?: number;
  stockValue?: number;
}

export interface TrialBalanceRow {
  accountId?: string;
  code: string;
  name: string;
  head?: string;
  subHead?: string;
  debit?: number;
  credit?: number;
  balance?: number;
}

export interface DocLine {
  id: string;
  itemId: string;
  quantity: number;
  unitCost?: number;
  unitPrice?: number;
  discount?: number;
  tax?: number;
  lineTotal?: number;
  item?: { id: string; code?: string; name?: string } | null;
}

export interface CashBookRow {
  id?: string;
  date: string;
  voucherDate?: string;
  voucher?: { id: string; number: string } | null;
  reference?: string;
  description?: string;
  debit?: number;
  credit?: number;
  runningBalance: number;
}

export interface TransactionDoc {
  id: string;
  number: string;
  code?: string;
  status: DocStatus;
  reference?: string;
  note?: string;
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  amountPaid?: number;
  customer?: { id: string; name: string; phone?: string; address?: string } | null;
  supplier?: { id: string; name: string; phone?: string; address?: string } | null;
  party?: { id: string; name: string; phone?: string; address?: string } | null;
  stockLocation?: { id: string; name: string } | null;
  location?: { id: string; name: string } | null;
  items?: DocLine[];
  [key: string]: unknown;
}