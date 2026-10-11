use anchor_lang::prelude::*;
use crate::constants::OBLIGATION_SEED;
use crate::state::Obligation;

#[derive(Accounts)]
pub struct InitializeObligation<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Obligation::INIT_SPACE,
        seeds = [OBLIGATION_SEED, authority.key().as_ref()],
        bump
    )]
    pub obligation: Account<'info, Obligation>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_obligation(
    ctx: Context<InitializeObligation>,
    collateral_amount: u64,
    debt_amount: u64,
    liquidation_threshold_bps: u32,
    oracle_price: u64,
) -> Result<()> {
    let obligation = &mut ctx.accounts.obligation;
    let clock = Clock::get()?;

    obligation.authority = ctx.accounts.authority.key();
    obligation.collateral_amount = collateral_amount;
    obligation.debt_amount = debt_amount;
    obligation.liquidation_threshold_bps = liquidation_threshold_bps;
    obligation.oracle_price = oracle_price;
    obligation.last_updated_slot = clock.slot;
    obligation.bump = ctx.bumps.obligation;

    let hf = obligation.calculate_health_factor();
    msg!("Obligation initialized. Initial HF: {} bps", hf);
    Ok(())
}
