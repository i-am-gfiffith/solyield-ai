# SolYield — Solana Lending Health Factor Keeper & Liquidation Guard

A complete end-to-end liquidation protection protocol for Solana lending positions.

## Architecture

- **On-Chain Anchor Program**: Deployed on Solana Devnet at [`6LfAWRgqdWtUtN1b9H3sXPRPTbQGDirtG9e1Wj5nKydQ`](https://explorer.solana.com/address/6LfAWRgqdWtUtN1b9H3sXPRPTbQGDirtG9e1Wj5nKydQ?cluster=devnet)
  - Vault PDA per authority: `[b"vault", authority.key().as_ref()]`
  - Delegated Session PDA: `[b"session", vault.key().as_ref()]` with trigger HF, per-tx cap, cumulative cap, and expiry
  - Lending Obligation PDA: `[b"obligation", authority.key().as_ref()]`
  - Core instruction: `guarded_repay` enforces that current on-chain HF < trigger threshold before executing debt repayment

- **Autonomous Keeper Daemon** (`keeper/`):
  - Service running on `http://localhost:3001`
  - Dedicated Keeper keypair: `Cv6ZLZ21wTA7RRAvdwkNRzyWJxjei75c1oz4YPm67te3`
  - Monitors registered positions every slot (~400ms)
  - Submits on-chain `guarded_repay` transactions when risk crosses trigger

- **Interactive Frontend** (`frontend/`):
  - Running on `http://localhost:5173`
  - Real Solana Wallet integration (Phantom / Backpack / Solflare)
  - Interactive on-chain vault creation, session key delegation, and reserve deposits
  - Live simulation button to trigger market drops and observe the keeper repaying debt in real-time

## Project Directory

- `program/`: Anchor Rust smart contract workspace
- `keeper/`: Node.js / TypeScript keeper daemon and REST/SSE API
- `frontend/`: Interactive Web3 dApp interface
