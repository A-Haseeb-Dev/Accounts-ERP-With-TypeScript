'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Package, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { PageLoader } from '@/components/ui/spinner';
import { money } from '@/lib/utils';

interface DashboardOverview {
  todaySales: number;
  todayPurchases: number;
  totalCustomers: number;
  totalSuppliers: number;
  totalProducts: number;
  currentStockValue: number;
  outstandingCustomerBalance: number;
  outstandingSupplierBalance: number;
  recentSales: { id: string; number: string; saleDate: string; customer: { name: string } | null; grandTotal: number; status: string }[];
  recentPurchases: { id: string; number: string; purchaseDate: string; supplier: { name: string } | null; grandTotal: number; status: string }[];
  recentVouchers: Record<string, unknown>[];
}

interface TrendPoint {
  date: string;
  sales: number;
  purchases: number;
}

export default function DashboardPage() {
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

  const kpis = [
    { label: 'Today Sales', value: money(data.todaySales), icon: ShoppingCart },
    { label: 'Today Purchases', value: money(data.todayPurchases), icon: TrendingUp },
    { label: 'Stock Value', value: money(data.currentStockValue), icon: Package },
    { label: 'Customers', value: String(data.totalCustomers), icon: Users },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" description="Business overview and recent activity" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <Card.Body className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
                <p className="text-xl font-bold text-slate-900">{value}</p>
              </div>
            </Card.Body>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Card.Header>
            <Card.Title>Sales vs Purchases (last 14 days)</Card.Title>
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
                    <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="sales" name="Sales" stroke="#0f766e" fill="url(#gs)" />
                  <Area type="monotone" dataKey="purchases" name="Purchases" stroke="#f59e0b" fill="url(#gp)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card.Body>
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>Quick Overview</Card.Title>
          </Card.Header>
          <Card.Body>
            <div className="space-y-4">
              <InfoRow label="Stock value" value={money(data.currentStockValue)} />
              <InfoRow label="Outstanding customers" value={money(data.outstandingCustomerBalance)} />
              <InfoRow label="Outstanding suppliers" value={money(data.outstandingSupplierBalance)} />
              <InfoRow label="Total suppliers" value={String(data.totalSuppliers)} />
              <InfoRow label="Total products" value={String(data.totalProducts)} />
            </div>
          </Card.Body>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
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
