use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct LiquidityPool {
    pub admin: Pubkey,
    pub lp_mint: Pubkey,
    pub vault: Pubkey,
    pub total_deposits: u64,
    pub yield_bps: u16,
    pub bump: u8,
    pub vault_bump: u8,
    pub mint_bump: u8,
    pub mint_auth_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LiquidityProvider {
    pub owner: Pubkey,
    pub admin: Pubkey,
    pub balance: u64,
    pub deposit_slot: u64,
    pub last_withdraw_slot: u64,
    pub accrued_yield: u64,
    pub bump: u8,
}

