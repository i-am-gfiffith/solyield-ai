use anchor_lang::prelude::*;

#[error_code]
pub enum SolYieldError {
    #[msg("Session key has expired")]
    SessionExpired,

    #[msg("Session is inactive or has been revoked")]
    SessionInactive,

    #[msg("Unauthorized keeper key")]
    UnauthorizedKeeper,

    #[msg("Health factor is currently above the trigger threshold; repayment not allowed")]
    HealthFactorAboveTrigger,

    #[msg("Repay amount exceeds per-transaction cap configured in session")]
    ExceedsPerTxCap,

    #[msg("Repay amount exceeds cumulative cap configured in session")]
    ExceedsCumulativeCap,

    #[msg("Insufficient reserve funds in vault")]
    InsufficientReserve,

    #[msg("Position is already zero debt or invalid")]
    NoDebtToRepay,

    #[msg("Invalid oracle price supplied")]
    InvalidPrice,

    #[msg("Trigger health factor is out of allowable bounds (1.05 to 2.00)")]
    InvalidTriggerThreshold,

    #[msg("Arithmetic overflow occurred")]
    MathOverflow,
}
