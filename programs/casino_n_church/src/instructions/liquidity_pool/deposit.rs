use anchor_lang::{prelude::*, system_program::{transfer, Transfer}};

use crate::states::{Admin, LiquidityPool, LiquidityProvider};
use crate::errors::CasinoError;

const BPS: u64 = 10_000;
const SLOTS_PER_YEAR: u64 = 63_072_000; // approx, for simple APR calc
const DEFAULT_YIELD_BPS: u16 = 500; // 5% APR 

#[derive(Accounts)]
pub struct LpDeposit<'info> {
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
        bump
    )]
    pub vault: SystemAccount<'info>, //Make sure to init Lp vault in admin init
    #[account(
        init_if_needed,
        payer = depositor,
        space = LiquidityPool::DISCRIMINATOR.len() + LiquidityPool::INIT_SPACE,
        seeds = [b"liquidity_pool", admin.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, LiquidityPool>,
    #[account(
        init_if_needed,
        payer = depositor,
        space = LiquidityProvider::DISCRIMINATOR.len() + LiquidityProvider::INIT_SPACE,
        seeds = [b"lp_provider", depositor.key().as_ref(), admin.key().as_ref()],
        bump
    )]
    pub provider: Account<'info, LiquidityProvider>,
    pub system_program: Program<'info, System>,
}

impl<'info> LpDeposit<'info> {
    pub fn process_deposit(&mut self, bumps: &LpDepositBumps, amount: u64) -> Result<()> {
        require!(amount > 0, CasinoError::MinimumBet);

        let now_slot = Clock::get()?.slot;

        if self.pool.admin == Pubkey::default() {
            self.pool.admin = self.admin.key();
            self.pool.vault = self.vault.key();
            self.pool.yield_bps = DEFAULT_YIELD_BPS;
            self.pool.bump = bumps.pool;
            self.pool.vault_bump = bumps.vault;
        }

        self.accrue_yield(now_slot)?;

        self.provider.balance = self
            .provider
            .balance
            .checked_add(amount)
            .ok_or(CasinoError::Overflow)?;
        self.provider.deposit_slot = now_slot;
        self.provider.last_withdraw_slot = now_slot;
        self.provider.owner = self.depositor.key();
        self.provider.admin = self.admin.key();
        self.pool.total_deposits = self
            .pool
            .total_deposits
            .checked_add(amount)
            .ok_or(CasinoError::Overflow)?;

        // Move SOL into the vault
        let sys_accounts = Transfer {
            from: self.depositor.to_account_info(),
            to: self.vault.to_account_info(),
        };
        let sys_ctx = CpiContext::new(self.system_program.to_account_info(), sys_accounts);
        transfer(sys_ctx, amount)?;

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

