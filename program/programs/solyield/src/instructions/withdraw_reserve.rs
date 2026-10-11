use anchor_lang::prelude::*;
use crate::constants::VAULT_SEED;
use crate::error::SolYieldError;
use crate::state::Vault;

#[derive(Accounts)]
pub struct WithdrawReserve<'info> {
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

pub fn handle_withdraw_reserve(ctx: Context<WithdrawReserve>, amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    require!(vault.reserve_balance >= amount, SolYieldError::InsufficientReserve);

    vault.reserve_balance = vault.reserve_balance.checked_sub(amount).unwrap();

    // Transfer lamports from Vault PDA back to authority
    let vault_info = vault.to_account_info();
    let authority_info = ctx.accounts.authority.to_account_info();

    **vault_info.try_borrow_mut_lamports()? = vault_info
        .lamports()
        .checked_sub(amount)
        .ok_or(SolYieldError::InsufficientReserve)?;

    **authority_info.try_borrow_mut_lamports()? = authority_info
        .lamports()
        .checked_add(amount)
        .ok_or(SolYieldError::MathOverflow)?;

    msg!("Withdrawn {} lamports from vault. Remaining balance: {}", amount, vault.reserve_balance);
    Ok(())
}
