import { useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiConfig } from './components/checkout/wagmi';
import { CustomerView } from './views/CustomerView';
import { MerchantView } from './views/MerchantView';

const queryClient = new QueryClient();

type Tab = 'customer' | 'admin';

export default function App() {
  const [tab, setTab] = useState<Tab>('customer');

  return (
    <WagmiProvider config={WagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-stone-100 dark:from-zinc-900 dark:via-zinc-800 dark:to-zinc-900">

          {/* Header */}
          <header className="border-b border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-40">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-14">
                <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
                  Debugging Ducks
                </h1>

                {/* Tabs */}
                <nav className="flex gap-1">
                  {(['customer', 'admin'] as Tab[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors capitalize ${
                        tab === t
                          ? 'bg-amber-500 text-white'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {t === 'customer' ? 'Shop' : 'Admin'}
                    </button>
                  ))}
                </nav>
              </div>
            </div>
          </header>

          {/* Page content */}
          {tab === 'customer' ? <CustomerView /> : <MerchantView />}
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
