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
export interface RouletteTransactionResult {
    txSignature: string;
    gamePda: string;
    spinHandle: string;      // Handle to decrypt the spin result
    payoutHandle: string;    // Handle to decrypt the payout amount
}

export interface RouletteResult {
    isWin: boolean;
    spinResult: number; // 0-36
    payout: number; // in lamports
    txSignature: string;
    gamePda: string;
    payoutHandle?: string;
}

export interface UseRouletteReturn {
    // Step 1: Submit transaction (no decryption)
    submitRoulette: (
        chosenNumber: number,
        betAmountSol: number
    ) => Promise<RouletteTransactionResult>;
    
    // Step 2: Reveal the spin result (user signs to decrypt)
    revealSpinResult: (spinHandle: string) => Promise<number>;
    
    // Step 3: Set the final result (for claim functionality)
    setResult: (result: RouletteResult | null) => void;
    
    // State
    isSubmitting: boolean;
    isRevealing: boolean;
    error: string | null;
    lastResult: RouletteResult | null;
}

export const useRoulette = (): UseRouletteReturn => {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();
    const { signMessage } = useWallet();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRevealing, setIsRevealing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastResult, setLastResult] = useState<RouletteResult | null>(null);

    // Step 1: Submit the roulette transaction (no decryption yet)
    const submitRoulette = useCallback(
        async (chosenNumber: number, betAmountSol: number): Promise<RouletteTransactionResult> => {
            if (!wallet) {
                throw new Error("Wallet not connected");
            }

            if (chosenNumber < 0 || chosenNumber > 36) {
                throw new Error("Number must be between 0 and 36");
            }

            setIsSubmitting(true);
            setError(null);

            try {
                const program = getProgram(connection, wallet);
                const betAmount = Math.floor(betAmountSol * 1_000_000_000);
                const seed = BigInt(Date.now());

                // Encrypt choice (number 0-36)
                const encryptedChoice = await encryptValue(BigInt(chosenNumber));

                // Derive PDAs
                const [adminPda] = getAdminPda(ADMIN_AUTHORITY);
                const [casinoVaultPda] = getCasinoVaultPda(adminPda);
                const [gamePda] = getGamePda("roulette", wallet.publicKey, seed);

                // Simulate
                console.log("Simulating roulette transaction...");
                const txForSim = await program.methods
                    .playRoulette(
                        new BN(seed.toString()),
                        hexToBuffer(encryptedChoice),
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
                console.log("Executing roulette transaction...");
                const txSignature = await program.methods
                    .playRoulette(
                        new BN(seed.toString()),
                        hexToBuffer(encryptedChoice),
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

                console.log("Roulette tx:", txSignature);

                // Wait for confirmation and fetch game state
                await new Promise((resolve) => setTimeout(resolve, 2000));
                const gameAccount = await (program.account as any).gameResult.fetch(gamePda);

                // Wait for Inco network to sync allowance
                await new Promise((resolve) => setTimeout(resolve, 2000));

                const result: RouletteTransactionResult = {
                    txSignature,
                    gamePda: gamePda.toBase58(),
                    spinHandle: gameAccount.randomHandles[0].toString(),
                    payoutHandle: gameAccount.payoutHandle.toString(),
                };

                setIsSubmitting(false);
                return result;
            } catch (err: any) {
                console.error("Roulette submission error:", err);
                setError(err.message || "Failed to submit roulette");
                setIsSubmitting(false);
                throw err;
            }
        },
        [connection, wallet]
    );

    // Step 2: Reveal the spin result (requires user signature)
    const revealSpinResult = useCallback(
        async (spinHandle: string): Promise<number> => {
            if (!wallet || !signMessage) {
                throw new Error("Wallet not connected");
            }

            setIsRevealing(true);
            setError(null);

            try {
                console.log("Decrypting spin result...");
                const spinDecrypt = await decryptHandle(spinHandle, wallet, signMessage);
                
                if (!spinDecrypt) {
                    throw new Error("Failed to decrypt spin result");
                }

                console.log("Spin result decrypted:", spinDecrypt.plaintext);
                const spinResult = parseInt(spinDecrypt.plaintext, 10);

                setIsRevealing(false);
                return spinResult;
            } catch (err: any) {
                console.error("Reveal spin result error:", err);
                setError(err.message || "Failed to reveal result");
                setIsRevealing(false);
                throw err;
            }
        },
        [wallet, signMessage]
    );

    // Set result (called by component after reveal)
    const setResult = useCallback((result: RouletteResult | null) => {
        setLastResult(result);
    }, []);

    return { submitRoulette, revealSpinResult, setResult, isSubmitting, isRevealing, error, lastResult };
};

export default useRoulette;
