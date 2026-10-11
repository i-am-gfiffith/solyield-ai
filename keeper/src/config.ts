import { Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

export const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "6LfAWRgqdWtUtN1b9H3sXPRPTbQGDirtG9e1Wj5nKydQ"
);

export const PORT = parseInt(process.env.PORT || "3001", 10);

export function loadKeeperKeypair(): Keypair {
  const possiblePaths = [
    path.resolve(process.cwd(), "keeper-keypair.json"),
    path.resolve(__dirname, "../keeper-keypair.json"),
    path.resolve(__dirname, "../../keeper-keypair.json"),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
      return Keypair.fromSecretKey(Uint8Array.from(raw));
    }
  }
  const kp = Keypair.generate();
  fs.writeFileSync(possiblePaths[0], JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

export const KEEPER_KEYPAIR = loadKeeperKeypair();
