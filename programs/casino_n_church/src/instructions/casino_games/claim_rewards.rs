use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};
use inco_lightning::{
    cpi::{self, accounts::VerifySignature},
    program::IncoLightning,
    ID as INCO_LIGHTNING_ID,
};

use crate::{
    errors::CasinoError,
    inco_helpers::parse_plaintext_to_u64,
    states::{Admin, GameResult},
};

// =============================================================================
// CLAIM REWARDS (unified for all games)
// =============================================================================

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    
    #[account(
        seeds = [b"admin", admin.authority.as_ref()],
        bump = admin.bump
    )]
    pub admin: Account<'info, Admin>,
    
    #[account(
        mut,
        seeds = [b"casino_vault", admin.key().as_ref()],
        bump
    )]
    pub casino_vault: SystemAccount<'info>,
    
    #[account(
        mut,
        seeds = [b"lp_vault", admin.key().as_ref()],
        bump
    )]
    pub lp_vault: SystemAccount<'info>,
    
    #[account(
        mut,
        constraint = game.player == player.key() @ CasinoError::Ed25519Pubkey,
        constraint = !game.claimed @ CasinoError::AlreadyClaimed
    )]
    pub game: Account<'info, GameResult>,
    
    /// CHECK: Instructions sysvar for Ed25519 signature verification
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: AccountInfo<'info>,
    
    #[account(address = INCO_LIGHTNING_ID)]
    pub inco_lightning_program: Program<'info, IncoLightning>,
    
    pub system_program: Program<'info, System>,
}

impl<'info> ClaimRewards<'info> {
    pub fn claim(
        ctx: Context<ClaimRewards>,
        handle: Vec<u8>,
        plaintext: Vec<u8>,
    ) -> Result<()> {
        // Verify decryption signature on-chain via Inco
        cpi::is_validsignature(
            CpiContext::new(
                ctx.accounts.inco_lightning_program.to_account_info(),
                VerifySignature {
                    instructions: ctx.accounts.instructions.to_account_info(),
                    signer: ctx.accounts.player.to_account_info(),
                },
            ),
            1, // Expected signature count
            Some(vec![handle]),
            Some(vec![plaintext.clone()]),
        )?;
        
        // Parse verified payout amount
        let payout = parse_plaintext_to_u64(&plaintext)?;
        
        if payout > 0 {
            let casino_balance = ctx.accounts.casino_vault.lamports();
            
            if casino_balance >= payout {
                // Full payout from casino vault
                Self::transfer_from_casino_vault(&ctx, payout)?;
            } else {
                // Partial from casino, remainder from LP vault
                let from_casino = casino_balance;
                let from_lp = payout.checked_sub(from_casino).ok_or(CasinoError::Overflow)?;
                
                // Verify LP has sufficient funds
                require!(
                    ctx.accounts.lp_vault.lamports() >= from_lp,
                    CasinoError::InsufficientVaultFunds
                );
                
                // Transfer from casino if any available
                if from_casino > 0 {
                    Self::transfer_from_casino_vault(&ctx, from_casino)?;
                }
                
                // Transfer remainder from LP
                Self::transfer_from_lp_vault(&ctx, from_lp)?;
            }
        }
        
        // Mark as claimed
        ctx.accounts.game.claimed = true;
        
        msg!("Claimed {} lamports!", payout);
        Ok(())
    }
    
    fn transfer_from_casino_vault(ctx: &Context<ClaimRewards>, amount: u64) -> Result<()> {
        let admin_key = ctx.accounts.admin.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"casino_vault",
            admin_key.as_ref(),
            &[ctx.bumps.casino_vault],
        ]];
        
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.casino_vault.to_account_info(),
                    to: ctx.accounts.player.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )
    }
    
    fn transfer_from_lp_vault(ctx: &Context<ClaimRewards>, amount: u64) -> Result<()> {
        let admin_key = ctx.accounts.admin.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"lp_vault",
            admin_key.as_ref(),
            &[ctx.bumps.lp_vault],
        ]];
        
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.lp_vault.to_account_info(),
                    to: ctx.accounts.player.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )
    }
}
