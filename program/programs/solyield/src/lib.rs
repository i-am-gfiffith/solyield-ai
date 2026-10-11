pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use instructions::*;
pub use state::*;

declare_id!("6LfAWRgqdWtUtN1b9H3sXPRPTbQGDirtG9e1Wj5nKydQ");

#[program]
pub mod solyield {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        instructions::initialize_vault::handle_initialize_vault(ctx)
    }

    pub fn deposit_reserve(ctx: Context<DepositReserve>, amount: u64) -> Result<()> {
        instructions::deposit_reserve::handle_deposit_reserve(ctx, amount)
    }

    pub fn withdraw_reserve(ctx: Context<WithdrawReserve>, amount: u64) -> Result<()> {
        instructions::withdraw_reserve::handle_withdraw_reserve(ctx, amount)
    }

    pub fn delegate_session(
        ctx: Context<DelegateSession>,
        keeper: Pubkey,
        trigger_health_factor_bps: u32,
        per_tx_repay_cap: u64,
        cumulative_repay_cap: u64,
        duration_seconds: i64,
    ) -> Result<()> {
        instructions::delegate_session::handle_delegate_session(
            ctx,
            keeper,
            trigger_health_factor_bps,
            per_tx_repay_cap,
            cumulative_repay_cap,
            duration_seconds,
        )
    }

    pub fn revoke_session(ctx: Context<RevokeSession>) -> Result<()> {
        instructions::revoke_session::handle_revoke_session(ctx)
    }

    pub fn initialize_obligation(
        ctx: Context<InitializeObligation>,
        collateral_amount: u64,
        debt_amount: u64,
        liquidation_threshold_bps: u32,
        oracle_price: u64,
    ) -> Result<()> {
        instructions::initialize_obligation::handle_initialize_obligation(
            ctx,
            collateral_amount,
            debt_amount,
            liquidation_threshold_bps,
            oracle_price,
        )
    }

    pub fn update_price(ctx: Context<UpdatePrice>, new_price: u64) -> Result<()> {
        instructions::update_price::handle_update_price(ctx, new_price)
    }

    pub fn reset_obligation(
        ctx: Context<ResetObligation>,
        collateral_amount: u64,
        debt_amount: u64,
        oracle_price: u64,
        target_reserve: u64,
    ) -> Result<()> {
        instructions::reset_obligation::handle_reset_obligation(
            ctx,
            collateral_amount,
            debt_amount,
            oracle_price,
            target_reserve,
        )
    }

    pub fn guarded_repay(ctx: Context<GuardedRepay>, repay_amount: u64) -> Result<()> {
        instructions::guarded_repay::handle_guarded_repay(ctx, repay_amount)
    }
}
