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

export type CoinSide = "heads" | "tails";

// Transaction result - returned immediately after on-chain submission
export interface CoinflipTransactionResult {
    txSignature: string;
    gamePda: string;
    flipHandle: string;      // Handle to decrypt the flip result
    payoutHandle: string;    // Handle to decrypt the payout amount
}

// Full result after reveals
export interface CoinflipResult {
    isWin: boolean;
    flipResult: CoinSide;
    payout: number; // in lamports
    txSignature: string;
    gamePda: string;
    payoutHandle?: string;
}

export interface UseCoinflipReturn {
    // Step 1: Submit transaction (no decryption)
    submitCoinflip: (
        choice: CoinSide,
        betAmountSol: number
    ) => Promise<CoinflipTransactionResult>;
    
    // Step 2: Reveal the flip result (user signs to decrypt)
    revealFlipResult: (flipHandle: string) => Promise<CoinSide>;
    
    // Step 3: Reveal the payout amount (user signs to decrypt)
    revealPayout: (payoutHandle: string) => Promise<number>;
    
    // Step 4: Set the final result (for claim functionality)
    setResult: (result: CoinflipResult | null) => void;
    
    // State
    isSubmitting: boolean;
    isRevealingResult: boolean;
    isRevealingPayout: boolean;
    error: string | null;
    lastResult: CoinflipResult | null;
}

export const useCoinflip = (): UseCoinflipReturn => {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();
    const { signMessage } = useWallet();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRevealingResult, setIsRevealingResult] = useState(false);
    const [isRevealingPayout, setIsRevealingPayout] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastResult, setLastResult] = useState<CoinflipResult | null>(null);

    // Step 1: Submit the coinflip transaction (no decryption yet)
    const submitCoinflip = useCallback(
        async (choice: CoinSide, betAmountSol: number): Promise<CoinflipTransactionResult> => {
            if (!wallet) {
                throw new Error("Wallet not connected");
            }

            setIsSubmitting(true);
            setError(null);

            try {
                const program = getProgram(connection, wallet);
                const betAmount = Math.floor(betAmountSol * 1_000_000_000);
                const seed = BigInt(Date.now());

                // Encrypt choice (0 = heads, 1 = tails)
                const choiceValue = choice === "heads" ? 0 : 1;
                const encryptedChoice = await encryptValue(BigInt(choiceValue));

                // Derive PDAs
                const [adminPda] = getAdminPda(ADMIN_AUTHORITY);
                const [casinoVaultPda] = getCasinoVaultPda(adminPda);
                const [gamePda] = getGamePda("coinflip", wallet.publicKey, seed);

                // Simulate to get handles
                console.log("Simulating coinflip transaction...");
                const txForSim = await program.methods
                    .playCoinflip(
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
                console.log("Simulated payout handle:", payoutHandle?.toString());
                console.log("Simulated flip handle:", randomHandles[0]?.toString());

                // Build allowance accounts
                const remainingAccounts = buildAllowanceAccounts(
                    payoutHandle,
                    randomHandles,
                    wallet.publicKey
                );

                // Execute transaction
                console.log("Executing coinflip transaction...");
                const txSignature = await program.methods
                    .playCoinflip(
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

                console.log("Coinflip tx:", txSignature);

                // Wait for confirmation and fetch game state
                await new Promise((resolve) => setTimeout(resolve, 2000));
                const gameAccount = await (program.account as any).gameResult.fetch(gamePda);
                
                // Wait for Inco network to sync allowance
                await new Promise((resolve) => setTimeout(resolve, 2000));

                const result: CoinflipTransactionResult = {
                    txSignature,
                    gamePda: gamePda.toBase58(),
                    flipHandle: gameAccount.randomHandles[0].toString(),
                    payoutHandle: gameAccount.payoutHandle.toString(),
                };

                setIsSubmitting(false);
                return result;
            } catch (err: any) {
                console.error("Coinflip submission error:", err);
                setError(err.message || "Failed to submit coinflip");
                setIsSubmitting(false);
                throw err;
            }
        },
        [connection, wallet]
    );

    // Step 2: Reveal the flip result (requires user signature)
    const revealFlipResult = useCallback(
        async (flipHandle: string): Promise<CoinSide> => {
            if (!wallet || !signMessage) {
                throw new Error("Wallet not connected");
            }

            setIsRevealingResult(true);
            setError(null);

            try {
                console.log("Decrypting flip result...");
                const flipResultDecrypt = await decryptHandle(flipHandle, wallet, signMessage);
                
                if (!flipResultDecrypt) {
                    throw new Error("Failed to decrypt flip result");
                }

                console.log("Flip result decrypted:", flipResultDecrypt.plaintext);
                const flipValue = parseInt(flipResultDecrypt.plaintext, 10);
                const flipResult: CoinSide = flipValue === 0 ? "heads" : "tails";

                setIsRevealingResult(false);
                return flipResult;
            } catch (err: any) {
                console.error("Reveal flip result error:", err);
                setError(err.message || "Failed to reveal result");
                setIsRevealingResult(false);
                throw err;
            }
        },
        [wallet, signMessage]
    );

    // Step 3: Reveal the payout amount (requires user signature)
    const revealPayout = useCallback(
        async (payoutHandle: string): Promise<number> => {
            if (!wallet || !signMessage) {
                throw new Error("Wallet not connected");
            }

            setIsRevealingPayout(true);
            setError(null);

            try {
                console.log("Decrypting payout...");
                const payoutResult = await decryptHandle(payoutHandle, wallet, signMessage);
                
                if (!payoutResult) {
                    throw new Error("Failed to decrypt payout");
                }

                console.log("Payout decrypted:", payoutResult.plaintext);
                const payout = parseInt(payoutResult.plaintext, 10);

                setIsRevealingPayout(false);
                return payout;
            } catch (err: any) {
                console.error("Reveal payout error:", err);
                setError(err.message || "Failed to reveal payout");
                setIsRevealingPayout(false);
                throw err;
            }
        },
        [wallet, signMessage]
    );

    // Set result (called by component after reveal)
    const setResult = useCallback((result: CoinflipResult | null) => {
        setLastResult(result);
    }, []);

    return {
        submitCoinflip,
        revealFlipResult,
        revealPayout,
        setResult,
        isSubmitting,
        isRevealingResult,
        isRevealingPayout,
        error,
        lastResult,
    };
};

export default useCoinflip;
