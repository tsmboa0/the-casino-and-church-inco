use anchor_lang::prelude::*;

pub mod instructions;
pub mod states;
pub mod errors;
pub mod inco_helpers;

pub use instructions::*;
pub use states::*;
pub use errors::*;
pub use inco_helpers::*;

declare_id!("F9wygaMhPNWmCd6MMtZg7orv6ZkvuF4ycWopZ9cjq3Nc");

#[program]
pub mod casino_n_church {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>, amount: u64) -> Result<()> {
        ctx.accounts.init(amount, &ctx.bumps)
    }

    pub fn lp_deposit(ctx: Context<LpDeposit>, amount: u64) -> Result<()> {
        ctx.accounts.process_deposit(&ctx.bumps, amount)
    }

    pub fn lp_withdraw(ctx: Context<LpWithdraw>, amount: u64) -> Result<()> {
        ctx.accounts.process_withdraw(&ctx.bumps, amount)
    }

    // =========================================================================
    // INCO-INTEGRATED CASINO GAMES (Privacy-Preserving)
    // =========================================================================

    /// Play coinflip with encrypted choice
    pub fn play_coinflip<'info>(
        ctx: Context<'_, '_, '_, 'info, PlayCoinflip<'info>>,
        seed: u128,
        encrypted_choice: Vec<u8>,
        amount: u64,
    ) -> Result<()> {
        PlayCoinflip::play(ctx, seed, encrypted_choice, amount)
    }

    /// Play roulette - straight bet on number 0-36
    pub fn play_roulette<'info>(
        ctx: Context<'_, '_, '_, 'info, PlayRoulette<'info>>,
        seed: u128,
        encrypted_choice: Vec<u8>,  // Number 0-36 (encrypted)
        amount: u64,
    ) -> Result<()> {
        PlayRoulette::play(ctx, seed, encrypted_choice, amount)
    }

    /// Play slot machine (encrypted reels)
    pub fn play_slot<'info>(
        ctx: Context<'_, '_, '_, 'info, PlaySlot<'info>>,
        seed: u128,
        amount: u64,
    ) -> Result<()> {
        PlaySlot::play(ctx, seed, amount)
    }

    /// Play aviator with encrypted target multiplier
    pub fn play_aviator<'info>(
        ctx: Context<'_, '_, '_, 'info, PlayAviator<'info>>,
        seed: u128,
        encrypted_target_multiplier: Vec<u8>,
        amount: u64,
    ) -> Result<()> {
        PlayAviator::play(ctx, seed, encrypted_target_multiplier, amount)
    }

    /// Claim rewards with on-chain verification (unified)
    pub fn claim_rewards(
        ctx: Context<ClaimRewards>,
        handle: Vec<u8>,
        plaintext: Vec<u8>,
    ) -> Result<()> {
        ClaimRewards::claim(ctx, handle, plaintext)
    }
}
