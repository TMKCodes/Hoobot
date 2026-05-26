import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import path from "path";
import { createHash } from "crypto";
import { gzipSync, gunzipSync } from "zlib";
import type { ConfigOptions } from "../Utilities/Args";
import type { Balances } from "../Exchanges/Balances";
import type { Candlesticks } from "../Exchanges/Candlesticks";
import type { TradeHistory } from "../Exchanges/Trades";
import { findProjectRoot, symbolsActiveForTrading } from "../Utilities/Args";

export const SIM_CHECKPOINT_VERSION = 2 as const;

export type SimulationCheckpoint = {
  version: 1 | typeof SIM_CHECKPOINT_VERSION;
  savedAt: string;
  /** SHA-256(konfiguraation snapshotti)#candleRows — laajempi kuin pelkkä symbolilista. */
  fingerprint: string;
  symIdx: number;
  candleIndex: number;
  candleRows: number;
  simulationHistoryYears: number | undefined;
  symbolsOrder: string[];
  candleStore: Candlesticks;
  balances: Balances;
  tradeHistory: TradeHistory;
  startingBalance: number;
};

const CHECKPOINT_FILE_FORMAT = "hoobot-sim-checkpoint-v2" as const;

type CheckpointFileEnvelope = {
  fileFormat: typeof CHECKPOINT_FILE_FORMAT;
  gzipBase64: string;
};

function stableSortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSortJson);
  }
  if (value != null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = stableSortJson(obj[key]);
    }
    return out;
  }
  return value;
}

/** Konfiguraatio ilman ajonaikaisia kenttiä + avaimet tyhjennetty — fingerprintiin. */
function configSnapshotForCheckpointHash(cfg: ConfigOptions): unknown {
  const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
  delete raw.startTime;
  raw.running = false;
  const exchanges = raw.exchanges;
  if (Array.isArray(exchanges)) {
    for (const ex of exchanges as Record<string, unknown>[]) {
      if (!ex || typeof ex !== "object") continue;
      if (typeof ex.key === "string") ex.key = "";
      if (typeof ex.secret === "string") ex.secret = "";
      delete ex.balances;
      delete ex.tradeHistory;
      delete ex.orderbooks;
      delete ex.openOrders;
    }
  }
  return stableSortJson(raw);
}

export function buildSimulationCheckpointFingerprint(cfg: ConfigOptions, candleRows: number): string {
  const snap = configSnapshotForCheckpointHash(cfg);
  const h = createHash("sha256").update(JSON.stringify(snap)).digest("hex");
  return `${h}#${candleRows}`;
}

export const defaultSimulationCheckpointPath = (): string =>
  path.join(findProjectRoot(), "simulation", "simulate-checkpoint.json");

export function validateCheckpointForRun(
  cfg: ConfigOptions,
  candleRows: number,
  cp: SimulationCheckpoint
): string | null {
  if (cp.version !== SIM_CHECKPOINT_VERSION) {
    if (cp.version === 1) {
      return "Checkpoint on vanhentunut (versio 1). Tyhjennä checkpoint ja aja simulaatio alusta.";
    }
    return "Checkpoint-versio ei ole tuettu.";
  }
  const fp = buildSimulationCheckpointFingerprint(cfg, candleRows);
  if (cp.fingerprint !== fp) {
    return "Simulaation asetukset tai kynttilähistorian koko ei täsmää checkpointiin. Tyhjennä checkpoint tai palauta samat asetukset ja data.";
  }
  if (cp.candleRows !== candleRows) {
    return "Kynttilärivien määrä ei täsmää checkpointiin (historia voi olla muuttunut — lataa kynttilät uudelleen).";
  }
  const ex = cfg.exchanges?.find((e) => e.name === "binance");
  const order = symbolsActiveForTrading(ex?.symbols).map((s) => s.name);
  if (order.join("|") !== cp.symbolsOrder.join("|")) {
    return "Symbolien järjestys tai lista ei täsmää checkpointiin.";
  }
  if (cp.symIdx < 0 || cp.symIdx >= order.length) {
    return "Checkpointin symbolierä on virheellinen.";
  }
  if (cp.candleIndex < 0 || cp.candleIndex > candleRows) {
    return "Checkpointin kynttiläindeksi on virheellinen.";
  }
  return null;
}

function parseCheckpointPayload(parsed: unknown): SimulationCheckpoint | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (o.fileFormat === CHECKPOINT_FILE_FORMAT && typeof o.gzipBase64 === "string") {
    try {
      const json = gunzipSync(Buffer.from(o.gzipBase64, "base64")).toString("utf-8");
      const inner = JSON.parse(json) as SimulationCheckpoint;
      if (inner && (inner.version === 1 || inner.version === 2) && typeof inner.symIdx === "number") {
        return inner;
      }
    } catch {
      return null;
    }
    return null;
  }
  const cp = parsed as SimulationCheckpoint;
  if (cp && (cp.version === 1 || cp.version === 2) && typeof cp.symIdx === "number") {
    return cp;
  }
  return null;
}

export function readSimulationCheckpointFile(filePath: string): SimulationCheckpoint | null {
  try {
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, "utf-8");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parseCheckpointPayload(parsed);
  } catch {
    return null;
  }
}

export function writeSimulationCheckpointFile(filePath: string, cp: SimulationCheckpoint): void {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const inner = JSON.stringify(cp);
  const gz = gzipSync(Buffer.from(inner, "utf-8"), { level: 6 });
  const envelope: CheckpointFileEnvelope = {
    fileFormat: CHECKPOINT_FILE_FORMAT,
    gzipBase64: gz.toString("base64"),
  };
  const finalPayload = JSON.stringify(envelope);
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, finalPayload, "utf-8");
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    // ignore
  }
  renameSync(tmp, filePath);
}

export function deleteSimulationCheckpointFile(filePath: string): void {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch (e) {
    console.error("deleteSimulationCheckpointFile:", e);
  }
}
