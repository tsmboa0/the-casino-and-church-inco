use anchor_lang::prelude::*;



#[account]
#[derive(InitSpace)]
pub struct Admin {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub casino_vault: Pubkey,
    pub lp_vault: Pubkey,
    pub house_edge_bps: u16,
    pub quest_creation_fee: u64,
    pub bump: u8,
}