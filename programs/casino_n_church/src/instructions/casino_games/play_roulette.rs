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

const STRAIGHT_BET_MULTIPLIER: u64 = 36;  // 35:1 + original bet

#[derive(Accounts)]
#[instruction(seed: u128)]
pub struct PlayRoulette<'info> {
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
        seeds = [b"game_roulette", player.key().as_ref(), seed.to_le_bytes().as_ref()],
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

impl<'info> PlayRoulette<'info> {
    /// Simplified Roulette: Straight bet only (exact number 0-36)
    /// 
    /// Player bets on a specific number. If spin matches, wins 35:1.
    /// Similar to coinflip pattern but with 37 outcomes.
    pub fn play(
        ctx: Context<'_, '_, '_, 'info, PlayRoulette<'info>>,
        seed: u128,
        encrypted_choice: Vec<u8>,  // Number 0-36 (encrypted)
        amount: u64,
    ) -> Result<()> {
        require!(amount >= MIN_BET_LAMPORTS, CasinoError::MinimumBet);
        require!(amount <= MAX_BET_LAMPORTS, CasinoError::MaximumBet);
        
        // Transfer bet
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
        
        // Encrypt player's choice (0-36)
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let choice: Euint128 = cpi::new_euint128(cpi_ctx, encrypted_choice, 0)?;
        
        // Spin wheel (0-36)
        let spin: Euint128 = generate_bounded_random(inco.clone(), signer.clone(), 37)?;
        
        // Log spin handle early to avoid truncation
        msg!("Spin handle: {}", spin.0);
        
        // Check if player won: is_winner = (choice == spin)
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let is_winner: Ebool = cpi::e_eq(cpi_ctx, choice, spin, 0)?;
        
        // Calculate payout: winner gets 35:1
        let win_payout = apply_house_edge(amount.saturating_mul(STRAIGHT_BET_MULTIPLIER));
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let encrypted_payout = cpi::as_euint128(cpi_ctx, win_payout as u128)?;
        
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let zero = cpi::as_euint128(cpi_ctx, 0u128)?;
        
        // payout = is_winner ? win_payout : 0
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let payout: Euint128 = cpi::e_select(cpi_ctx, is_winner, encrypted_payout, zero, 0)?;
        
        // Log payout handle
        msg!("Payout handle: {}", payout.0);
        
        // Grant decrypt permission for BOTH payout and spin
        if ctx.remaining_accounts.len() >= 4 {
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
            
            // Allow spin handle (accounts 2-3)
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
                spin.0,
                true,
                ctx.accounts.player.key(),
            )?;
        }
        
        ctx.accounts.game.set_inner(GameResult {
            player: ctx.accounts.player.key(),
            game_type: GameType::Roulette { bet_type: 0 },  // Straight bet
            seed,
            bet_amount: amount,
            slot: Clock::get()?.slot,
            choice_handle: choice.0,
            payout_handle: payout.0,
            random_handles: [spin.0, 0, 0, 0],
            claimed: false,
            bump: ctx.bumps.game,
        });
        
        Ok(())
    }
}
