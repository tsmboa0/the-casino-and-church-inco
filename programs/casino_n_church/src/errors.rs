use anchor_lang::prelude::*;

#[error_code]
pub enum CasinoError {
    #[msg("Bump error")]
    BumpError,
    #[msg("Overflow")]
    Overflow,
    #[msg("Minimum bet too low")]
    MinimumBet,
    #[msg("Maximum bet exceeded")]
    MaximumBet,
    #[msg("Invalid bet type")]
    InvalidBetType,
    #[msg("Invalid bet choice")]
    InvalidBetChoice,
    #[msg("Timeout not yet reached")]
    TimeoutNotReached,
    #[msg("Ed25519 Program Error")]
    Ed25519Program,
    #[msg("Ed25519 Accounts Error")]
    Ed25519Accounts,
    #[msg("Ed25519 Data Length Error")]
    Ed25519DataLength,
    #[msg("Ed25519 Signature Error")]
    Ed25519Signature,
    #[msg("Ed25519 Pubkey Error")]
    Ed25519Pubkey,
    #[msg("Ed25519 Message Error")]
    Ed25519Message,
    #[msg("Instruction Sysvar Not Found")]
    InstructionSysvarNotFound,
    #[msg("Game not yet resolved")]
    GameNotResolved,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Invalid decryption proof")]
    InvalidDecryptionProof,
    #[msg("Insufficient vault funds")]
    InsufficientVaultFunds,
    #[msg("Invalid payout amount")]
    InvalidPayoutAmount,
}
