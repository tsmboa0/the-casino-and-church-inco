use anchor_lang::{prelude::*, system_program::{transfer, Transfer}};

use crate::states::{Admin, LiquidityPool, LiquidityProvider};
use crate::errors::CasinoError;

const BPS: u64 = 10_000;
const SLOTS_PER_YEAR: u64 = 63_072_000; // approx

#[derive(Accounts)]
pub struct LpWithdraw<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(
        seeds = [b"admin", admin.authority.as_ref()],
        bump = admin.bump
    )]
    pub admin: Account<'info, Admin>,
    #[account(
        mut,
        seeds = [b"lp_vault", admin.key().as_ref()],
        bump = pool.vault_bump
    )]
    pub vault: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [b"liquidity_pool", admin.key().as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, LiquidityPool>,
    #[account(
        mut,
        seeds = [b"lp_provider", depositor.key().as_ref(), admin.key().as_ref()],
        bump = provider.bump
    )]
    pub provider: Account<'info, LiquidityProvider>,
    pub system_program: Program<'info, System>,
}

impl<'info> LpWithdraw<'info> {
    pub fn process_withdraw(&mut self, _bumps: &LpWithdrawBumps, amount: u64) -> Result<()> {
        require!(amount > 0, CasinoError::MinimumBet);
        require!(self.provider.balance >= amount, CasinoError::MaximumBet);

        let now_slot = Clock::get()?.slot;
        self.accrue_yield(now_slot)?;

        let payout = amount
            .checked_add(self.provider.accrued_yield)
            .ok_or(CasinoError::Overflow)?;

        // Transfer SOL from vault back to depositor
        let vault_bump = self.pool.vault_bump;
        let admin_key = self.admin.key();
        let signer_seeds: &[&[&[u8]]] =
            &[&[b"lp_vault", admin_key.as_ref(), &[vault_bump]]];
        let transfer_ctx = CpiContext::new_with_signer(
            self.system_program.to_account_info(),
            Transfer {
                from: self.vault.to_account_info(),
                to: self.depositor.to_account_info(),
            },
            signer_seeds,
        );
        transfer(transfer_ctx, payout)?;

        self.provider.balance = self
            .provider
            .balance
            .checked_sub(amount)
            .ok_or(CasinoError::Overflow)?;
        self.provider.accrued_yield = 0;
        self.provider.last_withdraw_slot = now_slot;
        self.pool.total_deposits = self
            .pool
            .total_deposits
            .saturating_sub(amount);

        Ok(())
    }

    fn accrue_yield(&mut self, now_slot: u64) -> Result<()> {
        if self.provider.balance == 0 {
            return Ok(());
        }
        let elapsed = now_slot.saturating_sub(self.provider.last_withdraw_slot);
        if elapsed == 0 {
            return Ok(());
        }
        let yield_bps = self.pool.yield_bps as u64;
        let accrued = (self.provider.balance as u128)
            .checked_mul(yield_bps as u128)
            .ok_or(CasinoError::Overflow)?
            .checked_mul(elapsed as u128)
            .ok_or(CasinoError::Overflow)?
            .checked_div((BPS * SLOTS_PER_YEAR) as u128)
            .ok_or(CasinoError::Overflow)? as u64;

        self.provider.accrued_yield = self
            .provider
            .accrued_yield
            .checked_add(accrued)
            .ok_or(CasinoError::Overflow)?;
        self.provider.last_withdraw_slot = now_slot;
        Ok(())
    }
}

