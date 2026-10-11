"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const fs_1 = __importDefault(require("fs"));
const config_1 = require("./config");
const solyield_json_1 = __importDefault(require("../idl/solyield.json"));
async function main() {
    console.log("=== SolYield Devnet End-to-End Test ===");
    const connection = new web3_js_1.Connection(config_1.RPC_URL, "confirmed");
    // Load user wallet
    const userKeypairRaw = JSON.parse(fs_1.default.readFileSync("/home/anmol/.config/solana/id.json", "utf-8"));
    const userKeypair = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(userKeypairRaw));
    console.log("User wallet:", userKeypair.publicKey.toBase58());
    console.log("Keeper wallet:", config_1.KEEPER_KEYPAIR.publicKey.toBase58());
    const provider = new anchor_1.AnchorProvider(connection, new anchor_1.Wallet(userKeypair), {
        commitment: "confirmed",
    });
    const program = new anchor_1.Program(solyield_json_1.default, provider);
    // PDAs
    const [vaultPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("vault"), userKeypair.publicKey.toBuffer()], config_1.PROGRAM_ID);
    const [sessionPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("session"), vaultPda.toBuffer()], config_1.PROGRAM_ID);
    const [obligationPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("obligation"), userKeypair.publicKey.toBuffer()], config_1.PROGRAM_ID);
    console.log("Vault PDA:", vaultPda.toBase58());
    console.log("Session PDA:", sessionPda.toBase58());
    console.log("Obligation PDA:", obligationPda.toBase58());
    // 1. Initialize Vault if needed
    try {
        const v = await program.account.vault.fetchNullable(vaultPda);
        if (!v) {
            console.log("Initializing Vault...");
            const tx = await program.methods
                .initializeVault()
                .accounts({
                vault: vaultPda,
                authority: userKeypair.publicKey,
                systemProgram: web3_js_1.SystemProgram.programId,
            })
                .rpc();
            console.log("Vault initialized, tx:", tx);
        }
        else {
            console.log("Vault already exists. Reserve:", v.reserveBalance.toString());
        }
    }
    catch (e) {
        console.error("Vault check failed:", e.message);
    }
    // 2. Deposit reserve (e.g. 3,000 units = 3000 * 1e6)
    try {
        console.log("Depositing reserve...");
        const tx = await program.methods
            .depositReserve(new anchor_1.BN(3000 * 1e6))
            .accounts({
            vault: vaultPda,
            authority: userKeypair.publicKey,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc();
        console.log("Deposited 3000 USDC reserve, tx:", tx);
    }
    catch (e) {
        console.log("Deposit failed or skipped:", e.message);
    }
    // 3. Delegate Session to Keeper
    try {
        console.log("Delegating session to keeper...");
        const tx = await program.methods
            .delegateSession(config_1.KEEPER_KEYPAIR.publicKey, 13500, // 1.35 trigger HF
        new anchor_1.BN(2500 * 1e6), // 2500 USDC per tx cap
        new anchor_1.BN(10000 * 1e6), // 10000 USDC cumulative cap
        new anchor_1.BN(86400 * 30) // 30 days
        )
            .accounts({
            session: sessionPda,
            vault: vaultPda,
            authority: userKeypair.publicKey,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc();
        console.log("Session delegated, tx:", tx);
    }
    catch (e) {
        console.log("Delegate session failed:", e.message);
    }
    // 4. Initialize Obligation
    try {
        const ob = await program.account.obligation.fetchNullable(obligationPda);
        if (!ob) {
            console.log("Initializing obligation: 120 SOL, 7400 USDC debt, 80% LT, $148 price...");
            const tx = await program.methods
                .initializeObligation(new anchor_1.BN(120 * 1e9), // 120 SOL
            new anchor_1.BN(7400 * 1e6), // 7400 USDC debt
            8000, // 80% LT
            new anchor_1.BN(148 * 1e6) // $148.00
            )
                .accounts({
                obligation: obligationPda,
                authority: userKeypair.publicKey,
                systemProgram: web3_js_1.SystemProgram.programId,
            })
                .rpc();
            console.log("Obligation initialized, tx:", tx);
        }
        else {
            console.log("Obligation already exists. Debt:", ob.debtAmount.toString());
        }
    }
    catch (e) {
        console.log("Obligation check failed:", e.message);
    }
    console.log("=== Setup Complete! ===");
}
main().catch(console.error);
