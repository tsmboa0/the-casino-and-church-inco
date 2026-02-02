import { Connection, PublicKey, SystemProgram, Transaction, clusterApiUrl } from '@solana/web3.js';
import type { AnchorWallet } from '@solana/wallet-adapter-react';

export const getDefaultConnection = () => new Connection(clusterApiUrl('devnet'), 'confirmed');

export async function fetchSolBalance(connection: Connection, owner: PublicKey): Promise<number> {
  const lamports = await connection.getBalance(owner, { commitment: 'confirmed' });
  return lamports / 1_000_000_000; // SOL
}

export async function buildSolSelfTransferTx(connection: Connection, owner: PublicKey, solAmount = 0.000001): Promise<Transaction> {
  const lamports = Math.max(1, Math.floor(solAmount * 1_000_000_000));
  const ix = SystemProgram.transfer({ fromPubkey: owner, toPubkey: owner, lamports });
  const { blockhash } = await connection.getLatestBlockhash('finalized');
  const tx = new Transaction({ feePayer: owner, recentBlockhash: blockhash });
  tx.add(ix);
  return tx;
}

type WalletSigner = AnchorWallet & {
  sendTransaction?: (transaction: Transaction, connection: Connection, options?: any) => Promise<string>;
  signAllTransactions?: (txs: Transaction[]) => Promise<Transaction[]>;
};

async function signAndMaybeSend(
  connection: Connection,
  wallet: WalletSigner,
  tx: Transaction,
  actuallySend: boolean
): Promise<{ signature?: string }> {
  // Prefer signTransaction if available; fall back to sendTransaction for adapters without direct signing
  if (wallet.signTransaction) {
    const signed = await wallet.signTransaction(tx);
    if (!actuallySend) return {};
    const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
    await connection.confirmTransaction(sig, 'confirmed');
    return { signature: sig };
  }

  if (wallet.sendTransaction) {
    if (!actuallySend) return {};
    const sig = await wallet.sendTransaction(tx, connection, { skipPreflight: false });
    await connection.confirmTransaction(sig, 'confirmed');
    return { signature: sig };
  }

  throw new Error("Wallet does not support signing transactions.");
}

export async function requestSolTransferSignature(params: {
  connection: Connection;
  wallet: WalletSigner;
  actuallySend?: boolean; // default false – sign only
  solAmount?: number; // default 0.000001
}): Promise<{ signature?: string }>
{
  const { connection, wallet, actuallySend = false, solAmount } = params;
  const tx = await buildSolSelfTransferTx(connection, wallet.publicKey, solAmount);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash('finalized')).blockhash;
  return signAndMaybeSend(connection, wallet, tx, actuallySend);
}

export async function requestSolTransferToRecipient(params: {
  connection: Connection;
  wallet: WalletSigner;
  recipient: PublicKey;
  solAmount: number; // in SOL
  actuallySend?: boolean; // default true for real transfer
}): Promise<{ signature?: string }>
{
  const { connection, wallet, recipient, solAmount, actuallySend = true } = params;
  const lamports = Math.max(1, Math.floor(solAmount * 1_000_000_000));
  const ix = SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: recipient, lamports });
  const { blockhash } = await connection.getLatestBlockhash('finalized');
  const tx = new Transaction({ feePayer: wallet.publicKey, recentBlockhash: blockhash }).add(ix);
  return signAndMaybeSend(connection, wallet, tx, actuallySend);
}


