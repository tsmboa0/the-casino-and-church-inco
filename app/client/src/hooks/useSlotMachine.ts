import { useState, useCallback } from "react";
import { useConnection, useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
    getProgram,
    getGamePda,
    getAdminPda,
    getCasinoVaultPda,
    getHandlesFromSimulationLogs,
    buildAllowanceAccounts,
    INCO_LIGHTNING_PROGRAM_ID,
    ADMIN_AUTHORITY,
} from "../lib/program/constants";
import { decryptHandle } from "../lib/program/inco";

// Reel symbols for display
export const REEL_SYMBOLS = ["🍒", "🍋", "🍊", "🍇", "⭐", "🔔", "💎", "🎰", "7️⃣", "🍀"];

// Transaction result - returned after on-chain submission
export interface SlotTransactionResult {
    txSignature: string;
    gamePda: string;
    reelHandles: [string, string, string]; // Handles to decrypt the 3 reels
    payoutHandle: string;                   // Handle to decrypt the payout amount
}

export interface SlotResult {
    isWin: boolean;
    reels: [number, number, number]; // Values 0-9
    reelSymbols: [string, string, string];
    payout: number; // in lamports
    txSignature: string;
    gamePda: string;
    payoutHandle?: string;
}

export interface UseSlotMachineReturn {
    // Step 1: Submit transaction (no decryption)
    submitSlots: (betAmountSol: number) => Promise<SlotTransactionResult>;
    
    // Step 2: Reveal the reels (user signs to decrypt all 3)
    revealReels: (reelHandles: [string, string, string]) => Promise<[number, number, number]>;
    
    // Step 3: Set the final result (for claim functionality)
    setResult: (result: SlotResult | null) => void;
    
    // State
    isSubmitting: boolean;
    isRevealing: boolean;
    error: string | null;
    lastResult: SlotResult | null;
}

export const useSlotMachine = (): UseSlotMachineReturn => {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();
    const { signMessage } = useWallet();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRevealing, setIsRevealing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastResult, setLastResult] = useState<SlotResult | null>(null);

    // Step 1: Submit the slot machine transaction (no decryption yet)
    const submitSlots = useCallback(
        async (betAmountSol: number): Promise<SlotTransactionResult> => {
            if (!wallet) {
                throw new Error("Wallet not connected");
            }

            setIsSubmitting(true);
            setError(null);

            try {
                const program = getProgram(connection, wallet);
                const betAmount = Math.floor(betAmountSol * 1_000_000_000);
                const seed = BigInt(Date.now());

                // Derive PDAs
                const [adminPda] = getAdminPda(ADMIN_AUTHORITY);
                const [casinoVaultPda] = getCasinoVaultPda(adminPda);
                const [gamePda] = getGamePda("slot", wallet.publicKey, seed);

                // Simulate
                console.log("Simulating slot machine transaction...");
                const txForSim = await program.methods
                    .playSlot(new BN(seed.toString()), new BN(betAmount))
                    .accounts({
                        player: wallet.publicKey,
                        admin: adminPda,
                        casinoVault: casinoVaultPda,
                        game: gamePda,
                        incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                    } as any)
                    .transaction();

                const { blockhash } = await connection.getLatestBlockhash();
                txForSim.recentBlockhash = blockhash;
                txForSim.feePayer = wallet.publicKey;

                const sim = await connection.simulateTransaction(txForSim);
                if (sim.value.err) {
                    throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}`);
                }

                const { payoutHandle, randomHandles } = getHandlesFromSimulationLogs(sim.value.logs);
                console.log("Simulated payout:", payoutHandle?.toString());
                console.log("Simulated reels:", randomHandles.map(h => h?.toString()));

                const remainingAccounts = buildAllowanceAccounts(payoutHandle, randomHandles, wallet.publicKey);

                // Execute
                console.log("Executing slot machine transaction...");
                const txSignature = await program.methods
                    .playSlot(new BN(seed.toString()), new BN(betAmount))
                    .accounts({
                        player: wallet.publicKey,
                        admin: adminPda,
                        casinoVault: casinoVaultPda,
                        game: gamePda,
                        incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                    } as any)
                    .remainingAccounts(remainingAccounts)
                    .rpc();

                console.log("Slot tx:", txSignature);

                // Wait for confirmation and fetch game state
                await new Promise((resolve) => setTimeout(resolve, 2000));
                const gameAccount = await (program.account as any).gameResult.fetch(gamePda);

                // Wait for Inco network to sync allowance
                await new Promise((resolve) => setTimeout(resolve, 2000));

                const result: SlotTransactionResult = {
                    txSignature,
                    gamePda: gamePda.toBase58(),
                    reelHandles: [
                        gameAccount.randomHandles[0].toString(),
                        gameAccount.randomHandles[1].toString(),
                        gameAccount.randomHandles[2].toString(),
                    ],
                    payoutHandle: gameAccount.payoutHandle.toString(),
                };

                setIsSubmitting(false);
                return result;
            } catch (err: any) {
                console.error("Slot submission error:", err);
                setError(err.message || "Failed to submit slots");
                setIsSubmitting(false);
                throw err;
            }
        },
        [connection, wallet]
    );

    // Step 2: Reveal the reels (requires user signature - decrypts all 3)
    const revealReels = useCallback(
        async (reelHandles: [string, string, string]): Promise<[number, number, number]> => {
            if (!wallet || !signMessage) {
                throw new Error("Wallet not connected");
            }

            setIsRevealing(true);
            setError(null);

            try {
                console.log("Decrypting reels...");
                const reels: [number, number, number] = [0, 0, 0];
                
                for (let i = 0; i < 3; i++) {
                    const reelDecrypt = await decryptHandle(reelHandles[i], wallet, signMessage);
                    if (!reelDecrypt) {
                        throw new Error(`Failed to decrypt reel ${i + 1}`);
                    }
                    reels[i] = parseInt(reelDecrypt.plaintext, 10) % 10;
                    console.log(`Reel ${i + 1} decrypted:`, reels[i]);
                }

                setIsRevealing(false);
                return reels;
            } catch (err: any) {
                console.error("Reveal reels error:", err);
                setError(err.message || "Failed to reveal reels");
                setIsRevealing(false);
                throw err;
            }
        },
        [wallet, signMessage]
    );

    // Set result (called by component after reveal)
    const setResult = useCallback((result: SlotResult | null) => {
        setLastResult(result);
    }, []);

    return { submitSlots, revealReels, setResult, isSubmitting, isRevealing, error, lastResult };
};

export default useSlotMachine;
