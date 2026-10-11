import express from "express";
import cors from "cors";
import { SolYieldKeeper } from "./keeper";
import { PORT, PROGRAM_ID, RPC_URL } from "./config";

const app = express();
app.use(cors());
app.use(express.json());

const keeper = new SolYieldKeeper();
keeper.start();

// Status endpoint
app.get("/api/status", async (req, res) => {
  res.json({
    status: "online",
    keeperPubkey: keeper.getKeeperPubkey(),
    programId: PROGRAM_ID.toBase58(),
    rpcUrl: RPC_URL,
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

app.listen(PORT, () => {
  console.log(`SolYield Keeper API listening on http://localhost:${PORT}`);
});
