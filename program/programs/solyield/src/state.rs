use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub authority: Pubkey,
    pub reserve_balance: u64,
    pub total_repaid_all_time: u64,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Session {
    pub vault: Pubkey,
    pub authority: Pubkey,
    pub keeper: Pubkey,
    pub trigger_health_factor_bps: u32, // e.g. 13500 for 1.35 HF
    pub per_tx_repay_cap: u64,          // e.g. 2500_000_000 for 2,500 USDC (6 decimals)
    pub cumulative_repay_cap: u64,      // total cap
    pub total_repaid: u64,              // repaid so far in this session
    pub expiry_timestamp: i64,          // unix timestamp
    pub is_active: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Obligation {
    pub authority: Pubkey,
    pub collateral_amount: u64,         // e.g. 120 SOL (9 decimals)
    pub debt_amount: u64,               // e.g. 7400 USDC (6 decimals)
    pub liquidation_threshold_bps: u32, // e.g. 8000 for 80%
    pub oracle_price: u64,              // price with 6 decimals: 148_000_000 ($148.00)
    pub last_updated_slot: u64,
    pub bump: u8,
}

impl Obligation {
    /// Computes the Health Factor in basis points (1.00 = 10,000)
    /// Formula: (collateral * price * liquidation_threshold_bps) / (debt * 10_000)
    /// Collateral has 9 decimals (SOL), price has 6 decimals (USDC/SOL), debt has 6 decimals (USDC).
    pub fn calculate_health_factor(&self) -> u32 {
        if self.debt_amount == 0 {
            return u32::MAX;
        }

        // Collateral value in micro-USDC (6 decimals):
        // (collateral_amount (9 dec) * oracle_price (6 dec)) / 10^9
        let collateral_val = (self.collateral_amount as u128)
            .checked_mul(self.oracle_price as u128)
            .unwrap_or(0)
            / 1_000_000_000u128;

        // Effective collateral with liquidation threshold:
        // collateral_val * liquidation_threshold_bps / 10_000
        let effective_collateral = collateral_val
            .checked_mul(self.liquidation_threshold_bps as u128)
            .unwrap_or(0)
            / 10_000u128;

        // Health factor in basis points:
        // (effective_collateral * 10_000) / debt_amount
        let hf_bps = effective_collateral
            .checked_mul(10_000u128)
            .unwrap_or(0)
            .checked_div(self.debt_amount as u128)
            .unwrap_or(0);

        if hf_bps > u32::MAX as u128 {
            u32::MAX
        } else {
            hf_bps as u32
        }
    }
}
