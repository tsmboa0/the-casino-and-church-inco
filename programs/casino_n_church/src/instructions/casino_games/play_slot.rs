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

const JACKPOT_MULTIPLIER: u64 = 50;
const SMALL_WIN_MULTIPLIER: u64 = 5;

#[derive(Accounts)]
#[instruction(seed: u128)]
pub struct PlaySlot<'info> {
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
        seeds = [b"game_slot", player.key().as_ref(), seed.to_le_bytes().as_ref()],
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

impl<'info> PlaySlot<'info> {
    pub fn play(
        ctx: Context<'_, '_, '_, 'info, PlaySlot<'info>>,
        seed: u128,
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
        
        // Generate 3 reels - each e_rand call produces a unique random value
        let reel1 = generate_bounded_random(inco.clone(), signer.clone(), 10)?;
        let reel2 = generate_bounded_random(inco.clone(), signer.clone(), 10)?;
        let reel3 = generate_bounded_random(inco.clone(), signer.clone(), 10)?;
        
        // Check matches - e_eq returns Ebool
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let match12: Ebool = cpi::e_eq(cpi_ctx, reel1, reel2, 0)?;
        
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let match23: Ebool = cpi::e_eq(cpi_ctx, reel2, reel3, 0)?;
        
        // Payout amounts
        let jackpot_amount = apply_house_edge(amount.saturating_mul(JACKPOT_MULTIPLIER));
        let small_amount = apply_house_edge(amount.saturating_mul(SMALL_WIN_MULTIPLIER));
        
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let enc_jackpot = cpi::as_euint128(cpi_ctx, jackpot_amount as u128)?;
        
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let enc_small = cpi::as_euint128(cpi_ctx, small_amount as u128)?;
        
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let zero = cpi::as_euint128(cpi_ctx, 0u128)?;
        
        // Using nested e_select for tiered payouts:
        // if match12 and match23 -> jackpot
        // elif match12 or match23 -> small win
        // else -> 0
        
        // First: if match23 then small_amount else 0
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let level3 = cpi::e_select(cpi_ctx, match23, enc_small, zero, 0)?;
        
        // Then: if match12 then (if match23 then jackpot else small_amount) else level3
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let if_match23_jackpot = cpi::e_select(cpi_ctx, match23, enc_jackpot, enc_small, 0)?;
        
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let payout = cpi::e_select(cpi_ctx, match12, if_match23_jackpot, level3, 0)?;
        
        // Log handles BEFORE allowance (so simulation can capture them)
        msg!("Payout handle: {}", payout.0);
        msg!("Reel1 handle: {}", reel1.0);
        msg!("Reel2 handle: {}", reel2.0);
        msg!("Reel3 handle: {}", reel3.0);
        
        // Grant decrypt permission for payout and all 3 reels
        // Requires 8 remaining accounts: 2 per handle (allowance PDA + player)
        if ctx.remaining_accounts.len() >= 8 {
            // Allow payout handle (accounts 0-1)
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
            
            // Allow reel1 handle (accounts 2-3)
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
                reel1.0,
                true,
                ctx.accounts.player.key(),
            )?;
            
            // Allow reel2 handle (accounts 4-5)
            cpi::allow(
                CpiContext::new(
                    inco.clone(),
                    Allow {
                        allowance_account: ctx.remaining_accounts[4].clone(),
                        signer: signer.clone(),
                        allowed_address: ctx.remaining_accounts[5].clone(),
                        system_program: ctx.accounts.system_program.to_account_info(),
                    },
                ),
                reel2.0,
                true,
                ctx.accounts.player.key(),
            )?;
            
            // Allow reel3 handle (accounts 6-7)
            cpi::allow(
                CpiContext::new(
                    inco.clone(),
                    Allow {
                        allowance_account: ctx.remaining_accounts[6].clone(),
                        signer: signer.clone(),
                        allowed_address: ctx.remaining_accounts[7].clone(),
                        system_program: ctx.accounts.system_program.to_account_info(),
                    },
                ),
                reel3.0,
                true,
                ctx.accounts.player.key(),
            )?;
        }
        
        ctx.accounts.game.set_inner(GameResult {
            player: ctx.accounts.player.key(),
            game_type: GameType::Slot,
            seed,
            bet_amount: amount,
            slot: Clock::get()?.slot,
            choice_handle: 0,
            payout_handle: payout.0,
            random_handles: [reel1.0, reel2.0, reel3.0, 0],  // 3 reels
            claimed: false,
            bump: ctx.bumps.game,
        });
        
        Ok(())
    }
}
