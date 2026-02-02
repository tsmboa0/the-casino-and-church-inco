use anchor_lang::{prelude::*, system_program::{transfer, Transfer}};
use crate::states::*;
#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub house: Signer<'info>,
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
        init,
        payer = house,
        space = Admin::DISCRIMINATOR.len() + Admin::INIT_SPACE,
        seeds = [b"admin", house.key().as_ref()],
        bump
    )]
    pub admin: Account<'info, Admin>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitializeVault<'info> {
    pub fn init(&mut self, amount: u64, bumps: &InitializeVaultBumps) -> Result<()> {
        //Init casino vault
        let casino_accounts = Transfer {
            from: self.house.to_account_info(),
            to: self.casino_vault.to_account_info(),
        };

        let casino_ctx = CpiContext::new(self.system_program.to_account_info(), casino_accounts);
        transfer(casino_ctx, amount)?;

        //Init LP vault
        let lp_accounts = Transfer {
            from: self.house.to_account_info(),
            to: self.lp_vault.to_account_info(),
        };
        let lp_ctx = CpiContext::new(self.system_program.to_account_info(), lp_accounts);
        transfer(lp_ctx, amount)?;
        self.admin.set_inner(Admin {
            authority: self.house.key(),
            treasury: self.house.key(),
            casino_vault: self.casino_vault.key(),
            lp_vault: self.lp_vault.key(),
            house_edge_bps: 150,
            quest_creation_fee: 100000000, // 0.1 SOL
            bump: bumps.admin,
        });
        Ok(())
    }
}


#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"admin", admin.authority.as_ref()],
        bump = admin.bump
    )]
    pub admin: Account<'info, Admin>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> UpdateConfig<'info> {
    pub fn update(&mut self, house_edge_bps: u16, quest_creation_fee: u64) -> Result<()> {
        self.admin.house_edge_bps = house_edge_bps;
        self.admin.quest_creation_fee = quest_creation_fee;
        Ok(())
    }
}