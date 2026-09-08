import {
  CandlestickInterval,
  ConfigOptions,
  SymbolOptions,
  getMinutesFromInterval,
  toSymbolKey,
} from "../Utilities/Args";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import AdmZip from "adm-zip";
import path from "path";
import { Exchange, isBinance, isNonKYC, isDexTrade } from "./Exchange";
import { NonKYCCandles, NonKYCResponse } from "./NonKYC/NonKYC";
import { DexTradeSocketGraphEvent } from "./DexTrade/DexTrade";
import { logToFile } from "../Utilities/LogToFile";
import { withRetry } from "../Utilities/Retry";

export interface Candlesticks {
  [symbol: string]: {
    [time: string]: Candlestick[];
  };
}

export interface Candlestick {
  symbol: string;
  interval: string;
  type: string;
  time: number;
  /** Candle period start time (ms). Used to detect new candle vs update. */
  startTime?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  trades: number;
  volume: number;
  quoteVolume: number;
  buyVolume: number;
  quoteBuyVolume: number;
  isFinal: boolean;
  [key: string]: string | number | boolean | undefined;
}

export async function getLastCandlesticks(
  exchange: Exchange,
  symbol: string,
  interval: CandlestickInterval,
  limit: number = 500,
): Promise<Candlestick[]> {
  return new Promise<Candlestick[]>(async (resolve, _reject) => {
    if (isBinance(exchange)) {
      exchange.candlesticks(
        toSymbolKey(symbol),
        interval,
        (_error: any, ticks: any, symbol: string, interval: string) => {
          if (ticks === undefined || !Array.isArray(ticks)) {
            return resolve([]);
          }
          const parsedData: Candlestick[] = ticks.map((candle: string[]) => {
            const openTime = Number.isFinite(parseFloat(candle[0])) ? parseFloat(candle[0]) : 0;
            return {
              symbol: symbol,
              interval: interval,
              type: candle[8] || "",
              time: openTime,
              startTime: openTime,
              open: Number.isFinite(parseFloat(candle[1])) ? parseFloat(candle[1]) : 0,
              high: Number.isFinite(parseFloat(candle[2])) ? parseFloat(candle[2]) : 0,
              low: Number.isFinite(parseFloat(candle[3])) ? parseFloat(candle[3]) : 0,
              close: Number.isFinite(parseFloat(candle[4])) ? parseFloat(candle[4]) : 0,
              trades: Number.isFinite(parseFloat(candle[9])) ? parseFloat(candle[9]) : 0,
              volume: Number.isFinite(parseFloat(candle[5])) ? parseFloat(candle[5]) : 0,
              quoteVolume: Number.isFinite(parseFloat(candle[7])) ? parseFloat(candle[7]) : 0,
              buyVolume: Number.isFinite(parseFloat(candle[10])) ? parseFloat(candle[10]) : 0,
              quoteBuyVolume: Number.isFinite(parseFloat(candle[11])) ? parseFloat(candle[11]) : 0,
              isFinal: Boolean(candle[12]) && candle[12] !== "false" && candle[12] !== "0",
            };
          }).filter(candle => candle.open > 0 || candle.close > 0 || candle.high > 0 || candle.low > 0);
          resolve(parsedData);
        },
        { limit: limit },
      );
    } else if (isNonKYC(exchange)) {
      const candlesticks = await exchange.getCandles(symbol, null, null, getMinutesFromInterval(interval), limit, 1);
      const parsedData: Candlestick[] = (candlesticks.bars || []).map(
        (candle: { time: number; close: number; open: number; high: number; low: number; volume: number }) => {
          const time = Number.isFinite(candle?.time) ? candle.time : 0;
          const open = Number.isFinite(candle?.open) ? candle.open : 0;
          const high = Number.isFinite(candle?.high) ? candle.high : 0;
          const low = Number.isFinite(candle?.low) ? candle.low : 0;
          const close = Number.isFinite(candle?.close) ? candle.close : 0;
          const volume = Number.isFinite(candle?.volume) ? candle.volume : 0;
          
          // Only include valid candles with at least some price data
          if (open === 0 && high === 0 && low === 0 && close === 0) return null;
          
          return {
            symbol: symbol,
            interval: interval,
            type: "kline",
            time: time,
            open: open,
            high: high,
            low: low,
            close: close,
            trades: 0,
            volume: volume,
            quoteVolume: 0,
            buyVolume: 0,
            quoteBuyVolume: 0,
            isFinal: true,
          };
        }
      ).filter(Boolean) as Candlestick[];
      resolve(parsedData);
    } else if (isDexTrade(exchange)) {
      const candlesticks = await exchange.getCandles(
        toSymbolKey(symbol),
        null,
        null,
        getMinutesFromInterval(interval),
        limit,
        1,
      );
      const parsedData: Candlestick[] = (candlesticks.bars || []).map((candle) => {
        const time = Number.isFinite(candle?.time) ? candle.time : 0;
        const open = Number.isFinite(candle?.open) ? candle.open : 0;
        const high = Number.isFinite(candle?.high) ? candle.high : 0;
        const low = Number.isFinite(candle?.low) ? candle.low : 0;
        const close = Number.isFinite(candle?.close) ? candle.close : 0;
        const volume = Number.isFinite(candle?.volume) ? candle.volume : 0;
        
        // Only include valid candles with at least some price data
        if (open === 0 && high === 0 && low === 0 && close === 0) return null;
        
        return {
          symbol: symbol,
          interval: interval,
          type: "kline",
          time: time,
          startTime: time,
          open: open,
          high: high,
          low: low,
          close: close,
          trades: 0,
          volume: volume,
          quoteVolume: 0,
          buyVolume: 0,
          quoteBuyVolume: 0,
          isFinal: true,
        };
      }).filter(Boolean) as Candlestick[];
      resolve(parsedData);
    }
  });
}

export const listenForCandlesticks = async (
  exchange: Exchange,
  symbol: string,
  intervals: CandlestickInterval[],
  candleStore: Candlesticks,
  historyLength: number,
  symbolOptions: SymbolOptions,
  callback: (candlesticks: Candlesticks) => Promise<void>,
): Promise<void> => {
  console.log("Start listening for Candlesticks");
  if (!Array.isArray(intervals) || intervals.length === 0) {
    throw new Error(
      `listenForCandlesticks: symbol="${symbol}" puuttuva tai virheellinen timeframes (${String(
        intervals,
      )}). Tarkista symbolin konfigissa taulukko \`timeframes\` — grid/sim-siirto ei säilyttänyt aiempia timeframeja.`,
    );
  }
  const maxCandlesticks = 10000;
  let timeframes = [...intervals];
  if (isBinance(exchange) && symbolOptions.trend?.enabled && symbolOptions.trend?.timeframe) {
    if (!intervals.includes(symbolOptions.trend.timeframe)) {
      timeframes.push(symbolOptions.trend.timeframe);
    }
  }
  for (let i = 0; i < timeframes.length; i++) {
    if (isBinance(exchange)) {
      const websocket = exchange.websockets;
      symbol = toSymbolKey(symbol);
      websocket.candlesticks(symbol, timeframes[i], async (candlestick: { e: any; E: any; s: any; k: any }) => {
        let { e: eventType, E: eventTime, s: symbol, k: ticks } = candlestick;
        let {
          t: startTimeMs,
          o: open,
          h: high,
          l: low,
          c: close,
          v: volume,
          n: trades,
          i: interval,
          x: isFinal,
          q: quoteVolume,
          V: buyVolume,
          Q: quoteBuyVolume,
        } = ticks;
        const startTime = typeof startTimeMs === "number" ? startTimeMs : parseFloat(String(startTimeMs));
        const newCandlestick: Candlestick = {
          symbol: symbol,
          interval: interval,
          type: eventType,
          time: parseFloat(eventTime),
          startTime,
          open: parseFloat(open),
          high: parseFloat(high),
          low: parseFloat(low),
          close: parseFloat(close),
          trades: parseFloat(trades),
          volume: parseFloat(volume),
          quoteVolume: parseFloat(quoteVolume),
          buyVolume: parseFloat(buyVolume),
          quoteBuyVolume: parseFloat(quoteBuyVolume),
          isFinal: Boolean(isFinal === true || isFinal === "true" || isFinal === 1),
        };
        if (candleStore[symbol] === undefined) {
          const oldCandlesticks = await withRetry(() =>
            getLastCandlesticks(exchange, symbol, timeframes[i], historyLength),
          );
          candleStore[symbol] = {
            [timeframes[i]]: [...oldCandlesticks, newCandlestick],
          };
        } else if (candleStore[symbol][timeframes[i]] === undefined) {
          candleStore[symbol][timeframes[i]] = [
            ...(await withRetry(() => getLastCandlesticks(exchange, symbol, timeframes[i], historyLength))),
            newCandlestick,
          ];
        } else if (newCandlestick.isFinal === true) {
          candleStore[symbol][timeframes[i]].push(newCandlestick);
        } else {
          const arr = candleStore[symbol][timeframes[i]];
          const lastCandle = arr[arr.length - 1];
          const lastStart = lastCandle?.startTime ?? lastCandle?.time;
          const isNewPeriod =
            lastStart !== undefined && newCandlestick.startTime !== undefined && lastStart !== newCandlestick.startTime;
          if (isNewPeriod) {
            arr.push(newCandlestick);
          } else {
            arr[arr.length - 1] = newCandlestick;
          }
        }
        const arrForSlice = candleStore[symbol]?.[timeframes[i]];
        if (arrForSlice?.length > maxCandlesticks) {
          candleStore[symbol][timeframes[i]] = arrForSlice.slice(-maxCandlesticks);
        }
        if (!(symbolOptions.stopLoss?.hit === true && symbolOptions.stopLoss?.stopTrading === true)) {
          await callback(candleStore);
        } else {
          websocket.terminate();
        }
      });
    } else if (isNonKYC(exchange)) {
      console.log("Subscribe to candles");
      exchange.subscribeCandles(
        symbol,
        getMinutesFromInterval(timeframes[i]),
        async (response: NonKYCResponse) => {
          console.log("Subscribe Candles callback called!");
          if (response.method === "updateCandles") {
            const candles = (response.params as NonKYCCandles).data;
            if (candles.length < 1) {
              return;
            }
            const candle = candles[0];
            const timeOfCandle = new Date(candle.timestamp).getTime();
            // const currentTime = new Date().getTime() - (30 * 1000);
            let isFinal = false;
            if (
              candleStore[toSymbolKey(symbol)] !== undefined &&
              candleStore[toSymbolKey(symbol)][timeframes[i]] !== undefined &&
              candleStore[toSymbolKey(symbol)][timeframes[i]].length > 0
            ) {
              const previousCandle =
                candleStore[toSymbolKey(symbol)][timeframes[i]][
                  candleStore[toSymbolKey(symbol)][timeframes[i]].length - 1
                ];
              if (previousCandle.time !== timeOfCandle) {
                isFinal = true;
              }
            } else if (candleStore[toSymbolKey(symbol)] === undefined) {
              isFinal = true;
            }
            const newCandlestick: Candlestick = {
              symbol: symbol,
              interval: timeframes[i],
              type: "",
              time: timeOfCandle,
              startTime: timeOfCandle,
              open: parseFloat(candle.open),
              high: parseFloat(candle.max),
              low: parseFloat(candle.min),
              close: parseFloat(candle.close),
              trades: 0,
              volume: parseFloat(candle.volume),
              quoteVolume: 0,
              buyVolume: 0,
              quoteBuyVolume: 0,
              isFinal: isFinal,
            };
            if (candleStore[toSymbolKey(symbol)] === undefined) {
              candleStore[toSymbolKey(symbol)] = {
                [timeframes[i]]: [
                  ...(await withRetry(() => getLastCandlesticks(exchange, symbol, timeframes[i], historyLength))),
                  newCandlestick,
                ],
              };
            } else if (candleStore[toSymbolKey(symbol)][timeframes[i]] === undefined) {
              candleStore[toSymbolKey(symbol)][timeframes[i]] = [
                ...(await withRetry(() => getLastCandlesticks(exchange, symbol, timeframes[i], historyLength))),
                newCandlestick,
              ];
            } else if (newCandlestick.isFinal === true) {
              candleStore[toSymbolKey(symbol)][timeframes[i]].push(newCandlestick);
            } else {
              candleStore[toSymbolKey(symbol)][timeframes[i]][
                candleStore[toSymbolKey(symbol)][timeframes[i]].length - 1
              ] = newCandlestick;
            }
            const arrForSliceN = candleStore[toSymbolKey(symbol)]?.[timeframes[i]];
            if (arrForSliceN?.length > maxCandlesticks) {
              candleStore[toSymbolKey(symbol)][timeframes[i]] = arrForSliceN.slice(-maxCandlesticks);
            }
            if (!(symbolOptions.stopLoss?.hit === true && symbolOptions.stopLoss?.stopTrading === true)) {
              await callback(candleStore);
            } else {
              exchange.unsubscribeCandles(symbol, getMinutesFromInterval(timeframes[i]));
              exchange.unsubscribeTicker(symbol);
            }
          }
        },
        10,
      );
    } else if (isDexTrade(exchange)) {
      console.log("DexTrade: Subscribe to candles");
      const pairInfo = await exchange.getPairInfo(toSymbolKey(symbol));
      const rateDecimal = pairInfo?.rate_decimal ?? 8;
      const baseDecimal = pairInfo?.base_decimal ?? 8;
      // Track whether we have already received the initial history batch
      let historyLoaded = false;
      await exchange.subscribeCandles(
        toSymbolKey(symbol),
        getMinutesFromInterval(timeframes[i]),
        async (events: DexTradeSocketGraphEvent[]) => {
          const storeKey = toSymbolKey(symbol);
          // First socket message delivers ~256 historical candles — use as initial history
          if (!historyLoaded && events.length > 1) {
            historyLoaded = true;
            const sortedEvents = [...events].sort((a, b) => a.data.time - b.data.time);
            const historicalCandles: Candlestick[] = sortedEvents.map((event, idx) => {
              const c = event.data;
              return {
                symbol: symbol,
                interval: timeframes[i],
                type: "",
                time: c.time * 1000,
                startTime: c.time * 1000,
                open: c.open / Math.pow(10, rateDecimal),
                high: c.high / Math.pow(10, rateDecimal),
                low: c.low / Math.pow(10, rateDecimal),
                close: c.close / Math.pow(10, rateDecimal),
                trades: 0,
                volume: c.volume / Math.pow(10, baseDecimal),
                quoteVolume: 0,
                buyVolume: 0,
                quoteBuyVolume: 0,
                isFinal: idx < sortedEvents.length - 1,
              };
            });
            if (candleStore[storeKey] === undefined) {
              candleStore[storeKey] = { [timeframes[i]]: historicalCandles };
            } else {
              candleStore[storeKey][timeframes[i]] = historicalCandles;
            }
            const arrForSliceDex0 = candleStore[storeKey]?.[timeframes[i]];
            if (arrForSliceDex0?.length > maxCandlesticks) {
              candleStore[storeKey][timeframes[i]] = arrForSliceDex0.slice(-maxCandlesticks);
            }
            if (!(symbolOptions.stopLoss?.hit === true && symbolOptions.stopLoss?.stopTrading === true)) {
              await callback(candleStore);
            } else {
              exchange.unsubscribeCandles(toSymbolKey(symbol), getMinutesFromInterval(timeframes[i]));
            }
            return;
          }
          // Subsequent single-candle updates
          historyLoaded = true;
          for (const event of events) {
            const c = event.data;
            const timeOfCandle = c.time * 1000;
            const open = c.open / Math.pow(10, rateDecimal);
            const high = c.high / Math.pow(10, rateDecimal);
            const low = c.low / Math.pow(10, rateDecimal);
            const close = c.close / Math.pow(10, rateDecimal);
            const volume = c.volume / Math.pow(10, baseDecimal);
            let isFinal = false;
            if (
              candleStore[storeKey] !== undefined &&
              candleStore[storeKey][timeframes[i]] !== undefined &&
              candleStore[storeKey][timeframes[i]].length > 0
            ) {
              const previousCandle =
                candleStore[storeKey][timeframes[i]][candleStore[storeKey][timeframes[i]].length - 1];
              if (previousCandle.time !== timeOfCandle) {
                isFinal = true;
              }
            } else if (candleStore[storeKey] === undefined) {
              isFinal = true;
            }
            const newCandlestick: Candlestick = {
              symbol: symbol,
              interval: timeframes[i],
              type: "",
              time: timeOfCandle,
              startTime: timeOfCandle,
              open,
              high,
              low,
              close,
              trades: 0,
              volume,
              quoteVolume: 0,
              buyVolume: 0,
              quoteBuyVolume: 0,
              isFinal,
            };
            if (candleStore[storeKey] === undefined) {
              candleStore[storeKey] = {
                [timeframes[i]]: [
                  ...(await withRetry(() => getLastCandlesticks(exchange, symbol, timeframes[i], historyLength))),
                  newCandlestick,
                ],
              };
            } else if (candleStore[storeKey][timeframes[i]] === undefined) {
              candleStore[storeKey][timeframes[i]] = [
                ...(await withRetry(() => getLastCandlesticks(exchange, symbol, timeframes[i], historyLength))),
                newCandlestick,
              ];
            } else if (newCandlestick.isFinal === true) {
              candleStore[storeKey][timeframes[i]].push(newCandlestick);
            } else {
              candleStore[storeKey][timeframes[i]][candleStore[storeKey][timeframes[i]].length - 1] = newCandlestick;
            }
            const arrForSliceDex = candleStore[storeKey]?.[timeframes[i]];
            if (arrForSliceDex?.length > maxCandlesticks) {
              candleStore[storeKey][timeframes[i]] = arrForSliceDex.slice(-maxCandlesticks);
            }
            if (!(symbolOptions.stopLoss?.hit === true && symbolOptions.stopLoss?.stopTrading === true)) {
              await callback(candleStore);
            } else {
              exchange.unsubscribeCandles(toSymbolKey(symbol), getMinutesFromInterval(timeframes[i]));
            }
          }
        },
      );
    }
  }
};

interface Candlerow {
  opentime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closetime: number;
  quoteVolume: number;
  trades: number;
  takerQtyBase: number;
  takerQtyQuote: number;
  unused: number;
}

/**
 * Normalisoi UNIX-aikaleiman millisekunneiksi.
 * Tukee sekunteja, millisekunteja, mikrosekunteja ja nanosekunteja.
 */
const normalizeUnixToMs = (ts: number): number => {
  if (!Number.isFinite(ts) || ts <= 0) return ts;
  // ns (19) -> ms
  if (ts >= 1e18) return Math.trunc(ts / 1e6);
  // us (16) -> ms
  if (ts >= 1e15) return Math.trunc(ts / 1e3);
  // ms (13) -> ms
  if (ts >= 1e12) return Math.trunc(ts);
  // s (10) -> ms
  if (ts >= 1e9) return Math.trunc(ts * 1e3);
  return Math.trunc(ts);
};

export const readCsvFile = async (filePath: string): Promise<Candlerow[]> => {
  const data = readFileSync(filePath, { encoding: "utf8" });
  const lines = data.split("\n");
  const rows: Candlerow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(",");
    if (values.length < 5) continue;
    const open = parseFloat(values[1]);
    const high = parseFloat(values[2]);
    const low = parseFloat(values[3]);
    const close = parseFloat(values[4]);
    if (Number.isNaN(open) || Number.isNaN(high) || Number.isNaN(low) || Number.isNaN(close)) continue;
    const openTimeRaw = parseInt(values[0], 10);
    const closeTimeRaw = parseInt(values[7], 10);
    const row: Candlerow = {
      opentime: normalizeUnixToMs(openTimeRaw),
      open,
      high,
      low,
      close,
      volume: parseFloat(values[5]),
      quoteVolume: parseFloat(values[6]),
      closetime: normalizeUnixToMs(closeTimeRaw),
      trades: parseInt(values[8], 10),
      takerQtyBase: parseFloat(values[9]),
      takerQtyQuote: parseFloat(values[10]),
      unused: parseInt(values[11], 10),
    };
    rows.push(row);
  }
  return rows;
};

export const downloadAndExtractZipFile = async (url: string, destinationPath: string): Promise<boolean | string> => {
  const response = await fetch(url);
  if (!response.ok) {
    return "404 NOT FOUND";
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const zipFilePath = path.join(destinationPath, "downloaded.zip");
  writeFileSync(zipFilePath, buffer);
  const zip = new AdmZip(zipFilePath);
  zip.extractAllTo(destinationPath, true);
  unlinkSync(zipFilePath);
  return true;
};

const addLeadingZero = (n: number) => {
  return n < 10 ? `0${n}` : `${n}`;
};

function shellSortCandlesticksByTime(nums: Candlestick[]): Candlestick[] {
  const n = nums.length;
  let gap = Math.floor(n / 2);
  while (gap > 0) {
    for (let i = gap; i < n; i++) {
      const temp = nums[i];
      let j = i;
      while (j >= gap && nums[j - gap].time > temp.time) {
        nums[j] = nums[j - gap];
        j -= gap;
      }
      nums[j] = temp;
    }
    gap = Math.floor(gap / 2);
  }
  return nums;
}

/** Ensimmäinen vuosi, josta Binance Vision -kuukausidata haetaan simulaatiossa. */
export const SIMULATION_HISTORICAL_START_YEAR = 2020;

function minMaxCandlestickTime(candles: Candlestick[]): { min: number; max: number } {
  if (candles.length === 0) {
    return { min: 0, max: 0 };
  }
  let minT = candles[0].time;
  let maxT = candles[0].time;
  for (let i = 1; i < candles.length; i++) {
    const t = candles[i].time;
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  return { min: minT, max: maxT };
}

/** Simulaatiohistorian esiasetukset (vuosina; 1/12 ≈ 1 kk). */
export const SIMULATION_HISTORY_ONE_MONTH_YEARS = 1 / 12;
export const SIMULATION_HISTORY_SIX_MONTHS_YEARS = 0.5;

export const formatSimulationHistoryPeriodFi = (years: number | undefined | null): string => {
  if (years == null || typeof years !== "number" || !Number.isFinite(years) || years <= 0) {
    return "koko ladattu historia";
  }
  if (Math.abs(years - SIMULATION_HISTORY_ONE_MONTH_YEARS) < 1e-6) {
    return "viimeiset 1 kk";
  }
  if (Math.abs(years - SIMULATION_HISTORY_SIX_MONTHS_YEARS) < 1e-6) {
    return "viimeiset 6 kk";
  }
  const rounded = Math.round(years * 1000) / 1000;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) {
    const n = Math.round(rounded);
    return n === 1 ? "viimeiset 1 vuosi" : `viimeiset ${n} vuotta`;
  }
  return `viimeiset ${years} v`;
};

/**
 * Rajaa simulaation kynttilät viimeisiin `years` vuoteen (avausaika >= nyt − vuodet).
 * Murto-osat sallittu (esim. 1/12 = 1 kk). Tyhjä / ei-numero / ≤ 0 = palauta kaikki.
 */
export const filterCandlesticksBySimulationHistoryYears = (
  candles: Candlestick[],
  years: number | undefined | null,
): Candlestick[] => {
  if (candles.length === 0) {
    return candles;
  }
  if (years == null || typeof years !== "number" || !Number.isFinite(years) || years <= 0) {
    return candles;
  }
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - years * msPerYear;
  return candles.filter((c) => c.time >= cutoff);
};

/**
 * Kuvaa konsoliin (fi), mitä kynttiläjaksoa simulaatio käyttää: koko historia vs. viimeiset N vuotta.
 */
export const formatSimulationCandleHistoryFi = (
  candles: Candlestick[],
  requestedHistoryYears: number | undefined | null,
): string => {
  if (candles.length === 0) {
    return "Simulaatio: ei kynttilöitä (tyhjä joukko rajauksen jälkeen). Tarkista data tai simulationHistoryYears.";
  }
  const { min, max } = minMaxCandlestickTime(candles);
  const minD = new Date(min).toLocaleString("fi-FI");
  const maxD = new Date(max).toLocaleString("fi-FI");
  const spanYears = (max - min) / (365.25 * 24 * 60 * 60 * 1000);
  const rows = candles.length;
  const useWindow =
    requestedHistoryYears != null &&
    typeof requestedHistoryYears === "number" &&
    Number.isFinite(requestedHistoryYears) &&
    requestedHistoryYears > 0;

  if (useWindow) {
    return (
      `Simulaatio: kynttilät — ${formatSimulationHistoryPeriodFi(requestedHistoryYears)} (rajattu). ` +
      `Vanhin: ${minD} — uusin: ${maxD}. ` +
      `Aikajänne ~${spanYears.toFixed(1)} v, rivejä ${rows}.`
    );
  }
  return (
    `Simulaatio: kynttilät — koko ladattu historia (Binance Vision ${SIMULATION_HISTORICAL_START_YEAR} →). ` +
    `Vanhin: ${minD} — uusin: ${maxD}. ` +
    `Aikajänne ~${spanYears.toFixed(1)} v, rivejä ${rows}.`
  );
};

export const downloadHistoricalCandlesticks = async (
  symbols: string[],
  intervals: string[],
  onProgress?: (info: {
    symbol: string;
    symbolIndex: number;
    symbolTotal: number;
    interval: string;
    intervalIndex: number;
    intervalTotal: number;
    year: number;
    month: number;
    monthIndex: number;
    monthTotal: number;
  }) => void,
): Promise<Candlestick[]> => {
  let allCandlesticks: Candlestick[] = [];
  const symTotal = symbols?.length ?? 0;
  for (let symbolIndex = 0; symbolIndex < symbols?.length; symbolIndex++) {
    console.log(`Downloading symbol ${symbolIndex + 1}/${symTotal}: ${symbols[symbolIndex]} candlesticks.`);
    for (let intervalIndex = 0; intervalIndex < intervals?.length; intervalIndex++) {
      let currentYear = new Date().getFullYear();
      let currentMonth = new Date().getMonth() + 1;
      const startYear = SIMULATION_HISTORICAL_START_YEAR;
      const startMonth = 1;
      const monthTotal = (currentYear - startYear) * 12 + (currentMonth - startMonth) + 1;
      let monthFileIndex = 0;
      for (let year = startYear; year <= currentYear; year++) {
        for (
          let month = year === startYear ? startMonth : 1;
          month <= (year === currentYear ? currentMonth : 12);
          month++
        ) {
          monthFileIndex++;
          const formattedYear = year.toString();
          const formattedMonth = addLeadingZero(month);
          onProgress?.({
            symbol: symbols[symbolIndex],
            symbolIndex: symbolIndex + 1,
            symbolTotal: symTotal,
            interval: intervals[intervalIndex],
            intervalIndex: intervalIndex + 1,
            intervalTotal: intervals.length,
            year,
            month,
            monthIndex: monthFileIndex,
            monthTotal,
          });
          if (monthFileIndex === 1 || monthFileIndex % 6 === 0) {
            console.log(
              `  … ${symbols[symbolIndex]} ${intervals[intervalIndex]} ${formattedYear}-${formattedMonth} (kuukausi ${monthFileIndex})`,
            );
          }
          const url = `https://data.binance.vision/data/spot/monthly/klines/${symbols[symbolIndex]
            .split("/")
            .join("")
            .toLocaleUpperCase()}/${intervals[intervalIndex]}/${symbols[symbolIndex]
            .split("/")
            .join("")
            .toLocaleUpperCase()}-${intervals[intervalIndex]}-${formattedYear}-${formattedMonth}.zip`;
          const destinationPath = "./candlestore/";
          if (!existsSync(destinationPath)) {
            mkdirSync(destinationPath);
            console.log(`Directory '${destinationPath}' created successfully.`);
          }
          const filePath = `./candlestore/${toSymbolKey(symbols[symbolIndex]).toLocaleUpperCase()}-${
            intervals[intervalIndex]
          }-${formattedYear}-${formattedMonth}.csv`;
          if (!existsSync(filePath)) {
            const dlresult = await downloadAndExtractZipFile(url, destinationPath);
            console.log(`Downloaded file ${url}: ${dlresult}`);
          }
          if (existsSync(filePath)) {
            const candledata = await readCsvFile(filePath);
            for (let candledataIndex = 0; candledataIndex < candledata.length; candledataIndex++) {
              if (candledataIndex > 0 && candledataIndex % 10000 === 0) {
                // Avoid long UI/network starvation while parsing huge CSV chunks.
                await new Promise<void>((resolve) => setImmediate(resolve));
              }
              const row = candledata[candledataIndex];
              const candlestick: Candlestick = {
                symbol: symbols[symbolIndex] != null ? toSymbolKey(symbols[symbolIndex]) : "",
                interval: intervals[intervalIndex],
                type: "",
                time: row.opentime,
                open: row.open,
                high: row.high,
                low: row.low,
                close: row.close,
                trades: row.trades,
                volume: row.volume,
                quoteVolume: row.quoteVolume,
                buyVolume: row.takerQtyBase,
                quoteBuyVolume: row.takerQtyQuote,
                isFinal: true,
              };
              allCandlesticks.push(candlestick);
            }
          }
        }
      }
    }
    console.log(`Downloaded symbol ${symbols[symbolIndex]} candlesticks.`);
  }
  console.log(`Sorting ${allCandlesticks.length} candlesticks.`);
  allCandlesticks = shellSortCandlesticksByTime(allCandlesticks);
  console.log(`Candlesticks sorted (${allCandlesticks.length} rows).`);
  return allCandlesticks;
};

/** Optional progress logging for simulation replay (Finnish console messages). */
export type SimulateListenProgress = {
  passIndex: number;
  passTotal: number;
  focusSymbol: string;
};

/** Kynttiläreplayn eteneminen (UI / status-API). */
export type SimulateListenCandleProgress = {
  passIndex: number;
  passTotal: number;
  focusSymbol: string;
  done: number;
  total: number;
};

export type SimulateListenOutcome = {
  userAborted: boolean;
  /** Seuraava käsiteltävä kynttiläindeksi tässä erässä, jos käyttäjä keskeytti. */
  abortedAtCandleIndex?: number;
  /** Stop-loss / stopTrading katkaisi replayn (ei käyttäjän abort). */
  stopTradingHalted?: boolean;
  /** Seuraava indeksi erässä pysähdyksen hetkellä (checkpoint-tyylinen; jatko ei yleensä tarkoitu). */
  stopTradingAtCandleIndex?: number;
};

export const simulateListenForCandlesticks = async (
  symbols: string[],
  candlesticks: Candlestick[],
  candleStore: Candlesticks,
  options: ConfigOptions,
  callback: (symbol: string, interval: string, candlesticks: Candlesticks) => Promise<void>,
  progress?: SimulateListenProgress,
  shouldAbort?: () => boolean,
  onCandleProgress?: (info: SimulateListenCandleProgress) => void,
  startCandleIndex?: number,
  /** Per erä (esim. symbolOptions.stopLoss) — sama idea kuin live-kuuntelussa. */
  isStopTrading?: () => boolean,
): Promise<SimulateListenOutcome> => {
  const maxCandlesticks = 1_000_000;
  const yieldEveryCandles = 100;
  const yieldEveryMs = 40;
  const total = candlesticks.length;
  const start = Math.max(0, Math.floor(startCandleIndex ?? 0));
  /** ~25 progress lines max for large runs */
  const reportEvery = Math.max(1, Math.ceil(total / 25));
  let lastReported = start > 0 ? start - 1 : -1;
  let replayAborted = false;
  let abortedAtCandleIndex: number | undefined;
  let stopTradingHalted = false;
  let stopTradingAtCandleIndex: number | undefined;
  let lastYieldAt = Date.now();

  const stopTradingActive = (): boolean => {
    if (typeof isStopTrading === "function" && isStopTrading()) return true;
    return options.stopLossHit === true && options.stopLossStopTrading === true;
  };
  if (progress && total > 0) {
    if (start > 0) {
      console.log(
        `Simulaatio: erä ${progress.passIndex}/${progress.passTotal} (${progress.focusSymbol}) — jatketaan kynttilästä ${start + 1}/${total}.`,
      );
    } else {
      console.log(
        `Simulaatio: erä ${progress.passIndex}/${progress.passTotal} (${progress.focusSymbol}) — käydään läpi ${total} kynttilätapahtumaa.`,
      );
    }
    onCandleProgress?.({
      passIndex: progress.passIndex,
      passTotal: progress.passTotal,
      focusSymbol: progress.focusSymbol,
      done: start,
      total,
    });
  }
  for (let candleIndex = start; candleIndex < candlesticks.length; candleIndex++) {
    const now = Date.now();
    if ((candleIndex > 0 && candleIndex % yieldEveryCandles === 0) || now - lastYieldAt >= yieldEveryMs) {
      // Keep HTTP endpoints responsive during long replay loops.
      await new Promise<void>((resolve) => setImmediate(resolve));
      lastYieldAt = Date.now();
    }
    if (shouldAbort && shouldAbort()) {
      console.log("Simulaatio: keskeytys pyydetty — lopetetaan kynttilöiden läpikäynti.");
      replayAborted = true;
      abortedAtCandleIndex = candleIndex;
      if (progress && total > 0) {
        onCandleProgress?.({
          passIndex: progress.passIndex,
          passTotal: progress.passTotal,
          focusSymbol: progress.focusSymbol,
          done: candleIndex,
          total,
        });
      }
      break;
    }
    const candlestick = candlesticks[candleIndex];
    const symbol = candlesticks[candleIndex]?.symbol;
    const interval = candlesticks[candleIndex]?.interval;
    if (!(symbol in candleStore)) {
      candleStore[symbol] = {};
    }
    if (!(interval in candleStore[symbol])) {
      candleStore[symbol][interval] = [];
    }
    candleStore[symbol][interval].push(candlestick);
    if (candleStore[symbol][interval]?.length > maxCandlesticks) {
      candleStore[symbol][interval] = candleStore[symbol][interval].slice(-maxCandlesticks);
    }
    if (progress && total > 0) {
      const done = candleIndex + 1;
      if (done === 1 || done === total || done - lastReported >= reportEvery) {
        const pct = ((done / total) * 100).toFixed(1);
        console.log(
          `Simulaatio: erä ${progress.passIndex}/${progress.passTotal} (${progress.focusSymbol}) — kynttilät ${done}/${total} (${pct} %).`,
        );
        onCandleProgress?.({
          passIndex: progress.passIndex,
          passTotal: progress.passTotal,
          focusSymbol: progress.focusSymbol,
          done,
          total,
        });
        lastReported = done;
      }
    }
    if (candleStore[symbol][interval]?.length > 250) {
      let splittedSymbol = "";
      for (let symbolsIndex = 0; symbolsIndex < symbols.length; symbolsIndex++) {
        if (symbol === toSymbolKey(symbols[symbolsIndex])) {
          splittedSymbol = symbols[symbolsIndex];
          break;
        }
      }
      if (!stopTradingActive()) {
        await callback(splittedSymbol, interval, candleStore);
      } else {
        stopTradingHalted = true;
        stopTradingAtCandleIndex = candleIndex + 1;
        break;
      }
    }
  }
  /**
   * Callback laukeaa vain kun sarjan pituus > 250. Jos erä päättyy 1…250 kynttilään, algoritmia ei kutsuttaisi —
   * replay jää viimeiseltä pätkältä ajamatta (checkpoint + tulos väärin).
   */
  if (!replayAborted && !stopTradingHalted && total > 0) {
    const focus = progress?.focusSymbol ?? symbols[0];
    if (focus && !stopTradingActive()) {
      const sk = toSymbolKey(focus);
      const node = candleStore[sk];
      if (node) {
        for (const interval of Object.keys(node)) {
          const len = node[interval]?.length ?? 0;
          if (len > 0 && len <= 250) {
            await callback(focus, interval, candleStore);
          }
        }
      }
    }
  }
  if (progress && total > 0 && !replayAborted && !stopTradingHalted) {
    console.log(
      `Simulaatio: erä ${progress.passIndex}/${progress.passTotal} (${progress.focusSymbol}) — kynttilöiden läpikäynti valmis.`,
    );
    onCandleProgress?.({
      passIndex: progress.passIndex,
      passTotal: progress.passTotal,
      focusSymbol: progress.focusSymbol,
      done: total,
      total,
    });
  } else if (stopTradingHalted && progress && total > 0) {
    console.log(
      `Simulaatio: erä ${progress.passIndex}/${progress.passTotal} (${progress.focusSymbol}) — replay pysäytettiin (stopTrading / stop-loss).`,
    );
  }
  return {
    userAborted: replayAborted,
    abortedAtCandleIndex,
    ...(stopTradingHalted ? { stopTradingHalted: true as const, stopTradingAtCandleIndex } : {}),
  };
};
