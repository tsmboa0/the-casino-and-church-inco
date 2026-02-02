use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};
use inco_lightning::{
    cpi::{self, accounts::{Allow, Operation}},
    program::IncoLightning,
    types::{Euint128, Ebool},
    ID as INCO_LIGHTNING_ID,
};

use crate::{
    errors::CasinoError,
    inco_helpers::generate_bounded_random,
    states::{GameResult, GameType},
};

const HOUSE_EDGE_BPS: u64 = 150;
const BPS: u64 = 10_000;
const MIN_BET_LAMPORTS: u64 = 10_000_000;
const MAX_BET_LAMPORTS: u64 = 10_000_000_000;
const MAX_MULTIPLIER_BPS: u32 = 100000; // 10x max

#[derive(Accounts)]
#[instruction(seed: u128)]
pub struct PlayAviator<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    
    /// CHECK: Admin authority
    pub admin: UncheckedAccount<'info>,
    
    #[account(mut, seeds = [b"casino_vault", admin.key().as_ref()], bump)]
    pub casino_vault: SystemAccount<'info>,
    
    #[account(
        init,
        payer = player,
        space = 8 + GameResult::INIT_SPACE,
        seeds = [b"game_aviator", player.key().as_ref(), seed.to_le_bytes().as_ref()],
        bump
    )]
    pub game: Account<'info, GameResult>,
    
    #[account(address = INCO_LIGHTNING_ID)]
    pub inco_lightning_program: Program<'info, IncoLightning>,
    
    pub system_program: Program<'info, System>,
}

fn apply_house_edge(amount: u64) -> u64 {
    let edge = amount.saturating_mul(HOUSE_EDGE_BPS) / BPS;
    amount.saturating_sub(edge)
}

impl<'info> PlayAviator<'info> {
    pub fn play(
        ctx: Context<'_, '_, '_, 'info, PlayAviator<'info>>,
        seed: u128,
        encrypted_target_multiplier: Vec<u8>,
        amount: u64,
    ) -> Result<()> {
        require!(amount >= MIN_BET_LAMPORTS, CasinoError::MinimumBet);
        require!(amount <= MAX_BET_LAMPORTS, CasinoError::MaximumBet);
        
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: ctx.accounts.casino_vault.to_account_info(),
                },
            ),
            amount,
        )?;
        
        let inco = ctx.accounts.inco_lightning_program.to_account_info();
        let signer = ctx.accounts.player.to_account_info();
        
        // Encrypt target multiplier
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let target: Euint128 = cpi::new_euint128(cpi_ctx, encrypted_target_multiplier, 0)?;
        
        // Crash point: random in [10000, 100000] BPS (1.00x to 10.00x)
        let crash_range = generate_bounded_random(inco.clone(), signer.clone(), 90000)?;
        
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let base_crash = cpi::as_euint128(cpi_ctx, 10000u128)?;
        
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let crash_point: Euint128 = cpi::e_add(cpi_ctx, crash_range, base_crash, 0)?;
        
        // Win if crash_point >= target
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let is_winner: Ebool = cpi::e_ge(cpi_ctx, crash_point, target, 0)?;
        
        // Max payout (simplified - actual would need FHE multiplication)
        let max_payout = apply_house_edge(amount.saturating_mul(MAX_MULTIPLIER_BPS as u64) / BPS);
        
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let payout_enc = cpi::as_euint128(cpi_ctx, max_payout as u128)?;
        
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let zero = cpi::as_euint128(cpi_ctx, 0u128)?;
        
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let payout = cpi::e_select(cpi_ctx, is_winner, payout_enc, zero, 0)?;
        
        // Log handles BEFORE allowance (so simulation can capture them)
        msg!("Payout handle: {}", payout.0);
        msg!("Crash point handle: {}", crash_point.0);
        
        // Grant decrypt for BOTH payout and crash point
        if ctx.remaining_accounts.len() >= 4 {
            // Allow payout handle
            cpi::allow(
                CpiContext::new(
                    inco.clone(),
                    Allow {
                        allowance_account: ctx.remaining_accounts[0].clone(),
                        signer: signer.clone(),
                        allowed_address: ctx.remaining_accounts[1].clone(),
                        system_program: ctx.accounts.system_program.to_account_info(),
                    },
                ),
                payout.0,
                true,
                ctx.accounts.player.key(),
            )?;
            
            // Allow crash_point handle for verification
            cpi::allow(
                CpiContext::new(
                    inco.clone(),
                    Allow {
                        allowance_account: ctx.remaining_accounts[2].clone(),
                        signer: signer.clone(),
                        allowed_address: ctx.remaining_accounts[3].clone(),
                        system_program: ctx.accounts.system_program.to_account_info(),
                    },
                ),
                crash_point.0,
                true,
                ctx.accounts.player.key(),
            )?;
        }
        
        ctx.accounts.game.set_inner(GameResult {
            player: ctx.accounts.player.key(),
            game_type: GameType::Aviator { target_multiplier_bps: 0 },
            seed,
            bet_amount: amount,
            slot: Clock::get()?.slot,
            choice_handle: target.0,
            payout_handle: payout.0,
            random_handles: [crash_point.0, 0, 0, 0],  // Only 1 random result
            claimed: false,
            bump: ctx.bumps.game,
        });
        
        Ok(())
    }
}
