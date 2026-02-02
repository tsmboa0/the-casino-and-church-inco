import { useState, useCallback } from "react";
import { useConnection, useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { SystemProgram, Transaction, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import {
    getProgram,
    getAdminPda,
    getCasinoVaultPda,
    getLpVaultPda,
    INCO_LIGHTNING_PROGRAM_ID,
    ADMIN_AUTHORITY,
} from "../lib/program/constants";
import { handleToBuffer, plaintextToBuffer, decryptHandle } from "../lib/program/inco";

export interface ClaimResult {
    success: boolean;
    amount: number; // in lamports
    txSignature: string;
}

export interface UseClaimRewardsReturn {
    // Combined function (decrypt + claim in one) - for backward compatibility
    claimRewards: (
        gamePda: string,
        payoutHandle: string
    ) => Promise<ClaimResult>;
    
    // Separate claim function - receives already decrypted plaintext
    // Used by ClaimRewardsModal which handles decryption separately
    submitClaim: (
        gamePda: string,
        payoutHandle: string,
        plaintext: string,
        ed25519Instructions: any[]
    ) => Promise<ClaimResult>;
    
    isClaiming: boolean;
    error: string | null;
}

export const useClaimRewards = (): UseClaimRewardsReturn => {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();
    const { signMessage } = useWallet();
    const [isClaiming, setIsClaiming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Submit claim transaction with already decrypted data
    const submitClaim = useCallback(
        async (
            gamePdaStr: string,
            payoutHandle: string,
            plaintext: string,
            ed25519Instructions: any[]
        ): Promise<ClaimResult> => {
            if (!wallet) {
                throw new Error("Wallet not connected");
            }

            setIsClaiming(true);
            setError(null);

            try {
                const program = getProgram(connection, wallet);
                const { PublicKey } = await import("@solana/web3.js");
                const gamePda = new PublicKey(gamePdaStr);

                const amount = parseInt(plaintext, 10);
                if (amount === 0) {
                    throw new Error("No winnings to claim");
                }

                console.log("Claiming", amount, "lamports");

                // Derive PDAs
                const [adminPda] = getAdminPda(ADMIN_AUTHORITY);
                const [casinoVaultPda] = getCasinoVaultPda(adminPda);
                const [lpVaultPda] = getLpVaultPda(adminPda);

                // Build claim instruction
                const claimIx = await program.methods
                    .claimRewards(
                        handleToBuffer(payoutHandle),
                        plaintextToBuffer(plaintext)
                    )
                    .accounts({
                        player: wallet.publicKey,
                        admin: adminPda,
                        casinoVault: casinoVaultPda,
                        lpVault: lpVaultPda,
                        game: gamePda,
                        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
                        incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                    } as any)
                    .instruction();

                // Build transaction with Ed25519 pre-instructions
                const tx = new Transaction();
                ed25519Instructions.forEach((ix: any) => tx.add(ix));
                tx.add(claimIx);

                const { blockhash } = await connection.getLatestBlockhash();
                tx.recentBlockhash = blockhash;
                tx.feePayer = wallet.publicKey;

                // Sign and send
                const signedTx = await wallet.signTransaction(tx);
                const txSignature = await connection.sendRawTransaction(signedTx.serialize());
                await connection.confirmTransaction(txSignature, "confirmed");

                console.log("Claimed:", txSignature);

                setIsClaiming(false);
                return {
                    success: true,
                    amount,
                    txSignature,
                };
            } catch (err: any) {
                console.error("Claim error:", err);
                setError(err.message || "Failed to claim rewards");
                setIsClaiming(false);
                throw err;
            }
        },
        [connection, wallet]
    );

    // Combined function - decrypt + claim (for backward compatibility)
    const claimRewards = useCallback(
        async (gamePdaStr: string, payoutHandle: string): Promise<ClaimResult> => {
            if (!wallet || !signMessage) {
                throw new Error("Wallet not connected");
            }

            setIsClaiming(true);
            setError(null);

            try {
                // Decrypt to get plaintext with Ed25519 signature
                console.log("Decrypting payout handle for claim...");
                const result = await decryptHandle(payoutHandle, wallet, signMessage);
                if (!result) {
                    throw new Error("Failed to decrypt payout");
                }

                // Now submit the claim
                return await submitClaim(
                    gamePdaStr,
                    payoutHandle,
                    result.plaintext,
                    result.ed25519Instructions
                );
            } catch (err: any) {
                console.error("Claim error:", err);
                setError(err.message || "Failed to claim rewards");
                setIsClaiming(false);
                throw err;
            }
        },
        [wallet, signMessage, submitClaim]
    );

    return { claimRewards, submitClaim, isClaiming, error };
};

export default useClaimRewards;
