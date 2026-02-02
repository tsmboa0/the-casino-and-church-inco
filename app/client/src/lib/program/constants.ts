import { PublicKey, Connection } from "@solana/web3.js";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { AnchorWallet } from "@solana/wallet-adapter-react";
import idl from "./idl.json";

// Program IDs
export const PROGRAM_ID = new PublicKey("F9wygaMhPNWmCd6MMtZg7orv6ZkvuF4ycWopZ9cjq3Nc");
export const INCO_LIGHTNING_PROGRAM_ID = new PublicKey(
    "5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj"
);

// PDA seeds
export const ADMIN_SEED = "admin";
export const CASINO_VAULT_SEED = "casino_vault";
export const LP_VAULT_SEED = "lp_vault";

// Game-specific seeds
export const GAME_SEEDS = {
    coinflip: "game_coinflip",
    roulette: "game_roulette",
    slot: "game_slot",
    aviator: "game_aviator",
} as const;

// Convert bigint seed to buffer (little-endian u128)
export const seedToBuffer = (seed: bigint): Buffer => {
    const buf = Buffer.alloc(16);
    let s = seed;
    for (let i = 0; i < 16; i++) {
        buf[i] = Number(s & BigInt(0xff));
        s = s >> BigInt(8);
    }
    return buf;
};

// Derive Admin PDA
export const getAdminPda = (authority: PublicKey): [PublicKey, number] => {
    const authority_ = new PublicKey("8tmUuXnBRHbg8UYAPor6mDcmbzcENnu4tVz2sr7dmx9B");
    return PublicKey.findProgramAddressSync(
        [Buffer.from(ADMIN_SEED), authority.toBuffer()],
        PROGRAM_ID
    );
};

// Derive Casino Vault PDA
export const getCasinoVaultPda = (adminPda: PublicKey): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(CASINO_VAULT_SEED), adminPda.toBuffer()],
        PROGRAM_ID
    );
};

// Derive LP Vault PDA
export const getLpVaultPda = (adminPda: PublicKey): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(LP_VAULT_SEED), adminPda.toBuffer()],
        PROGRAM_ID
    );
};

// Derive Game PDA
export const getGamePda = (
    gameType: keyof typeof GAME_SEEDS,
    player: PublicKey,
    seed: bigint
): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(GAME_SEEDS[gameType]), player.toBuffer(), seedToBuffer(seed)],
        PROGRAM_ID
    );
};

// Derive Allowance PDA for Inco handle decryption
export const getAllowancePda = (
    handle: bigint,
    allowedAddress: PublicKey
): [PublicKey, number] => {
    const handleBuffer = Buffer.alloc(16);
    let h = handle;
    for (let i = 0; i < 16; i++) {
        handleBuffer[i] = Number(h & BigInt(0xff));
        h = h >> BigInt(8);
    }
    return PublicKey.findProgramAddressSync(
        [handleBuffer, allowedAddress.toBuffer()],
        INCO_LIGHTNING_PROGRAM_ID
    );
};

// Get Anchor program instance
export const getProgram = (connection: Connection, wallet: AnchorWallet) => {
    const provider = new AnchorProvider(connection, wallet, {
        commitment: "confirmed",
    });
    return new Program(idl as Idl, provider);
};

// Extract handles from simulation logs
export interface GameHandles {
    payoutHandle: bigint | null;
    randomHandles: (bigint | null)[];
}

export const getHandlesFromSimulationLogs = (
    logs: string[] | null
): GameHandles => {
    let payoutHandle: bigint | null = null;
    const randomHandles: (bigint | null)[] = [];

    if (!logs) return { payoutHandle, randomHandles };

    for (const log of logs) {
        // Payout handle
        if (log.includes("Payout handle:")) {
            const match = log.match(/Payout handle:\s*(\d+)/);
            if (match) payoutHandle = BigInt(match[1]);
        }
        // Single random (coinflip, roulette, aviator crash)
        if (
            log.includes("Random handle:") ||
            log.includes("Spin handle:") ||
            log.includes("Crash point handle:")
        ) {
            const match = log.match(/handle:\s*(\d+)/);
            if (match) randomHandles.push(BigInt(match[1]));
        }
        // Slot reels
        if (log.includes("Reel1 handle:")) {
            const match = log.match(/Reel1 handle:\s*(\d+)/);
            if (match) randomHandles.push(BigInt(match[1]));
        }
        if (log.includes("Reel2 handle:")) {
            const match = log.match(/Reel2 handle:\s*(\d+)/);
            if (match) randomHandles.push(BigInt(match[1]));
        }
        if (log.includes("Reel3 handle:")) {
            const match = log.match(/Reel3 handle:\s*(\d+)/);
            if (match) randomHandles.push(BigInt(match[1]));
        }
    }

    return { payoutHandle, randomHandles };
};

// Build remaining accounts for allowance
export const buildAllowanceAccounts = (
    payoutHandle: bigint | null,
    randomHandles: (bigint | null)[],
    playerPubkey: PublicKey
): { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] => {
    const accounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [];

    if (!payoutHandle) {
        console.log("No payout handle, returning empty accounts");
        return accounts;
    }

    // Payout allowance (2 accounts)
    const [payoutPda] = getAllowancePda(payoutHandle, playerPubkey);
    accounts.push(
        { pubkey: payoutPda, isSigner: false, isWritable: true },
        { pubkey: playerPubkey, isSigner: false, isWritable: false }
    );

    // Random handles allowance (2 accounts each)
    for (const handle of randomHandles) {
        if (handle) {
            const [randomPda] = getAllowancePda(handle, playerPubkey);
            accounts.push(
                { pubkey: randomPda, isSigner: false, isWritable: true },
                { pubkey: playerPubkey, isSigner: false, isWritable: false }
            );
        }
    }

    return accounts;
};

// Admin authority (hardcoded for now - should be fetched from config)
export const ADMIN_AUTHORITY = new PublicKey("8tmUuXnBRHbg8UYAPor6mDcmbzcENnu4tVz2sr7dmx9B");
