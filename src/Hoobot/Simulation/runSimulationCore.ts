import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import type { TradeHistory } from "../Exchanges/Trades";
import {
  buildSimulationCheckpointFingerprint,
  defaultSimulationCheckpointPath,
  deleteSimulationCheckpointFile,
  readSimulationCheckpointFile,
  validateCheckpointForRun,
  writeSimulationCheckpointFile,
  SIM_CHECKPOINT_VERSION,
} from "./simulationCheckpoint";
import type { SimulationCheckpoint } from "./simulationCheckpoint";
import {
  type ConfigOptions,
  type ExchangeOptions,
  findProjectRoot,
  validateOptions,
  toSymbolKey,
  symbolsActiveForTrading,
} from "../Utilities/Args";
import {
  downloadHistoricalCandlesticks,
  filterCandlesticksBySimulationHistoryYears,
  formatSimulationCandleHistoryFi,
  simulateListenForCandlesticks,
  type SimulateListenCandleProgress,
  type Candlesticks,
  type Candlestick,
} from "../Exchanges/Candlesticks";
import {
  fetchBinanceExchangeInfoPublic,
  getFilterFromBinanceExchangeInfo,
  type BinanceExchangeInfoPayload,
} from "../Exchanges/Filters";
import { withRetry } from "../Utilities/Retry";
import { simulateAlgorithmic } from "../Modes/Algorithmic";
import { simulateHilow } from "../Modes/HiLow";
import { simulateExtreme } from "../Modes/Extreme";
import { simulatePeriodic } from "../Modes/Periodic";
import {
  computeSimulationStartingBalance,
  simulationModeErrorFi,
  simulationTimeframesForExchange,
  type SimulatableExchangeMode,
} from "./simModeHelpers";
import { consoleLogger } from "../Utilities/ConsoleLogger";
import { logToFile } from "../Utilities/LogToFile";
import { symbolFilters } from "../symbolFiltersStore";

export type SimulationApiResult =
  | {
      ok: true;
      startingBalance: number;
      finalPortfolio: number;
      roi: number;
      roiPercent: string;
      candleRows: number;
      /** Stop-loss / stopTrading katkaisi replayn vähintään yhdessä symbolierässä. */
      replayHaltedByStopLoss?: boolean;
      /** simulateAlgorithmic-heittymät joita nieltiin catchissä (replay jatkui). */
      algorithmicCallbackErrors?: number;
      symbols: Array<{
        name: string;
        trades: number;
        stopLosses: number;
        stopLossSells: number;
        stopLossBuys: number;
        takeProfits: number;
        holds: number;
        sells: number;
        buys: number;
        growingMax: { buy: number; sell: number };
        openBaseAmount?: number;
        markPrice?: number;
        openValueQuote?: number;
        lastBuyPrice?: number;
      }>;
      /** Grid-ajosta: parhaan variantin indeksi (0-pohjainen), koko ja parametrit (UI). */
      gridVariantIndex?: number;
      gridVariantCount?: number;
      gridVariant?: unknown;
      /** GET /simulate/last — tallennushetki ja lähde (ei kirjoiteta takaisin levylle). */
      persistedAt?: string;
      summarySource?: "simulate-last" | "grid-last" | "grid-dump";
    }
  | { ok: false; error: string; aborted?: boolean; checkpointSaved?: boolean };

export type SimulationPreload = {
  allCandlesticks: Candlestick[];
  exchangeInfo: BinanceExchangeInfoPayload;
};

/** Simulaation eteneminen (HTTP-status / UI): lataus tai kynttiläreplay. */
export type SimulationProgress =
  | { phase: "loading"; message: string }
  | {
      phase: "replay";
      passIndex: number;
      passTotal: number;
      focusSymbol: string;
      done: number;
      total: number;
      percent: number;
      /** Tähän mennessä syntyneet sim-kaupat (tradeHistory), ei Binance-toimeksiantoja. */
      simTrades?: number;
    };

let lastSimConsoleLogAt = 0;
let lastSimConsoleLogKey = "";

/** Tulosta eteneminen terminaaliin (PowerShell). Sim-istunnossa oletus päällä. */
export function shouldLogSimulationProgressToConsole(): boolean {
  if (process.env.SIM_PROGRESS_CONSOLE === "false") return false;
  if (process.env.SIM_PROGRESS_CONSOLE === "true") return true;
  if (process.env.SIMULATE === "true") return true;
  return process.stdout.isTTY === true;
}

export function logSimulationProgressToConsole(
  p: SimulationProgress,
  opts?: { prefix?: string }
): void {
  if (!shouldLogSimulationProgressToConsole()) return;
  const prefix = opts?.prefix?.trim();
  const pref = prefix ? `${prefix} ` : "";
  let key: string;
  let line: string;
  if (p.phase === "loading") {
    key = `loading|${p.message}`;
    line = `${pref}${p.message}`;
  } else {
    key = `replay|${p.passIndex}|${p.done}|${Math.floor(p.done / Math.max(p.total, 1) * 20)}`;
    const pct = Number.isFinite(p.percent) ? p.percent.toFixed(1) : "?";
    const tradesNote =
      typeof p.simTrades === "number" ? ` | sim-kauppoja ${p.simTrades}` : "";
    line = `${pref}Replay ${p.done}/${p.total} (${pct}%) — ${p.focusSymbol}${tradesNote} [pass ${p.passIndex}/${p.passTotal}]`;
  }
  const now = Date.now();
  const minMs = p.phase === "replay" ? 2500 : 800;
  if (key === lastSimConsoleLogKey && now - lastSimConsoleLogAt < minMs) return;
  lastSimConsoleLogAt = now;
  lastSimConsoleLogKey = key;
  console.log(line);
}

/** Yksittäisen simulaation checkpoint- ja jatkovaihtoehdot (ei grid). */
export type RunSimulationOptions = {
  /** Lue checkpoint levyltä ja jatka (fingerprint tarkistetaan kynttilöiden latauksen jälkeen). */
  resumeFromFile?: boolean;
  checkpointPath?: string;
  /** Oletus: true ilman preloadia; grid (preload) ei tallenna. */
  saveCheckpoints?: boolean;
};

/** Lataa kynttilät ja exchangeInfo kerran grid-ajoa varten (symbolit/timeframet configista). */
export const loadSimulationPreload = async (
  simulateOptions: ConfigOptions,
  onProgress?: (p: SimulationProgress) => void
): Promise<SimulationPreload | { error: string }> => {
  const reportProgress = (p: SimulationProgress): void => {
    logSimulationProgressToConsole(p, { prefix: "[sim-grid preload]" });
    onProgress?.(p);
  };
  const opts = validateOptions(JSON.parse(JSON.stringify(simulateOptions)) as ConfigOptions);
  const exchangeOptions = opts.exchanges?.find((e) => e.name === "binance");
  if (!exchangeOptions) {
    return {
      error:
        "Simulaatio vaatii Binance-vaihdon (name === 'binance'). Tarkista asetukset.",
    };
  }
  const modeErr = simulationModeErrorFi(exchangeOptions.mode);
  if (modeErr) {
    return { error: modeErr };
  }
  const symbolPassesPreload = symbolsActiveForTrading(exchangeOptions.symbols);
  if (symbolPassesPreload.length === 0) {
    return {
      error:
        "Ei yhtään treidatavaksi merkittyä symbolia (enabled !== false). Merkitse vähintään yksi pari käyttöön.",
    };
  }
  const symbols = symbolPassesPreload.map((s) => s.name);
  const timeframes = simulationTimeframesForExchange(exchangeOptions);
  const allCandlesticks = await downloadHistoricalCandlesticks(symbols, timeframes, (info) => {
    reportProgress({
      phase: "loading",
      message:
        `Ladataan kynttilöitä: symboli ${info.symbolIndex}/${info.symbolTotal} (${info.symbol}), ` +
        `tf ${info.intervalIndex}/${info.intervalTotal} (${info.interval}), ` +
        `kk ${info.monthIndex}/${info.monthTotal} (${info.year}-${String(info.month).padStart(2, "0")})`,
    });
  });
  const exchangeInfo = await withRetry(() => fetchBinanceExchangeInfoPublic(120000), {
    maxRetries: 3,
    delayMs: 2000,
  });
  return { allCandlesticks, exchangeInfo };
};

const clearSymbolFiltersForSimulation = (exchangeOptions: ExchangeOptions): void => {
  for (const s of exchangeOptions.symbols) {
    const k = toSymbolKey(s.name);
    if (k in symbolFilters) delete symbolFilters[k];
  }
};

/**
 * Simulaation loppusaldo **mark-to-market**: quote-käteinen + base × viimeisin kynttilän close.
 */
const calculateSimulationPortfolioMtm = (options: ExchangeOptions, candleStore: Candlesticks): number => {
  let balance = 0;
  try {
    const quoteSet = new Set<string>();
    for (const symbolOptions of options.symbols) {
      const parts = symbolOptions.name.split("/");
      if (parts.length >= 2 && parts[1]) {
        quoteSet.add(parts[1]);
      }
    }
    for (const q of quoteSet) {
      balance += options.balances?.[q]?.crypto ?? 0;
    }
    for (const symbolOptions of options.symbols) {
      const [base] = symbolOptions.name.split("/");
      const baseAmt = options.balances?.[base]?.crypto ?? 0;
      if (baseAmt <= 0) continue;
      const sk = toSymbolKey(symbolOptions.name);
      const store = candleStore[sk];
      const tf0 = symbolOptions.timeframes?.[0];
      const primaryTf = tf0 != null && store?.[tf0] != null ? tf0 : store != null ? Object.keys(store)[0] : undefined;
      const series = primaryTf != null ? store?.[primaryTf] : undefined;
      let markPrice = 0;
      if (series != null && series.length > 0) {
        markPrice = Number(series[series.length - 1].close) || 0;
      }
      // Fallback: etsi uusin close kaikista timeframeista (jos primary-sarja on tyhjä/puuttuu).
      if (markPrice <= 0 && store != null) {
        let bestTime = -1;
        let bestClose = 0;
        for (const tf of Object.keys(store)) {
          const arr = store[tf];
          if (!arr || arr.length === 0) continue;
          const last = arr[arr.length - 1];
          const t = Number(last?.closeTime ?? 0);
          const c = Number(last?.close ?? 0);
          if (t >= bestTime && c > 0) {
            bestTime = t;
            bestClose = c;
          }
        }
        if (bestClose > 0) markPrice = bestClose;
      }
      // Fallback: viimeisimmän kaupan hinta (auttaa kun replay loppuu BUY:hin eikä closea ole muistissa).
      if (markPrice <= 0 && Array.isArray(options.tradeHistory?.[sk]) && options.tradeHistory[sk]!.length > 0) {
        const lastTrade = options.tradeHistory[sk]![options.tradeHistory[sk]!.length - 1];
        const p = Number(lastTrade.price);
        if (Number.isFinite(p) && p > 0) markPrice = p;
      }
      balance += baseAmt * markPrice;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logToFile("./logs/error.log", errorMessage);
    console.error(errorMessage);
  }
  return balance;
};

/**
 * @param config Simulaatioasetukset (kloonataan sisällä — älä luota viitteeseen).
 * @param preload Jos annettu, ohita kynttilä- ja exchangeInfo-lataus (grid-sarja).
 * @param onProgress Valinnainen: latausviestit ja kynttiläreplayn eteneminen (UI / /simulate/status).
 * @param runOptions Checkpoint-tallennus ja jatko (ei käytössä gridissä preloadin kanssa).
 */
export const runSimulationWithConfig = async (
  config: ConfigOptions,
  preload?: SimulationPreload,
  shouldAbort?: () => boolean,
  onProgress?: (p: SimulationProgress) => void,
  runOptions?: RunSimulationOptions
): Promise<SimulationApiResult> => {
  const reportProgress = (p: SimulationProgress): void => {
    logSimulationProgressToConsole(p);
    onProgress?.(p);
  };
  const checkpointPath = runOptions?.checkpointPath ?? defaultSimulationCheckpointPath();
  const saveCheckpoints =
    runOptions?.saveCheckpoints !== undefined ? runOptions.saveCheckpoints : !preload;

  const simulateOptions = validateOptions(JSON.parse(JSON.stringify(config)) as ConfigOptions);
  simulateOptions.startTime = new Date().toISOString();
  simulateOptions.simulate = true;

  const exchangeOptions = simulateOptions.exchanges?.find((e) => e.name === "binance");
  if (!exchangeOptions) {
    const msg =
        "Simulaatio vaatii Binance-vaihdon asetuksista (exchanges[].name === 'binance'). Tarkista settings/hoobot-options.json.";
    console.error(msg);
    return { ok: false, error: msg };
  }
  const modeErr = simulationModeErrorFi(exchangeOptions.mode);
  if (modeErr) {
    return { ok: false, error: modeErr };
  }

  const simMode = exchangeOptions.mode as SimulatableExchangeMode;

  const symbolPasses = symbolsActiveForTrading(exchangeOptions.symbols);
  if (symbolPasses.length === 0) {
    return {
      ok: false,
      error:
        "Ei yhtään treidatavaksi merkittyä symbolia (enabled !== false). Merkitse vähintään yksi pari käyttöön.",
    };
  }

  clearSymbolFiltersForSimulation(exchangeOptions);

  const resumeFromDisk: SimulationCheckpoint | null =
    !preload && saveCheckpoints && runOptions?.resumeFromFile === true
      ? readSimulationCheckpointFile(checkpointPath)
      : null;

  if (resumeFromDisk && runOptions?.resumeFromFile) {
    console.log(
      `Simulaatio: jatketaan checkpointista (${resumeFromDisk.savedAt}, erä ${resumeFromDisk.symIdx + 1}/${symbolPasses.length}, kynttiläindeksi ${resumeFromDisk.candleIndex}).`
    );
  }

  const Logger = consoleLogger();
  let startingBalance = 0;
  let candleStore: Candlesticks = {};
  let candleRowsForResult = 0;

  if (!resumeFromDisk) {
    exchangeOptions.tradeHistory = {} as TradeHistory;
    exchangeOptions.balances = {};
    startingBalance = computeSimulationStartingBalance(symbolPasses);
  } else {
    exchangeOptions.tradeHistory = JSON.parse(JSON.stringify(resumeFromDisk.tradeHistory)) as TradeHistory;
    exchangeOptions.balances = JSON.parse(JSON.stringify(resumeFromDisk.balances));
    startingBalance = resumeFromDisk.startingBalance;
    candleStore = JSON.parse(JSON.stringify(resumeFromDisk.candleStore)) as Candlesticks;
  }

  Logger.push("simulation-symbols", symbolPasses);
  Logger.print();
  Logger.flush();
  const symbols = symbolPasses.map((symbol) => symbol.name);
  const timeframes = simulationTimeframesForExchange(exchangeOptions);

  let allCandlesticks: Candlestick[];
  let exchangeInfoSim: BinanceExchangeInfoPayload;

  if (preload) {
    allCandlesticks = preload.allCandlesticks;
    exchangeInfoSim = preload.exchangeInfo;
  } else {
    reportProgress({ phase: "loading", message: "Ladataan kynttilöitä (Binance Vision)…" });
    allCandlesticks = await downloadHistoricalCandlesticks(symbols, timeframes, (info) => {
      reportProgress({
        phase: "loading",
        message:
          `Ladataan kynttilöitä: symboli ${info.symbolIndex}/${info.symbolTotal} (${info.symbol}), ` +
          `tf ${info.intervalIndex}/${info.intervalTotal} (${info.interval}), ` +
          `kk ${info.monthIndex}/${info.monthTotal} (${info.year}-${String(info.month).padStart(2, "0")})`,
      });
    });
    reportProgress({ phase: "loading", message: "Haetaan exchangeInfo (julkinen API)…" });
    console.log("Simulaatio: haetaan exchangeInfo (julkinen /api/v3/exchangeInfo, timeout 120 s)…");
    exchangeInfoSim = await withRetry(() => fetchBinanceExchangeInfoPublic(120000), {
      maxRetries: 3,
      delayMs: 2000,
    });
  }

  const historyYears = simulateOptions.simulationHistoryYears;
  const candlesticksForSim = filterCandlesticksBySimulationHistoryYears(allCandlesticks, historyYears);
  candleRowsForResult = candlesticksForSim.length;

  if (resumeFromDisk) {
    const err = validateCheckpointForRun(simulateOptions, candleRowsForResult, resumeFromDisk);
    if (err) {
      return { ok: false, error: err };
    }
  }

  if (
    typeof historyYears === "number" &&
    Number.isFinite(historyYears) &&
    historyYears > 0 &&
    candlesticksForSim.length < allCandlesticks.length
  ) {
    console.log(
      `Simulaatio: ladattuja kynttilärivejä ${allCandlesticks.length}, rajauksen jälkeen ${candlesticksForSim.length} (simulationHistoryYears=${historyYears}).`
    );
  }
  console.log(formatSimulationCandleHistoryFi(candlesticksForSim, historyYears));
  console.log(
    `Starting simulation with downloaded candlesticks (${candlesticksForSim.length} candle rows, ${symbolPasses.length} symbol pass(es)).`
  );
  reportProgress({
    phase: "loading",
    message: `Replay: ${candlesticksForSim.length} kynttiläriviä, ${symbolPasses.length} symbolierää.`,
  });

  const startSymIdx = resumeFromDisk?.symIdx ?? 0;
  const resumeCandleForFirstPass = resumeFromDisk?.candleIndex ?? 0;
  /**
   * Älä nollaa saldoja / älä lisää startingBalance uudelleen jatkoerän alussa.
   * Erityistapaus (0,0): throttled checkpoint voi tallentua heti ensimmäisen symbolin initin jälkeen
   * (candleIndex=0); startingBalance on jo checkpointissa → ilman tätä tulee tuplalaskenta.
   */
  let skipBalanceInit = !!(
    resumeFromDisk != null &&
    (resumeFromDisk.candleIndex > 0 ||
      (resumeFromDisk.symIdx === 0 &&
        resumeFromDisk.candleIndex === 0 &&
        resumeFromDisk.startingBalance > 0))
  );

  let lastCheckpointSaveAt = 0;
  let algorithmicCallbackErrors = 0;
  let replayHaltedByStopLoss = false;

  const writeCheckpoint = (symIdx: number, nextCandleIndex: number): void => {
    if (!saveCheckpoints || preload) return;
    const cp: SimulationCheckpoint = {
      version: SIM_CHECKPOINT_VERSION,
      savedAt: new Date().toISOString(),
      fingerprint: buildSimulationCheckpointFingerprint(simulateOptions, candleRowsForResult),
      symIdx,
      candleIndex: nextCandleIndex,
      candleRows: candleRowsForResult,
      simulationHistoryYears:
        typeof historyYears === "number" && Number.isFinite(historyYears) ? historyYears : undefined,
      symbolsOrder: symbolPasses.map((s) => s.name),
      candleStore: JSON.parse(JSON.stringify(candleStore)) as Candlesticks,
      balances: JSON.parse(JSON.stringify(exchangeOptions.balances)),
      tradeHistory: JSON.parse(JSON.stringify(exchangeOptions.tradeHistory ?? {})) as TradeHistory,
      startingBalance,
    };
    writeSimulationCheckpointFile(checkpointPath, cp);
  };

  const mapCandleProgress = (info: SimulateListenCandleProgress): SimulationProgress => {
    const total = info.total;
    const done = info.done;
    const percent = total > 0 ? (done / total) * 100 : 0;
    const symbolKey = toSymbolKey(info.focusSymbol);
    const simTrades = exchangeOptions.tradeHistory?.[symbolKey]?.length ?? 0;
    return {
      phase: "replay",
      passIndex: info.passIndex,
      passTotal: info.passTotal,
      focusSymbol: info.focusSymbol,
      done,
      total,
      percent,
      simTrades,
    };
  };

  // Kirjoita simulaation konfiguraatio vain kerran per ajo (ei joka symbolipassilla).
  const sanitizedStartTime = simulateOptions.startTime.replace(/:/g, "-");
  const simRoot = path.join(findProjectRoot(), "simulation");
  const filePath = path.join(simRoot, sanitizedStartTime, "configuration.json");
  if (!existsSync(simRoot)) {
    mkdirSync(simRoot, { recursive: true });
  }
  const directory = path.dirname(filePath);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(simulateOptions, null, 2));

  for (let symIdx = startSymIdx; symIdx < symbolPasses.length; symIdx++) {
    const symbolOptions = symbolPasses[symIdx];
    if (!skipBalanceInit) {
      const symbolParts = symbolOptions.name?.split("/") || [];
      if (symbolParts.length === 2 && symbolParts[0] && symbolParts[1]) {
        exchangeOptions.balances = exchangeOptions.balances ?? {};
        exchangeOptions.balances[symbolParts[0]] = {
          crypto: 0,
          usdt: 0,
        };
        exchangeOptions.balances[symbolParts[1]] = {
          crypto: symbolOptions.growingMax?.buy ?? 0,
          usdt: 0,
        };
      }
    } else {
      skipBalanceInit = false;
    }
    const filter = getFilterFromBinanceExchangeInfo(exchangeInfoSim, symbolOptions.name);
    symbolFilters[toSymbolKey(symbolOptions.name)] = filter;

    const startCandle = symIdx === startSymIdx ? resumeCandleForFirstPass : 0;

    const throttledProgress = (info: SimulateListenCandleProgress): void => {
      reportProgress(mapCandleProgress(info));
      if (!saveCheckpoints || preload) return;
      const now = Date.now();
      if (now - lastCheckpointSaveAt >= 90_000) {
        lastCheckpointSaveAt = now;
        writeCheckpoint(symIdx, info.done);
      }
    };

    const outcome = await simulateListenForCandlesticks(
      symbols,
      candlesticksForSim,
      candleStore,
      simulateOptions,
      async (symbol: string, interval: string, candlesticks: Candlesticks) => {
        try {
          if (
            candlesticks[toSymbolKey(symbol)][interval] == undefined ||
            candlesticks[toSymbolKey(symbol)][interval].length === 0
          ) {
            return;
          }
          const runSim =
            simMode === "hilow"
              ? simulateHilow
              : simMode === "extreme"
                ? simulateExtreme
                : simMode === "periodic"
                  ? simulatePeriodic
                  : simulateAlgorithmic;
          await runSim(
            symbolOptions.name,
            candlesticks,
            simulateOptions,
            exchangeOptions,
            symbolOptions,
            exchangeOptions.balances ?? {},
            symbolFilters[toSymbolKey(symbol)]
          );
        } catch (error) {
          algorithmicCallbackErrors += 1;
          const modeLabel = simMode;
          const head = `[sim] ${modeLabel} callback error #${algorithmicCallbackErrors} symbol=${symbolOptions.name} pass=${symIdx + 1}/${symbolPasses.length}`;
          console.error(head, error);
          let body: string;
          if (error instanceof Error) {
            body = error.stack || error.message;
          } else if (error !== null && typeof error === "object") {
            try {
              body = JSON.stringify(error, null, 2);
            } catch {
              body = String(error);
            }
          } else {
            body = String(error);
          }
          logToFile("./logs/error.log", `${head}\n${body}\n`);
        }
      },
      {
        passIndex: symIdx + 1,
        passTotal: symbolPasses.length,
        focusSymbol: symbolOptions.name,
      },
      shouldAbort,
      onProgress != null || shouldLogSimulationProgressToConsole() || (saveCheckpoints && !preload)
        ? throttledProgress
        : undefined,
      startCandle,
      () => symbolOptions.stopLoss?.hit === true && symbolOptions.stopLoss?.stopTrading === true
    );

    if (outcome.userAborted) {
      const nextIdx = outcome.abortedAtCandleIndex ?? 0;
      writeCheckpoint(symIdx, nextIdx);
      console.log("Simulaatio: checkpoint tallennettu — voit jatkaa myöhemmin (resume).");
      return {
        ok: false,
        error: "Simulaatio keskeytettiin. Tila tallennettu — voit jatkaa \"Jatka simulaatiota\" -painikkeella.",
        aborted: true,
        checkpointSaved: true,
      };
    }

    if (outcome.stopTradingHalted) {
      replayHaltedByStopLoss = true;
      if (saveCheckpoints && !preload) {
        deleteSimulationCheckpointFile(checkpointPath);
      }
      console.log(
        "Simulaatio: stop-loss / stopTrading — ei jatketa seuraaviin symboleihin, checkpoint poistettu."
      );
      break;
    }

    if (saveCheckpoints && !preload) {
      if (symIdx + 1 < symbolPasses.length) {
        writeCheckpoint(symIdx + 1, 0);
      } else {
        deleteSimulationCheckpointFile(checkpointPath);
      }
    }
  }

  const finalPortfolio = calculateSimulationPortfolioMtm(exchangeOptions, candleStore);
  if (algorithmicCallbackErrors > 0) {
    console.warn(
      `Simulaatio: ${algorithmicCallbackErrors} algorithmic-callback -poikkeusta (katso ./logs/error.log). Tulos voi olla puutteellinen.`
    );
    Logger.push("Algorithmic callback errors (silent)", algorithmicCallbackErrors);
  }
  Logger.push("Starting balance", startingBalance.toFixed(2));
  Logger.push("Final Balance (MTM: quote + base×viimeinen close)", finalPortfolio.toFixed(2));
  Logger.push("ROI", startingBalance > 0 ? ((finalPortfolio - startingBalance) / startingBalance).toFixed(4) : "0");
  const symbolStats: Array<{
    name: string;
    trades: number;
    stopLosses: number;
    stopLossSells: number;
    stopLossBuys: number;
    takeProfits: number;
    forcedIdle: number;
    holds: number;
    sells: number;
    buys: number;
    growingMax: { buy: number; sell: number };
    openBaseAmount?: number;
    markPrice?: number;
    openValueQuote?: number;
    lastBuyPrice?: number;
  }> = [];
  for (const symbol of symbolPasses) {
    const sk = toSymbolKey(symbol.name);
    const th = exchangeOptions.tradeHistory?.[sk] ?? [];
    const stopLosses = th.filter((trade) => trade.profit === "STOP_LOSS");
    const stopLossSells = stopLosses.filter((trade) => !trade.isBuyer).length;
    const stopLossBuys = stopLosses.filter((trade) => trade.isBuyer).length;
    const takeProfits = th.filter(
      (trade) => trade.profit === "TAKE_PROFIT" || trade.profit === "TAKE_PROFIT_FORCE"
    ).length;
    const forcedIdle = th.filter((trade) => trade.profit === "FORCE_IDLE").length;
    const holds = th.filter((trade) => trade.profit === "HOLD").length;
    const sells = th.filter((trade) => trade.profit === "SELL").length;
    const buys = th.filter((trade) => trade.profit === "BUY").length;
    const [base] = symbol.name.split("/");
    const openBaseAmount = Number(exchangeOptions.balances?.[base]?.crypto ?? 0);
    let markPrice = 0;
    const store = candleStore[sk];
    const tf0 = symbol.timeframes?.[0];
    const primaryTf = tf0 != null && store?.[tf0] != null ? tf0 : store != null ? Object.keys(store)[0] : undefined;
    const series = primaryTf != null ? store?.[primaryTf] : undefined;
    if (series != null && series.length > 0) {
      markPrice = Number(series[series.length - 1].close) || 0;
    }
    if (markPrice <= 0 && store != null) {
      let bestTime = -1;
      let bestClose = 0;
      for (const tf of Object.keys(store)) {
        const arr = store[tf];
        if (!arr || arr.length === 0) continue;
        const last = arr[arr.length - 1];
        const t = Number(last?.closeTime ?? 0);
        const c = Number(last?.close ?? 0);
        if (t >= bestTime && c > 0) {
          bestTime = t;
          bestClose = c;
        }
      }
      if (bestClose > 0) markPrice = bestClose;
    }
    if (markPrice <= 0 && th.length > 0) {
      const p = Number(th[th.length - 1]?.price);
      if (Number.isFinite(p) && p > 0) markPrice = p;
    }
    const openValueQuote = openBaseAmount > 0 && markPrice > 0 ? openBaseAmount * markPrice : 0;
    let lastBuyPrice: number | undefined;
    for (let i = th.length - 1; i >= 0; i--) {
      if (th[i].isBuyer) {
        const p = Number(th[i].price);
        if (Number.isFinite(p) && p > 0) lastBuyPrice = p;
        break;
      }
    }
    Logger.push(`${symbol.name} max trade`, symbol.growingMax);
    Logger.push(`${symbol.name} trades`, th.length);
    Logger.push(`${symbol.name} stop losses`, stopLosses.length);
    Logger.push(`${symbol.name} stop loss sells`, stopLossSells);
    Logger.push(`${symbol.name} stop loss buys`, stopLossBuys);
    Logger.push(`${symbol.name} take profits`, takeProfits);
    Logger.push(`${symbol.name} forced idle`, forcedIdle);
    Logger.push(`${symbol.name} holds (legacy)`, holds);
    Logger.push(`${symbol.name} sells`, sells);
    Logger.push(`${symbol.name} buys`, buys);
    symbolStats.push({
      name: symbol.name,
      trades: th.length,
      stopLosses: stopLosses.length,
      stopLossSells,
      stopLossBuys,
      takeProfits,
      forcedIdle,
      holds,
      sells,
      buys,
      growingMax: { buy: symbol.growingMax?.buy ?? 0, sell: symbol.growingMax?.sell ?? 0 },
      ...(openBaseAmount > 0 ? { openBaseAmount } : {}),
      ...(markPrice > 0 ? { markPrice } : {}),
      ...(openValueQuote > 0 ? { openValueQuote } : {}),
      ...(lastBuyPrice != null ? { lastBuyPrice } : {}),
    });
  }
  Logger.print();
  Logger.flush();
  const roiNum = startingBalance > 0 ? (finalPortfolio - startingBalance) / startingBalance : 0;
  const roiPct = startingBalance > 0 ? ((finalPortfolio - startingBalance) / startingBalance * 100).toFixed(2) : "0";
  return {
    ok: true,
    startingBalance,
    finalPortfolio,
    roi: roiNum,
    roiPercent: roiPct,
    candleRows: candleRowsForResult,
    ...(replayHaltedByStopLoss ? { replayHaltedByStopLoss: true } : {}),
    ...(algorithmicCallbackErrors > 0 ? { algorithmicCallbackErrors } : {}),
    symbols: symbolStats,
  };
};

export type { SimulationCheckpoint } from "./simulationCheckpoint";
