import { useEffect, useState } from 'react';
import { apiUrl } from '../lib/api';

type OrderItem = {
  id: string;
  quantity: number;
  unitPriceUsd: number;
  product: { name: string };
};

type Order = {
  id: string;
  customerName: string;
  customerEmail: string;
  status: string;
  totalUsdc: number;
  createdAt: string;
  items: OrderItem[];
};

type Withdrawal = {
  id: string;
  orderId: string;
  status: string;
  amountCop: number | null;
  muralPayoutRequestId: string;
  createdAt: string;
  order: {
    customerName: string;
    totalUsdc: number;
  };
};

const STATUS_COLORS: Record<string, string> = {
  PENDING_PAYMENT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  PAID: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  PROCESSING: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] || 'bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

export function MerchantView() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'orders' | 'withdrawals'>('orders');

  const fetchData = async () => {
    try {
      const [ordersRes, withdrawalsRes] = await Promise.all([
        fetch(apiUrl('/api/merchant/orders')),
        fetch(apiUrl('/api/merchant/withdrawals')),
      ]);
      if (!ordersRes.ok || !withdrawalsRes.ok) throw new Error('Failed to fetch merchant data');
      const [ordersData, withdrawalsData] = await Promise.all([
        ordersRes.json(),
        withdrawalsRes.json(),
      ]);
      setOrders(ordersData);
      setWithdrawals(withdrawalsData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="text-center py-16 text-zinc-400">Loading...</div>;
  if (error) return <div className="text-center py-16 text-red-500">{error}</div>;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Admin Dashboard</h2>
        <button
          onClick={fetchData}
          className="text-sm px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700 mb-6">
        {(['orders', 'withdrawals'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium cursor-pointer transition-colors border-b-2 -mb-px ${
              activeTab === t
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
            }`}
          >
            {t === 'orders' ? `Orders (${orders.length})` : `COP Withdrawals (${withdrawals.length})`}
          </button>
        ))}
      </div>

      {/* Orders tab */}
      {activeTab === 'orders' && (
        <section>
          {orders.length === 0 ? (
            <p className="text-zinc-400">No orders yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Order ID</th>
                    <th className="px-4 py-3 text-left font-medium">Customer</th>
                    <th className="px-4 py-3 text-left font-medium">Items</th>
                    <th className="px-4 py-3 text-right font-medium">USDC</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                  {orders.map(order => (
                    <tr key={order.id} className="bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500">{order.id.slice(0, 8)}…</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900 dark:text-white">{order.customerName}</div>
                        <div className="text-zinc-500">{order.customerEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {order.items.map(item => `${item.quantity}× ${item.product.name}`).join(', ')}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-zinc-900 dark:text-white">
                        {order.totalUsdc.toFixed(2)}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                      <td className="px-4 py-3 text-zinc-500">{formatDate(order.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Withdrawals tab */}
      {activeTab === 'withdrawals' && (
        <section>
          {withdrawals.length === 0 ? (
            <p className="text-zinc-400">No withdrawals yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Payout ID</th>
                    <th className="px-4 py-3 text-left font-medium">Customer</th>
                    <th className="px-4 py-3 text-right font-medium">USDC In</th>
                    <th className="px-4 py-3 text-right font-medium">COP Out</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                  {withdrawals.map(w => (
                    <tr key={w.id} className="bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500">{w.muralPayoutRequestId.slice(0, 8)}…</td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{w.order.customerName}</td>
                      <td className="px-4 py-3 text-right text-zinc-900 dark:text-white">{w.order.totalUsdc.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-medium text-zinc-900 dark:text-white">
                        {w.amountCop != null ? `${w.amountCop.toLocaleString()} COP` : '—'}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={w.status} /></td>
                      <td className="px-4 py-3 text-zinc-500">{formatDate(w.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
