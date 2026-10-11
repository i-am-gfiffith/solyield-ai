use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use crate::constants::VAULT_SEED;
use crate::state::Vault;

#[derive(Accounts)]
pub struct DepositReserve<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, authority.key().as_ref()],
        bump = vault.bump,
        has_one = authority,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_deposit_reserve(ctx: Context<DepositReserve>, amount: u64) -> Result<()> {
    // Transfer SOL lamports from authority into the Vault PDA
    transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.reserve_balance = vault.reserve_balance.checked_add(amount).unwrap();

    msg!("Deposited {} lamports into vault. New balance: {}", amount, vault.reserve_balance);
    Ok(())
}
