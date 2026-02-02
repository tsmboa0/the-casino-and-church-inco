import { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { fetchCncBalance } from '../lib/wallet/cnc';

export function useCncBalance() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Storage helpers
  const storageKey = publicKey ? `cnc-balance:${publicKey.toString()}` : null;
  const loadFromStorage = () => {
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.amount === 'number') return parsed.amount as number;
    } catch {}
    return null;
  };
  const saveToStorage = (amount: number) => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ amount, updatedAt: Date.now() }));
    } catch {}
  };

  const refresh = async () => {
    if (!publicKey) {
      setBalance(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const b = await fetchCncBalance(connection, publicKey);
      const amt = b ? b.amount : 0;
      setBalance(amt);
      saveToStorage(amt);
    } catch (e) {
      setError('Failed to fetch CNC balance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // hydrate from storage immediately
    const cached = loadFromStorage();
    if (cached !== null) setBalance(cached);
    // then fetch fresh when wallet or connection changes
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, connection]);

  // Refresh on window focus and every 30s
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    const interval = setInterval(() => refresh(), 30000);
    return () => {
      window.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [publicKey, connection]);

  return { balance, loading, error, refresh };
}


