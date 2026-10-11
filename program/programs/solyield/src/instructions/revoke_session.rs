use anchor_lang::prelude::*;
use crate::constants::SESSION_SEED;
use crate::state::Session;

#[derive(Accounts)]
pub struct RevokeSession<'info> {
    #[account(
        mut,
        seeds = [SESSION_SEED, session.vault.as_ref()],
        bump = session.bump,
        has_one = authority,
    )]
    pub session: Account<'info, Session>,

    pub authority: Signer<'info>,
}

pub fn handle_revoke_session(ctx: Context<RevokeSession>) -> Result<()> {
    let session = &mut ctx.accounts.session;
    session.is_active = false;

    msg!("Session revoked for vault: {}", session.vault);
    Ok(())
}
