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
    states::{GameResult, GameType},
};

const HOUSE_EDGE_BPS: u64 = 150;
const BPS: u64 = 10_000;
const MIN_BET_LAMPORTS: u64 = 10_000_000; // 0.01 SOL
const MAX_BET_LAMPORTS: u64 = 10_000_000_000; // 10 SOL

// =============================================================================
// PLAY COINFLIP (with Inco encryption)
// =============================================================================

#[derive(Accounts)]
#[instruction(seed: u128)]
pub struct PlayCoinflip<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    
    /// CHECK: Admin authority for vault PDA derivation
    pub admin: UncheckedAccount<'info>,
    
    #[account(
        mut,
        seeds = [b"casino_vault", admin.key().as_ref()],
        bump
    )]
    pub casino_vault: SystemAccount<'info>,
    
    #[account(
        init,
        payer = player,
        space = 8 + GameResult::INIT_SPACE,
        seeds = [b"game_coinflip", player.key().as_ref(), seed.to_le_bytes().as_ref()],
        bump
    )]
    pub game: Account<'info, GameResult>,
    
    #[account(address = INCO_LIGHTNING_ID)]
    pub inco_lightning_program: Program<'info, IncoLightning>,
    
    pub system_program: Program<'info, System>,
}

impl<'info> PlayCoinflip<'info> {
    pub fn play(
        ctx: Context<'_, '_, '_, 'info, PlayCoinflip<'info>>,
        seed: u128,
        encrypted_choice: Vec<u8>,
        amount: u64,
    ) -> Result<()> {
        // Validate bet
        require!(amount >= MIN_BET_LAMPORTS, CasinoError::MinimumBet);
        require!(amount <= MAX_BET_LAMPORTS, CasinoError::MaximumBet);
        
        // Transfer bet to vault
        let transfer_accounts = Transfer {
            from: ctx.accounts.player.to_account_info(),
            to: ctx.accounts.casino_vault.to_account_info(),
        };
        transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), transfer_accounts),
            amount,
        )?;
        
        let inco = ctx.accounts.inco_lightning_program.to_account_info();
        let signer = ctx.accounts.player.to_account_info();
        
        // 1. Create encrypted choice from ciphertext (0 or 1)
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let choice: Euint128 = cpi::new_euint128(cpi_ctx, encrypted_choice, 0)?;
        
        // 2. Generate random 0-1
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let raw = cpi::e_rand(cpi_ctx, 0)?;
        
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let two = cpi::as_euint128(cpi_ctx, 2u128)?;
        
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let flip: Euint128 = cpi::e_rem(cpi_ctx, raw, two, 0)?;
        
        // 3. Compare: is_winner = (choice == flip)
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let is_winner: Ebool = cpi::e_eq(cpi_ctx, choice, flip, 0)?;
        
        // 4. Calculate encrypted payout using e_select
        let win_payout = Self::calculate_win_payout(amount);
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let encrypted_payout = cpi::as_euint128(cpi_ctx, win_payout as u128)?;
        
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let zero = cpi::as_euint128(cpi_ctx, 0u128)?;
        
        let cpi_ctx = CpiContext::new(inco.clone(), Operation { signer: signer.clone() });
        let payout: Euint128 = cpi::e_select(cpi_ctx, is_winner, encrypted_payout, zero, 0)?;
        
        // Log handles BEFORE allowance (so simulation can capture them)
        msg!("Payout handle: {}", payout.0);
        msg!("Random handle: {}", flip.0);
        
        // 5. Grant player permission to decrypt BOTH payout and flip result
        // Requires 4 remaining accounts: 2 per handle (allowance PDA + player)
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
            
            // Allow flip result handle (accounts 2-3)
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
                flip.0,
                true,
                ctx.accounts.player.key(),
            )?;
        }
        
        // Store game result with encrypted handles
        ctx.accounts.game.set_inner(GameResult {
            player: ctx.accounts.player.key(),
            game_type: GameType::Coinflip,
            seed,
            bet_amount: amount,
            slot: Clock::get()?.slot,
            choice_handle: choice.0,
            payout_handle: payout.0,
            random_handles: [flip.0, 0, 0, 0],
            claimed: false,
            bump: ctx.bumps.game,
        });
        
        Ok(())
    }
    
    /// Calculate win payout: 2x bet minus house edge
    fn calculate_win_payout(amount: u64) -> u64 {
        let gross = amount.saturating_mul(2);
        let edge = gross.saturating_mul(HOUSE_EDGE_BPS) / BPS;
        gross.saturating_sub(edge)
    }
}
