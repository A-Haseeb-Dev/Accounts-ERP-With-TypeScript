'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  ChevronRight,
  FileText,
  Landmark,
  Package,
  RefreshCcw,
  ShoppingCart,
  Users,
  Wallet,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { PageLoader } from '@/components/ui/spinner';
import { money } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';

interface DashboardOverview {
  todaySales: number;
  todayPurchases: number;
  monthSales: number;
  monthPurchases: number;
  todayReceipts: number;
  todayPayments: number;
  monthReceipts: number;
  monthPayments: number;
  cashBalance: number;
  bankBalance: number;
  totalCustomers: number;
  totalSuppliers: number;
  totalProducts: number;
  currentStockValue: number;
  outstandingCustomerBalance: number;
  outstandingSupplierBalance: number;
  overdueInvoices: { count: number; amount: number };
  chequesInHand: { count: number; amount: number };
  chequesMaturingSoon: { count: number; amount: number };
  chequesDueToday: { count: number; amount: number };
  bouncedCheques: { count: number; amount: number };
  lowStockCount: number;
  topCustomers: { id: string; name: string; total: number }[];
  pendingReceipts: Record<string, unknown>[];
  recentSales: { id: string; number: string; saleDate: string; customer: { name: string } | null; grandTotal: number; status: string }[];
  recentPurchases: { id: string; number: string; purchaseDate: string; supplier: { name: string } | null; grandTotal: number; status: string }[];
  recentVouchers: Record<string, unknown>[];
}

interface TrendPoint {
  date: string;
  sales: number;
  purchases: number;
  receipts: number;
  payments: number;
}

export default function DashboardPage() {
  const { can } = useAuth();
  const { data, isLoading } = useQuery<DashboardOverview>({
    queryKey: ['dashboard'],
    queryFn: () => apiFetch('/dashboard'),
  });

  const { data: trendResult } = useQuery<{ days: number; points: TrendPoint[] }>({
    queryKey: ['dashboard', 'trend'],
    queryFn: () => apiFetch('/dashboard/sales-trend?days=14'),
  });

  if (isLoading || !data) return <PageLoader />;

  const trendRows = trendResult?.points ?? [];

  const netToday = data.todayReceipts - data.todayPayments;
  const netMonth = data.monthReceipts - data.monthPayments;

  const kpis = [
    {
      label: 'Today Receipts',
      value: money(data.todayReceipts),
      sub: `Month ${money(data.monthReceipts)}`,
      icon: ArrowDownCircle,
      accent: 'text-emerald-700 bg-emerald-50',
    },
    {
      label: 'Today Payments',
      value: money(data.todayPayments),
      sub: `Month ${money(data.monthPayments)}`,
      icon: ArrowUpCircle,
      accent: 'text-amber-700 bg-amber-50',
    },
    {
      label: 'Today Sales',
      value: money(data.todaySales),
      sub: `Month ${money(data.monthSales)}`,
      icon: ShoppingCart,
      accent: 'text-teal-700 bg-teal-50',
    },
    {
      label: 'Today Purchases',
      value: money(data.todayPurchases),
      sub: `Month ${money(data.monthPurchases)}`,
      icon: Package,
      accent: 'text-slate-700 bg-slate-100',
    },
  ];

  const secondKpis = [
    {
      label: 'Net Today',
      value: money(netToday),
      sub: `Net month ${money(netMonth)}`,
      icon: Wallet,
      accent: netToday >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50',
    },
    {
      label: 'Cash Balance',
      value: money(data.cashBalance),
      sub: `Bank ${money(data.bankBalance)}`,
      icon: Banknote,
      accent: 'text-teal-700 bg-teal-50',
    },
    {
      label: 'Receivables',
      value: money(data.outstandingCustomerBalance),
      sub: data.overdueInvoices.count > 0
        ? `${data.overdueInvoices.count} overdue · ${money(data.overdueInvoices.amount)}`
        : 'No overdue invoices',
      icon: Users,
      accent: data.overdueInvoices.count > 0 ? 'text-red-700 bg-red-50' : 'text-teal-700 bg-teal-50',
    },
    {
      label: 'Cheques in Hand',
      value: money(data.chequesInHand.amount),
      sub: data.chequesInHand.count > 0
        ? `${data.chequesInHand.count} cheque(s) · ${data.chequesMaturingSoon.count} maturing in 7 days`
        : 'No cheques in hand',
      icon: Landmark,
      accent: data.chequesMaturingSoon.count > 0 ? 'text-amber-700 bg-amber-50' : 'text-teal-700 bg-teal-50',
    },
  ];

  const hasQuickActions = can('sales.invoice.create') || can('accounts.payments.create') || can('inventory.purchase.create');

  return (
    <div>
      <PageHeader title="Dashboard" description="Business overview and recent activity" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, sub, icon: Icon, accent }) => (
          <Card key={label}>
            <Card.Body className="flex items-center gap-4">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
                <p className="text-xl font-bold text-slate-900">{value}</p>
                <p className="text-[11px] text-slate-400">{sub}</p>
              </div>
            </Card.Body>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {secondKpis.map(({ label, value, sub, icon: Icon, accent }) => (
          <Card key={label}>
            <Card.Body className="flex items-center gap-4">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
                <p className="text-xl font-bold text-slate-900">{value}</p>
                <p className="text-[11px] text-slate-400">{sub}</p>
              </div>
            </Card.Body>
          </Card>
        ))}
      </div>

      {hasQuickActions && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {can('sales.invoice.create') && (
            <a
              href="/sales/invoices"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <ShoppingCart className="h-4 w-4" /> New Sale
            </a>
          )}
          {can('accounts.payments.create') && (
            <a
              href="/accounts/payments"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <ArrowDownCircle className="h-4 w-4" /> New Receipt / Payment
            </a>
          )}
          {can('inventory.purchase.create') && (
            <a
              href="/inventory/purchases"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <Package className="h-4 w-4" /> New Purchase
            </a>
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Card.Header>
            <Card.Title>Cash flow & Sales (last 14 days)</Card.Title>
          </Card.Header>
          <Card.Body>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendRows}>
                  <defs>
                    <linearGradient id="gs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0f766e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0f766e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="receipts" name="Receipts" stroke="#16a34a" fill="url(#gr)" />
                  <Area type="monotone" dataKey="sales" name="Sales" stroke="#0f766e" fill="url(#gs)" />
                  <Area type="monotone" dataKey="payments" name="Payments" stroke="#d97706" fill="url(#gp)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card.Body>
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>Top Customers</Card.Title>
          </Card.Header>
          <Card.Body>
            {data.topCustomers.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">No posted sales yet.</p>
            ) : (
              <div className="space-y-3">
                {data.topCustomers.map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{i + 1}</span>
                      <span className="truncate text-sm font-medium text-slate-700">{c.name}</span>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-slate-800">{money(c.total)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 space-y-4 border-t border-slate-100 pt-4">
              <InfoRow label="Cash balance" value={money(data.cashBalance)} />
              <InfoRow label="Bank balance" value={money(data.bankBalance)} />
              <InfoRow label="Stock value" value={money(data.currentStockValue)} />
              <InfoRow label="Payables" value={money(data.outstandingSupplierBalance)} />
              <InfoRow label="Suppliers" value={String(data.totalSuppliers)} />
              <InfoRow label="Products" value={String(data.totalProducts)} />
            </div>
          </Card.Body>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <Card.Header>
            <Card.Title>Status</Card.Title>
          </Card.Header>
          <Card.Body>
            <div className="space-y-3">
              <StatusRow
                icon={<AlertTriangle className="h-4 w-4" />}
                tone="danger"
                label={data.overdueInvoices.count > 0 ? `${data.overdueInvoices.count} overdue invoice(s)` : 'No overdue invoices'}
                value={data.overdueInvoices.count > 0 ? money(data.overdueInvoices.amount) : undefined}
              />
              <StatusRow
                icon={<Landmark className="h-4 w-4" />}
                tone="warn"
                label={data.chequesInHand.count > 0 ? `Cheques in hand (${data.chequesInHand.count})` : 'No cheques in hand'}
                value={data.chequesInHand.count > 0 ? money(data.chequesInHand.amount) : undefined}
              />
              {data.chequesDueToday.count > 0 && (
                <StatusRow
                  icon={<RefreshCcw className="h-4 w-4" />}
                  tone="danger"
                  label={`${data.chequesDueToday.count} cheque(s) due today`}
                  value={money(data.chequesDueToday.amount)}
                />
              )}
              {data.chequesMaturingSoon.count > 0 && (
                <StatusRow
                  icon={<RefreshCcw className="h-4 w-4" />}
                  tone="warn"
                  label={`${data.chequesMaturingSoon.count} cheque(s) maturing in 7 days`}
                  value={money(data.chequesMaturingSoon.amount)}
                />
              )}
              {data.bouncedCheques.count > 0 && (
                <StatusRow
                  icon={<AlertTriangle className="h-4 w-4" />}
                  tone="danger"
                  label={`${data.bouncedCheques.count} cheque(s) bounced`}
                  value={money(data.bouncedCheques.amount)}
                />
              )}
              <StatusRow
                icon={<Package className="h-4 w-4" />}
                tone={data.lowStockCount > 0 ? 'warn' : 'ok'}
                label={data.lowStockCount > 0 ? `${data.lowStockCount} low-stock item(s)` : 'Stock levels healthy'}
              />
              {data.pendingReceipts.length > 0 && (
                <a href="/accounts/payments" className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700 hover:bg-amber-100">
                  <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> {data.pendingReceipts.length} payment(s) awaiting approval</span>
                  <ChevronRight className="h-4 w-4" />
                </a>
              )}
            </div>
          </Card.Body>
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>Recent Sales</Card.Title>
          </Card.Header>
          <Card.Body>
            <div className="space-y-3">
              {data.recentSales.slice(0, 5).map((s) => (
                <Row
                  key={s.id}
                  number={s.number}
                  party={s.customer?.name ?? '-'}
                  date={s.saleDate}
                  amount={s.grandTotal}
                  status={s.status}
                />
              ))}
              {data.recentSales.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No sales yet.</p>}
            </div>
          </Card.Body>
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>Recent Purchases</Card.Title>
          </Card.Header>
          <Card.Body>
            <div className="space-y-3">
              {data.recentPurchases.slice(0, 5).map((p) => (
                <Row
                  key={p.id}
                  number={p.number}
                  party={p.supplier?.name ?? '-'}
                  date={p.purchaseDate}
                  amount={p.grandTotal}
                  status={p.status}
                />
              ))}
              {data.recentPurchases.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No purchases yet.</p>}
            </div>
          </Card.Body>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function Row({ number, party, date, amount, status }: { number: string; party: string; date: string; amount: number; status: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{number}</p>
        <p className="truncate text-xs text-slate-500">{party} · {new Date(date).toLocaleDateString('en-GB')}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">{money(amount)}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${status === 'posted' ? 'bg-teal-50 text-teal-700' : 'bg-slate-200 text-slate-600'}`}>
          {status}
        </span>
      </div>
    </div>
  );
}

function StatusRow({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value?: string; tone: 'ok' | 'warn' | 'danger' }) {
  const toneClasses = {
    ok: 'border-slate-100 bg-slate-50 text-slate-700',
    warn: 'border-amber-100 bg-amber-50 text-amber-700',
    danger: 'border-red-100 bg-red-50 text-red-700',
  };
  return (
    <div className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${toneClasses[tone]}`}>
      <span className="flex items-center gap-2">{icon}<span>{label}</span></span>
      {value !== undefined && <span className="shrink-0 font-semibold">{value}</span>}
    </div>
  );
}