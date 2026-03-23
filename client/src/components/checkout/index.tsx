import { useEffect, useState } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { FiX } from 'react-icons/fi';
import { ConnectAndPay } from './connect-pay';
import { SupportedChainId } from './wagmi';

export type CheckoutModalProps = {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  totalUsdc: number;
  walletAddress: string;
  chainId: SupportedChainId;
  tokenAddress: `0x${string}`;
  displayMode?: 'light' | 'dark' | 'system';
  accentColor?: string;
};

export function CheckoutModal({
  isOpen,
  onClose,
  orderId,
  totalUsdc,
  walletAddress,
  chainId,
  tokenAddress,
  displayMode = 'system',
  accentColor = '#338aea',
}: CheckoutModalProps) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    if (displayMode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      setIsDark(mq.matches);
      const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      setIsDark(displayMode === 'dark');
    }
  }, [displayMode]);

  return (
    <Dialog open={isOpen} as="div" style={{ position: 'relative', zIndex: 50 }} onClose={onClose}>
      <DialogBackdrop
        transition
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}
      />

      <div style={{ position: 'fixed', inset: 0, zIndex: 50, overflowY: 'auto' }}>
        <div style={{ display: 'flex', minHeight: '100%', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <DialogPanel
            transition
            style={{
              width: '100%',
              maxWidth: '28rem',
              borderRadius: '0.75rem',
              backgroundColor: isDark ? '#111827' : '#ffffff',
              padding: '1.75rem 2rem',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
            }}
          >
            <DialogTitle
              as="div"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.25rem',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: isDark ? '#ffffff' : '#111827' }}>
                Pay with Crypto
              </h3>
              <button
                onClick={onClose}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: isDark ? '#9ca3af' : '#6b7280' }}
              >
                <FiX size={20} />
              </button>
            </DialogTitle>

            <ConnectAndPay
              orderId={orderId}
              totalUsdc={totalUsdc}
              walletAddress={walletAddress}
              chainId={chainId}
              tokenAddress={tokenAddress}
              isDark={isDark}
              accentColor={accentColor}
            />
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
