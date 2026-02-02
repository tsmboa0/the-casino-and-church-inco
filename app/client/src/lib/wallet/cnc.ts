import { Connection, PublicKey, SystemProgram, Transaction, clusterApiUrl } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, getAccount, getMint } from '@solana/spl-token';
import type { AnchorWallet } from '@solana/wallet-adapter-react';

// CNC token mint on devnet
export const CNC_MINT = new PublicKey('83czKg4PVLbmUcWhjpq5AXnSivDJrJVMf3AdwuUCPhPT');

// Shared devnet connection (UI may also provide one via context)
export const getDefaultConnection = () => new Connection(clusterApiUrl('devnet'), 'confirmed');

export async function getCncAta(owner: PublicKey): Promise<PublicKey> {
  return await getAssociatedTokenAddress(CNC_MINT, owner);
}

export async function fetchCncBalance(connection: Connection, owner: PublicKey): Promise<{ amount: number; decimals: number } | null> {
  try {
    const ata = await getCncAta(owner);
    const [accountInfo, mintInfo] = await Promise.all([
      getAccount(connection, ata, 'confirmed').catch(() => null),
      getMint(connection, CNC_MINT, 'confirmed'),
    ]);
    if (!accountInfo) return { amount: 0, decimals: mintInfo.decimals };
    const raw = Number(accountInfo.amount);
    return { amount: raw / Math.pow(10, mintInfo.decimals), decimals: mintInfo.decimals };
  } catch (e) {
    console.warn('fetchCncBalance error', e);
    return null;
  }
}

// Build a small SPL transfer transaction. By default we only request a signature (not send).
export async function buildCncSelfTransferTx(connection: Connection, owner: PublicKey): Promise<Transaction> {
  const ata = await getCncAta(owner);
  const mintInfo = await getMint(connection, CNC_MINT);
  const smallest = Math.max(1, Math.floor(Math.pow(10, mintInfo.decimals) * 0.000001));
  const ix = createTransferInstruction(ata, ata, owner, BigInt(smallest));
  const { blockhash } = await connection.getLatestBlockhash('finalized');
  const tx = new Transaction({ feePayer: owner, recentBlockhash: blockhash });
  tx.add(ix);
  return tx;
}

// Request user signature for the SPL transfer; optionally send to devnet.
export async function requestCncTransferSignature(params: {
  connection: Connection;
  wallet: AnchorWallet;
  actuallySend?: boolean; // default false – only sign to show wallet activity
}): Promise<{ signature?: string }>
{
  const { connection, wallet, actuallySend = false } = params;
  const tx = await buildCncSelfTransferTx(connection, wallet.publicKey);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash('finalized')).blockhash;
  const signed = await wallet.signTransaction(tx);
  if (!actuallySend) return {};
  const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
  await connection.confirmTransaction(sig, 'confirmed');
  return { signature: sig };
}


