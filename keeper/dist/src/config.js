"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KEEPER_KEYPAIR = exports.PORT = exports.PROGRAM_ID = exports.RPC_URL = void 0;
exports.loadKeeperKeypair = loadKeeperKeypair;
const web3_js_1 = require("@solana/web3.js");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
exports.PROGRAM_ID = new web3_js_1.PublicKey(process.env.PROGRAM_ID || "6LfAWRgqdWtUtN1b9H3sXPRPTbQGDirtG9e1Wj5nKydQ");
exports.PORT = parseInt(process.env.PORT || "3001", 10);
function loadKeeperKeypair() {
    const possiblePaths = [
        path_1.default.resolve(process.cwd(), "keeper-keypair.json"),
        path_1.default.resolve(__dirname, "../keeper-keypair.json"),
        path_1.default.resolve(__dirname, "../../keeper-keypair.json"),
    ];
    for (const p of possiblePaths) {
        if (fs_1.default.existsSync(p)) {
            const raw = JSON.parse(fs_1.default.readFileSync(p, "utf-8"));
            return web3_js_1.Keypair.fromSecretKey(Uint8Array.from(raw));
        }
    }
    const kp = web3_js_1.Keypair.generate();
    fs_1.default.writeFileSync(possiblePaths[0], JSON.stringify(Array.from(kp.secretKey)));
    return kp;
}
exports.KEEPER_KEYPAIR = loadKeeperKeypair();
