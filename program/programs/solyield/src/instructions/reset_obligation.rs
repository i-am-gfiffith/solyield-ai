use anchor_lang::prelude::*;
use crate::state::{Obligation, Vault, Session};

#[derive(Accounts)]
pub struct ResetObligation<'info> {
    #[account(
        mut,
        has_one = authority,
    )]
    pub obligation: Account<'info, Obligation>,

    #[account(
        mut,
        has_one = authority,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        has_one = authority,
    )]
    pub session: Account<'info, Session>,

    pub authority: Signer<'info>,
}

pub fn handle_reset_obligation(
    ctx: Context<ResetObligation>,
    collateral_amount: u64,
    debt_amount: u64,
    oracle_price: u64,
    target_reserve: u64,
) -> Result<()> {
    let obligation = &mut ctx.accounts.obligation;
    let vault = &mut ctx.accounts.vault;
    let session = &mut ctx.accounts.session;
    let clock = Clock::get()?;

    obligation.collateral_amount = collateral_amount;
    obligation.debt_amount = debt_amount;
    obligation.oracle_price = oracle_price;
    obligation.last_updated_slot = clock.slot;

    vault.reserve_balance = target_reserve;
    session.total_repaid = 0;
    session.is_active = true;

    msg!("Reset position: collateral={}, debt={}, price={}, reserve={}", collateral_amount, debt_amount, oracle_price, target_reserve);
    Ok(())
}
