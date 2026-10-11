"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolYieldKeeper = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const config_1 = require("./config");
const solyield_json_1 = __importDefault(require("../idl/solyield.json"));
class SolYieldKeeper {
    connection;
    provider;
    program;
    monitoredAuthorities = new Set();
    logs = [];
    positionsCache = new Map();
    isRunning = false;
    currentSlot = 0;
    constructor() {
        this.connection = new web3_js_1.Connection(config_1.RPC_URL, "confirmed");
        const wallet = new anchor_1.Wallet(config_1.KEEPER_KEYPAIR);
        this.provider = new anchor_1.AnchorProvider(this.connection, wallet, {
            commitment: "confirmed",
        });
        this.program = new anchor_1.Program(solyield_json_1.default, this.provider);
    }
    getKeeperPubkey() {
        return config_1.KEEPER_KEYPAIR.publicKey.toBase58();
    }
    getLogs() {
        return this.logs.slice(-50);
    }
    getPositions() {
        return Array.from(this.positionsCache.values());
    }
    getCurrentSlot() {
        return this.currentSlot;
    }
    log(type, message, signature, details) {
        const d = new Date();
        const timeStr = [d.getHours(), d.getMinutes(), d.getSeconds()]
            .map((x) => String(x).padStart(2, "0"))
            .join(":");
        const logItem = {
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
    registerAuthority(authorityStr) {
        try {
            new web3_js_1.PublicKey(authorityStr);
            this.monitoredAuthorities.add(authorityStr);
            this.log("info", `Registered authority for monitoring: ${authorityStr.slice(0, 4)}...${authorityStr.slice(-4)}`);
        }
        catch (e) {
            this.log("error", `Invalid authority key: ${authorityStr}`);
        }
    }
    getVaultPda(authority) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("vault"), authority.toBuffer()], config_1.PROGRAM_ID)[0];
    }
    getSessionPda(vault) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("session"), vault.toBuffer()], config_1.PROGRAM_ID)[0];
    }
    getObligationPda(authority) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("obligation"), authority.toBuffer()], config_1.PROGRAM_ID)[0];
    }
    async evaluatePosition(authorityStr) {
        try {
            const authority = new web3_js_1.PublicKey(authorityStr);
            const vaultPda = this.getVaultPda(authority);
            const sessionPda = this.getSessionPda(vaultPda);
            const obligationPda = this.getObligationPda(authority);
            const [vaultAcc, sessionAcc, obligationAcc] = await Promise.all([
                this.program.account.vault.fetchNullable(vaultPda),
                this.program.account.session.fetchNullable(sessionPda),
                this.program.account.obligation.fetchNullable(obligationPda),
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
            let status = "SAFE";
            if (!sessionAcc || !sessionAcc.isActive) {
                status = "INACTIVE";
            }
            else if (reserveBalanceUsdc <= 0 && healthFactor < triggerHealthFactor) {
                status = "NO_RESERVE";
            }
            else if (healthFactor < 1.0) {
                status = "LIQUIDATABLE";
            }
            else if (healthFactor < triggerHealthFactor) {
                status = "BELOW TRIGGER";
            }
            else if (healthFactor < triggerHealthFactor + 0.1) {
                status = "WATCH";
            }
            const pos = {
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
        }
        catch (err) {
            this.log("warn", `Failed to evaluate position for ${authorityStr.slice(0, 4)}: ${err.message}`);
            return null;
        }
    }
    async checkAndExecuteRepay(authorityStr) {
        const pos = await this.evaluatePosition(authorityStr);
        if (!pos)
            return;
        if (pos.status !== "BELOW TRIGGER" && pos.status !== "LIQUIDATABLE") {
            return;
        }
        if (pos.reserveBalanceUsdc <= 0) {
            this.log("warn", `HF ${pos.healthFactor} below trigger ${pos.triggerHealthFactor}, but vault reserve is empty.`);
            return;
        }
        try {
            const authority = new web3_js_1.PublicKey(authorityStr);
            const vaultPda = new web3_js_1.PublicKey(pos.vaultPda);
            const sessionPda = new web3_js_1.PublicKey(pos.sessionPda);
            const obligationPda = new web3_js_1.PublicKey(pos.obligationPda);
            // Calculate repayment amount needed to push HF to safe buffer (trigger + 0.15)
            const targetHf = pos.triggerHealthFactor + 0.15;
            const targetDebt = (pos.collateralSol * pos.oraclePriceUsd * (pos.liquidationThresholdBps / 10000)) / targetHf;
            const wantUsdc = Math.max(0, pos.debtUsdc - targetDebt);
            // Apply guardrail caps
            const repayUsdc = Math.min(wantUsdc, pos.perTxCapUsdc, pos.reserveBalanceUsdc, pos.debtUsdc);
            const repayAmountRaw = Math.floor(repayUsdc * 1e6);
            if (repayAmountRaw < 1000) {
                return; // negligible
            }
            this.log("action", `🚨 TRIGGER BREACHED: HF ${pos.healthFactor} < ${pos.triggerHealthFactor}. Submitting guarded repay of $${repayUsdc.toFixed(2)} USDC...`);
            // Execute on-chain guarded_repay instruction
            const tx = await this.program.methods
                .guardedRepay(new anchor_1.BN(repayAmountRaw))
                .accounts({
                session: sessionPda,
                vault: vaultPda,
                obligation: obligationPda,
                authority: authority,
                keeper: config_1.KEEPER_KEYPAIR.publicKey,
                systemProgram: web3_js_1.SystemProgram.programId,
            })
                .signers([config_1.KEEPER_KEYPAIR])
                .rpc();
            this.log("action", `✅ REPAY SUCCESS: Repaid $${repayUsdc.toFixed(2)} USDC. Slot: ${this.currentSlot}`, tx, {
                repaidUsdc: repayUsdc,
                authority: authorityStr,
            });
            // Refresh state
            await this.evaluatePosition(authorityStr);
        }
        catch (err) {
            this.log("error", `Guarded repay failed: ${err.message}`);
        }
    }
    async simulatePriceDrop(authorityStr, newPriceUsd) {
        try {
            const authority = new web3_js_1.PublicKey(authorityStr);
            const obligationPda = this.getObligationPda(authority);
            const priceRaw = new anchor_1.BN(Math.round(newPriceUsd * 1e6));
            this.log("info", `Simulating oracle price drop to $${newPriceUsd} for ${authorityStr.slice(0, 4)}...`);
            const tx = await this.program.methods
                .updatePrice(priceRaw)
                .accounts({
                obligation: obligationPda,
                caller: config_1.KEEPER_KEYPAIR.publicKey,
            })
                .signers([config_1.KEEPER_KEYPAIR])
                .rpc();
            this.log("info", `Oracle price updated to $${newPriceUsd}. Tx: ${tx.slice(0, 8)}...`);
            await this.checkAndExecuteRepay(authorityStr);
        }
        catch (err) {
            this.log("error", `Failed to update price: ${err.message}`);
        }
    }
    start() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        this.log("info", `Keeper service online. Pubkey: ${this.getKeeperPubkey()}`);
        // Slot & position watcher loop
        setInterval(async () => {
            try {
                this.currentSlot = await this.connection.getSlot("processed");
                for (const auth of this.monitoredAuthorities) {
                    await this.checkAndExecuteRepay(auth);
                }
            }
            catch (e) {
                // network jitter handling
            }
        }, 2500);
    }
}
exports.SolYieldKeeper = SolYieldKeeper;
