import { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { fetchSolBalance } from '../lib/wallet/sol';

export function useSolBalance() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storageKey = publicKey ? `sol-balance:${publicKey.toString()}` : null;
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
      const amt = await fetchSolBalance(connection, publicKey);
      setBalance(amt);
      saveToStorage(amt);
    } catch (e) {
      setError('Failed to fetch SOL balance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = loadFromStorage();
    if (cached !== null) setBalance(cached);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, connection]);

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


