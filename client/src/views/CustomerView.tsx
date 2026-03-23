import { useEffect, useState } from 'react';
import { CheckoutModal } from '../components/checkout';
import { SupportedChainId } from '../components/checkout/wagmi';
import { apiUrl } from '../lib/api';

type Product = {
  id: string;
  name: string;
  description: string;
  priceUsd: number;
  imageUrl?: string;
  stock: number;
};

type OrderResponse = {
  orderId: string;
  totalUsdc: number;
  walletAddress: string;
  chainId: number;
  tokenAddress: string;
};

export function CustomerView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [activeOrder, setActiveOrder] = useState<OrderResponse | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  useEffect(() => {
    fetch(apiUrl('/api/products'))
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Product[]) => {
        if (!Array.isArray(data)) throw new Error('Unexpected response shape');
        setProducts(data);
        const init: Record<string, number> = {};
        data.forEach(p => { init[p.id] = 0; });
        setQuantities(init);
      })
      .catch(err => console.error('Failed to fetch products:', err));
  }, []);

  const updateQuantity = (id: string, delta: number) => {
    setQuantities(prev => ({ ...prev, [id]: Math.max(0, (prev[id] || 0) + delta) }));
  };

  const totalItems = Object.values(quantities).reduce((sum, q) => sum + q, 0);
  const totalPrice = products.reduce((sum, p) => sum + p.priceUsd * (quantities[p.id] || 0), 0);
  const cartItems = products
    .filter(p => quantities[p.id] > 0)
    .map(p => ({ productId: p.id, quantity: quantities[p.id] }));

  const canCheckout = customerName.trim() && customerEmail.trim() && cartItems.length > 0;

  const handleCheckout = async () => {
    if (!canCheckout) return;
    setIsCreatingOrder(true);
    setOrderError('');
    try {
      const res = await fetch(apiUrl('/api/orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerName, customerEmail, items: cartItems }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create order');
      }
      const order: OrderResponse = await res.json();
      setActiveOrder(order);
      setIsCheckoutOpen(true);
    } catch (err) {
      setOrderError((err as Error).message);
    } finally {
      setIsCreatingOrder(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col lg:flex-row gap-8">

        {/* Product grid */}
        <div className="flex-1">
          {products.length === 0 ? (
            <div className="text-center text-zinc-400 py-16">Loading products...</div>
          ) : (
            <div className="space-y-5">
              {products.map(product => (
                <div
                  key={product.id}
                  className="bg-white dark:bg-zinc-800 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 flex flex-col sm:flex-row"
                >
                  {product.imageUrl ? (
                    <div className="w-full sm:w-44 h-44 flex-shrink-0 overflow-hidden">
                      <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-full sm:w-44 h-44 flex-shrink-0 bg-gradient-to-br from-amber-100 to-stone-200 flex items-center justify-center">
                      <span className="text-4xl">🛍️</span>
                    </div>
                  )}
                  <div className="p-5 flex flex-col justify-between flex-1">
                    <div>
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-1">{product.name}</h3>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">{product.description}</p>
                      <p className="text-xl font-bold text-zinc-900 dark:text-white">${product.priceUsd.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                      <button
                        onClick={() => updateQuantity(product.id, -1)}
                        disabled={!quantities[product.id]}
                        className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-700 font-bold text-lg hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        −
                      </button>
                      <span className="text-lg font-semibold text-zinc-900 dark:text-white w-6 text-center">
                        {quantities[product.id] || 0}
                      </span>
                      <button
                        onClick={() => updateQuantity(product.id, 1)}
                        disabled={product.stock > 0 && (quantities[product.id] || 0) >= product.stock}
                        className="w-9 h-9 rounded-full bg-amber-500 text-white font-bold text-lg hover:bg-amber-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cart sidebar */}
        <div className="w-full lg:w-96 lg:sticky lg:top-8 h-fit flex-shrink-0">
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-5">Your Cart</h2>

            {totalItems === 0 ? (
              <p className="text-zinc-400 text-center py-8">Add items to your cart to get started</p>
            ) : (
              <>
                <div className="space-y-2 mb-5">
                  {products.filter(p => quantities[p.id] > 0).map(p => (
                    <div key={p.id} className="flex justify-between text-sm text-zinc-700 dark:text-zinc-300">
                      <span>{quantities[p.id]}× {p.name}</span>
                      <span className="font-medium">${(p.priceUsd * quantities[p.id]).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4 mb-5">
                  <div className="flex justify-between text-lg font-bold text-zinc-900 dark:text-white">
                    <span>Total</span>
                    <span>${totalPrice.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">Paid in USDC on Polygon</p>
                </div>
              </>
            )}

            {/* Customer info */}
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Email</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={e => setCustomerEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {orderError && (
              <p className="text-sm text-red-600 dark:text-red-400 mb-3">{orderError}</p>
            )}

            <button
              onClick={handleCheckout}
              disabled={!canCheckout || isCreatingOrder}
              className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              {isCreatingOrder ? 'Creating order...' : 'Pay with Crypto'}
            </button>
          </div>
        </div>
      </div>

      {/* Checkout modal */}
      {activeOrder && (
        <CheckoutModal
          isOpen={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          orderId={activeOrder.orderId}
          totalUsdc={activeOrder.totalUsdc}
          walletAddress={activeOrder.walletAddress}
          chainId={activeOrder.chainId as SupportedChainId}
          tokenAddress={activeOrder.tokenAddress as `0x${string}`}
          accentColor="#f59e0b"
        />
      )}
    </div>
  );
}
