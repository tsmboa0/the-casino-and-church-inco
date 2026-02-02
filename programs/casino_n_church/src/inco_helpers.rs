use anchor_lang::prelude::*;
use inco_lightning::{
    cpi::{self, accounts::Operation},
    types::Euint128,
};

/// Generate bounded random: 0 to (max-1)
/// Example: generate_bounded_random(inco, signer, 37) -> 0-36 for roulette
pub fn generate_bounded_random<'a>(
    inco: AccountInfo<'a>,
    signer: AccountInfo<'a>,
    max: u128,
) -> Result<Euint128> {
    // Generate encrypted random
    let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
    let raw = cpi::e_rand(cpi_ctx, 0)?;
    
    // Create encrypted max value
    let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
    let max_val = cpi::as_euint128(cpi_ctx, max)?;
    
    // random % max gives 0 to (max-1)
    let cpi_ctx = CpiContext::new(inco, Operation { signer });
    cpi::e_rem(cpi_ctx, raw, max_val, 0)
}


/// Parse plaintext bytes to u64 (from Inco decryption result)
pub fn parse_plaintext_to_u64(plaintext: &[u8]) -> Result<u64> {
    if plaintext.is_empty() {
        return Ok(0);
    }
    
    // Inco returns u128 in little-endian format
    // We extract the lower 8 bytes for u64
    if plaintext.len() >= 8 {
        let mut bytes = [0u8; 8];
        bytes.copy_from_slice(&plaintext[..8]);
        Ok(u64::from_le_bytes(bytes))
    } else {
        // Pad with zeros if less than 8 bytes
        let mut bytes = [0u8; 8];
        bytes[..plaintext.len()].copy_from_slice(plaintext);
        Ok(u64::from_le_bytes(bytes))
    }
}

/// Parse plaintext boolean (for Ebool decryption)
pub fn parse_plaintext_to_bool(plaintext: &[u8]) -> bool {
    !plaintext.is_empty() && plaintext.iter().any(|&b| b != 0)
}
