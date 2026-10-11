import {
  Connection,
  PublicKey,
  SystemProgram,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { RPC_URL, PROGRAM_ID, KEEPER_KEYPAIR } from "./config";
import idl from "../idl/solyield.json";

export interface KeeperLog {
  id: string;
  timestamp: string;
  type: "info" | "action" | "warn" | "error";
  message: string;
  signature?: string;
  details?: Record<string, any>;
}

export interface MonitoredPosition {
  authority: string;
  vaultPda: string;
  sessionPda: string;
  obligationPda: string;
  collateralSol: number;
  debtUsdc: number;
  liquidationThresholdBps: number;
  oraclePriceUsd: number;
  healthFactor: number;
  triggerHealthFactor: number;
  reserveBalanceUsdc: number;
  perTxCapUsdc: number;
  status: "SAFE" | "WATCH" | "BELOW TRIGGER" | "LIQUIDATABLE" | "NO_RESERVE" | "INACTIVE";
  lastCheckSlot: number;
}

export class SolYieldKeeper {
  private connection: Connection;
  private provider: AnchorProvider;
  private program: Program<any>;
  private monitoredAuthorities: Set<string> = new Set();
  private logs: KeeperLog[] = [];
  private positionsCache: Map<string, MonitoredPosition> = new Map();
  private isRunning: boolean = false;
  private currentSlot: number = 0;

  constructor() {
    this.connection = new Connection(RPC_URL, "confirmed");
    const wallet = new Wallet(KEEPER_KEYPAIR);
    this.provider = new AnchorProvider(this.connection, wallet, {
      commitment: "confirmed",
    });
    this.program = new Program(idl as any, this.provider);
  }

  public getKeeperPubkey(): string {
    return KEEPER_KEYPAIR.publicKey.toBase58();
  }

  public getLogs(): KeeperLog[] {
    return this.logs.slice(-50);
  }

  public getPositions(): MonitoredPosition[] {
    return Array.from(this.positionsCache.values());
  }

  public getCurrentSlot(): number {
    return this.currentSlot;
  }

  public log(type: KeeperLog["type"], message: string, signature?: string, details?: Record<string, any>) {
    const d = new Date();
    const timeStr = [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((x) => String(x).padStart(2, "0"))
      .join(":");
    const logItem: KeeperLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: timeStr,
      type,
      message,
      signature,
      details,
    };
    this.logs.unshift(logItem);
    if (this.logs.length > 200) {
      this.logs.pop();
    }
    console.log(`[${timeStr}] [${type.toUpperCase()}] ${message}`);
  }

  public registerAuthority(authorityStr: string) {
    try {
      new PublicKey(authorityStr);
      this.monitoredAuthorities.add(authorityStr);
      this.log("info", `Registered authority for monitoring: ${authorityStr.slice(0, 4)}...${authorityStr.slice(-4)}`);
    } catch (e) {
      this.log("error", `Invalid authority key: ${authorityStr}`);
    }
  }

  public getVaultPda(authority: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), authority.toBuffer()],
      PROGRAM_ID
    )[0];
  }

  public getSessionPda(vault: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("session"), vault.toBuffer()],
      PROGRAM_ID
    )[0];
  }

  public getObligationPda(authority: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("obligation"), authority.toBuffer()],
      PROGRAM_ID
    )[0];
  }

  public async evaluatePosition(authorityStr: string): Promise<MonitoredPosition | null> {
    try {
      const authority = new PublicKey(authorityStr);
      const vaultPda = this.getVaultPda(authority);
      const sessionPda = this.getSessionPda(vaultPda);
      const obligationPda = this.getObligationPda(authority);

      const [vaultAcc, sessionAcc, obligationAcc] = await Promise.all([
        (this.program.account as any).vault.fetchNullable(vaultPda),
        (this.program.account as any).session.fetchNullable(sessionPda),
        (this.program.account as any).obligation.fetchNullable(obligationPda),
      ]);

      if (!obligationAcc) {
        return null;
      }

      const collateralSol = obligationAcc.collateralAmount.toNumber() / 1e9;
      const debtUsdc = obligationAcc.debtAmount.toNumber() / 1e6;
      const liquidationThresholdBps = obligationAcc.liquidationThresholdBps;
      const oraclePriceUsd = obligationAcc.oraclePrice.toNumber() / 1e6;

      // Calculate HF
      const collateralVal = collateralSol * oraclePriceUsd;
      const effectiveCollateral = collateralVal * (liquidationThresholdBps / 10000);
      const healthFactor = debtUsdc > 0 ? effectiveCollateral / debtUsdc : 999;

      const triggerHealthFactor = sessionAcc
        ? sessionAcc.triggerHealthFactorBps / 10000
        : 1.35;
      const perTxCapUsdc = sessionAcc ? sessionAcc.perTxRepayCap.toNumber() / 1e6 : 0;
      const reserveBalanceUsdc = vaultAcc ? vaultAcc.reserveBalance.toNumber() / 1e6 : 0;

      let status: MonitoredPosition["status"] = "SAFE";
      if (!sessionAcc || !sessionAcc.isActive) {
        status = "INACTIVE";
      } else if (reserveBalanceUsdc <= 0 && healthFactor < triggerHealthFactor) {
        status = "NO_RESERVE";
      } else if (healthFactor < 1.0) {
        status = "LIQUIDATABLE";
      } else if (healthFactor < triggerHealthFactor) {
        status = "BELOW TRIGGER";
      } else if (healthFactor < triggerHealthFactor + 0.1) {
        status = "WATCH";
      }

      const pos: MonitoredPosition = {
        authority: authorityStr,
        vaultPda: vaultPda.toBase58(),
        sessionPda: sessionPda.toBase58(),
        obligationPda: obligationPda.toBase58(),
        collateralSol,
        debtUsdc,
        liquidationThresholdBps,
        oraclePriceUsd,
        healthFactor: parseFloat(healthFactor.toFixed(3)),
        triggerHealthFactor,
        reserveBalanceUsdc,
        perTxCapUsdc,
        status,
        lastCheckSlot: this.currentSlot,
      };

      this.positionsCache.set(authorityStr, pos);
      return pos;
    } catch (err: any) {
      this.log("warn", `Failed to evaluate position for ${authorityStr.slice(0, 4)}: ${err.message}`);
      return null;
    }
  }

  public async checkAndExecuteRepay(authorityStr: string) {
    const pos = await this.evaluatePosition(authorityStr);
    if (!pos) return;

    if (pos.status !== "BELOW TRIGGER" && pos.status !== "LIQUIDATABLE") {
      return;
    }

    if (pos.reserveBalanceUsdc <= 0) {
      this.log("warn", `HF ${pos.healthFactor} below trigger ${pos.triggerHealthFactor}, but vault reserve is empty.`);
      return;
    }

    try {
      const authority = new PublicKey(authorityStr);
      const vaultPda = new PublicKey(pos.vaultPda);
      const sessionPda = new PublicKey(pos.sessionPda);
      const obligationPda = new PublicKey(pos.obligationPda);

      // Calculate repayment amount needed to push HF to safe buffer (trigger + 0.15)
      const targetHf = pos.triggerHealthFactor + 0.15;
      const targetDebt =
        (pos.collateralSol * pos.oraclePriceUsd * (pos.liquidationThresholdBps / 10000)) / targetHf;
      const wantUsdc = Math.max(0, pos.debtUsdc - targetDebt);

      // Apply guardrail caps
      const repayUsdc = Math.min(wantUsdc, pos.perTxCapUsdc, pos.reserveBalanceUsdc, pos.debtUsdc);
      const repayAmountRaw = Math.floor(repayUsdc * 1e6);

      if (repayAmountRaw < 1000) {
        return; // negligible
      }

      this.log(
        "action",
        `🚨 TRIGGER BREACHED: HF ${pos.healthFactor} < ${pos.triggerHealthFactor}. Submitting guarded repay of $${repayUsdc.toFixed(2)} USDC...`
      );

      // Execute on-chain guarded_repay instruction
      const tx = await (this.program.methods as any)
        .guardedRepay(new BN(repayAmountRaw))
        .accounts({
          session: sessionPda,
          vault: vaultPda,
          obligation: obligationPda,
          authority: authority,
          keeper: KEEPER_KEYPAIR.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([KEEPER_KEYPAIR])
        .rpc();

      this.log(
        "action",
        `✅ REPAY SUCCESS: Repaid $${repayUsdc.toFixed(2)} USDC. Slot: ${this.currentSlot}`,
        tx,
        {
          repaidUsdc: repayUsdc,
          authority: authorityStr,
        }
      );

      // Refresh state
      await this.evaluatePosition(authorityStr);
    } catch (err: any) {
      this.log("error", `Guarded repay failed: ${err.message}`);
    }
  }

  public async simulatePriceDrop(authorityStr: string, newPriceUsd: number) {
    try {
      const authority = new PublicKey(authorityStr);
      const obligationPda = this.getObligationPda(authority);
      const priceRaw = new BN(Math.round(newPriceUsd * 1e6));

      this.log("info", `Simulating oracle price drop to $${newPriceUsd} for ${authorityStr.slice(0, 4)}...`);
      const tx = await (this.program.methods as any)
        .updatePrice(priceRaw)
        .accounts({
          obligation: obligationPda,
          caller: KEEPER_KEYPAIR.publicKey,
        })
        .signers([KEEPER_KEYPAIR])
        .rpc();

      this.log("info", `Oracle price updated to $${newPriceUsd}. Tx: ${tx.slice(0, 8)}...`);
      await this.checkAndExecuteRepay(authorityStr);
    } catch (err: any) {
      this.log("error", `Failed to update price: ${err.message}`);
    }
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.log("info", `Keeper service online. Pubkey: ${this.getKeeperPubkey()}`);

    // Slot & position watcher loop
    setInterval(async () => {
      try {
        this.currentSlot = await this.connection.getSlot("processed");
        for (const auth of this.monitoredAuthorities) {
          await this.checkAndExecuteRepay(auth);
        }
      } catch (e: any) {
        // network jitter handling
      }
    }, 2500);
  }
}
