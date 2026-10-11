import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import fs from "fs";
import { RPC_URL, PROGRAM_ID, KEEPER_KEYPAIR } from "./config";
import idl from "../idl/solyield.json";

async function main() {
  console.log("=== SolYield Devnet End-to-End Test ===");
  const connection = new Connection(RPC_URL, "confirmed");

  // Load user wallet
  const userKeypairRaw = JSON.parse(
    fs.readFileSync("/home/anmol/.config/solana/id.json", "utf-8")
  );
  const userKeypair = Keypair.fromSecretKey(Uint8Array.from(userKeypairRaw));
  console.log("User wallet:", userKeypair.publicKey.toBase58());
  console.log("Keeper wallet:", KEEPER_KEYPAIR.publicKey.toBase58());

  const provider = new AnchorProvider(connection, new Wallet(userKeypair), {
    commitment: "confirmed",
  });
  const program = new Program(idl as any, provider);

  // PDAs
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), userKeypair.publicKey.toBuffer()],
    PROGRAM_ID
  );
  const [sessionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("session"), vaultPda.toBuffer()],
    PROGRAM_ID
  );
  const [obligationPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("obligation"), userKeypair.publicKey.toBuffer()],
    PROGRAM_ID
  );

  console.log("Vault PDA:", vaultPda.toBase58());
  console.log("Session PDA:", sessionPda.toBase58());
  console.log("Obligation PDA:", obligationPda.toBase58());

  // 1. Initialize Vault if needed
  try {
    const v = await (program.account as any).vault.fetchNullable(vaultPda);
    if (!v) {
      console.log("Initializing Vault...");
      const tx = await (program.methods as any)
        .initializeVault()
        .accounts({
          vault: vaultPda,
          authority: userKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("Vault initialized, tx:", tx);
    } else {
      console.log("Vault already exists. Reserve:", v.reserveBalance.toString());
    }
  } catch (e: any) {
    console.error("Vault check failed:", e.message);
  }

  // 2. Deposit reserve (e.g. 3,000 units = 3000 * 1e6)
  try {
    console.log("Depositing reserve...");
    const tx = await (program.methods as any)
      .depositReserve(new BN(3000 * 1e6))
      .accounts({
        vault: vaultPda,
        authority: userKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Deposited 3000 USDC reserve, tx:", tx);
  } catch (e: any) {
    console.log("Deposit failed or skipped:", e.message);
  }

  // 3. Delegate Session to Keeper
  try {
    console.log("Delegating session to keeper...");
    const tx = await (program.methods as any)
      .delegateSession(
        KEEPER_KEYPAIR.publicKey,
        13500, // 1.35 trigger HF
        new BN(2500 * 1e6), // 2500 USDC per tx cap
        new BN(10000 * 1e6), // 10000 USDC cumulative cap
        new BN(86400 * 30) // 30 days
      )
      .accounts({
        session: sessionPda,
        vault: vaultPda,
        authority: userKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Session delegated, tx:", tx);
  } catch (e: any) {
    console.log("Delegate session failed:", e.message);
  }

  // 4. Initialize Obligation
  try {
    const ob = await (program.account as any).obligation.fetchNullable(obligationPda);
    if (!ob) {
      console.log("Initializing obligation: 120 SOL, 7400 USDC debt, 80% LT, $148 price...");
      const tx = await (program.methods as any)
        .initializeObligation(
          new BN(120 * 1e9), // 120 SOL
          new BN(7400 * 1e6), // 7400 USDC debt
          8000, // 80% LT
          new BN(148 * 1e6) // $148.00
        )
        .accounts({
          obligation: obligationPda,
          authority: userKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("Obligation initialized, tx:", tx);
    } else {
      console.log("Obligation already exists. Debt:", ob.debtAmount.toString());
    }
  } catch (e: any) {
    console.log("Obligation check failed:", e.message);
  }

  console.log("=== Setup Complete! ===");
}

main().catch(console.error);
