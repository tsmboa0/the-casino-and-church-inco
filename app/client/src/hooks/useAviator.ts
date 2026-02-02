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
import { encryptValue, hexToBuffer, decryptHandle } from "../lib/program/inco";

// Transaction result - returned after on-chain submission
export interface AviatorTransactionResult {
    txSignature: string;
    gamePda: string;
    crashHandle: string;     // Handle to decrypt the crash multiplier
    payoutHandle: string;    // Handle to decrypt the payout amount
    targetMultiplier: number; // Store for reference
}

export interface AviatorResult {
    isWin: boolean;
    crashMultiplier: number; // e.g., 1.5, 2.3, etc.
    targetMultiplier: number; // What player targeted
    payout: number; // in lamports
    txSignature: string;
    gamePda: string;
    payoutHandle?: string;
}

export interface UseAviatorReturn {
    // Step 1: Submit transaction (no decryption)
    submitAviator: (
        targetMultiplier: number,
        betAmountSol: number
    ) => Promise<AviatorTransactionResult>;
    
    // Step 2: Reveal the crash multiplier (user signs to decrypt)
    revealCrashMultiplier: (crashHandle: string) => Promise<number>;
    
    // Step 3: Set the final result (for claim functionality)
    setResult: (result: AviatorResult | null) => void;
    
    // State
    isSubmitting: boolean;
    isRevealing: boolean;
    error: string | null;
    lastResult: AviatorResult | null;
}

// Convert multiplier to BPS (2.0x -> 20000)
const multiplierToBps = (multiplier: number): number => Math.floor(multiplier * 10000);

// Convert BPS to multiplier (20000 -> 2.0x)
const bpsToMultiplier = (bps: number): number => bps / 10000;

export const useAviator = (): UseAviatorReturn => {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();
    const { signMessage } = useWallet();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRevealing, setIsRevealing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastResult, setLastResult] = useState<AviatorResult | null>(null);

    // Step 1: Submit the aviator transaction (no decryption yet)
    const submitAviator = useCallback(
        async (targetMultiplier: number, betAmountSol: number): Promise<AviatorTransactionResult> => {
            if (!wallet) {
                throw new Error("Wallet not connected");
            }

            if (targetMultiplier < 1.01) {
                throw new Error("Target multiplier must be at least 1.01x");
            }

            setIsSubmitting(true);
            setError(null);

            try {
                const program = getProgram(connection, wallet);
                const betAmount = Math.floor(betAmountSol * 1_000_000_000);
                const seed = BigInt(Date.now());

                // Encrypt target multiplier in BPS
                const targetBps = multiplierToBps(targetMultiplier);
                const encryptedTarget = await encryptValue(BigInt(targetBps));

                // Derive PDAs
                const [adminPda] = getAdminPda(ADMIN_AUTHORITY);
                const [casinoVaultPda] = getCasinoVaultPda(adminPda);
                const [gamePda] = getGamePda("aviator", wallet.publicKey, seed);

                // Simulate
                console.log("Simulating aviator transaction...");
                console.log("Target multiplier:", targetMultiplier, "x (", targetBps, "BPS)");

                const txForSim = await program.methods
                    .playAviator(
                        new BN(seed.toString()),
                        hexToBuffer(encryptedTarget),
                        new BN(betAmount)
                    )
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
                const remainingAccounts = buildAllowanceAccounts(payoutHandle, randomHandles, wallet.publicKey);

                // Execute
                console.log("Executing aviator transaction...");
                const txSignature = await program.methods
                    .playAviator(
                        new BN(seed.toString()),
                        hexToBuffer(encryptedTarget),
                        new BN(betAmount)
                    )
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

                console.log("Aviator tx:", txSignature);

                // Wait for confirmation and fetch game state
                await new Promise((resolve) => setTimeout(resolve, 2000));
                const gameAccount = await (program.account as any).gameResult.fetch(gamePda);

                // Wait for Inco network to sync allowance
                await new Promise((resolve) => setTimeout(resolve, 2000));

                const result: AviatorTransactionResult = {
                    txSignature,
                    gamePda: gamePda.toBase58(),
                    crashHandle: gameAccount.randomHandles[0].toString(),
                    payoutHandle: gameAccount.payoutHandle.toString(),
                    targetMultiplier,
                };

                setIsSubmitting(false);
                return result;
            } catch (err: any) {
                console.error("Aviator submission error:", err);
                setError(err.message || "Failed to submit aviator");
                setIsSubmitting(false);
                throw err;
            }
        },
        [connection, wallet]
    );

    // Step 2: Reveal the crash multiplier (requires user signature)
    const revealCrashMultiplier = useCallback(
        async (crashHandle: string): Promise<number> => {
            if (!wallet || !signMessage) {
                throw new Error("Wallet not connected");
            }

            setIsRevealing(true);
            setError(null);

            try {
                console.log("Decrypting crash multiplier...");
                const crashDecrypt = await decryptHandle(crashHandle, wallet, signMessage);
                
                if (!crashDecrypt) {
                    throw new Error("Failed to decrypt crash multiplier");
                }

                const crashBps = parseInt(crashDecrypt.plaintext, 10);
                const crashMultiplier = bpsToMultiplier(crashBps);
                console.log("Crash multiplier decrypted:", crashMultiplier, "x");

                setIsRevealing(false);
                return crashMultiplier;
            } catch (err: any) {
                console.error("Reveal crash multiplier error:", err);
                setError(err.message || "Failed to reveal result");
                setIsRevealing(false);
                throw err;
            }
        },
        [wallet, signMessage]
    );

    // Set result (called by component after reveal)
    const setResult = useCallback((result: AviatorResult | null) => {
        setLastResult(result);
    }, []);

    return { submitAviator, revealCrashMultiplier, setResult, isSubmitting, isRevealing, error, lastResult };
};

export default useAviator;
