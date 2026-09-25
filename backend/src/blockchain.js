import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER = path.join(__dirname, "../../blockchain/academic_ledger.json");

function loadLedger() {
  if (!fs.existsSync(LEDGER)) return { blocks: [], network: "academic-prototype" };
  return JSON.parse(fs.readFileSync(LEDGER, "utf8"));
}

function saveLedger(l) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2));
}

/**
 * Academic blockchain certification.
 * If GANACHE_RPC is set, a future ethers.js deployment can replace the local ledger.
 * Hashes only — documents and datasets stay off-chain.
 */
export function certifyCredit(credit) {
  const payload = {
    creditId: String(credit._id),
    farmerId: String(credit.farmerId),
    quantity: credit.quantity,
    farmId: String(credit.farmId),
    issuedAt: new Date().toISOString(),
  };
  const payloadHash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const ledger = loadLedger();
  const blockNumber = (ledger.blocks?.length || 0) + 1;
  const prev = ledger.blocks?.[ledger.blocks.length - 1]?.txHash || "0xgenesis";
  const txHash = "0x" + crypto.createHash("sha256").update(prev + payloadHash + blockNumber).digest("hex");
  const certificateHash = "0x" + crypto.createHash("sha256").update(txHash + payloadHash).digest("hex");
  const rec = {
    txHash,
    blockNumber,
    payloadHash,
    certificateHash,
    payload,
    timestamp: new Date().toISOString(),
  };
  ledger.blocks = ledger.blocks || [];
  ledger.blocks.push(rec);
  saveLedger(ledger);
  return {
    ...rec,
    network: process.env.GANACHE_RPC ? "ganache" : "academic-ledger",
    mode: process.env.GANACHE_RPC ? "GANACHE" : "ACADEMIC_LEDGER",
  };
}
