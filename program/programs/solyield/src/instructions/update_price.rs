use anchor_lang::prelude::*;
use crate::error::SolYieldError;
use crate::state::Obligation;

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(mut)]
    pub obligation: Account<'info, Obligation>,

    pub caller: Signer<'info>,
}

pub fn handle_update_price(ctx: Context<UpdatePrice>, new_price: u64) -> Result<()> {
    require!(new_price > 0, SolYieldError::InvalidPrice);

    let obligation = &mut ctx.accounts.obligation;
    let clock = Clock::get()?;

    obligation.oracle_price = new_price;
    obligation.last_updated_slot = clock.slot;

    let hf = obligation.calculate_health_factor();
    msg!("Price updated to {}. New HF: {} bps", new_price, hf);
    Ok(())
}
