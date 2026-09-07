import fs from "fs";
import path from "path";
import {
  applyRecommendedAlgorithmicIndicators,
  shouldApplyComplementaryIndicators,
} from "../Modes/algorithmicIndicators";
import { normalizeAlgorithmicIndicatorParams } from "../Indicators/indicatorParams";
import { Balances } from "../Exchanges/Balances";
import { Orderbooks } from "../Exchanges/Orderbook";
import { TradeHistory } from "../Exchanges/Trades";
import { Order } from "../Exchanges/Orders";
import { logToFile } from "./LogToFile";
import { Exchange } from "../Exchanges/Exchange";

export interface CurrentProfitMax {
  [symbol: string]: number;
}

export type CandlestickInterval =
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "8h"
  | "12h"
  | "1d"
  | "3d"
  | "1w"
  | "1M";

export type BotMode = "algorithmic" | "hilow";

/** Normalizes symbol to exchange key format (e.g. "BTC/USDT" -> "BTCUSDT"). */
export const toSymbolKey = (symbol: string): string => {
  if (!symbol || typeof symbol !== "string") return "";
  return symbol.split("/").join("");
};

export const getSecondsFromInterval = (interval: CandlestickInterval): number => {
  const intervalToSeconds: Record<CandlestickInterval, number> = {
    "1m": 60,
    "3m": 60 * 3,
    "5m": 60 * 5,
    "15m": 60 * 15,
    "30m": 60 * 30,
    "1h": 60 * 60,
    "2h": 60 * 60 * 2,
    "4h": 60 * 60 * 4,
    "6h": 60 * 60 * 6,
    "8h": 60 * 60 * 8,
    "12h": 60 * 60 * 12,
    "1d": 60 * 60 * 24,
    "3d": 60 * 60 * 24 * 3,
    "1w": 60 * 60 * 24 * 7,
    "1M": 60 * 60 * 24 * 30, // Assuming 30 days in a month
  };
  return intervalToSeconds[interval];
};

export const getMinutesFromInterval = (interval: CandlestickInterval): number => {
  const intervalToSeconds: Record<CandlestickInterval, number> = {
    "1m": 1,
    "3m": 3,
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "2h": 60 * 2,
    "4h": 60 * 4,
    "6h": 60 * 6,
    "8h": 60 * 8,
    "12h": 60 * 12,
    "1d": 60 * 24,
    "3d": 60 * 24 * 3,
    "1w": 60 * 24 * 7,
    "1M": 60 * 24 * 30, // Assuming 30 days in a month
  };
  return intervalToSeconds[interval];
};

export interface OpenOrders {
  [symbol: string]: Order[];
}

export interface ExchangeOptions {
  name: string;
  socket: Exchange;
  key: string;
  secret: string;
  mode: "algorithmic" | "hilow" | "extreme" | "grid" | "consecutive" | "periodic" | "marketmaking";
  forceStopOnDisconnect: boolean;
  console: string;
  openOrders: OpenOrders;
  balances: Balances;
  tradeHistory: TradeHistory;
  orderbooks: Orderbooks;
  symbols: SymbolOptions[];
  /** When true, no real orders are placed (dry run). */
  dryRun?: boolean;
  /**
   * Binance REST: HTTP-pyynnön timeout millisekunteina (node-binance `request`).
   * Ei sama kuin API:n `recvWindow`. Oletus Hoobotissa 300000 (5 min).
   */
  binanceHttpRequestTimeoutMs?: number;
}

export interface GridLevel {
  orderId: string;
  price: number;
  size: string;
  type: "buy" | "sell";
  executed: boolean;
}

export interface SymbolOptions {
  /** Kun false, paria ei treidata (live tai sim) — oletus true jos puuttuu. */
  enabled?: boolean;
  currentOrder: Order | undefined;
  noPreviousTradeCheck: boolean;
  minimumTimeSinceLastTrade: number;
  name: string;
  timeframes: CandlestickInterval[];
  agreement: number;
  source: "close" | "high" | "low";
  consecutiveQuantity: number;
  consecutiveDirection: "SELL" | "BUY" | undefined;
  consecutivePreviousDirection: string | undefined;
  consecutiveNextTrade: string | undefined;
  consecutiveTradeAllowed: boolean | undefined;
  periodicDirection: "SELL" | "BUY" | undefined;
  periodicQuantity: number;
  periodicInterval: number;
  periodicTime: number;
  trend?: {
    current: string;
    enabled: boolean;
    timeframe: CandlestickInterval;
    ema: {
      short: number;
      long: number;
    };
  };
  profit?: {
    enabled: boolean;
    minimumSell: number;
    minimumBuy: number;
  };
  price?: {
    enabled: boolean;
    maximumSell: number;
    minimumSell: number;
    maximumBuy: number;
    minimumBuy: number;
  };
  growingMax?: {
    buy: number;
    sell: number;
  };
  /** Simulaation kiinteä ostosumma quote-valuutassa. 0/tyhjä = käytä koko käytettävissä olevaa quote-saldoa. */
  simulationBuyAmountQuote?: number;
  closePercentage?: number;
  maximumAgeOfOrder?: number;
  tradeFeePercentage?: number;
  stopLoss?: {
    enabled: boolean;
    stopTrading: boolean;
    pnl: number;
    agingPerHour: number;
    hit: boolean;
  };
  stopLossBuy?: {
    enabled: boolean;
    pnl: number;
    agingPerHour: number;
  };
  takeProfit?: {
    enabled: boolean;
    /** Vähimmäis-unrealized % vain TP-suluissa (trailing). 0 = ei lattiaa. Ei koske stop lossia. */
    limit: number;
    /** Trailing-aktivointi: unrealized ≥ minimum → armed. Ei yksinään sulje. */
    minimum: number;
    /** Sulku kun huipusta pudonnut ≥ drop % (vaatii armed). */
    drop: number;
    current: number;
    /** When to update currentMax: "update" every tick, "trade" only on order, "final" only on candle close. */
    currentMaxSource?: "update" | "trade" | "final";
    /** Pakkosulku huipun jälkeen (H14 forceAfter): pudotus ≥ drop, vähintään minProfit, myös HOLD. */
    forceAfterEnabled?: boolean;
    forceAfterCandles?: number;
    forceAfterDrop?: number;
    forceMinProfit?: number;
  };
  /** Erillinen TP vain kun enabled === true ja next === BUY; muuten takeProfit. */
  takeProfitBuy?: {
    enabled: boolean;
    /** Kuten takeProfit.limit (vain kun tämä osio käytössä BUY-polulla). */
    limit: number;
    /** Kuten takeProfit.minimum (arming BUY-polulla). */
    minimum: number;
    /** Kuten takeProfit.drop (BUY-sulku). */
    drop: number;
    current: number;
    currentMaxSource?: "update" | "trade" | "final";
    forceAfterEnabled?: boolean;
    forceAfterCandles?: number;
    forceAfterDrop?: number;
    forceMinProfit?: number;
  };
  forcedExit?: {
    enabled?: boolean;
    candles?: number;
    change?: number;
    /** Minimum unrealized PNL% required for forced exit. Prevents accidental loss trades. */
    minProfit?: number;
  };
  /** HiLow fixed EUR: myy kun quote-voitto ≥ sellProfitQuote; osta kun hinta on laskenut buyMoveQuote EUR verran. */
  hilowFixed?: {
    sellProfitQuote?: number;
    buyMoveQuote?: number;
    stopLossQuote?: number;
  };
  /** Algorithmic: complementary = suositeltu MACD+RSI+ADX+BB+CMF; custom = älä ylikirjoita loadissa. */
  indicatorsPreset?: "complementary" | "custom";
  /** Algorithmic: ATR-skaalaus, trendi-agreement, konflikti, idle-ease (oletus päällä). */
  algorithmicAdaptive?: {
    enabled?: boolean;
    volatilityScale?: boolean;
    atrLookback?: number;
    volatilityAgreement?: boolean;
    trendAgreement?: boolean;
    trendAlignedBonus?: number;
    trendCounterPenalty?: number;
    conflictEnabled?: boolean;
    conflictMinShare?: number;
    conflictPenalty?: number;
    maxCashCandles?: number;
    maxLongCandles?: number;
    agreementEaseMax?: number;
    feeAwareMinProfit?: boolean;
  };
  /** Extreme: adaptiivinen EUR-ping-pong (volatiliteetti + trendi). */
  extreme?: {
    sellProfitQuote?: number;
    buyMoveQuote?: number;
    stopLossQuote?: number;
    volatilityScale?: boolean;
    volatilityLookback?: number;
    trendAdjust?: boolean;
    maxCashCandles?: number;
    maxLongCandles?: number;
    /** Päivää ilman kauppaa → pakota seuraava askel (0 = pois). */
    idleForceDays?: number;
    /** Ylikirjoittaa päivät kynttilöinä. */
    idleForceCandles?: number;
  };
  grid: GridLevel[];
  gridOrderSize: number;
  gridRebalance: boolean;
  gridLevels: number;
  gridRange: {
    upper: number;
    lower: number;
  };
  gridDensity: "uniform" | "concentrated" | undefined;
  indicators?: {
    sma?: {
      enabled: boolean;
      length: number;
      weight?: number;
    };
    adx?: {
      enabled: boolean;
      dilength: number;
      adxSmoothing: number;
      weight?: number;
      plusDI?: {
        length: number;
      };
      minusDI?: {
        length: number;
      };
    };
    renko?: {
      enabled: boolean;
      weight: number;
      multiplier: number;
      brickSize: number;
    };
    ema?: {
      enabled?: boolean;
      short: number;
      long: number;
      weight?: number;
    };
    macd?: {
      enabled: boolean;
      fast: number;
      slow: number;
      signal: number;
      weight?: number;
      skipHistogram?: boolean;
    };
    rsi?: {
      enabled: boolean;
      length: number;
      smoothing?: {
        type: "EMA" | "SMA";
        length: number;
      };
      history: number;
      tresholds: {
        overbought: number;
        oversold: number;
      };
      weight?: number;
    };
    atr?: {
      enabled: boolean;
      length: number;
      weight?: number;
    };
    obv?: {
      enabled: boolean;
      length: number;
      weight?: number;
    };
    cmf?: {
      enabled: boolean;
      length: number;
      history: number;
      tresholds: {
        overbought: number;
        oversold: number;
      };
      weight?: number;
    };
    bb?: {
      enabled: boolean;
      length: number;
      multiplier: number;
      average: "SMA" | "EMA";
      history: number;
      weight?: number;
    };
    so?: {
      enabled: boolean;
      kPeriod: number;
      dPeriod: number;
      smoothing: number;
      tresholds: {
        overbought: number;
        oversold: number;
      };
      weight?: number;
    };
    srsi?: {
      enabled: boolean;
      rsiLength: number;
      stochLength: number;
      kPeriod: number;
      dPeriod: number;
      smoothK: number;
      smoothD: number;
      history: number;
      tresholds: {
        overbought: number;
        oversold: number;
      };
      weight?: number;
    };
    dmi?: {
      enabled: boolean;
      dmiLength: number;
      adxSmoothing: number;
      weight?: number;
    };
    aroon?: {
      enabled: boolean;
      length?: number;
      weight?: number;
    };
    cci?: {
      enabled: boolean;
      length?: number;
      thresholds?: {
        overbought: number;
        oversold: number;
      };
      weight?: number;
    };
    chaikin?: {
      enabled: boolean;
      fastPeriod?: number;
      slowPeriod?: number;
      weight?: number;
    };
    forceIndex?: {
      enabled: boolean;
      length?: number;
      weight?: number;
    };
    ichimoku?: {
      enabled: boolean;
      tenkanPeriod?: number;
      kijunPeriod?: number;
      senkouPeriod?: number;
      displacement?: number;
      weight?: number;
    };
    mfi?: {
      enabled: boolean;
      length?: number;
      thresholds?: {
        overbought: number;
        oversold: number;
      };
      weight?: number;
    };
    parabolicSAR?: {
      enabled: boolean;
      accelerationFactor?: number;
      maxAcceleration?: number;
      weight?: number;
    };
    vwap?: {
      enabled: boolean;
      stdDevMultiplier?: number;
      resetPeriod?: "daily" | "weekly" | "monthly" | "session";
      weight?: number;
    };
    williamsR?: {
      enabled: boolean;
      length?: number;
      thresholds?: {
        overbought: number;
        oversold: number;
      };
      weight?: number;
    };
    OpenAI?: {
      enabled: boolean;
      key: string;
      model: string;
      history: string;
      overwrite: boolean;
    };
  };
  /** Market Making mode: two-sided limit order quoting around the mid price. */
  marketMaking?: {
    /** Initial quote-currency amount allocated per slot (e.g. 50 = spend at least 50 USDT per slot). */
    startingSlotQuote: number;
    /** Full bid-ask spread as % of mid price (e.g. 0.5 = 0.5 %). Minimum effective value: 0.01 %. */
    spreadPercent: number;
    /** Number of price levels on each side, 1–5. Each successive level is offset by levelSpacingPercent. */
    levels: number;
    /** Additional price gap between consecutive levels as % of mid price (e.g. 0.1 = 0.1 %). */
    levelSpacingPercent: number;
    /** Quote-currency amount allocated per bid level (e.g. 50 = spend 50 USDT per bid order). Omit to use full quote balance divided evenly across levels. */
    orderSizeQuote?: number;
    /** Base-currency amount allocated per ask level (e.g. 0.001 = sell 0.001 BTC per ask order). Omit to use full base balance divided evenly across levels. */
    orderSizeBase?: number;
    /** Minimum milliseconds between full re-quote cycles (e.g. 5000 = 5 s). */
    refreshIntervalMs: number;
    /** Target base-asset value ratio 0–1 (default 0.5 = equal value in base and quote). */
    inventoryTarget?: number;
    /** Inventory skew strength 0–1 (default 0.5). 0 = no skew, 1 = maximum skew. */
    inventorySkewFactor?: number;
    /** Maximum total quote currency committed to open bids (exposure cap). Omit for no cap. */
    maxQuoteExposure?: number;
    /** Maximum total base currency committed to open asks (exposure cap). Omit for no cap. */
    maxBaseExposure?: number;
    /** Fixed mid price for the market making strategy. */
    fixedMidPrice?: number;
    /** Static mid price for the market making strategy. */
    staticMidPrice?: number;
  };
}

/** Poista hilowFixed.stopLossQuote jos tyhjä/0 — estää vanhan arvon jäämisen merge-tallennuksessa. */
export function normalizeHilowFixedOptions(sym: SymbolOptions): void {
  const hf = sym.hilowFixed;
  if (!hf || typeof hf !== "object") return;
  const sl = Number(hf.stopLossQuote);
  if (!Number.isFinite(sl) || sl <= 0) {
    delete hf.stopLossQuote;
  }
}

export function normalizeBbAverage(sym: SymbolOptions): void {
  const bb = sym.indicators?.bb;
  if (!bb) return;
  if (bb.average !== "EMA") {
    bb.average = "SMA";
  }
}

export function normalizeExtremeOptions(sym: SymbolOptions): void {
  const ex = sym.extreme;
  if (!ex || typeof ex !== "object") return;
  const sl = Number(ex.stopLossQuote);
  if (!Number.isFinite(sl) || sl <= 0) {
    delete ex.stopLossQuote;
  }
}

export interface DiscordOptions {
  enabled?: boolean;
  token?: string;
  applicationId?: string;
  serverId?: string;
  channelId?: string;
}

/** Simulaatio-grid: useita parametriyhdistelmiä samalla kynttilähistorialla (CLI / simulaatio-UI). */
export interface SimGridOptions {
  /** Kun true: simulaatio-UI voi käynnistää grid-ajon (POST /simulate/grid). */
  enabled?: boolean;
  /** Polku projektin juureen (esim. settings/sim-grid.example.json). */
  configPath?: string;
}

export interface ConfigOptions {
  running: boolean;
  debug: boolean;
  startTime: string;
  exchanges: ExchangeOptions[];
  license: string;
  simulate: boolean;
  discord: DiscordOptions;
  discordSecondary?: DiscordOptions;
  /** When true, no real orders are placed (dry run). */
  dryRun?: boolean;
  /**
   * Simulaatio: käytä vain kynttilöitä, joiden aika on viimeisen N vuoden sisällä (esim. 2 = viimeiset 2 vuotta).
   * Murto-osat sallittu: 1/12 ≈ 1 kk, 0.5 = 6 kk.
   * Pois, 0 tai negatiivinen = koko ladattu historia (Binance Vision ~2020 → nykyhetki).
   */
  simulationHistoryYears?: number;
  simGrid?: SimGridOptions;
  /**
   * Sim Yhteenveto / copy-symbol→live — symbolitason polut (camelCase, pistepolku esim. `takeProfit.target`).
   * Jos lista ei-tyhjä: PATCHistä päivitetään vain nämät polut; muu säilyy live-symbolista.
   * Tyhjä / puuttuu = täydellinen sulautus (PATCH + aiempi käyttäjälogi).
   */
  simPatchMergeAllowPaths?: string[];
  /**
   * Nämä PATHit kopioidaan aina PATCHin ja allowlist-merge jälkeen takaisin LIVE-symbolista
   * (PATCH ei saa päivittää esim. `apiKeys` tai `timeframes`).
   */
  simPreservePathsOnLiveMerge?: string[];
  [key: string]:
    | ExchangeOptions[]
    | DiscordOptions
    | string
    | string[]
    | number
    | boolean
    | undefined
    | number
    | TradeHistory
    | Orderbooks
    | Balances
    | OpenOrders
    | SimGridOptions; // Index signature
}

/** Poistettu TP-kentät — eivät enää vaikuta logiikkaan eivätkä säily mergeissä. */
const LEGACY_TAKE_PROFIT_KEYS = ["dropMinUnrealized"] as const;

export function stripLegacyTakeProfitFields(
  tp: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!tp || typeof tp !== "object") return tp;
  const out = { ...tp };
  for (const k of LEGACY_TAKE_PROFIT_KEYS) {
    delete out[k];
  }
  return out;
}

/** Poista legacy TP-kentät kaikista symboleista ennen tiedostoon kirjoitusta. */
export function sanitizeOptionsDocument(options: ConfigOptions): ConfigOptions {
  const out = JSON.parse(JSON.stringify(options)) as ConfigOptions;
  for (const ex of out.exchanges ?? []) {
    for (const sym of ex.symbols ?? []) {
      if (!sym || typeof sym !== "object") continue;
      if (sym.takeProfit) {
        sym.takeProfit = stripLegacyTakeProfitFields(
          sym.takeProfit as Record<string, unknown>,
        ) as SymbolOptions["takeProfit"];
      }
      if (sym.takeProfitBuy) {
        sym.takeProfitBuy = stripLegacyTakeProfitFields(
          sym.takeProfitBuy as Record<string, unknown>,
        ) as SymbolOptions["takeProfitBuy"];
      }
    }
  }
  return out;
}

/** Validates options after load. Logs warnings and normalizes structure to avoid runtime errors. */
export const validateOptions = (options: ConfigOptions): ConfigOptions => {
  if (!options || typeof options !== "object") {
    return { running: false, debug: false, startTime: "", exchanges: [], license: "", simulate: false, discord: {} };
  }
  if (!Array.isArray(options.exchanges)) {
    options.exchanges = [];
  }
  for (let i = 0; i < options.exchanges.length; i++) {
    const ex = options.exchanges[i];
    if (!ex || typeof ex !== "object") continue;
    if (!ex.name) ex.name = "";
    if (!ex.mode) ex.mode = "algorithmic";
    if (ex.mode === "algorithmic" || ex.mode === "hilow" || ex.mode === "extreme" || ex.mode === "periodic") {
      if (!Array.isArray(ex.symbols)) ex.symbols = [];
      for (let j = 0; j < ex.symbols.length; j++) {
        const sym = ex.symbols[j];
        if (sym && typeof sym === "object" && !sym.name) (sym as SymbolOptions).name = "";
        if (sym?.takeProfit) {
          sym.takeProfit = stripLegacyTakeProfitFields(
            sym.takeProfit as Record<string, unknown>,
          ) as SymbolOptions["takeProfit"];
        }
        if (sym?.takeProfitBuy) {
          sym.takeProfitBuy = stripLegacyTakeProfitFields(
            sym.takeProfitBuy as Record<string, unknown>,
          ) as SymbolOptions["takeProfitBuy"];
        }
        if (sym) {
          normalizeHilowFixedOptions(sym);
          normalizeExtremeOptions(sym);
          if (ex.mode === "algorithmic" && shouldApplyComplementaryIndicators(sym)) {
            applyRecommendedAlgorithmicIndicators(sym);
          }
          normalizeBbAverage(sym);
          if (ex.mode === "algorithmic") {
            normalizeAlgorithmicIndicatorParams(sym);
          }
        }
        if (sym.takeProfit?.enabled && (sym.takeProfit.drop ?? 0) <= 0) {
          console.warn(`[Hoobot] ${sym.name}: takeProfit enabled but drop <= 0 — trailing TP disabled.`);
        }
        if (sym.takeProfit?.enabled && (sym.takeProfit.minimum ?? 0) < 0) {
          console.warn(`[Hoobot] ${sym.name}: takeProfit.minimum is negative.`);
        }
        if (sym.stopLoss?.enabled && (sym.stopLoss.pnl ?? 0) > 0) {
          console.warn(`[Hoobot] ${sym.name}: stopLoss.pnl should be <= 0 (got ${sym.stopLoss.pnl}).`);
        }
        if (!Array.isArray(sym.timeframes) || sym.timeframes.length === 0) {
          console.warn(`[Hoobot] ${sym.name}: timeframes missing or empty.`);
        }
        if (sym.agreement != null && (sym.agreement < 0 || sym.agreement > 100)) {
          console.warn(`[Hoobot] ${sym.name}: agreement should be 0–100.`);
        }
      }
    }
  }
  if (!options.discord || typeof options.discord !== "object") options.discord = {};
  if (options.simGrid != null && typeof options.simGrid === "object") {
    const g = options.simGrid;
    if (g.enabled === undefined) g.enabled = false;
    if (typeof g.configPath !== "string" || g.configPath.trim() === "") {
      g.configPath = "settings/sim-grid.example.json";
    }
  }
  return options;
};

/** Symbolit joiden `enabled !== false` (vanhoissa asetuksissa kenttä puuttuu = treidataan). */
export const symbolsActiveForTrading = (symbols: SymbolOptions[] | undefined): SymbolOptions[] =>
  (symbols ?? []).filter((s) => s && s.enabled !== false);

/** Syväkopio; exchange key/secret → "***" (grid-/sim-tulostiedostot). */
export const maskConfigSecretsForExport = (options: ConfigOptions): ConfigOptions => {
  const out = JSON.parse(JSON.stringify(options)) as ConfigOptions;
  const exchanges = out.exchanges;
  if (Array.isArray(exchanges)) {
    for (const ex of exchanges) {
      if (ex && typeof ex === "object") {
        if (typeof ex.key === "string" && ex.key.length > 0) ex.key = "***";
        if (typeof ex.secret === "string" && ex.secret.length > 0) ex.secret = "***";
      }
    }
  }
  return out;
};

export const SETTINGS_LIVE_OPTIONS_BASENAME = "hoobot-options.json";

/** SIMULATE=true -istunnon oma asennustiedosto (ei live-bottia). */
export const SETTINGS_SIMULATE_OPTIONS_BASENAME = "hoobot-options-simulate.json";

export function getLiveOptionsFilePath(): string {
  return path.join(findProjectRoot(), "settings", SETTINGS_LIVE_OPTIONS_BASENAME);
}

export function getSimulateOptionsFilePath(): string {
  return path.join(findProjectRoot(), "settings", SETTINGS_SIMULATE_OPTIONS_BASENAME);
}

/**
 * Etsii projektin juuren: hakemisto jossa on settings/ ja hoobot-options*.json.
 * Kävelee process.cwd() ylöspäin (esim. build/ → projektin juuri).
 */
export function findProjectRoot(): string {
  let dir = path.resolve(process.cwd());
  const seen = new Set<string>();
  for (let i = 0; i < 16; i++) {
    if (seen.has(dir)) break;
    seen.add(dir);
    const settingsDir = path.join(dir, "settings");
    if (fs.existsSync(settingsDir)) {
      const marker = path.join(settingsDir, SETTINGS_LIVE_OPTIONS_BASENAME);
      const markerSim = path.join(settingsDir, SETTINGS_SIMULATE_OPTIONS_BASENAME);
      if (fs.existsSync(marker) || fs.existsSync(markerSim)) {
        return dir;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(process.cwd());
}

/** Suhteellinen polku projektin juureen (tai absoluuttinen sellaisenaan). */
export function resolveProjectRelativePath(relPath: string): string {
  const normalized = String(relPath ?? "")
    .trim()
    .replace(/\\/g, "/");
  if (!normalized) {
    return path.join(findProjectRoot(), "settings", "sim-grid.example.json");
  }
  if (path.isAbsolute(normalized)) {
    return normalized;
  }
  return path.resolve(findProjectRoot(), normalized);
}

const readConfigJsonFile = (filePath: string): Record<string, unknown> | null => {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed != null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const configHasExchanges = (doc: Record<string, unknown> | null | undefined): boolean =>
  Array.isArray(doc?.exchanges) && (doc?.exchanges as unknown[]).length > 0;

/** Kun simulate-tiedosto on tyhjä: ota livestä vain ensimmäinen enabled-symboli per pörssi (ei kaikkia live-pareja). */
const seedSimExchangesFromLive = (liveDoc: Record<string, unknown>): unknown[] => {
  const exchanges = liveDoc.exchanges;
  if (!Array.isArray(exchanges)) return [];
  const out: unknown[] = [];
  for (const rawEx of exchanges) {
    if (rawEx == null || typeof rawEx !== "object") continue;
    const ex = rawEx as Record<string, unknown>;
    const symbols = ex.symbols;
    if (!Array.isArray(symbols)) continue;
    const enabled = symbols.filter(
      (s) => s != null && typeof s === "object" && (s as { enabled?: boolean }).enabled !== false,
    );
    if (enabled.length === 0) continue;
    out.push({ ...ex, symbols: [JSON.parse(JSON.stringify(enabled[0]))] });
  }
  return out;
};

/**
 * Sim-UI / parseArgsSimulate: lue hoobot-options-simulate.json.
 * Jos simulate-tiedosto on olemassa mutta exchanges on tyhjä, täydennä yhdellä live-symbolilla
 * (simGrid ym. säilyvät simulate-tiedostosta). Ei koskaan sekoita koko live-listaa simulateen.
 */
export const loadSimulateSettingsDocument = (): Record<string, unknown> => {
  const simPath = getSimulateOptionsFilePath();
  const livePath = getLiveOptionsFilePath();
  const simDoc = readConfigJsonFile(simPath);
  const liveDoc = readConfigJsonFile(livePath);

  if (simDoc && configHasExchanges(simDoc)) {
    return { ...simDoc, simulate: true };
  }
  if (simDoc && liveDoc && configHasExchanges(liveDoc)) {
    return {
      ...liveDoc,
      ...simDoc,
      exchanges: seedSimExchangesFromLive(liveDoc),
      simulate: true,
    };
  }
  if (simDoc) return { ...simDoc, simulate: true };
  if (liveDoc) return { ...liveDoc, simulate: true };
  return { simulate: true, exchanges: [] };
};

/**
 * Simulaation asetukset: ensisijaisesti settings/hoobot-options-simulate.json.
 * Jos sitä ei ole tai exchanges on tyhjä, käytetään live-tiedoston pörssejä.
 */
export const parseArgsSimulate = (): ConfigOptions => {
  let options: ConfigOptions = {
    running: false,
    debug: false,
    startTime: "",
    exchanges: [],
    license: "",
    simulate: true,
    discord: {},
  };
  try {
    const loaded = loadSimulateSettingsDocument();
    options = loaded as unknown as ConfigOptions;
    options.simulate = true;
    options = validateOptions(options);
    for (let i = 0; i < options.exchanges.length; i++) {
      options.exchanges[i].tradeHistory = options.exchanges[i].tradeHistory ?? {};
    }
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error(JSON.stringify(error, null, 4));
  }
  return options;
};

export const parseArgs = (): ConfigOptions => {
  let options: ConfigOptions = {
    running: false,
    debug: false,
    startTime: "",
    exchanges: [],
    license: "",
    simulate: process.env.SIMULATE === "true" ? true : false,
    discord: {},
  };
  try {
    const optionsFilename = getLiveOptionsFilePath();
    if (fs.existsSync(optionsFilename)) {
      const optionsFile = fs.readFileSync(optionsFilename);
      options = JSON.parse(optionsFile.toString("utf-8"));
    }
    if (process.env.SIMULATE === "true") {
      options.simulate = true;
    }
    options = validateOptions(options);
    for (let i = 0; i < options.exchanges.length; i++) {
      options.exchanges[i].tradeHistory = options.exchanges[i].tradeHistory ?? {};
    }
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error(JSON.stringify(error, null, 4));
  }

  return options;
};
