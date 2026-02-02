// Re-export Inco SDK utilities for easy access
export { encryptValue } from "@inco/solana-sdk/encryption";
export { decrypt } from "@inco/solana-sdk/attested-decrypt";
export {
    hexToBuffer,
    handleToBuffer,
    plaintextToBuffer,
} from "@inco/solana-sdk/utils";

// Helper to decrypt a handle and return the result
import { decrypt } from "@inco/solana-sdk/attested-decrypt";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import type { Connection } from "@solana/web3.js";

export interface DecryptResult {
    plaintext: string;
    ed25519Instructions: any[];
}

export const decryptHandle = async (
    handle: string,
    wallet: AnchorWallet,
    signMessage: any
): Promise<DecryptResult | null> => {
    try {
        const result = await decrypt([handle], {
            address: wallet.publicKey,
            signMessage: signMessage,
        })

        // Extract plaintext from result (SDK may return different formats)
        // const plaintext = typeof result === 'object' && 'plaintext' in result
        //     ? String(result.plaintext)
        //     : String(result);

        const plaintext = result.plaintexts?.[0] ?? "0";

        const ed25519Instructions = typeof result === 'object' && 'ed25519Instructions' in result
            ? (result as any).ed25519Instructions
            : [];

        return { plaintext, ed25519Instructions };
    } catch (error) {
        console.error("Decryption failed:", error);
        return null;
    }
};
