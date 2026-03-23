import { useEffect, useRef, useState } from 'react';
import { erc20Abi, parseUnits } from 'viem';
import { useAccount, useSwitchChain, useWriteContract } from 'wagmi';
import { SupportedChainId } from './wagmi';
import { WalletOptions } from './wallet-options';
import { apiUrl } from '../../lib/api';

type PaymentState = 'wallet-picker' | 'transfer-pending' | 'awaiting-confirmation' | 'paid' | 'error';

export type ConnectAndPayProps = {
  orderId: string;
  totalUsdc: number;
  walletAddress: string;
  chainId: SupportedChainId;
  tokenAddress: `0x${string}`;
  isDark: boolean;
  accentColor: string;
};

export function ConnectAndPay({
  orderId,
  totalUsdc,
  walletAddress,
  chainId,
  tokenAddress,
  isDark,
  accentColor,
}: ConnectAndPayProps) {
  const [paymentState, setPaymentState] = useState<PaymentState>('wallet-picker');
  const [errorMessage, setErrorMessage] = useState('');
  const [submittedTxHash, setSubmittedTxHash] = useState('');
  const [isHoveringButton, setIsHoveringButton] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();

  // Auto-switch to the correct chain when wallet connects
  useEffect(() => {
    if (isConnected && chain?.id !== chainId && chainId) {
      switchChain({ chainId });
    }
  }, [isConnected, chain?.id, chainId, switchChain]);

  // Once wagmi returns a tx hash, store it and move to awaiting-confirmation
  useEffect(() => {
    if (!txHash) return;
    setSubmittedTxHash(txHash);
    setPaymentState('awaiting-confirmation');

    // Store tx hash on the order so the webhook handler can match it
    fetch(apiUrl(`/api/orders/${orderId}/confirm`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash }),
    }).catch(err => console.error('Failed to store tx hash:', err));
  }, [txHash, orderId]);

  // Poll for PAID status after tx is submitted
  useEffect(() => {
    if (paymentState !== 'awaiting-confirmation') return;

    let attempts = 0;
    const maxAttempts = 60; // 5 minutes at 5-second intervals

    pollingRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(apiUrl(`/api/orders/${orderId}`));
        if (res.ok) {
          const order = await res.json();
          if (order.status === 'PAID' || order.status === 'COMPLETED') {
            clearInterval(pollingRef.current!);
            setPaymentState('paid');
            return;
          }
          if (order.status === 'FAILED') {
            clearInterval(pollingRef.current!);
            setErrorMessage('Payment was received but payout processing failed. Please contact support.');
            setPaymentState('error');
            return;
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
      if (attempts >= maxAttempts) {
        clearInterval(pollingRef.current!);
        setErrorMessage('Payment confirmation timed out. Your transaction may still be processing — check your order status later.');
        setPaymentState('error');
      }
    }, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [paymentState, orderId]);

  // Surface write errors — truncate viem's verbose message to the first line only
  useEffect(() => {
    if (writeError) {
      const full = writeError.message || 'Transaction failed';
      const firstLine = full.split('\n')[0].split('Request Arguments:')[0].trim();
      setErrorMessage(firstLine || 'Transaction failed');
      setPaymentState('error');
    }
  }, [writeError]);

  const handlePay = () => {
    if (!isConnected || chain?.id !== chainId) return;
    setPaymentState('transfer-pending');

    // USDC uses 6 decimals; parseUnits handles the decimal string precisely
    const amount = parseUnits(totalUsdc.toFixed(6), 6);

    writeContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [walletAddress as `0x${string}`, amount],
      chainId,
    });
  };

  const darkenColor = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `#${Math.floor(r * 0.85).toString(16).padStart(2, '0')}${Math.floor(g * 0.85).toString(16).padStart(2, '0')}${Math.floor(b * 0.85).toString(16).padStart(2, '0')}`;
  };

  const secondaryTextColor = isDark ? '#d1d5db' : '#6b7280';
  const isOnCorrectChain = isConnected && chain?.id === chainId;

  return (
    <>
      <div style={{ minHeight: '12rem', overflowY: 'auto' }}>
        {paymentState === 'wallet-picker' && (
          <WalletOptions
            chainId={chainId}
            tokenAddress={tokenAddress}
            isDark={isDark}
            accentColor={accentColor}
          />
        )}

        {(paymentState === 'transfer-pending' || isPending) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '10rem', gap: '1rem' }}>
            <LoadingSpinner accentColor={accentColor} size={48} />
            <p style={{ color: secondaryTextColor, textAlign: 'center', margin: 0 }}>
              Confirm the transaction in your wallet...
            </p>
          </div>
        )}

        {paymentState === 'awaiting-confirmation' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '10rem', gap: '1rem' }}>
            <LoadingSpinner accentColor={accentColor} size={48} />
            <p style={{ color: secondaryTextColor, textAlign: 'center', margin: 0 }}>
              Transaction submitted — awaiting payment confirmation...
            </p>
            {submittedTxHash && (
              <p style={{ fontSize: '0.75rem', color: secondaryTextColor, wordBreak: 'break-all', textAlign: 'center', margin: 0 }}>
                Tx: {submittedTxHash.slice(0, 10)}...{submittedTxHash.slice(-8)}
              </p>
            )}
          </div>
        )}

        {paymentState === 'paid' && (
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: isDark ? '#064e3b' : '#ecfdf5',
            color: isDark ? '#a7f3d0' : '#065f46',
            border: isDark ? '1px solid #10b981' : '1px solid #a7f3d0',
            borderRadius: '0.5rem',
          }}>
            <h3 style={{ fontWeight: 600, marginBottom: '0.5rem', marginTop: 0 }}>Payment Confirmed!</h3>
            <p style={{ margin: 0 }}>
              Your payment of {totalUsdc.toFixed(2)} USDC was received. Your order is being processed.
            </p>
          </div>
        )}

        {paymentState === 'error' && (
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: isDark ? '#3f3f46' : '#fef2f2',
            color: isDark ? '#fca5a5' : '#991b1b',
            border: isDark ? '1px solid #52525b' : '1px solid #fecaca',
            borderRadius: '0.5rem',
          }}>
            <h3 style={{ fontWeight: 600, marginBottom: '0.5rem', marginTop: 0 }}>Payment Error</h3>
            <p style={{ margin: 0 }}>{errorMessage}</p>
          </div>
        )}
      </div>

      {paymentState === 'wallet-picker' && (
        <button
          disabled={!isOnCorrectChain}
          style={{
            width: '100%',
            marginTop: '1.25rem',
            padding: '0.6rem 1rem',
            backgroundColor: isHoveringButton && isOnCorrectChain ? darkenColor(accentColor) : accentColor,
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            opacity: !isOnCorrectChain ? 0.5 : 1,
            cursor: isOnCorrectChain ? 'pointer' : 'default',
          }}
          onMouseEnter={() => setIsHoveringButton(true)}
          onMouseLeave={() => setIsHoveringButton(false)}
          onClick={handlePay}
        >
          {!isConnected
            ? 'Connect wallet to pay'
            : !isOnCorrectChain
            ? 'Switching to Polygon Amoy...'
            : `Pay ${totalUsdc.toFixed(2)} USDC`}
        </button>
      )}

      {paymentState === 'error' && (
        <button
          style={{
            width: '100%',
            marginTop: '1.25rem',
            padding: '0.6rem 1rem',
            backgroundColor: isHoveringButton ? darkenColor(accentColor) : accentColor,
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
          onMouseEnter={() => setIsHoveringButton(true)}
          onMouseLeave={() => setIsHoveringButton(false)}
          onClick={() => {
            setPaymentState('wallet-picker');
            setErrorMessage('');
          }}
        >
          Try Again
        </button>
      )}
    </>
  );
}

function LoadingSpinner({ accentColor, size = 32 }: { accentColor: string; size?: number }) {
  return (
    <div role="status">
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .checkout-spinner { animation: spin 0.8s linear infinite; }
      `}</style>
      <div
        className="checkout-spinner"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          border: `3px solid ${accentColor}33`,
          borderTopColor: accentColor,
        }}
      />
      <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
        Loading...
      </span>
    </div>
  );
}
