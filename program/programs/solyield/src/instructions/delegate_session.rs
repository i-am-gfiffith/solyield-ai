use anchor_lang::prelude::*;
use crate::constants::{MIN_TRIGGER_HF_BPS, MAX_TRIGGER_HF_BPS, SESSION_SEED, VAULT_SEED};
use crate::error::SolYieldError;
use crate::state::{Session, Vault};

#[derive(Accounts)]
pub struct DelegateSession<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + Session::INIT_SPACE,
        seeds = [SESSION_SEED, vault.key().as_ref()],
        bump
    )]
    pub session: Account<'info, Session>,

    #[account(
        seeds = [VAULT_SEED, authority.key().as_ref()],
        bump = vault.bump,
        has_one = authority,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_delegate_session(
    ctx: Context<DelegateSession>,
    keeper: Pubkey,
    trigger_health_factor_bps: u32,
    per_tx_repay_cap: u64,
    cumulative_repay_cap: u64,
    duration_seconds: i64,
) -> Result<()> {
    require!(
        trigger_health_factor_bps >= MIN_TRIGGER_HF_BPS && trigger_health_factor_bps <= MAX_TRIGGER_HF_BPS,
        SolYieldError::InvalidTriggerThreshold
    );

    let session = &mut ctx.accounts.session;
    let clock = Clock::get()?;

    session.vault = ctx.accounts.vault.key();
    session.authority = ctx.accounts.authority.key();
    session.keeper = keeper;
    session.trigger_health_factor_bps = trigger_health_factor_bps;
    session.per_tx_repay_cap = per_tx_repay_cap;
    session.cumulative_repay_cap = cumulative_repay_cap;
    session.total_repaid = 0;
    session.expiry_timestamp = clock.unix_timestamp.checked_add(duration_seconds).ok_or(SolYieldError::MathOverflow)?;
    session.is_active = true;
    session.bump = ctx.bumps.session;

    msg!(
        "Session delegated to keeper {}. Trigger HF: {} bps, Expiry: {}",
        keeper,
        trigger_health_factor_bps,
        session.expiry_timestamp
    );
    Ok(())
}
