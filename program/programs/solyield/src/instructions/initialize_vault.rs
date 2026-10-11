use anchor_lang::prelude::*;
use crate::constants::VAULT_SEED;
use crate::state::Vault;

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, authority.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    vault.authority = ctx.accounts.authority.key();
    vault.reserve_balance = 0;
    vault.total_repaid_all_time = 0;
    vault.created_at = clock.unix_timestamp;
    vault.bump = ctx.bumps.vault;

    msg!("Vault initialized for authority: {}", vault.authority);
    Ok(())
}
