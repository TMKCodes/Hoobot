/* =====================================================================
 * Hoobot - Proprietary License
 * Copyright (c) 2023 Hoosat Oy. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are not permitted without prior written permission
 * from Hoosat Oy. Unauthorized reproduction, copying, or use of this
 * software, in whole or in part, is strictly prohibited. All
 * modifications in source or binary must be submitted to Hoosat Oy in source format.
 *
 * THIS SOFTWARE IS PROVIDED BY HOOSAT OY "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL HOOSAT OY BE LIABLE FOR ANY DIRECT,
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
 * STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
 * OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * The user of this software uses it at their own risk. Hoosat Oy shall
 * not be liable for any losses, damages, or liabilities arising from
 * the use of this software.
 * ===================================================================== */

import fs from "fs";
import Binance from "node-binance-api";
import { loginDiscord } from "./Discord/discord";
import { listenForCandlesticks, Candlesticks } from "./Hoobot/Exchanges/Candlesticks";
import {
  ExchangeOptions,
  parseArgs,
  parseArgsSimulate,
  getLiveOptionsFilePath,
  getSimulateOptionsFilePath,
  loadSimulateSettingsDocument,
  getMinutesFromInterval,
  toSymbolKey,
  validateOptions,
  stripLegacyTakeProfitFields,
  sanitizeOptionsDocument,
  resolveProjectRelativePath,
  findProjectRoot,
  maskConfigSecretsForExport,
  type ConfigOptions,
  type SymbolOptions,
} from "./Hoobot/Utilities/Args";
import { createBinanceBalanceDataErrorLogBridge, getCurrentBalances, storeBalances } from "./Hoobot/Exchanges/Balances";
import { consoleLogger } from "./Hoobot/Utilities/ConsoleLogger";
import { getFilters } from "./Hoobot/Exchanges/Filters";
import dotenv from "dotenv";
import { algorithmic } from "./Hoobot/Modes/Algorithmic";
import { seedTakeProfitRuntimeForAllSymbols, syncTakeProfitRuntimeFromConfig } from "./Hoobot/Indicators/Profit";
import { getTakeProfitRuntimeState } from "./Hoobot/Indicators/takeProfitPositionState";
import { checkLicenseValidity } from "./Hoobot/Utilities/License";
import { Orderbook, getOrderbook, listenForOrderbooks } from "./Hoobot/Exchanges/Orderbook";
import {
  getTradeHistory,
  Trade,
  calculatePNLPercentageForLong,
  calculatePNLPercentageForShort,
} from "./Hoobot/Exchanges/Trades";
import { hilow } from "./Hoobot/Modes/HiLow";
import { extreme } from "./Hoobot/Modes/Extreme";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { Exchange } from "./Hoobot/Exchanges/Exchange";
import { logToFile } from "./Hoobot/Utilities/LogToFile";
import { NonKYC } from "./Hoobot/Exchanges/NonKYC/NonKYC";
import { Mexc } from "./Hoobot/Exchanges/Mexc/Mexc";
import { DexTrade } from "./Hoobot/Exchanges/DexTrade/DexTrade";
import { gridTrading } from "./Hoobot/Modes/Grid";
import { periodic } from "./Hoobot/Modes/Periodic";
import { fileURLToPath } from "url";
import express from "express";
import { createHash } from "crypto";
import { logger } from "./Hoobot/Utilities/Logger";
import { symbolFilters } from "./Hoobot/symbolFiltersStore";
import {
  runSimulationWithConfig,
  loadSimulationPreload,
  type SimulationApiResult,
  type SimulationProgress,
} from "./Hoobot/Simulation/runSimulationCore";
import {
  buildSimulationCheckpointFingerprint,
  defaultSimulationCheckpointPath,
  deleteSimulationCheckpointFile,
  readSimulationCheckpointFile,
} from "./Hoobot/Simulation/simulationCheckpoint";
import {
  deepMergeConfig,
  executeSimGrid,
  estimateGridVariantCount,
  validateGridPayload,
  type GridRunSummary,
  type GridRuntimeProgress,
} from "./Hoobot/Simulation/runSimGridCore";
import { flattenLeafValues } from "./Hoobot/Simulation/gridVariantCache";

export { symbolFilters, runSimulationWithConfig, loadSimulationPreload };
export type { SimulationApiResult, SimulationProgress };

// Get configuration options from command-line arguments and dotenv.
dotenv.config();

// Initialize Binance client

var options = process.env.SIMULATE === "true" ? parseArgsSimulate() : parseArgs();

const runExchange = async (exchange: Exchange, discord: any, exchangeOptions: ExchangeOptions) => {
  exchangeOptions.balances = await getCurrentBalances(exchange);
  storeBalances(exchange, exchangeOptions.balances);
  const candlesticksToPreload = 1000;
  const symbolCandlesticks: Candlesticks = {};
  if (exchangeOptions.mode === "algorithmic") {
    console.log(`Start running exchange ${exchangeOptions.name} on algorithmic mode.`);
    if (Array.isArray(exchangeOptions.symbols)) {
      if (exchangeOptions.orderbooks === undefined) {
        exchangeOptions.orderbooks = {};
      }
      for (const symbolOptions of exchangeOptions.symbols) {
        if (symbolOptions.enabled === false) continue;
        exchangeOptions.orderbooks[toSymbolKey(symbolOptions.name)] = await getOrderbook(exchange, symbolOptions.name);
        symbolFilters[toSymbolKey(symbolOptions.name)] = await getFilters(exchange, symbolOptions.name);

        const symbolKey = toSymbolKey(symbolOptions.name);
        if (exchangeOptions.tradeHistory === undefined) {
          exchangeOptions.tradeHistory = {};
        }
        exchangeOptions.tradeHistory[symbolKey] = await getTradeHistory(exchange, symbolOptions.name);
        const trades = exchangeOptions.tradeHistory[symbolKey];
        if (Array.isArray(trades) && trades.length > 0) {
          const last: Trade = trades[trades.length - 1];
          const timeStr = new Date(last.time).toLocaleString("fi-FI");
          const side = last.isBuyer ? "BUY" : "SELL";
          console.log(`[${symbolOptions.name}] Viimeisin kauppa: ${side} ${last.qty} @ ${last.price} (${timeStr})`);
        }

        listenForOrderbooks(exchange, symbolOptions.name, (symbol: string, orderbook: Orderbook) => {
          if (exchangeOptions.orderbooks === undefined) {
            exchangeOptions.orderbooks = {};
          }
          if (
            exchangeOptions.orderbooks !== undefined &&
            exchangeOptions.orderbooks[toSymbolKey(symbol)] === undefined
          ) {
            exchangeOptions.orderbooks[toSymbolKey(symbol)] = {
              bids: {},
              asks: {},
            };
          }
          exchangeOptions.orderbooks[toSymbolKey(symbol)] = orderbook;
        });
        listenForCandlesticks(
          exchange,
          symbolOptions.name,
          symbolOptions.timeframes,
          symbolCandlesticks,
          candlesticksToPreload,
          symbolOptions,
          async (candlesticks: Candlesticks) => {
            const logger = consoleLogger();
            try {
              await algorithmic(
                discord,
                exchange,
                logger,
                symbolOptions.name,
                candlesticks,
                options,
                exchangeOptions,
                symbolOptions,
              );
            } catch (err) {
              logToFile(
                "./logs/error.log",
                JSON.stringify({ context: "algorithmic", symbol: symbolOptions.name, err }, null, 4),
              );
              console.error(`algorithmic ${symbolOptions.name}:`, err);
            }
          },
        );
      }
    }
  } else if (exchangeOptions.mode === "hilow") {
    console.log(`Start running exchange  ${exchangeOptions.name} on hilow mode.`);
    for (const symbolOptions of exchangeOptions.symbols) {
      if (symbolOptions.enabled === false) continue;
      exchangeOptions.orderbooks[toSymbolKey(symbolOptions.name)] = await getOrderbook(exchange, symbolOptions.name);
      symbolFilters[toSymbolKey(symbolOptions.name)] = await getFilters(exchange, symbolOptions.name);
      listenForOrderbooks(exchange, symbolOptions.name, (_symbol: string, orderbook: Orderbook) => {
        if (exchangeOptions.orderbooks === undefined) {
          exchangeOptions.orderbooks = {};
        }
        if (
          exchangeOptions.orderbooks !== undefined &&
          exchangeOptions.orderbooks[toSymbolKey(symbolOptions.name)] === undefined
        ) {
          exchangeOptions.orderbooks[toSymbolKey(symbolOptions.name)] = {
            bids: {},
            asks: {},
          };
        }
        exchangeOptions.orderbooks[toSymbolKey(symbolOptions.name)] = orderbook;
        const logger = consoleLogger();
        hilow(discord, exchange, logger, symbolOptions.name, options, exchangeOptions, symbolOptions);
      });
    }
  } else if (exchangeOptions.mode === "extreme") {
    console.log(`Start running exchange  ${exchangeOptions.name} on extreme mode.`);
    for (const symbolOptions of exchangeOptions.symbols) {
      if (symbolOptions.enabled === false) continue;
      exchangeOptions.orderbooks[toSymbolKey(symbolOptions.name)] = await getOrderbook(exchange, symbolOptions.name);
      symbolFilters[toSymbolKey(symbolOptions.name)] = await getFilters(exchange, symbolOptions.name);
      listenForOrderbooks(exchange, symbolOptions.name, (_symbol: string, orderbook: Orderbook) => {
        if (exchangeOptions.orderbooks === undefined) {
          exchangeOptions.orderbooks = {};
        }
        if (
          exchangeOptions.orderbooks !== undefined &&
          exchangeOptions.orderbooks[toSymbolKey(symbolOptions.name)] === undefined
        ) {
          exchangeOptions.orderbooks[toSymbolKey(symbolOptions.name)] = {
            bids: {},
            asks: {},
          };
        }
        exchangeOptions.orderbooks[toSymbolKey(symbolOptions.name)] = orderbook;
        const logger = consoleLogger();
        extreme(discord, exchange, logger, symbolOptions.name, options, exchangeOptions, symbolOptions);
      });
    }
  } else if (exchangeOptions.mode === "periodic") {
    console.log(`Start running exchange  ${exchangeOptions.name} on periodic mode.`);
    for (const symbolOptions of exchangeOptions.symbols) {
      if (symbolOptions.enabled === false) continue;
      exchangeOptions.orderbooks[toSymbolKey(symbolOptions.name)] = await getOrderbook(exchange, symbolOptions.name);
      symbolFilters[toSymbolKey(symbolOptions.name)] = await getFilters(exchange, symbolOptions.name);
      listenForOrderbooks(exchange, symbolOptions.name, (_symbol: string, orderbook: Orderbook) => {
        if (exchangeOptions.orderbooks === undefined) {
          exchangeOptions.orderbooks = {};
        }
        if (
          exchangeOptions.orderbooks !== undefined &&
          exchangeOptions.orderbooks[toSymbolKey(symbolOptions.name)] === undefined
        ) {
          exchangeOptions.orderbooks[toSymbolKey(symbolOptions.name)] = {
            bids: {},
            asks: {},
          };
        }
        exchangeOptions.orderbooks[toSymbolKey(symbolOptions.name)] = orderbook;
        const logger = consoleLogger();
        periodic(discord, exchange, logger, symbolOptions.name, options, exchangeOptions, symbolOptions);
      });
    }
  } else if (exchangeOptions.mode === "grid") {
    console.log(`Start running exchange ${exchangeOptions.name} on grid trading mode.`);
    if (Array.isArray(exchangeOptions.symbols)) {
      for (const symbolOptions of exchangeOptions.symbols) {
        if (symbolOptions.enabled === false) continue;
        exchangeOptions.orderbooks[toSymbolKey(symbolOptions.name)] = await getOrderbook(exchange, symbolOptions.name);
        symbolFilters[toSymbolKey(symbolOptions.name)] = await getFilters(exchange, symbolOptions.name);
        listenForOrderbooks(exchange, symbolOptions.name, (symbol: string, orderbook: Orderbook) => {
          if (exchangeOptions.orderbooks === undefined) {
            exchangeOptions.orderbooks = {};
          }
          if (
            exchangeOptions.orderbooks !== undefined &&
            exchangeOptions.orderbooks[toSymbolKey(symbol)] === undefined
          ) {
            exchangeOptions.orderbooks[toSymbolKey(symbol)] = {
              bids: {},
              asks: {},
            };
          }
          exchangeOptions.orderbooks[toSymbolKey(symbol)] = orderbook;
        });
        // listenForTrades(exchange, symbolOptions.name, async (trade: Trade) => {
        //   let msg = "```";
        //   msg += `Order executed: ${trade.symbol}\r\n`;
        //   msg += `${trade.isBuyer === true ? "Buy" : "Sell"} ID: ${trade.orderId}\r\n`;
        //   msg += `Price: ${trade.price}\r\n`;
        //   msg += `Qty: ${trade.qty}\r\n`;
        //   msg += `Time now ${new Date().toLocaleString("fi-fi")}\r\n`;
        //   msg += "```";
        //   sendMessageToChannel(discord, options.discord.channelId!, msg);
        // });
        listenForCandlesticks(
          exchange,
          symbolOptions.name,
          symbolOptions.timeframes,
          symbolCandlesticks,
          candlesticksToPreload,
          symbolOptions,
          async (candlesticks: Candlesticks) => {
            const logger = consoleLogger();
            await gridTrading(
              discord,
              exchange,
              logger,
              symbolOptions.name,
              candlesticks,
              options,
              exchangeOptions,
              symbolOptions,
            );
          },
        );
      }
    }
  }
};

/** Binance REST HTTP-timeout (ms); erillinen recvWindow:sta. Nosta jos ESOCKETTIMEDOUT jatkuu hitaalla verkolla. */
const DEFAULT_BINANCE_HTTP_REQUEST_TIMEOUT_MS = 300000;

const startBinance = async (exchangeOptions: ExchangeOptions, opts?: { silent?: boolean }): Promise<Exchange> => {
  const exchange = new Binance();
  const httpMs =
    typeof exchangeOptions.binanceHttpRequestTimeoutMs === "number" && exchangeOptions.binanceHttpRequestTimeoutMs > 0
      ? exchangeOptions.binanceHttpRequestTimeoutMs
      : DEFAULT_BINANCE_HTTP_REQUEST_TIMEOUT_MS;
  exchange.options({
    APIKEY: exchangeOptions.key,
    APISECRET: exchangeOptions.secret,
    useServerTime: true,
    recvWindow: 60000,
    /** Binance API recvWindow; HTTP-pyynnön timeout erikseen (node-binance-api + scripts/apply-node-binance-http-timeout.cjs) */
    httpRequestTimeout: httpMs,
    family: 4,
    /** Kun WS-account ilmoitus puuttuu balances[], kirjasto lokee balanceData error — haetaan saldot RESTillä (rajoitettu välein). */
    log: createBinanceBalanceDataErrorLogBridge(exchange, exchangeOptions),
  });
  try {
    const binanceAny = exchange as any;
    if (typeof binanceAny.useServerTime === "function") {
      await binanceAny.useServerTime();
    }
  } catch (err) {
    console.warn("Binance serveriajan synkronointi epäonnistui käynnistyksessä:", err);
  }
  if (!opts?.silent) {
    console.log("Started Binance");
  }
  return exchange;
};

const startNonKYC = async (exchangeOptions: ExchangeOptions, opts?: { silent?: boolean }): Promise<Exchange> => {
  if (exchangeOptions.forceStopOnDisconnect === undefined) {
    exchangeOptions.forceStopOnDisconnect = false;
  }
  const exchange = new NonKYC(exchangeOptions.key, exchangeOptions.secret, exchangeOptions.forceStopOnDisconnect);
  await exchange.waitConnect();
  if (!opts?.silent) {
    console.log("Started NonKYC");
  }
  return exchange;
};

const startMexc = async (exchangeOptions: ExchangeOptions, opts?: { silent?: boolean }): Promise<Exchange> => {
  if (exchangeOptions.forceStopOnDisconnect === undefined) {
    exchangeOptions.forceStopOnDisconnect = false;
  }
  const exchange = new Mexc({ key: exchangeOptions.key, secret: exchangeOptions.secret });
  await exchange.waitConnect();
  if (!opts?.silent) {
    console.log("Started Mexc");
  }
  return exchange;
};

const startDexTrade = async (exchangeOptions: ExchangeOptions, opts?: { silent?: boolean }): Promise<Exchange> => {
  const exchange = new DexTrade(exchangeOptions.key, exchangeOptions.secret);
  await exchange.waitConnect();
  if (!opts?.silent) {
    console.log("Started DexTrade");
  }
  return exchange;
};

const delay = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

type PersistedSimulationResult = {
  savedAt: string;
  result: SimulationApiResult;
  /** Grid-ajon pohja-asetukset (maskatut avaimet), kun tulos on peräisin gridistä. */
  baselineConfig?: ConfigOptions;
};

type SimulationRunSummaryRow = {
  source: "grid-results" | "grid-progress" | "grid-last" | "simulate-last" | "grid-cache";
  file: string;
  savedAt?: string;
  gridPath?: string;
  variantIndex?: number;
  roi: number;
  roiPercent: string;
  startingBalance: number;
  finalPortfolio: number;
  candleRows: number;
  variant?: unknown;
  values: Record<string, unknown>;
  /** simulate-last + tallennettu baselineConfig — koko exchanges → live (paikallinen sim-istunto). */
  hasPersistedBaseline?: boolean;
  /** Grid baseline (variantti #1): simulation/baseline-options-*.json */
  baselineOptionsSnapshotFile?: string;
  /** Grid baseline — Koko baseline → live -nappi */
  hasGridBaselineSnapshot?: boolean;
};

const hoobot = async () => {
  try {
    seedTakeProfitRuntimeForAllSymbols(options);
    if (await checkLicenseValidity(options.license)) {
      console.log("License key is valid. Enjoy the trading with Hoobot!");
    } else {
      console.log(
        "Invalid license key. Please purchase a valid license. Contact toni.lukkaroinen@hoosat.fi to purchase Hoobot Hoobot. There are preventions to notice this if you remove this check.",
      );
    }
    let discord: Awaited<ReturnType<typeof loginDiscord>> = undefined;
    const exchanges: Exchange[] = [];
    if (options.discord?.enabled === true) {
      discord = await loginDiscord(exchanges, options);
    }
    for (var exchangeOptions of options.exchanges) {
      exchangeOptions.dryRun = options.dryRun ?? false;
      if (exchangeOptions.name === "nonkyc") {
        const setupNonKYC = async (exchangeOptions: any, discord: any): Promise<Exchange> => {
          exchangeOptions.socket = await startNonKYC(exchangeOptions);
          exchangeOptions.socket.on("try-to-reconnect", async () => {
            console.log("Trying to reconnect");
            exchangeOptions.socket = await setupNonKYC(exchangeOptions, discord);
            runExchange(exchangeOptions.socket, discord, exchangeOptions);
          });
          return exchangeOptions.socket;
        };
        exchangeOptions.socket = await setupNonKYC(exchangeOptions, discord);
        exchanges.push(exchangeOptions.socket);
      }
      if (exchangeOptions.name === "mexc") {
        exchangeOptions.socket = await startMexc(exchangeOptions);
        exchanges.push(exchangeOptions.socket);
      }
      if (exchangeOptions.name === "dextrade") {
        const setupDexTrade = async (exchangeOptions: any): Promise<Exchange> => {
          exchangeOptions.socket = await startDexTrade(exchangeOptions);
          return exchangeOptions.socket;
        };
        exchangeOptions.socket = await setupDexTrade(exchangeOptions);
        exchanges.push(exchangeOptions.socket);
      }
      if (exchangeOptions.name === "binance") {
        exchangeOptions.socket = await startBinance(exchangeOptions);
        exchanges.push(exchangeOptions.socket);
      }
      if (exchangeOptions.socket !== undefined) {
        runExchange(exchangeOptions.socket, discord, exchangeOptions);
        await delay(1000);
      }
    }
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error(JSON.stringify(error, null, 4));
  }
};

// --- PNL helpers for Dashboard ---

const getTargetTimestamp = (duration: string): number => {
  const now = Math.floor(new Date().getTime() / 1000);
  switch (duration.toUpperCase()) {
    case "1D":
      return now - 24 * 60 * 60;
    case "1W":
      return now - 7 * 24 * 60 * 60;
    case "1M":
      return now - 30 * 24 * 60 * 60;
    case "1Y":
      return now - 30 * 24 * 60 * 60 * 12;
    default:
      throw new Error("Invalid duration");
  }
};

const getHistoricalTradesForDuration = async (
  exchange: Exchange,
  symbol: string,
  duration: string,
): Promise<Trade[]> => {
  const tradeHistory: Trade[] = await getTradeHistory(exchange, symbol);
  const targetTimestamp: number = getTargetTimestamp(duration.toUpperCase());
  const tradesInDuration: Trade[] = tradeHistory.filter((trade) => trade.time / 1000 >= targetTimestamp);
  const tradesBeforeDuration: Trade[] = tradeHistory.filter((trade) => trade.time / 1000 < targetTimestamp);
  const previousTradeBeforeDuration = tradesBeforeDuration[tradesBeforeDuration.length - 1];
  if (previousTradeBeforeDuration === undefined) {
    return tradesInDuration;
  }
  return [previousTradeBeforeDuration, ...tradesInDuration];
};

// Prevent hammering exchange REST endpoints from the Dashboard.
// When bot is running, we also prefer `exchangeOptions.tradeHistory` over fresh REST calls.
const pnlCacheByKey: Record<string, { at: number; data: unknown }> = {};
const PNL_CACHE_MS = 15000;

const simulate = async (): Promise<SimulationApiResult> => {
  try {
    const cfg = validateOptions(JSON.parse(JSON.stringify(parseArgsSimulate())) as ConfigOptions);
    return await runSimulationWithConfig(cfg);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("simulate:", e);
    return { ok: false, error: msg };
  }
};

const stopHoobot = () => {
  if (!options.exchanges?.length) return;
  console.log("Exchanges to shut down %d", options.exchanges.length);
  for (var i = 0; i < options.exchanges.length; i++) {
    const socket = options.exchanges[i].socket;
    if (!socket) continue;
    console.log(
      "Symbols to to shut down %d in the exchange %s",
      options.exchanges[i].symbols?.length ?? 0,
      options.exchanges[i].name,
    );
    if (options.exchanges[i].name == "nonkyc") {
      for (var x = 0; x < (options.exchanges[i].symbols?.length ?? 0); x++) {
        for (var y = 0; y < (options.exchanges[i].symbols[x].timeframes?.length ?? 0); y++) {
          (socket as NonKYC).unsubscribeCandles(
            options.exchanges[i].symbols[x].name,
            getMinutesFromInterval(options.exchanges[i].symbols[x].timeframes[y]),
          );
        }
        (socket as NonKYC).unsubscribeOrderbook(options.exchanges[i].symbols[x].name);
        (socket as NonKYC).unsubscribeTrades(options.exchanges[i].symbols[x].name);
        (socket as NonKYC).unsubscribeTicker(options.exchanges[i].symbols[x].name);
        (socket as NonKYC).unsubscribeReports();
      }
      (socket as NonKYC).disconnect();
    } else if (options.exchanges[i].name == "binance") {
      (socket as Binance).websockets?.terminate();
    }
  }
};

const webServer = async () => {
  const app = express();
  const isSimulateInstance = process.env.SIMULATE === "true";
  const PORT = process.env.PORT || (isSimulateInstance ? 5657 : 5656);
  const simulationDir = path.join(findProjectRoot(), "simulation");
  const simulationCacheDir = path.join(simulationDir, "cache");
  const simulationSingleCacheDir = path.join(simulationCacheDir, "single");
  const simulationGridCacheDir = path.join(simulationCacheDir, "grid");
  const simulateLastResultFile = path.join(simulationDir, "simulate-last-result.json");
  const gridLastSummaryFile = path.join(simulationDir, "grid-last-summary.json");
  const liveOptionsFilename = getLiveOptionsFilePath();
  const simulateOptionsFilename = getSimulateOptionsFilePath();
  /** Live aina hoobot-options.json; simulaatio-istunto oma tiedosto (+ fallback lukemisessa liveen). */
  const optionsFilename = isSimulateInstance ? simulateOptionsFilename : liveOptionsFilename;

  const effectiveSettingsReadPath = (): string => {
    if (!isSimulateInstance) return optionsFilename;
    if (fs.existsSync(optionsFilename)) return optionsFilename;
    if (fs.existsSync(liveOptionsFilename)) return liveOptionsFilename;
    return optionsFilename;
  };

  const effectiveSettingsMergePath = (): string => {
    return effectiveSettingsReadPath();
  };

  type SimToLiveSymbolMergePolicy = {
    patchAllowPaths?: string[];
    preserveLivePathsExtra?: string[];
  };

  const isCfgPlainRecord = (x: unknown): x is Record<string, unknown> =>
    x !== null && typeof x === "object" && !Array.isArray(x);

  const readOptionalDotPaths = (field: unknown): string[] | undefined => {
    if (!Array.isArray(field)) return undefined;
    const out: string[] = [];
    for (const item of field) {
      if (typeof item !== "string") continue;
      const t = item.trim().replace(/\s+/g, "");
      if (!t) continue;
      out.push(t.split(/\.+/).filter(Boolean).join("."));
    }
    return out.length > 0 ? out : undefined;
  };

  const readSimToLiveMergePolicy = (liveDocRoot: Record<string, unknown>): SimToLiveSymbolMergePolicy => ({
    patchAllowPaths: readOptionalDotPaths(liveDocRoot.simPatchMergeAllowPaths),
    preserveLivePathsExtra: readOptionalDotPaths(liveDocRoot.simPreservePathsOnLiveMerge),
  });

  const cloneJsonValue = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

  const valueAtDotPath = (root: unknown, dotted: string): unknown => {
    const parts = dotted.split(".").filter((p) => p.length > 0);
    if (parts.length === 0) return undefined;
    let cur: unknown = root;
    for (const p of parts) {
      if (!isCfgPlainRecord(cur)) return undefined;
      cur = cur[p];
      if (cur === undefined) return undefined;
    }
    return cur;
  };

  const assignAtDotPath = (mutRoot: Record<string, unknown>, dotted: string, value: unknown): void => {
    const parts = dotted.split(".").filter((p) => p.length > 0);
    if (parts.length === 0) return;
    let cur: Record<string, unknown> = mutRoot;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      let branch = cur[k];
      if (branch === null || !isCfgPlainRecord(branch)) {
        branch = {};
        cur[k] = branch;
      }
      cur = branch as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = value as never;
  };

  /**
   * Yhdistä sim/grid-PATCH livessä olevaan symboliin: **ei korvata koko symbolia** default-tilassa syvätäydennyksellä.
   * `hoobot-options` root: `simPatchMergeAllowPaths` = vain PATCHin nämät polut päivittyvät; `simPreservePathsOnLiveMerge`
   * = nämä PATHit palautetaan aina live-symbolista PATCHin jälkeen. Ajonaikaiset kentät (grid, tilaukset…) yhä livestä.
   */
  const mergeIncomingSymbolPreserveLiveRuntime = (
    incoming: Record<string, unknown>,
    existing: SymbolOptions | undefined,
    policy?: SimToLiveSymbolMergePolicy,
  ): Record<string, unknown> => {
    if (!existing) return { ...incoming };

    const allowPaths = policy?.patchAllowPaths;
    const preserveExtra = policy?.preserveLivePathsExtra;

    const existingAsRecord = (s: SymbolOptions): Record<string, unknown> =>
      cloneJsonValue(s) as unknown as Record<string, unknown>;

    let merged: Record<string, unknown>;
    if (allowPaths && allowPaths.length > 0) {
      merged = existingAsRecord(existing);
      for (const pth of allowPaths) {
        const v = valueAtDotPath(incoming, pth);
        if (v !== undefined) assignAtDotPath(merged, pth, cloneJsonValue(v));
      }
    } else {
      const baseSnap = existingAsRecord(existing);
      merged = deepMergeConfig(baseSnap, incoming) as Record<string, unknown>;
    }

    if (preserveExtra && preserveExtra.length > 0) {
      const liveSnap = existingAsRecord(existing);
      for (const pth of preserveExtra) {
        const v = valueAtDotPath(liveSnap, pth);
        if (v !== undefined) assignAtDotPath(merged, pth, cloneJsonValue(v));
      }
    }

    const ex = existingAsRecord(existing);

    const preserveTop = [
      "currentOrder",
      "grid",
      "periodicTime",
      "consecutiveQuantity",
      "consecutiveDirection",
      "consecutivePreviousDirection",
      "consecutiveNextTrade",
      "consecutiveTradeAllowed",
      "noPreviousTradeCheck",
      "minimumTimeSinceLastTrade",
    ] as const;
    for (const k of preserveTop) {
      if (ex[k] !== undefined) merged[k] = ex[k];
    }
    const oldTrend = ex.trend as Record<string, unknown> | undefined;
    const newTrend = merged.trend as Record<string, unknown> | undefined;
    if (oldTrend && newTrend != null && typeof newTrend === "object") {
      merged.trend = { ...newTrend, current: oldTrend.current ?? newTrend.current };
    }
    const oldTp = ex.takeProfit as Record<string, unknown> | undefined;
    const newTp = merged.takeProfit as Record<string, unknown> | undefined;
    if (oldTp || newTp) {
      merged.takeProfit = stripLegacyTakeProfitFields({ ...(oldTp || {}), ...(newTp || {}) });
      const cur = merged.takeProfit as Record<string, unknown>;
      if (existing.takeProfit?.current != null) cur.current = existing.takeProfit.current;
    }
    const oldSl = ex.stopLoss as Record<string, unknown> | undefined;
    const newSl = merged.stopLoss as Record<string, unknown> | undefined;
    if (oldSl || newSl) {
      merged.stopLoss = { ...(oldSl || {}), ...(newSl || {}) };
      const sl = merged.stopLoss as Record<string, unknown>;
      if (existing.stopLoss?.hit !== undefined) sl.hit = existing.stopLoss.hit;
    }
    const oldTpb = ex.takeProfitBuy as Record<string, unknown> | undefined;
    const newTpb = merged.takeProfitBuy as Record<string, unknown> | undefined;
    if (oldTpb || newTpb) {
      merged.takeProfitBuy = stripLegacyTakeProfitFields({ ...(oldTpb || {}), ...(newTpb || {}) });
      const curB = merged.takeProfitBuy as Record<string, unknown>;
      if (existing.takeProfitBuy?.current != null) curB.current = existing.takeProfitBuy.current;
    }
    const oldSlB = ex.stopLossBuy as Record<string, unknown> | undefined;
    const newSlB = merged.stopLossBuy as Record<string, unknown> | undefined;
    if (oldSlB || newSlB) {
      merged.stopLossBuy = { ...(oldSlB || {}), ...(newSlB || {}) };
      const slb = merged.stopLossBuy as Record<string, unknown>;
      if (existing.stopLossBuy && "hit" in existing.stopLossBuy && existing.stopLossBuy.hit !== undefined) {
        slb.hit = (existing.stopLossBuy as { hit?: boolean }).hit;
      }
    }
    /** Grid-sim PATCH ei välttämättä sisällä näitä — ilman säilytys liveltä puuttuu mm. `timeframes` → listenForCandlesticks kaatuu. */
    if ((!Array.isArray(merged.timeframes) || merged.timeframes.length === 0) && Array.isArray(ex.timeframes)) {
      merged.timeframes = ex.timeframes as unknown[];
    }
    if (merged.minimumBuy === undefined && ex.minimumBuy !== undefined) merged.minimumBuy = ex.minimumBuy;
    if (merged.minimumSell === undefined && ex.minimumSell !== undefined) merged.minimumSell = ex.minimumSell;
    if (merged.minimumVolume === undefined && ex.minimumVolume !== undefined) merged.minimumVolume = ex.minimumVolume;
    const mergedSym = { ...existing, ...(merged as object) } as SymbolOptions;
    syncTakeProfitRuntimeFromConfig(mergedSym);
    return merged;
  };

  /** Grid-variantista symbolipatch: ensin Binance (vanhat grid-tiedostot), muuten ensimmäinen pörssi jolla on symboleita. */
  const extractSymbolPatchFromGridVariant = (variant: unknown): Record<string, unknown> | null => {
    if (variant == null || typeof variant !== "object") return null;
    const v = variant as Record<string, unknown>;
    const exchanges = v.exchanges;
    if (!Array.isArray(exchanges)) return null;
    const pickEx = (): { symbols?: unknown[] } | undefined => {
      const binance = exchanges.find(
        (e: unknown) => e != null && typeof e === "object" && (e as { name?: string }).name === "binance",
      ) as { symbols?: unknown[] } | undefined;
      if (binance?.symbols?.length) return binance;
      for (const e of exchanges) {
        if (e == null || typeof e !== "object") continue;
        const ex = e as { symbols?: unknown[] };
        if (Array.isArray(ex.symbols) && ex.symbols.length > 0) return ex;
      }
      return undefined;
    };
    const picked = pickEx();
    if (!picked?.symbols?.length) return null;
    const sym = picked.symbols[0];
    if (!sym || typeof sym !== "object") return null;
    const symObj = sym as Record<string, unknown>;
    const { name: _n, ...rest } = symObj;
    return rest;
  };

  /** Yhteinen siirto: kirjoita hoobot-options -tiedostoon (polku annettu) yhteenvetovariantin patch. */
  const applySummaryVariantToHoobotJsonFile = (
    targetFilePath: string,
    body: {
      exchangeName?: string;
      targetSymbolName?: string;
      applyToAll?: boolean;
      variant?: unknown;
    },
  ): { ok: true; appliedSymbols: string[]; basename: string } | { ok: false; status: number; error: string } => {
    const patch = extractSymbolPatchFromGridVariant(body.variant);
    if (patch === null) {
      return {
        ok: false,
        status: 400,
        error: "Puuttuu variantti tai ei symbolipatchia (exchanges → … → symbols[0]).",
      };
    }
    if (Object.keys(patch).length === 0) {
      return {
        ok: false,
        status: 400,
        error: "Baseline / tyhjä variantti — ei parametreja siirrettäväksi. Valitse variantti jossa on akseliarvoja.",
      };
    }
    if (!fs.existsSync(targetFilePath)) {
      return {
        ok: false,
        status: 400,
        error: "Asetustiedostoa ei löydy: " + targetFilePath,
      };
    }
    try {
      const rawLive = fs.readFileSync(targetFilePath, "utf-8");
      const liveDoc = (rawLive ? JSON.parse(rawLive) : {}) as Record<string, unknown>;
      const simToLivePol = readSimToLiveMergePolicy(liveDoc);
      const exchanges = liveDoc.exchanges as ExchangeOptions[] | undefined;
      if (!Array.isArray(exchanges) || exchanges.length === 0) {
        return { ok: false, status: 400, error: "Konfigissa ei ole pörssejä." };
      }
      const wantEx = (body.exchangeName ?? "").toString().trim();
      let exIdx = wantEx ? exchanges.findIndex((e) => e && e.name === wantEx) : 0;
      if (exIdx < 0 && wantEx) {
        return {
          ok: false,
          status: 400,
          error: `Pörssiä "${wantEx}" ei löydy asetuksista.`,
        };
      }
      if (exIdx < 0) exIdx = 0;
      const ex = exchanges[exIdx];
      if (!ex || !Array.isArray(ex.symbols)) {
        return { ok: false, status: 400, error: "Pörssillä ei ole symbolilistaa." };
      }
      const syms = [...ex.symbols];
      const applyToAll = body.applyToAll === true;
      const targetName = (body.targetSymbolName ?? "").toString().trim();
      if (!applyToAll && !targetName) {
        return { ok: false, status: 400, error: "Valitse kohdepari tai käytä Siirrä kaikkiin." };
      }
      const targetNames = applyToAll
        ? syms.map((s) => (s && s.name ? String(s.name) : "")).filter(Boolean)
        : [targetName];
      if (targetNames.length === 0) {
        return { ok: false, status: 400, error: "Ei kohdesymboleja." };
      }
      const applied: string[] = [];
      for (const nm of targetNames) {
        const sIdx = syms.findIndex((s) => s && s.name === nm);
        if (sIdx < 0) {
          return {
            ok: false,
            status: 400,
            error: `Symbolia "${nm}" ei löydy asetuksissa.`,
          };
        }
        const existingSym = syms[sIdx];
        const incoming = { ...patch, name: nm } as Record<string, unknown>;
        const merged = mergeIncomingSymbolPreserveLiveRuntime(incoming, existingSym, simToLivePol);
        syms[sIdx] = merged as unknown as SymbolOptions;
        syncTakeProfitRuntimeFromConfig(syms[sIdx]);
        applied.push(nm);
      }
      ex.symbols = syms as SymbolOptions[];
      fs.writeFileSync(targetFilePath, JSON.stringify(sanitizeOptionsDocument(liveDoc as ConfigOptions), null, 2));
      return { ok: true, appliedSymbols: applied, basename: path.basename(targetFilePath) };
    } catch (e) {
      console.error("applySummaryVariantToHoobotJsonFile:", e);
      return { ok: false, status: 500, error: "Siirto epäonnistui (tiedoston käsittely)." };
    }
  };

  app.use(express.json());

  /** CORS: sim-UI toisella portilla / toisella hostilla voi hakea symboleja ja lähettää patchin live-bottiin. */
  const simToLivePushCors = (res: express.Response): void => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Hoobot-Apply-Key");
  };

  const stableSortJson = (value: unknown): unknown => {
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
  };

  const sha256 = (value: unknown): string => {
    const sorted = stableSortJson(value);
    return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
  };

  const readJsonIfExists = <T>(filePath: string): T | null => {
    try {
      if (!existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, "utf-8");
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };

  const writeJsonSafe = (filePath: string, value: unknown): void => {
    try {
      const dir = path.dirname(filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
    } catch (e) {
      console.error("writeJsonSafe:", e);
    }
  };

  /** Grid-yhteenvedosta paras onnistunut variantti — sama muoto kuin yksittäisen simin tulos (UI / simulate-last). */
  const bestOkResultFromGridSummary = (summary: unknown): SimulationApiResult | null => {
    if (!summary || typeof summary !== "object") return null;
    const s = summary as Partial<GridRunSummary>;
    if (s.best == null || !Array.isArray(s.results)) return null;
    const idx = s.best.variantIndex;
    const row = s.results.find((r) => r && typeof r === "object" && r.variantIndex === idx);
    const res = row?.result;
    if (res && typeof res === "object" && "ok" in res && res.ok === true) {
      return {
        ...res,
        gridVariantIndex: idx,
        gridVariantCount: typeof s.variantCount === "number" ? s.variantCount : undefined,
        gridVariant: row.variant,
      };
    }
    return null;
  };

  const getCandlestoreSnapshot = (): { fileCount: number; latestMtimeMs: number } => {
    try {
      const dir = path.join(findProjectRoot(), "candlestore");
      if (!existsSync(dir)) return { fileCount: 0, latestMtimeMs: 0 };
      const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".csv"));
      let latest = 0;
      for (const f of files) {
        try {
          const st = fs.statSync(path.join(dir, f));
          if (st.mtimeMs > latest) latest = st.mtimeMs;
        } catch {
          // ignore single-file stat errors
        }
      }
      return { fileCount: files.length, latestMtimeMs: Math.floor(latest) };
    } catch {
      return { fileCount: 0, latestMtimeMs: 0 };
    }
  };

  const persistSimulationResult = (result: SimulationApiResult, opts?: { baselineConfig?: ConfigOptions }): void => {
    try {
      if (!result.ok && "aborted" in result && result.aborted === true) {
        return;
      }
      if (!existsSync(simulationDir)) mkdirSync(simulationDir, { recursive: true });
      let resultToStore = result;
      if (result.ok && ("persistedAt" in result || "summarySource" in result)) {
        const {
          persistedAt: _pa,
          summarySource: _ss,
          ...rest
        } = result as Extract<SimulationApiResult, { ok: true }> & {
          persistedAt?: string;
          summarySource?: string;
        };
        resultToStore = rest as SimulationApiResult;
      }
      const payload: PersistedSimulationResult = {
        savedAt: new Date().toISOString(),
        result: resultToStore,
      };
      if (opts?.baselineConfig != null) {
        payload.baselineConfig = opts.baselineConfig;
      }
      writeFileSync(simulateLastResultFile, JSON.stringify(payload, null, 2));
    } catch (e) {
      console.error("persistSimulationResult:", e);
    }
  };

  type SimPersistMeta = {
    savedAt?: string;
    sourceKey: "simulate-last" | "grid-last" | "grid-dump";
  };

  const loadPersistedSimulationWithMeta = (): { result: SimulationApiResult; meta: SimPersistMeta } | null => {
    try {
      if (existsSync(simulateLastResultFile)) {
        const raw = fs.readFileSync(simulateLastResultFile, "utf-8");
        if (raw) {
          const parsed = JSON.parse(raw) as PersistedSimulationResult;
          if (parsed?.result && typeof parsed.result === "object" && "ok" in parsed.result) {
            return {
              result: parsed.result,
              meta: {
                savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : undefined,
                sourceKey: "simulate-last",
              },
            };
          }
        }
      }
    } catch (e) {
      console.error("loadPersistedSimulationWithMeta (simulate-last):", e);
    }
    try {
      if (existsSync(gridLastSummaryFile)) {
        const raw = fs.readFileSync(gridLastSummaryFile, "utf-8");
        if (raw) {
          const fromGrid = bestOkResultFromGridSummary(JSON.parse(raw) as unknown);
          if (fromGrid) {
            let savedAt: string | undefined;
            try {
              savedAt = new Date(fs.statSync(gridLastSummaryFile).mtimeMs).toISOString();
            } catch {
              /* ignore */
            }
            return { result: fromGrid, meta: { savedAt, sourceKey: "grid-last" } };
          }
        }
      }
    } catch (e) {
      console.error("loadPersistedSimulationWithMeta (grid-last):", e);
    }
    try {
      if (!existsSync(simulationDir)) return null;
      const names = fs
        .readdirSync(simulationDir)
        .filter((f) => f.toLowerCase().startsWith("grid-results-") && f.toLowerCase().endsWith(".json"));
      if (names.length === 0) return null;
      const ordered = [...names].sort((a, b) => {
        try {
          return fs.statSync(path.join(simulationDir, b)).mtimeMs - fs.statSync(path.join(simulationDir, a)).mtimeMs;
        } catch {
          return 0;
        }
      });
      for (const name of ordered) {
        const p = path.join(simulationDir, name);
        const dump = readJsonIfExists<unknown>(p);
        const fromDump = dump != null ? bestOkResultFromGridSummary(dump) : null;
        if (fromDump) {
          let savedAt: string | undefined;
          try {
            savedAt = new Date(fs.statSync(p).mtimeMs).toISOString();
          } catch {
            /* ignore */
          }
          return { result: fromDump, meta: { savedAt, sourceKey: "grid-dump" } };
        }
      }
    } catch (e) {
      console.error("loadPersistedSimulationWithMeta (grid-dump):", e);
    }
    return null;
  };

  const loadPersistedSimulationResult = (): SimulationApiResult | null =>
    loadPersistedSimulationWithMeta()?.result ?? null;

  const enrichLastResultMetaForApi = (
    last: SimulationApiResult,
  ): { persistedAt?: string; summarySource?: "simulate-last" | "grid-last" | "grid-dump" } => {
    if (!last.ok) return {};
    try {
      if (existsSync(simulateLastResultFile)) {
        const raw = fs.readFileSync(simulateLastResultFile, "utf-8");
        if (!raw) return {};
        const parsed = JSON.parse(raw) as PersistedSimulationResult;
        const pr = parsed?.result;
        if (!pr || typeof pr !== "object" || !("ok" in pr) || !pr.ok || !last.ok) return {};
        const prev = pr as Extract<SimulationApiResult, { ok: true }>;
        const same =
          last.candleRows === prev.candleRows &&
          Math.abs(last.finalPortfolio - prev.finalPortfolio) < 1e-6 &&
          last.roiPercent === prev.roiPercent;
        if (same) {
          return {
            persistedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : undefined,
            summarySource: "simulate-last",
          };
        }
      }
    } catch {
      /* ignore */
    }
    if (typeof last.gridVariantIndex === "number" && Number.isFinite(last.gridVariantIndex)) {
      return { summarySource: "grid-last" };
    }
    return {};
  };

  const simulationLastResultNotFoundPayload = (): Record<string, unknown> => {
    let gridDumpCount = 0;
    try {
      if (existsSync(simulationDir)) {
        gridDumpCount = fs
          .readdirSync(simulationDir)
          .filter((f) => f.toLowerCase().startsWith("grid-results-") && f.toLowerCase().endsWith(".json")).length;
      }
    } catch {
      gridDumpCount = 0;
    }
    const hasSimLast = existsSync(simulateLastResultFile);
    const hasGridLast = existsSync(gridLastSummaryFile);
    let hint =
      "Tallenna tulos: aja yksittäinen simulaatio loppuun tai grid niin että vähintään yksi variantti onnistuu. Keskeytys (aborted) ei tallennu.";
    const hasAnyArtifact = hasSimLast || hasGridLast || gridDumpCount > 0;
    if (!hasAnyArtifact) {
      hint +=
        " Kansiossa simulation/ ei ole tulostiedostoja — käynnistä npm run simulate projektin juuresta, jotta polku osuu oikeaan (findProjectRoot).";
    } else {
      hint +=
        " Joku tiedosto on olemassa, mutta tulosta ei saatu (esim. kaikki grid-variantit virheessä, tiedosto rikki tai simulate-last ei sisällä kelvollista result-kenttää).";
    }
    return {
      ok: false,
      error: "Edellistä simulaatiotulosta ei löytynyt.",
      hint,
      simulationDir,
      files: {
        simulateLastResult: hasSimLast,
        gridLastSummary: hasGridLast,
        gridResultsDumps: gridDumpCount,
      },
    };
  };

  const isNonemptyVariantPatch = (variant: unknown): boolean =>
    variant != null && typeof variant === "object" && Object.keys(variant as Record<string, unknown>).length > 0;

  /** Yksittäisen simin / grid-baselinen tulos: sama muoto kuin grid-rivillä (ensimmäinen pörssi jolla on symboleita). */
  const buildSyntheticGridVariantFromConfigOptions = (cfg: ConfigOptions | undefined): unknown | undefined => {
    if (!cfg || !Array.isArray(cfg.exchanges)) return undefined;
    const exWithSym = cfg.exchanges.find(
      (e): e is ExchangeOptions =>
        e != null &&
        typeof e === "object" &&
        typeof e.name === "string" &&
        Array.isArray(e.symbols) &&
        e.symbols.length > 0 &&
        e.symbols[0] != null &&
        typeof e.symbols[0] === "object",
    );
    if (!exWithSym) return undefined;
    const symClone = JSON.parse(JSON.stringify(exWithSym.symbols[0])) as Record<string, unknown>;
    return {
      exchanges: [
        {
          name: exWithSym.name,
          symbols: [symClone],
        },
      ],
    };
  };

  /** Grid baseline (variantIndex 0, patch {}): rakenna variantti baselineConfig / snapshot-tiedostosta. */
  const resolveGridSummaryVariant = (
    item: { variantIndex?: number; variant?: unknown },
    dump: { baselineConfig?: ConfigOptions; baselineOptionsSnapshotFile?: string },
  ): { variant: unknown; baselineOptionsSnapshotFile?: string; hasGridBaselineSnapshot: boolean } => {
    if (isNonemptyVariantPatch(item.variant)) {
      return { variant: item.variant, hasGridBaselineSnapshot: false };
    }
    if (item.variantIndex !== 0) {
      return { variant: item.variant ?? {}, hasGridBaselineSnapshot: false };
    }
    const snapPath =
      typeof dump.baselineOptionsSnapshotFile === "string" && dump.baselineOptionsSnapshotFile.trim().length > 0
        ? dump.baselineOptionsSnapshotFile.trim()
        : undefined;
    const tryFromCfg = (cfg: ConfigOptions | undefined) => {
      const syn = buildSyntheticGridVariantFromConfigOptions(cfg);
      if (syn == null) return null;
      return { variant: syn, baselineOptionsSnapshotFile: snapPath, hasGridBaselineSnapshot: true };
    };
    if (dump.baselineConfig) {
      const fromEmbedded = tryFromCfg(dump.baselineConfig);
      if (fromEmbedded) return fromEmbedded;
    }
    if (snapPath && existsSync(snapPath)) {
      try {
        const raw = fs.readFileSync(snapPath, "utf-8");
        if (raw) {
          const fromFile = tryFromCfg(JSON.parse(raw) as ConfigOptions);
          if (fromFile) return fromFile;
        }
      } catch {
        // vanha/poistettu snapshot
      }
    }
    return { variant: item.variant ?? {}, hasGridBaselineSnapshot: false };
  };

  const SIM_SUMMARY_UI_ROW_LIMIT = 500;
  let lastSummaryCollectError: string | null = null;

  const collectSimulationSummaryDiagnostics = (): {
    gridResultsFileCount: number;
    gridProgressResultCount: number;
    gridLastOkCount: number;
    simulateLastOk: boolean;
    hint: string;
  } => {
    let gridResultsFileCount = 0;
    let gridProgressResultCount = 0;
    let gridLastOkCount = 0;
    let simulateLastOk = false;
    try {
      if (existsSync(simulationDir)) {
        const names = fs.readdirSync(simulationDir);
        for (const name of names) {
          const lower = name.toLowerCase();
          if (lower.startsWith("grid-results-") && lower.endsWith(".json")) {
            gridResultsFileCount++;
          }
        }
        const progress = readJsonIfExists<{ results?: Array<{ result?: { ok?: boolean } }> }>(
          path.join(simulationDir, "grid-progress-summary.json"),
        );
        if (progress?.results) {
          gridProgressResultCount = progress.results.filter((r) => r?.result?.ok).length;
        }
        const gridLast = readJsonIfExists<{ results?: Array<{ result?: { ok?: boolean } }> }>(gridLastSummaryFile);
        if (gridLast?.results) {
          gridLastOkCount = gridLast.results.filter((r) => r?.result?.ok).length;
        }
      }
      const simLast = readJsonIfExists<PersistedSimulationResult>(simulateLastResultFile);
      simulateLastOk = !!simLast?.result?.ok;
    } catch {
      // ignore
    }
    let hint =
      "Tallenna tulos: aja yksittäinen simulaatio loppuun tai grid niin että vähintään yksi variantti onnistuu. Keskeytys (aborted) ei tallennu yhteenvetoon.";
    if (gridResultsFileCount > 0 && gridProgressResultCount === 0) {
      hint +=
        " Kansiossa on vanhoja grid-results-*.json -tiedostoja; jos lista on silti tyhjä, käynnistä simulaatio uudelleen (npm run simulate:start:build) portissa 5657 ja päivitä sivu.";
    } else if (gridProgressResultCount === 0 && gridLastOkCount === 0 && !simulateLastOk) {
      hint +=
        " grid-progress-summary.json on tyhjä (uusi grid käynnissä tai keskeytetty) — odota ensimmäistä onnistunutta varianttia tai käynnistä grid uudelleen.";
    }
    return {
      gridResultsFileCount,
      gridProgressResultCount,
      gridLastOkCount,
      simulateLastOk,
      hint,
    };
  };

  const collectSimulationSummaryRows = (): SimulationRunSummaryRow[] => {
    lastSummaryCollectError = null;
    const rows: SimulationRunSummaryRow[] = [];
    const dedupe = new Map<string, SimulationRunSummaryRow>();
    try {
      if (!existsSync(simulationDir)) return rows;
      const names = fs.readdirSync(simulationDir);
      for (const name of names) {
        const lower = name.toLowerCase();
        const fullPath = path.join(simulationDir, name);
        let savedAt: string | undefined;
        try {
          savedAt = new Date(fs.statSync(fullPath).mtimeMs).toISOString();
        } catch {
          savedAt = undefined;
        }
        if (
          (lower.startsWith("grid-results-") && lower.endsWith(".json")) ||
          lower === "grid-progress-summary.json" ||
          lower === "grid-last-summary.json"
        ) {
          const parsed = readJsonIfExists<unknown>(fullPath);
          if (!parsed || typeof parsed !== "object") continue;
          const dump = parsed as {
            gridPath?: string;
            baselineConfig?: ConfigOptions;
            baselineOptionsSnapshotFile?: string;
            results?: Array<{ variantIndex?: number; variant?: unknown; result?: SimulationApiResult }>;
          };
          const sourceType: SimulationRunSummaryRow["source"] =
            lower === "grid-progress-summary.json"
              ? "grid-progress"
              : lower === "grid-last-summary.json"
                ? "grid-last"
                : "grid-results";
          const resultRows = Array.isArray(dump.results) ? dump.results : [];
          for (const item of resultRows) {
            const r = item?.result;
            if (!r || typeof r !== "object" || !("ok" in r) || !r.ok) continue;
            const resolvedGrid = resolveGridSummaryVariant(item, dump);
            const row: SimulationRunSummaryRow = {
              source: sourceType,
              file: name,
              savedAt,
              gridPath: typeof dump.gridPath === "string" ? dump.gridPath : undefined,
              variantIndex: typeof item.variantIndex === "number" ? item.variantIndex : undefined,
              roi: r.roi,
              roiPercent: r.roiPercent,
              startingBalance: r.startingBalance,
              finalPortfolio: r.finalPortfolio,
              candleRows: r.candleRows,
              variant: resolvedGrid.variant,
              baselineOptionsSnapshotFile: resolvedGrid.baselineOptionsSnapshotFile,
              hasGridBaselineSnapshot: resolvedGrid.hasGridBaselineSnapshot,
              values: (() => {
                const flat = flattenLeafValues(resolvedGrid.variant);
                if (
                  typeof item.variantIndex === "number" &&
                  item.variantIndex === 0 &&
                  typeof dump.baselineOptionsSnapshotFile === "string" &&
                  dump.baselineOptionsSnapshotFile.length > 0
                ) {
                  flat["baseline.optionsSnapshotFile"] = dump.baselineOptionsSnapshotFile;
                }
                return flat;
              })(),
            };
            const key = `${row.gridPath ?? row.file}|${row.variantIndex ?? -1}|${row.roi}|${row.finalPortfolio}|${row.candleRows}`;
            const prev = dedupe.get(key);
            if (!prev || (row.savedAt != null && (prev.savedAt == null || row.savedAt > prev.savedAt))) {
              dedupe.set(key, row);
            }
          }
        } else if (name === "simulate-last-result.json") {
          const parsed = readJsonIfExists<PersistedSimulationResult>(fullPath);
          if (!parsed?.result || !parsed.result.ok) continue;
          const r = parsed.result;
          let resolvedVariant: unknown = undefined;
          if (r.gridVariant != null && typeof r.gridVariant === "object") {
            resolvedVariant = r.gridVariant;
          } else {
            resolvedVariant = buildSyntheticGridVariantFromConfigOptions(parsed.baselineConfig);
            if (resolvedVariant == null) {
              try {
                if (existsSync(optionsFilename)) {
                  const rawSim = fs.readFileSync(optionsFilename, "utf-8");
                  if (rawSim) {
                    const simDoc = JSON.parse(rawSim) as ConfigOptions;
                    resolvedVariant = buildSyntheticGridVariantFromConfigOptions(simDoc);
                  }
                }
              } catch {
                // vanhat tiedostot / rikkinäinen JSON
              }
            }
          }
          const row: SimulationRunSummaryRow = {
            source: "simulate-last",
            file: name,
            savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : savedAt,
            roi: r.roi,
            roiPercent: r.roiPercent,
            startingBalance: r.startingBalance,
            finalPortfolio: r.finalPortfolio,
            candleRows: r.candleRows,
            variant: resolvedVariant,
            values: flattenLeafValues(
              resolvedVariant != null && typeof resolvedVariant === "object" ? resolvedVariant : {},
            ),
            hasPersistedBaseline: (() => {
              const b = parsed.baselineConfig;
              return !!(b && typeof b === "object" && Array.isArray(b.exchanges) && b.exchanges.length > 0);
            })(),
          };
          const key = `${row.file}|${row.roi}|${row.finalPortfolio}|${row.candleRows}`;
          const prev = dedupe.get(key);
          if (!prev || (row.savedAt != null && (prev.savedAt == null || row.savedAt > prev.savedAt))) {
            dedupe.set(key, row);
          }
        }
      }
      const gridVariantCacheDir = path.join(simulationDir, "cache", "grid-variants");
      if (existsSync(gridVariantCacheDir)) {
        for (const cacheName of fs.readdirSync(gridVariantCacheDir)) {
          if (!cacheName.toLowerCase().endsWith(".json")) continue;
          const cachePath = path.join(gridVariantCacheDir, cacheName);
          const cached = readJsonIfExists<{
            savedAt?: string;
            variantIndex?: number;
            variant?: unknown;
            values?: Record<string, unknown>;
            gridPath?: string;
            simulationHistoryYears?: number;
            baselineConfig?: ConfigOptions;
            baselineOptionsSnapshotFile?: string;
            result?: SimulationApiResult;
          }>(cachePath);
          const r = cached?.result;
          if (!r || typeof r !== "object" || !r.ok) continue;
          let cacheSavedAt: string | undefined;
          try {
            cacheSavedAt = new Date(fs.statSync(cachePath).mtimeMs).toISOString();
          } catch {
            cacheSavedAt = undefined;
          }
          const resolvedGrid = resolveGridSummaryVariant(
            {
              variantIndex: cached.variantIndex,
              variant: cached.variant,
            },
            {
              baselineConfig: cached.baselineConfig,
              baselineOptionsSnapshotFile: cached.baselineOptionsSnapshotFile,
            },
          );
          const row: SimulationRunSummaryRow = {
            source: "grid-cache",
            file: cacheName,
            savedAt: typeof cached.savedAt === "string" ? cached.savedAt : cacheSavedAt,
            gridPath: typeof cached.gridPath === "string" ? cached.gridPath : undefined,
            variantIndex: typeof cached.variantIndex === "number" ? cached.variantIndex : undefined,
            roi: r.roi,
            roiPercent: r.roiPercent,
            startingBalance: r.startingBalance,
            finalPortfolio: r.finalPortfolio,
            candleRows: r.candleRows,
            variant: resolvedGrid.variant,
            baselineOptionsSnapshotFile: resolvedGrid.baselineOptionsSnapshotFile,
            hasGridBaselineSnapshot: resolvedGrid.hasGridBaselineSnapshot,
            values: (() => {
              const fromCache =
                cached.values != null && typeof cached.values === "object" && Object.keys(cached.values).length > 0
                  ? { ...cached.values }
                  : null;
              const flat = fromCache ?? flattenLeafValues(resolvedGrid.variant);
              flat["cache.hash"] = cacheName.replace(/\.json$/i, "");
              if (
                !fromCache &&
                typeof cached.variantIndex === "number" &&
                cached.variantIndex === 0 &&
                typeof cached.baselineOptionsSnapshotFile === "string" &&
                cached.baselineOptionsSnapshotFile.length > 0
              ) {
                flat["baseline.optionsSnapshotFile"] = cached.baselineOptionsSnapshotFile;
              }
              return flat;
            })(),
          };
          const key = `grid-cache|${cacheName}|${row.roi}|${row.finalPortfolio}|${row.candleRows}`;
          const prev = dedupe.get(key);
          if (!prev || (row.savedAt != null && (prev.savedAt == null || row.savedAt > prev.savedAt))) {
            dedupe.set(key, row);
          }
        }
      }
    } catch (e) {
      lastSummaryCollectError = e instanceof Error ? e.message : String(e);
      console.error("collectSimulationSummaryRows:", e);
    }
    rows.push(...dedupe.values());
    rows.sort((a, b) => {
      if (b.roi !== a.roi) return b.roi - a.roi;
      const at = a.savedAt ? Date.parse(a.savedAt) : 0;
      const bt = b.savedAt ? Date.parse(b.savedAt) : 0;
      return bt - at;
    });
    return rows;
  };

  /** Simulaatio- ja grid-tila — ennen reittejä, jotta /simulate/* ja /simulate/grid viittaavat samaan tilaan. */
  let simGridRunning = false;
  let simGridAbortRequested = false;
  let simGridStartedAt: number | null = null;
  let simGridLastSummary: GridRunSummary | null = null;
  let simGridLastError: string | null = null;
  let simGridProgress: GridRuntimeProgress | null = null;
  let simulateRunning = false;
  let simulateAbortRequested = false;
  let simulateStartedAt: number | null = null;
  let simulateLastResult: SimulationApiResult | null = loadPersistedSimulationResult();
  let simulateLastError: string | null = null;
  let simulateProgress: SimulationProgress | null = null;

  app.get("/health", (_, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Resolve Frontend directory: try next to bundle, then cwd/build, build-dev, src.
  // Fallback: bundle dir (legacy copy put index.html next to hoobot.js).
  const candidates = [
    path.join(__dirname, "Frontend"),
    path.join(process.cwd(), "build", "Frontend"),
    path.join(process.cwd(), "build-dev", "Frontend"),
    path.join(process.cwd(), "src", "Frontend"),
    ...(existsSync(path.join(__dirname, "index.html")) ? [__dirname] : []),
  ];
  let frontendPath = candidates.find((p) => existsSync(p));
  if (!frontendPath) {
    frontendPath = path.join(__dirname, "Frontend");
    logger.warn(
      "Frontend folder not found. Tried:",
      candidates.join(", "),
      "- Run 'npm run build' to copy Frontend into build/",
    );
  } else {
    logger.info("Serving frontend from:", frontendPath);
  }
  app.use(express.static(frontendPath));

  const indexPath = path.resolve(frontendPath, "index.html");
  app.get("/", (_, res) => {
    if (!existsSync(indexPath)) {
      res.status(404).send(`index.html not found. Frontend path: ${frontendPath}`);
      return;
    }
    res.sendFile(indexPath);
  });

  app.get("/simulate", async (req, res) => {
    if (process.env.SIMULATE !== "true") {
      res.status(403).json({ ok: false, error: "Simulate endpoint only available when SIMULATE=true." });
      return;
    }
    const useLastRaw = req.query.useLast;
    const useLast = String(Array.isArray(useLastRaw) ? useLastRaw[0] : (useLastRaw ?? "")).toLowerCase() === "true";
    if (useLast) {
      const last = simulateLastResult ?? loadPersistedSimulationResult();
      if (last) {
        res.json(last);
        return;
      }
      res.status(404).json(simulationLastResultNotFoundPayload());
      return;
    }
    if (simulateRunning) {
      res.status(409).json({ ok: false, error: "Simulaatio on jo käynnissä." });
      return;
    }
    simulateAbortRequested = false;
    simulateRunning = true;
    simulateProgress = { phase: "loading", message: "Aloitetaan simulaatio…" };
    const cfg = validateOptions(JSON.parse(JSON.stringify(parseArgsSimulate())) as ConfigOptions);
    const yearsRaw = req.query.years;
    if (yearsRaw != null) {
      const yearsNum = Number(Array.isArray(yearsRaw) ? yearsRaw[0] : yearsRaw);
      if (Number.isFinite(yearsNum) && yearsNum >= 0) {
        cfg.simulationHistoryYears = yearsNum;
      }
    }
    const baselineSnapshot = maskConfigSecretsForExport(JSON.parse(JSON.stringify(cfg)) as ConfigOptions);
    const result = await runSimulationWithConfig(
      cfg,
      undefined,
      () => simulateAbortRequested,
      (p) => {
        simulateProgress = p;
      },
      { saveCheckpoints: true },
    );
    simulateRunning = false;
    simulateProgress = null;
    simulateLastResult = result;
    simulateLastError = result.ok ? null : result.error;
    persistSimulationResult(result, { baselineConfig: baselineSnapshot });
    if (result.ok) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  });

  /** Taustalla ajettava yksittäinen simulaatio (UI voi pollata tilaa selaimen uudelleenlatauksen jälkeen). */
  app.post("/simulate/start", (req, res) => {
    if (process.env.SIMULATE !== "true") {
      res.status(403).json({ ok: false, error: "Simulate endpoint only available when SIMULATE=true." });
      return;
    }
    if (simulateRunning) {
      res.status(409).json({ ok: false, error: "Simulaatio on jo käynnissä." });
      return;
    }
    const body = req.body && typeof req.body === "object" ? (req.body as { years?: unknown; resume?: boolean }) : {};
    const yearsNum = Number(body.years ?? NaN);
    const resume = body.resume === true;
    const checkpointPath = defaultSimulationCheckpointPath();
    if (resume) {
      const cp = readSimulationCheckpointFile(checkpointPath);
      if (!cp) {
        res.status(400).json({
          ok: false,
          error: "Checkpointia ei löydy (simulation/simulate-checkpoint.json). Ei voi jatkaa — aja simulaatio alusta.",
        });
        return;
      }
    } else {
      /** Synkronoitu ennen HTTP-vastausta ja setImmediateä — näin /simulate/checkpoint ei näytä väärää tilaa käynnistyessä uusi ajo. */
      deleteSimulationCheckpointFile(checkpointPath);
    }
    simulateAbortRequested = false;
    simulateRunning = true;
    simulateStartedAt = Date.now();
    simulateLastError = null;
    simulateProgress = {
      phase: "loading",
      message: resume ? "Jatketaan tallennetusta tilasta…" : "Aloitetaan simulaatio…",
    };
    setImmediate(() => {
      const cfg = validateOptions(JSON.parse(JSON.stringify(parseArgsSimulate())) as ConfigOptions);
      if (Number.isFinite(yearsNum) && yearsNum >= 0) {
        cfg.simulationHistoryYears = yearsNum;
      }
      const baselineSnapshot = maskConfigSecretsForExport(JSON.parse(JSON.stringify(cfg)) as ConfigOptions);
      const simCacheKey = sha256({
        config: cfg,
        years: Number.isFinite(yearsNum) && yearsNum >= 0 ? yearsNum : (cfg.simulationHistoryYears ?? null),
        dataSnapshot: getCandlestoreSnapshot(),
      });
      const simCacheFile = path.join(simulationSingleCacheDir, `${simCacheKey}.json`);
      if (!resume) {
        const cached = readJsonIfExists<{ savedAt: string; result: SimulationApiResult }>(simCacheFile);
        if (cached?.result?.ok) {
          console.log("[simulate] Tulos palautettiin välimuistista — ei uutta ajoa.");
          simulateLastResult = cached.result;
          simulateLastError = null;
          simulateRunning = false;
          simulateStartedAt = null;
          simulateProgress = null;
          persistSimulationResult(cached.result, { baselineConfig: baselineSnapshot });
          return;
        }
      }
      runSimulationWithConfig(
        cfg,
        undefined,
        () => simulateAbortRequested,
        (p) => {
          simulateProgress = p;
        },
        { resumeFromFile: resume, checkpointPath, saveCheckpoints: true },
      )
        .then((r) => {
          simulateLastResult = r;
          simulateLastError = r.ok ? null : r.error;
          persistSimulationResult(r, { baselineConfig: baselineSnapshot });
          if (r.ok) {
            writeJsonSafe(simCacheFile, { savedAt: new Date().toISOString(), result: r });
          }
          simulateRunning = false;
          simulateProgress = null;
        })
        .catch((e) => {
          simulateLastError = e instanceof Error ? e.message : String(e);
          simulateRunning = false;
          simulateProgress = null;
          console.error("simulate/start:", e);
        });
    });
    res.json({
      ok: true,
      message: resume ? "Simulaation jatkaminen käynnistetty taustalla." : "Simulaatio käynnistetty taustalla.",
      years: Number.isFinite(yearsNum) ? yearsNum : undefined,
      resume,
    });
  });

  /** Checkpoint-tiedoston metatiedot (jatko-UI). */
  app.get("/simulate/checkpoint", (_, res) => {
    if (process.env.SIMULATE !== "true") {
      res.status(403).json({ ok: false, error: "Vain SIMULATE-istunto." });
      return;
    }
    const cp = readSimulationCheckpointFile(defaultSimulationCheckpointPath());
    if (!cp) {
      res.json({ ok: true, exists: false });
      return;
    }
    const symName = cp.symbolsOrder[cp.symIdx] ?? "?";
    const passTotal = cp.symbolsOrder.length;
    const cfg = validateOptions(JSON.parse(JSON.stringify(parseArgsSimulate())) as ConfigOptions);
    let fingerprintMatches = false;
    let fingerprintHint: string | undefined;
    if (cp.version === 1) {
      fingerprintHint =
        "Checkpoint on versiota 1 (vanha muoto). Tyhjennä checkpoint ja aja uusi simulaatio, tai jatko epäonnistuu.";
    } else {
      try {
        fingerprintMatches = cp.fingerprint === buildSimulationCheckpointFingerprint(cfg, cp.candleRows);
      } catch {
        fingerprintMatches = false;
      }
      if (!fingerprintMatches) {
        fingerprintHint =
          "Nykyiset simulate-asetukset eivät täsmää checkpointiin (tai kynttilärivimäärä muuttunut) — jatko voi epäonnistua.";
      }
    }
    res.json({
      ok: true,
      exists: true,
      version: cp.version,
      savedAt: cp.savedAt,
      symIdx: cp.symIdx,
      candleIndex: cp.candleIndex,
      candleRows: cp.candleRows,
      symbolLabel: `${symName} (erä ${cp.symIdx + 1}/${passTotal})`,
      percentInPass: cp.candleRows > 0 ? (cp.candleIndex / cp.candleRows) * 100 : 0,
      fingerprintMatches,
      fingerprintHint,
    });
  });

  /** Poista checkpoint (aloita seuraava ajo aina alusta). */
  app.post("/simulate/checkpoint/clear", (_, res) => {
    if (process.env.SIMULATE !== "true") {
      res.status(403).json({ ok: false, error: "Vain SIMULATE-istunto." });
      return;
    }
    deleteSimulationCheckpointFile(defaultSimulationCheckpointPath());
    res.json({ ok: true, message: "Checkpoint poistettu." });
  });

  app.get("/simulate/status", (_, res) => {
    res.json({
      running: simulateRunning,
      startedAt: simulateStartedAt,
      lastResult: simulateLastResult,
      lastError: simulateLastError,
      abortRequested: simulateAbortRequested,
      progress: simulateProgress,
    });
  });

  app.get("/simulate/last", (_, res) => {
    if (process.env.SIMULATE !== "true") {
      res.status(403).json({ ok: false, error: "Simulate endpoint only available when SIMULATE=true." });
      return;
    }
    if (simulateLastResult) {
      if (simulateLastResult.ok) {
        const extra = enrichLastResultMetaForApi(simulateLastResult);
        res.json({ ...simulateLastResult, ...extra });
      } else {
        res.json(simulateLastResult);
      }
      return;
    }
    const fromDisk = loadPersistedSimulationWithMeta();
    if (!fromDisk) {
      res.status(404).json(simulationLastResultNotFoundPayload());
      return;
    }
    const { result, meta } = fromDisk;
    if (result.ok) {
      res.json({
        ...result,
        persistedAt: meta.savedAt,
        summarySource: meta.sourceKey,
      });
    } else {
      res.json(result);
    }
  });

  /** Kaikkien simulaatioajojen yhteenveto (parhaat ROI:t + varianttiarvot). */
  app.get("/simulate/summary", (req, res) => {
    if (process.env.SIMULATE !== "true") {
      res.status(403).json({
        ok: false,
        error: "Simulate endpoint only available when SIMULATE=true.",
        hint: "Avaa simulaatio-istunto portissa 5657 (npm run simulate tai simulate:start:build), ei live-portissa 5656.",
      });
      return;
    }
    const minRoiRaw = req.query.minRoi;
    const minRoi = minRoiRaw != null && String(minRoiRaw).trim() !== "" ? Number(String(minRoiRaw).trim()) : undefined;
    const minRoiPercentRaw = req.query.minRoiPercent;
    const minRoiFromPercent =
      minRoiPercentRaw != null && String(minRoiPercentRaw).trim() !== ""
        ? Number(String(minRoiPercentRaw).trim()) / 100
        : undefined;
    const minRoiFilter =
      minRoiFromPercent != null && Number.isFinite(minRoiFromPercent)
        ? minRoiFromPercent
        : minRoi != null && Number.isFinite(minRoi)
          ? minRoi
          : undefined;

    const allRowsCollected = collectSimulationSummaryRows();
    if (lastSummaryCollectError) {
      res.status(500).json({
        ok: false,
        error: `Yhteenvetorivien keruu epäonnistui: ${lastSummaryCollectError}`,
        diagnostics: collectSimulationSummaryDiagnostics(),
      });
      return;
    }
    const allRows =
      minRoiFilter != null
        ? allRowsCollected.filter((row) => Number.isFinite(row.roi) && row.roi >= minRoiFilter)
        : allRowsCollected;
    const totalCount = allRows.length;
    const rows = allRows.slice(0, SIM_SUMMARY_UI_ROW_LIMIT);
    const truncated = totalCount > rows.length;
    const best = allRows.length > 0 ? allRows[0] : null;
    const payload: Record<string, unknown> = {
      ok: true,
      simulationUi: isSimulateInstance,
      totalCount,
      count: rows.length,
      truncated,
      minRoiFilter: minRoiFilter ?? null,
      best,
      rows,
    };
    if (totalCount === 0) {
      payload.diagnostics = collectSimulationSummaryDiagnostics();
    }
    res.json(payload);
  });

  /** Arvioi gridin varianttimäärä ennen käynnistystä (UI-varoitus). */
  app.post("/simulate/grid-estimate", (req, res) => {
    if (process.env.SIMULATE !== "true") {
      res.status(403).json({ ok: false, error: "Simulate endpoint only available when SIMULATE=true." });
      return;
    }
    try {
      const body = req.body && typeof req.body === "object" ? (req.body as { configPath?: unknown }) : {};
      const relPath =
        typeof body.configPath === "string" && String(body.configPath).trim() !== ""
          ? String(body.configPath).trim()
          : "settings/sim-grid.example.json";
      const absPath = resolveProjectRelativePath(relPath);
      if (!existsSync(absPath)) {
        res.status(400).json({ ok: false, error: `Grid-tiedostoa ei löydy: ${relPath}` });
        return;
      }
      const raw = fs.readFileSync(absPath, "utf-8");
      const parsed = raw ? (JSON.parse(raw) as unknown) : {};
      const v = validateGridPayload(parsed);
      if (!v.ok) {
        res.status(400).json({ ok: false, error: `Grid-validointi epäonnistui:\n- ${v.errors.join("\n- ")}` });
        return;
      }
      const count = estimateGridVariantCount(v.data);
      res.json({ ok: true, count, configPath: relPath });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  /** Keskeytä käynnissä oleva simulaatio (replay-loop) tai grid-variantit */
  app.post("/simulate/stop", (_, res) => {
    if (process.env.SIMULATE !== "true") {
      res.status(403).json({ ok: false, error: "Simulaation stop on vain SIMULATE-istunnossa." });
      return;
    }
    simulateAbortRequested = true;
    simGridAbortRequested = true;
    res.json({ ok: true, message: "Simulaation/gridin keskeytys pyydetty." });
  });

  /** Taustalla ajettava grid (useita variantteja). Vaatii SIMULATE=true ja simGrid.enabled. */
  app.post("/simulate/grid", (req, res) => {
    if (process.env.SIMULATE !== "true") {
      res.status(403).json({
        error: "Grid-simulaatio on vain SIMULATE-istunnossa (esim. portti 5657).",
      });
      return;
    }
    /** Sama lähde kuin executeSimGrid (fallback hoobot-options.json jos simulate-tiedostoa ei ole). */
    const fresh = validateOptions(JSON.parse(JSON.stringify(parseArgsSimulate())) as ConfigOptions);
    if (!fresh.simGrid?.enabled) {
      const settingsName = isSimulateInstance ? "hoobot-options-simulate.json" : "hoobot-options.json";
      res.status(403).json({
        error: `Ota grid käyttöön: aseta simGrid.enabled = true ja tallenna asetukset (${settingsName}).`,
      });
      return;
    }
    if (simGridRunning) {
      res.status(409).json({ error: "Grid-simulaatio on jo käynnissä." });
      return;
    }
    const body = req.body && typeof req.body === "object" ? (req.body as { configPath?: unknown }) : {};
    const pathFromBody =
      typeof body.configPath === "string" && String(body.configPath).trim() !== ""
        ? String(body.configPath).trim()
        : "";
    const relPath = pathFromBody || fresh.simGrid?.configPath || "settings/sim-grid.example.json";
    const absPath = resolveProjectRelativePath(relPath);
    if (!existsSync(absPath)) {
      res.status(400).json({
        error: `Grid-tiedostoa ei löydy: ${relPath} (ratkaistu: ${absPath}). Varmista polku projektin juuresta ja että tiedosto on olemassa.`,
      });
      return;
    }
    const gridRaw = fs.readFileSync(absPath, "utf-8");
    const gridCacheKey = sha256({
      gridPath: relPath,
      gridRaw,
      config: fresh,
      dataSnapshot: getCandlestoreSnapshot(),
    });
    const gridCacheFile = path.join(simulationGridCacheDir, `${gridCacheKey}.json`);
    const cachedGrid = readJsonIfExists<{ savedAt: string; summary: GridRunSummary }>(gridCacheFile);
    if (cachedGrid?.summary) {
      simGridLastSummary = cachedGrid.summary;
      simGridLastError = null;
      simGridRunning = false;
      simGridProgress = null;
      simGridStartedAt = null;
      const bestFromCache = bestOkResultFromGridSummary(cachedGrid.summary);
      if (bestFromCache) {
        simulateLastResult = bestFromCache;
        persistSimulationResult(bestFromCache, {
          baselineConfig: cachedGrid.summary.baselineConfig,
        });
      }
      console.log(
        `[sim-grid] Tulos palautettiin välimuistista (sama grid + asetukset) — ei uutta ajoa. Polku: ${relPath}`,
      );
      res.json({
        ok: true,
        cached: true,
        message: "Grid-tulos löytyi cachesta (samoin asetuksin) — ajoa ei käynnistetty uudelleen.",
        path: relPath,
      });
      return;
    }
    simGridRunning = true;
    simGridAbortRequested = false;
    simGridStartedAt = Date.now();
    simulateAbortRequested = false;
    simGridLastError = null;
    simGridLastSummary = null;
    simGridProgress = null;
    console.log(`[sim-grid] Käynnistetään taustalla: ${relPath}`);
    setImmediate(() => {
      executeSimGrid(
        absPath,
        () => simGridAbortRequested,
        (p) => {
          simGridProgress = p;
        },
      )
        .then((summary) => {
          simGridLastSummary = summary;
          writeJsonSafe(gridCacheFile, { savedAt: new Date().toISOString(), summary });
          const best = bestOkResultFromGridSummary(summary);
          if (best) {
            simulateLastResult = best;
            persistSimulationResult(best, { baselineConfig: summary.baselineConfig });
          }
          simGridRunning = false;
          simGridStartedAt = null;
          simGridProgress = null;
        })
        .catch((e) => {
          simGridLastError = e instanceof Error ? e.message : String(e);
          simGridRunning = false;
          simGridStartedAt = null;
          simGridProgress = null;
          console.error("executeSimGrid:", e);
        });
    });
    res.json({ ok: true, message: "Grid-simulaatio käynnistetty taustalla.", path: relPath });
  });

  app.get("/simulate/grid-status", (_, res) => {
    res.json({
      running: simGridRunning,
      startedAt: simGridStartedAt,
      abortRequested: simGridAbortRequested,
      progress: simGridProgress,
      lastSummary: simGridLastSummary,
      lastError: simGridLastError,
    });
  });

  app.get("/run", (_, res) => {
    if (options.running != true) {
      options.running = true;
      const optionsInFile = parseArgs();
      optionsInFile.running = true;
      fs.writeFileSync(liveOptionsFilename, JSON.stringify(optionsInFile, null, 2));
      hoobot();
      res.json({ message: "Hoobot started" });
    } else {
      res.json({ message: "Hoobot was already running, can't restart." });
    }
  });

  app.get("/stop", (_, res) => {
    console.log("Got command to stop hoobot");
    if (options.running == true) {
      options.running = false;
      const optionsInFile = parseArgs();
      optionsInFile.running = false;
      fs.writeFileSync(liveOptionsFilename, JSON.stringify(optionsInFile, null, 2));
      stopHoobot();
      res.json({ message: "Hoobot stopping" });
    } else {
      res.json({ message: "Couldn't stop hoobot, since it was not running." });
    }
  });

  const maskSecretsForDisplay = (data: Record<string, unknown>): Record<string, unknown> => {
    const out = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
    const exchanges = out.exchanges as Array<{ key?: string; secret?: string }> | undefined;
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

  const mergeSettingsForSave = (
    current: Record<string, unknown>,
    incoming: Record<string, unknown>,
  ): Record<string, unknown> => {
    const merged = JSON.parse(JSON.stringify(incoming)) as Record<string, unknown>;
    const curEx = current.exchanges as Array<{ key?: string; secret?: string }> | undefined;
    const inEx = merged.exchanges as Array<{ key?: string; secret?: string }> | undefined;
    if (Array.isArray(curEx) && Array.isArray(inEx)) {
      for (let i = 0; i < inEx.length; i++) {
        const c = curEx[i];
        const n = inEx[i];
        if (c && n && typeof n === "object") {
          const mask = (v: unknown) => v === "***" || v === "" || v == null;
          if (mask(n.secret) && typeof c.secret === "string" && c.secret.length > 0) n.secret = c.secret;
          if (mask(n.key) && typeof c.key === "string" && c.key.length > 0) n.key = c.key;
        }
      }
    }
    if (merged.simGrid === undefined && current.simGrid != null) {
      merged.simGrid = current.simGrid as Record<string, unknown>;
    } else if (merged.simGrid != null && current.simGrid != null && typeof merged.simGrid === "object") {
      const curSg = current.simGrid as Record<string, unknown>;
      const inSg = merged.simGrid as Record<string, unknown>;
      const inPath = inSg.configPath;
      if (
        (inPath === undefined || inPath === "" || inPath === null) &&
        curSg.configPath != null &&
        curSg.configPath !== ""
      ) {
        inSg.configPath = curSg.configPath;
      }
      if (inSg.enabled === undefined && curSg.enabled !== undefined) {
        inSg.enabled = curSg.enabled;
      }
    }
    return merged;
  };

  app.get("/settings", (_, res) => {
    try {
      if (isSimulateInstance) {
        const data = loadSimulateSettingsDocument();
        res.json({
          ...maskSecretsForDisplay(data),
          simulationUi: true,
        });
        return;
      }
      const readFrom = effectiveSettingsReadPath();
      if (fs.existsSync(readFrom)) {
        const raw = fs.readFileSync(readFrom, "utf-8");
        const data = raw ? JSON.parse(raw) : {};
        res.json({
          ...maskSecretsForDisplay(data as Record<string, unknown>),
          simulationUi: isSimulateInstance,
        });
      } else {
        res.json({
          debug: false,
          startTime: "",
          license: "",
          discord: {},
          exchanges: [],
          running: false,
          simulationUi: isSimulateInstance,
        });
      }
    } catch (e) {
      console.error("Error reading settings:", e);
      res.status(500).json({ error: "Failed to read settings file" });
    }
  });

  app.post("/settings", (req, res) => {
    var running = options.running;
    if (running == true) {
      stopHoobot();
    }
    let newOptions = req.body as Record<string, unknown>;
    newOptions.running = options.running;
    try {
      const mergeFrom = effectiveSettingsMergePath();
      if (fs.existsSync(mergeFrom)) {
        const raw = fs.readFileSync(mergeFrom, "utf-8");
        const current = raw ? JSON.parse(raw) : {};
        newOptions = mergeSettingsForSave(current as Record<string, unknown>, newOptions);
      }
    } catch {
      // use body as-is if merge fails
    }
    fs.writeFileSync(optionsFilename, JSON.stringify(sanitizeOptionsDocument(newOptions as ConfigOptions), null, 2));
    options = newOptions as typeof options;
    // Simulaatio-UI (SIMULATE=true, esim. portti 5657): älä käynnistä live-bottia tallennuksella
    if (options.running == true && process.env.SIMULATE !== "true") {
      hoobot();
    }
    res.json({ message: "Options updated successfully", options: maskSecretsForDisplay(newOptions) });
  });

  /** Kopioi yhden parin asetukset simulaatiolomakkeesta tai -tiedostosta → live hoobot-options.json. */
  app.post("/settings/copy-symbol-to-live", (req, res) => {
    if (!isSimulateInstance) {
      res.status(403).json({ ok: false, error: "Vain simulaatio-istunnossa (SIMULATE=true)." });
      return;
    }
    try {
      const body = req.body as { exchangeName?: string; symbol?: Record<string, unknown> };
      const incoming = body.symbol && typeof body.symbol === "object" ? body.symbol : null;
      const symName = incoming?.name != null ? String(incoming.name).trim() : "";
      if (!incoming || !symName) {
        res.status(400).json({ ok: false, error: "Puuttuu symbol.name tai symbol-objekti." });
        return;
      }
      if (!fs.existsSync(liveOptionsFilename)) {
        res.status(400).json({ ok: false, error: "Live-asetustiedostoa ei löydy: " + liveOptionsFilename });
        return;
      }
      const rawLive = fs.readFileSync(liveOptionsFilename, "utf-8");
      const liveDoc = (rawLive ? JSON.parse(rawLive) : {}) as Record<string, unknown>;
      const copySymPol = readSimToLiveMergePolicy(liveDoc);
      const exchanges = liveDoc.exchanges as ExchangeOptions[] | undefined;
      if (!Array.isArray(exchanges) || exchanges.length === 0) {
        res.status(400).json({ ok: false, error: "Live-konfigissa ei ole pörssejä." });
        return;
      }
      const wantEx = (body.exchangeName ?? "").toString().trim();
      let exIdx = wantEx ? exchanges.findIndex((e) => e && e.name === wantEx) : 0;
      if (exIdx < 0 && wantEx) {
        res.status(400).json({ ok: false, error: `Pörssiä "${wantEx}" ei löydy live-asetuksista.` });
        return;
      }
      if (exIdx < 0) exIdx = 0;
      const ex = exchanges[exIdx];
      if (!ex || !Array.isArray(ex.symbols)) {
        res.status(400).json({ ok: false, error: "Live-pörssillä ei ole symbolilistaa." });
        return;
      }
      const syms = [...ex.symbols];
      const sIdx = syms.findIndex((s) => s && s.name === symName);
      const existingSym = sIdx >= 0 ? syms[sIdx] : undefined;
      const merged = mergeIncomingSymbolPreserveLiveRuntime(incoming, existingSym, copySymPol);
      const asSym = merged as unknown as SymbolOptions;
      if (sIdx >= 0) syms[sIdx] = asSym;
      else syms.push(asSym);
      syncTakeProfitRuntimeFromConfig(sIdx >= 0 ? syms[sIdx] : asSym);
      ex.symbols = syms as SymbolOptions[];

      fs.writeFileSync(liveOptionsFilename, JSON.stringify(sanitizeOptionsDocument(liveDoc as ConfigOptions), null, 2));
      res.json({
        ok: true,
        message: `Parin ${symName} asetukset kirjoitettiin live-tiedostoon (${path.basename(liveOptionsFilename)}).`,
      });
    } catch (e) {
      console.error("copy-symbol-to-live:", e);
      res.status(500).json({ ok: false, error: "Kopiointi epäonnistui." });
    }
  });

  app.options("/settings/live-symbols", (_, res) => {
    simToLivePushCors(res);
    res.sendStatus(204);
  });

  /** Take profit -runtime (huippu, armed) symbolille — treidauksen tilan tarkistus UI:lle. */
  app.get("/trading/tp-state", (req, res) => {
    const symbolName = String(req.query.symbol ?? "").trim();
    if (!symbolName) {
      res.status(400).json({ ok: false, error: "Query parameter symbol is required." });
      return;
    }
    const symbolKey = toSymbolKey(symbolName);
    let sym: SymbolOptions | undefined;
    for (const ex of options.exchanges ?? []) {
      sym = ex.symbols?.find((s) => s && toSymbolKey(s.name) === symbolKey);
      if (sym) break;
    }
    if (!sym) {
      res.status(404).json({ ok: false, error: `Symbol ${symbolName} not found in running options.` });
      return;
    }
    res.json({
      ok: true,
      symbol: sym.name,
      takeProfit: {
        current: sym.takeProfit?.current ?? 0,
        runtimeSell: getTakeProfitRuntimeState(symbolKey, "sell"),
        runtimeBuy: getTakeProfitRuntimeState(symbolKey, "buy"),
      },
    });
  });

  /** hoobot-options.json - symbolilistat (Sim Yhteenveto → Live, paikallinen tai etä-CORS). */
  app.get("/settings/live-symbols", (_, res) => {
    simToLivePushCors(res);
    try {
      const readPath = isSimulateInstance ? liveOptionsFilename : optionsFilename;
      if (!fs.existsSync(readPath)) {
        res.json({ ok: true, exchanges: [] });
        return;
      }
      const raw = fs.readFileSync(readPath, "utf-8");
      const doc = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
      const exchanges = Array.isArray(doc.exchanges) ? doc.exchanges : [];
      const out: Array<{ name: string; symbols: Array<{ name: string }> }> = [];
      for (const ex of exchanges) {
        if (!ex || typeof ex !== "object") continue;
        const e = ex as { name?: string; symbols?: SymbolOptions[] };
        const symbols = Array.isArray(e.symbols)
          ? e.symbols.filter((s) => s && s.name).map((s) => ({ name: String(s.name) }))
          : [];
        out.push({ name: String(e.name ?? ""), symbols });
      }
      res.json({ ok: true, exchanges: out });
    } catch (e) {
      console.error("live-symbols:", e);
      res.status(500).json({ ok: false, error: "Live-symbolien luku epäonnistui." });
    }
  });

  /** hoobot-options-simulate.json - symbolilistat (Sim Yhteenveto → käytä simulaatiossa). */
  app.options("/settings/simulate-symbols", (_, res) => {
    simToLivePushCors(res);
    res.sendStatus(204);
  });

  app.get("/settings/simulate-symbols", (_, res) => {
    simToLivePushCors(res);
    if (!isSimulateInstance) {
      res.status(403).json({ ok: false, error: "Vain simulaatio-istunnossa (SIMULATE=true)." });
      return;
    }
    try {
      const readPath = optionsFilename;
      if (!fs.existsSync(readPath)) {
        res.json({ ok: true, exchanges: [], basename: path.basename(readPath) });
        return;
      }
      const raw = fs.readFileSync(readPath, "utf-8");
      const doc = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
      const exchanges = Array.isArray(doc.exchanges) ? doc.exchanges : [];
      const out: Array<{ name: string; symbols: Array<{ name: string }> }> = [];
      for (const ex of exchanges) {
        if (!ex || typeof ex !== "object") continue;
        const e = ex as { name?: string; symbols?: SymbolOptions[] };
        const symbols = Array.isArray(e.symbols)
          ? e.symbols.filter((s) => s && s.name).map((s) => ({ name: String(s.name) }))
          : [];
        out.push({ name: String(e.name ?? ""), symbols });
      }
      res.json({ ok: true, exchanges: out, basename: path.basename(readPath) });
    } catch (e) {
      console.error("simulate-symbols:", e);
      res.status(500).json({ ok: false, error: "Simulaatio-symbolien luku epäonnistui." });
    }
  });

  /** Sim: kirjoita yhteenvetorivin variantti hoobot-options-simulate.json -tiedostoon (seuraava simulaatio). */
  app.options("/settings/apply-summary-variant-to-simulate", (_, res) => {
    simToLivePushCors(res);
    res.sendStatus(204);
  });

  app.post("/settings/apply-summary-variant-to-simulate", (req, res) => {
    simToLivePushCors(res);
    if (!isSimulateInstance) {
      res.status(403).json({ ok: false, error: "Vain simulaatio-istunnossa." });
      return;
    }
    try {
      const body = req.body as {
        exchangeName?: string;
        targetSymbolName?: string;
        applyToAll?: boolean;
        variant?: unknown;
      };
      const targetPath = optionsFilename;
      const out = applySummaryVariantToHoobotJsonFile(targetPath, body);
      if (!out.ok) {
        res.status(out.status).json({
          ok: false,
          error: out.status === 400 ? out.error.replace(/^Asetustiedostoa/, "Simulaatio-asetustiedostoa") : out.error,
        });
        return;
      }
      res.json({
        ok: true,
        message: `Kirjoitettu ${out.appliedSymbols.length} parille (${out.appliedSymbols.join(", ")}) → ${path.basename(targetPath)}. Seuraava simulaatio käyttää näitä.`,
        appliedSymbols: out.appliedSymbols,
        basename: out.basename,
      });
    } catch (e) {
      console.error("apply-summary-variant-to-simulate:", e);
      res.status(500).json({ ok: false, error: "Siirto simulaatioasetuksiin epäonnistui." });
    }
  });

  /** Sim: kirjoitus tähän koneella olevaan hoobot-options (live kopio tai jaettu polku); uudelleenkäynnistys erillisellä POST /live/restart. */
  app.post("/settings/apply-summary-variant-to-live", (req, res) => {
    if (!isSimulateInstance) {
      res.status(403).json({ ok: false, error: "Vain simulaatio-istunnossa." });
      return;
    }
    try {
      const body = req.body as {
        exchangeName?: string;
        targetSymbolName?: string;
        applyToAll?: boolean;
        variant?: unknown;
      };
      const out = applySummaryVariantToHoobotJsonFile(liveOptionsFilename, body);
      if (!out.ok) {
        res.status(out.status).json({
          ok: false,
          error: out.status === 400 ? out.error.replace(/^Asetustiedostoa/, "Live-asetustiedostoa") : out.error,
        });
        return;
      }
      res.json({
        ok: true,
        message: `Siirretty ${out.appliedSymbols.length} parille (${out.appliedSymbols.join(", ")}) → ${path.basename(liveOptionsFilename)}.`,
        appliedSymbols: out.appliedSymbols,
        liveRestartPending: true,
        hint: "Etä-botille käytä suoraa lähetystä tai POST /live/restart live-osoitteesta.",
      });
    } catch (e) {
      console.error("apply-summary-variant-to-live:", e);
      res.status(500).json({ ok: false, error: "Siirto epäonnistui." });
    }
  });

  /**
   * Sim-istunto: korvaa live hoobot-options.json `exchanges` kokonaan viimeksi tallennetun yksittäissimin
   * baselineConfig.exchanges -listalla (maskatut avaimet). Varoitus UI:ssa — muut pörssit katoavat jos baseline on kapea.
   */
  app.post("/settings/apply-simulate-last-baseline-exchanges-to-live", (req, res) => {
    if (!isSimulateInstance) {
      res.status(403).json({ ok: false, error: "Vain simulaatio-istunnossa." });
      return;
    }
    try {
      const body =
        req.body && typeof req.body === "object" ? (req.body as { baselineOptionsSnapshotFile?: unknown }) : {};
      const snapFromBody =
        typeof body.baselineOptionsSnapshotFile === "string" ? body.baselineOptionsSnapshotFile.trim() : "";
      let baseline: ConfigOptions | undefined;
      if (snapFromBody && existsSync(snapFromBody)) {
        const rawSnap = fs.readFileSync(snapFromBody, "utf-8");
        baseline = rawSnap ? (JSON.parse(rawSnap) as ConfigOptions) : undefined;
      } else if (existsSync(simulateLastResultFile)) {
        const rawLast = fs.readFileSync(simulateLastResultFile, "utf-8");
        const parsed = rawLast ? (JSON.parse(rawLast) as PersistedSimulationResult) : null;
        baseline = parsed?.baselineConfig;
      }
      if (!baseline || !Array.isArray(baseline.exchanges) || baseline.exchanges.length === 0) {
        res.status(400).json({
          ok: false,
          error: snapFromBody
            ? "Baseline-snapshot-tiedostosta ei löytynyt exchanges-listaa."
            : "Tallennetussa tuloksessa ei ole baselineConfig.exchanges -osiota. Aja simulaatio uudelleen (SIMULATE=true) jotta baseline tallentuu.",
        });
        return;
      }
      if (!existsSync(liveOptionsFilename)) {
        res.status(400).json({
          ok: false,
          error: "Live-asetustiedostoa ei löydy: " + path.basename(liveOptionsFilename),
        });
        return;
      }
      const rawLive = fs.readFileSync(liveOptionsFilename, "utf-8");
      const liveDoc = (rawLive ? JSON.parse(rawLive) : {}) as Record<string, unknown>;
      liveDoc.exchanges = JSON.parse(JSON.stringify(baseline.exchanges)) as unknown[];
      fs.writeFileSync(liveOptionsFilename, JSON.stringify(liveDoc, null, 2));
      res.json({
        ok: true,
        message: `Live-tiedoston exchanges korvattu baselin mukaan (${baseline.exchanges.length} pörssiä) → ${path.basename(liveOptionsFilename)}.`,
        liveRestartPending: true,
        hint: "Käynnistä live-botti uudelleen (tai POST /live/restart) jotta muutos astuu voimaan.",
      });
    } catch (e) {
      console.error("apply-simulate-last-baseline-exchanges-to-live:", e);
      res.status(500).json({ ok: false, error: "Siirto epäonnistui." });
    }
  });

  app.options("/settings/remote-apply-summary-variant", (_, res) => {
    simToLivePushCors(res);
    res.sendStatus(204);
  });

  /**
   * Live-botti yksin: vastaanotta sim-yhteenvedon variantin HTTP:lla, kirjoittaa omat asetuksensa ja käynnistää uudelleen.
   * Vapaaehtoinen HOOBOT_APPLY_KEY — jos env on asetettu, pakollinen otsikko X-Hoobot-Apply-Key sama arvo.
   */
  app.post("/settings/remote-apply-summary-variant", (req, res) => {
    simToLivePushCors(res);
    if (isSimulateInstance) {
      res.status(403).json({
        ok: false,
        error:
          "Tämä komento on vain live-prosessissa. Simulaatioprosessissa käytä ”paikallista kopioita” tai kutsua live-botin osoitteesta.",
      });
      return;
    }
    const expectedKey = (process.env.HOOBOT_APPLY_KEY ?? "").trim();
    if (expectedKey) {
      const got = (req.header("x-hoobot-apply-key") ?? "").trim();
      if (got !== expectedKey) {
        res.status(401).json({
          ok: false,
          error: "Puuttuva tai väärä X-Hoobot-Apply-Key (livessä HOOBOT_APPLY_KEY).",
        });
        return;
      }
    }
    try {
      const body = req.body as {
        exchangeName?: string;
        targetSymbolName?: string;
        applyToAll?: boolean;
        variant?: unknown;
      };
      const out = applySummaryVariantToHoobotJsonFile(optionsFilename, body);
      if (!out.ok) {
        res.status(out.status).json({ ok: false, error: out.error });
        return;
      }
      restartLiveHoobotFromDisk();
      res.json({
        ok: true,
        message: `Siirretty ${out.appliedSymbols.length} parille (${out.appliedSymbols.join(", ")}) ja live käynnistettiin uudelleen (${out.basename}).`,
        appliedSymbols: out.appliedSymbols,
        restarted: true,
      });
    } catch (e) {
      console.error("remote-apply-summary-variant:", e);
      res.status(500).json({ ok: false, error: "Etäsiirto tai uudelleiskäynnistys epäonnistui." });
    }
  });

  const restartLiveHoobotFromDisk = (): void => {
    stopHoobot();
    const fresh = validateOptions(JSON.parse(JSON.stringify(parseArgs())) as ConfigOptions);
    fresh.running = true;
    fs.writeFileSync(liveOptionsFilename, JSON.stringify(fresh, null, 2));
    Object.assign(options, fresh);
    void hoobot().catch((err) => console.error("hoobot restart:", err));
  };

  app.options("/live/restart", (_, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Hoobot-Apply-Key");
    res.sendStatus(204);
  });

  /** Käynnistä live-botti uudelleen levylle tallennetuista asetuksista (vain SIMULATE≠true). */
  app.post("/live/restart", (_, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (isSimulateInstance) {
      res.status(403).json({
        ok: false,
        error:
          "Tämä on simulaatiopalvelin. Käynnistä live-botti erillisessä Hoobot-prosessissa (SIMULATE ei asetettu), tai kutsu tämä endpointti live-portista (esim. 5656).",
      });
      return;
    }
    try {
      restartLiveHoobotFromDisk();
      res.json({ ok: true, message: "Live-botti käynnistetty uudelleen." });
    } catch (e) {
      console.error("live/restart:", e);
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  // PNL summary for dashboard (reuse running exchange when bot is on, else temporary silent connection)
  app.get("/api/pnl", async (req, res) => {
    try {
      const exchangeName = (req.query.exchange as string | undefined) ?? options.exchanges[0]?.name;
      const duration = (req.query.duration as string | undefined) ?? "1D";
      if (!exchangeName) {
        res.status(400).json({ error: "No exchanges configured" });
        return;
      }

      const cacheKey = `${exchangeName}|${String(duration).toUpperCase()}`;
      const cached = pnlCacheByKey[cacheKey];
      if (cached && Date.now() - cached.at < PNL_CACHE_MS) {
        res.json(cached.data);
        return;
      }

      const exchangeOptions = options.exchanges.find((e) => e.name === exchangeName);
      if (!exchangeOptions) {
        res.status(400).json({ error: `Exchange '${exchangeName}' not found in settings` });
        return;
      }

      let exchange: Exchange;
      if (exchangeOptions.socket) {
        exchange = exchangeOptions.socket;
      } else if (exchangeOptions.name === "binance") {
        exchange = await startBinance(exchangeOptions, { silent: true });
      } else if (exchangeOptions.name === "nonkyc") {
        exchange = await startNonKYC(exchangeOptions, { silent: true });
      } else if (exchangeOptions.name === "mexc") {
        exchange = await startMexc(exchangeOptions, { silent: true });
      } else if (exchangeOptions.name === "dextrade") {
        exchange = await startDexTrade(exchangeOptions, { silent: true });
      } else {
        res.status(400).json({ error: `Exchange '${exchangeOptions.name}' not supported for PNL dashboard` });
        return;
      }

      const symbols = exchangeOptions.symbols ?? [];
      const summary: Array<{ symbol: string; trades: number; pnlPercentage: number }> = [];
      const targetTimestamp = getTargetTimestamp(String(duration).toUpperCase());

      for (const symbolOptions of symbols) {
        try {
          const symbolKey = toSymbolKey(symbolOptions.name);
          const existing = exchangeOptions.tradeHistory?.[symbolKey];

          let tradesInDuration: Trade[] = [];

          if (Array.isArray(existing) && existing.length > 0) {
            const tradesAfter = existing.filter((t) => t.time / 1000 >= targetTimestamp);
            const tradesBefore = existing.filter((t) => t.time / 1000 < targetTimestamp);
            const prev = tradesBefore[tradesBefore.length - 1];
            tradesInDuration = prev ? [prev, ...tradesAfter] : tradesAfter;
          } else {
            // Fallback: only when tradeHistory isn't loaded yet for that symbol.
            const tradeHistory = await getTradeHistory(exchange, symbolOptions.name);
            const tradesAfter = tradeHistory.filter((t) => t.time / 1000 >= targetTimestamp);
            const tradesBefore = tradeHistory.filter((t) => t.time / 1000 < targetTimestamp);
            const prev = tradesBefore[tradesBefore.length - 1];
            tradesInDuration = prev ? [prev, ...tradesAfter] : tradesAfter;
          }

          if (tradesInDuration.length < 2) {
            summary.push({ symbol: symbolOptions.name, trades: tradesInDuration.length, pnlPercentage: 0 });
            continue;
          }

          let pnlPercentage = 0;
          for (let i = 1; i < tradesInDuration.length; i++) {
            const olderTrade = tradesInDuration[i - 1];
            const lastTrade = tradesInDuration[i];
            let lastPNL = 0;
            let commission = 0;
            if (olderTrade.isBuyer) {
              lastPNL = calculatePNLPercentageForLong(parseFloat(olderTrade.price), parseFloat(lastTrade.price));
            } else {
              lastPNL = calculatePNLPercentageForShort(parseFloat(olderTrade.price), parseFloat(lastTrade.price));
            }

            const olderCommission = parseFloat(String(olderTrade.commission ?? 0));
            const lastCommission = parseFloat(String(lastTrade.commission ?? 0));
            if (!Number.isNaN(olderCommission) && olderCommission > 0) {
              commission += olderTrade.commissionAsset === "BNB" ? 0.075 : 0.1;
            }
            if (!Number.isNaN(lastCommission) && lastCommission > 0) {
              commission += lastTrade.commissionAsset === "BNB" ? 0.075 : 0.1;
            }

            pnlPercentage += lastPNL - commission;
          }

          summary.push({
            symbol: symbolOptions.name,
            trades: tradesInDuration.length,
            pnlPercentage: Number(pnlPercentage.toFixed(2)),
          });
        } catch (e) {
          logger.error("Failed to calculate PNL for symbol", symbolOptions.name, e);
          summary.push({ symbol: symbolOptions.name, trades: 0, pnlPercentage: 0 });
        }
      }

      const out = {
        exchange: exchangeOptions.name,
        duration: String(duration).toUpperCase(),
        summary,
      };
      pnlCacheByKey[cacheKey] = { at: Date.now(), data: out };
      res.json(out);
    } catch (e) {
      logger.error("Error in /api/pnl", e);
      res.status(500).json({ error: "Failed to calculate PNL", details: e instanceof Error ? e.message : String(e) });
    }
  });

  // Start the server and return the Express app instance
  await new Promise<void>((resolve, reject) => {
    const server = app.listen(PORT, () => {
      logger.info(`Open Hoobot at http://localhost:${PORT}${isSimulateInstance ? " (simulaatio-istunto)" : ""}`);
      if (isSimulateInstance) {
        console.log(
          "[simulate] Palvelin odottaa. Käynnistä ajo UI:ssa (Simulaatio → Run Simulation) tai POST /simulate/start.",
        );
        console.log("[simulate] Eteneminen: SIM_PROGRESS_CONSOLE=false poistaa replay-rivit terminaalista.");
      }
      resolve();
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `[Hoobot] Portti ${PORT} on jo käytössä. Pysäytä vanha prosessi tai käytä PORT=5658 npm run simulate:start`,
        );
      }
      reject(err);
    });
  });

  return app;
};

const handleRejection = (reason: unknown) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  let extra: unknown = undefined;

  if (!(reason instanceof Error)) {
    extra = reason;
  }

  try {
    logToFile(
      "./logs/error.log",
      JSON.stringify(
        {
          message: err.message,
          stack: err.stack,
          reason: extra,
        },
        null,
        4,
      ),
    );
  } catch {
    // ignore
  }

  if (extra && typeof extra === "object") {
    console.error("Unhandled error object:", extra);
  } else {
    console.error("Unhandled error:", err);
  }
};

const handleUncaughtException = (reason: unknown) => {
  handleRejection(reason);
  process.exit(1);
};

process.on("unhandledRejection", handleRejection);
process.on("uncaughtException", handleUncaughtException);

if (process.env.NOWEBUI === "true") {
  hoobot().catch(handleRejection);
} else {
  // Älä autokäynnistä live-kauppaa simulaatio-istunnossa (SIMULATE=true, oma portti)
  if (options.running && process.env.SIMULATE !== "true") {
    hoobot().catch(handleRejection);
  }
  webServer().catch(handleRejection);
}
