"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const keeper_1 = require("./keeper");
const config_1 = require("./config");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const keeper = new keeper_1.SolYieldKeeper();
keeper.start();
// Status endpoint
app.get("/api/status", async (req, res) => {
    res.json({
        status: "online",
        keeperPubkey: keeper.getKeeperPubkey(),
        programId: config_1.PROGRAM_ID.toBase58(),
        rpcUrl: config_1.RPC_URL,
        slot: keeper.getCurrentSlot(),
        monitoredCount: keeper.getPositions().length,
    });
});
// Logs endpoint
app.get("/api/logs", (req, res) => {
    res.json({
        logs: keeper.getLogs(),
    });
});
// Positions endpoint
app.get("/api/positions", (req, res) => {
    res.json({
        positions: keeper.getPositions(),
    });
});
// Register authority
app.post("/api/register", async (req, res) => {
    const { authority } = req.body;
    if (!authority) {
        return res.status(400).json({ error: "authority required" });
    }
    keeper.registerAuthority(authority);
    const pos = await keeper.evaluatePosition(authority);
    res.json({ success: true, position: pos });
});
// Evaluate position
app.post("/api/evaluate", async (req, res) => {
    const { authority } = req.body;
    if (!authority) {
        return res.status(400).json({ error: "authority required" });
    }
    const pos = await keeper.evaluatePosition(authority);
    await keeper.checkAndExecuteRepay(authority);
    res.json({ success: true, position: pos });
});
// Simulate price drop
app.post("/api/simulate-drop", async (req, res) => {
    const { authority, price } = req.body;
    if (!authority || !price) {
        return res.status(400).json({ error: "authority and price required" });
    }
    await keeper.simulatePriceDrop(authority, parseFloat(price));
    const pos = await keeper.evaluatePosition(authority);
    res.json({ success: true, position: pos });
});
// Server-Sent Events (SSE) for live streaming to frontend
app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const interval = setInterval(() => {
        const data = JSON.stringify({
            slot: keeper.getCurrentSlot(),
            logs: keeper.getLogs().slice(0, 5),
            positions: keeper.getPositions(),
        });
        res.write(`data: ${data}\n\n`);
    }, 1500);
    req.on("close", () => {
        clearInterval(interval);
        res.end();
    });
});
app.listen(config_1.PORT, () => {
    console.log(`SolYield Keeper API listening on http://localhost:${config_1.PORT}`);
});
