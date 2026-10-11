use anchor_lang::prelude::*;

pub const VAULT_SEED: &[u8] = b"vault";
pub const SESSION_SEED: &[u8] = b"session";
pub const OBLIGATION_SEED: &[u8] = b"obligation";

pub const BPS_DENOMINATOR: u32 = 10_000;
pub const MIN_TRIGGER_HF_BPS: u32 = 10_500; // 1.05 HF
pub const MAX_TRIGGER_HF_BPS: u32 = 20_000; // 2.00 HF
