use anchor_lang::prelude::*;
use crate::constants::{SESSION_SEED, VAULT_SEED};
use crate::error::SolYieldError;
use crate::state::{Obligation, Session, Vault};

#[event]
pub struct RepayExecuted {
    pub authority: Pubkey,
    pub keeper: Pubkey,
    pub vault: Pubkey,
    pub amount_repaid: u64,
    pub old_health_factor_bps: u32,
    pub new_health_factor_bps: u32,
    pub remaining_debt: u64,
    pub remaining_reserve: u64,
    pub slot: u64,
}

#[derive(Accounts)]
pub struct GuardedRepay<'info> {
    #[account(
        mut,
        seeds = [SESSION_SEED, vault.key().as_ref()],
        bump = session.bump,
        has_one = vault,
    )]
    pub session: Account<'info, Session>,

    #[account(
        mut,
        seeds = [VAULT_SEED, session.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        has_one = authority,
    )]
    pub obligation: Account<'info, Obligation>,

    /// The authority who owns the position and vault
    pub authority: SystemAccount<'info>,

    #[account(
        mut,
        constraint = keeper.key() == session.keeper @ SolYieldError::UnauthorizedKeeper
    )]
    pub keeper: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_guarded_repay(ctx: Context<GuardedRepay>, repay_amount: u64) -> Result<()> {
    let session = &mut ctx.accounts.session;
    let vault = &mut ctx.accounts.vault;
    let obligation = &mut ctx.accounts.obligation;
    let clock = Clock::get()?;

    // 1. Session active check
    require!(session.is_active, SolYieldError::SessionInactive);

    // 2. Expiry check
    require!(
        clock.unix_timestamp <= session.expiry_timestamp,
        SolYieldError::SessionExpired
    );

    // 3. Debt check
    require!(obligation.debt_amount > 0, SolYieldError::NoDebtToRepay);

    // 4. On-chain Health Factor check
    let old_hf = obligation.calculate_health_factor();
    require!(
        old_hf < session.trigger_health_factor_bps,
        SolYieldError::HealthFactorAboveTrigger
    );

    // 5. Per-tx cap check
    require!(
        repay_amount <= session.per_tx_repay_cap,
        SolYieldError::ExceedsPerTxCap
    );

    // 6. Cumulative cap check
    let new_cumulative = session
        .total_repaid
        .checked_add(repay_amount)
        .ok_or(SolYieldError::MathOverflow)?;
    require!(
        new_cumulative <= session.cumulative_repay_cap,
        SolYieldError::ExceedsCumulativeCap
    );

    // 7. Vault reserve check
    let actual_repay = repay_amount.min(obligation.debt_amount);
    require!(
        vault.reserve_balance >= actual_repay,
        SolYieldError::InsufficientReserve
    );

    // Execute state updates
    vault.reserve_balance = vault.reserve_balance.checked_sub(actual_repay).unwrap();
    vault.total_repaid_all_time = vault.total_repaid_all_time.checked_add(actual_repay).unwrap();

    obligation.debt_amount = obligation.debt_amount.checked_sub(actual_repay).unwrap();
    obligation.last_updated_slot = clock.slot;

    session.total_repaid = new_cumulative;

    let new_hf = obligation.calculate_health_factor();

    emit!(RepayExecuted {
        authority: session.authority,
        keeper: session.keeper,
        vault: vault.key(),
        amount_repaid: actual_repay,
        old_health_factor_bps: old_hf,
        new_health_factor_bps: new_hf,
        remaining_debt: obligation.debt_amount,
        remaining_reserve: vault.reserve_balance,
        slot: clock.slot,
    });

    msg!(
        "Guarded repay executed: {} units repaid. HF improved from {} bps to {} bps.",
        actual_repay,
        old_hf,
        new_hf
    );

    Ok(())
}
