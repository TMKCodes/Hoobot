import type { Candlestick } from "../Exchanges/Candlesticks";
import type { Orderbook } from "../Exchanges/Orderbook";
import type { ExchangeOptions, SymbolOptions } from "../Utilities/Args";
import { simPriceFromCandle } from "../Trading/executionSizing";

export type SimulatableExchangeMode = "algorithmic" | "hilow" | "extreme" | "periodic";

export const SIMULATABLE_EXCHANGE_MODES: SimulatableExchangeMode[] = [
  "algorithmic",
  "hilow",
  "extreme",
  "periodic",
];

export function isSimulatableExchangeMode(mode: string | undefined): mode is SimulatableExchangeMode {
  return mode != null && (SIMULATABLE_EXCHANGE_MODES as string[]).includes(mode);
}

/** Yksihintainen orderbook kynttilän closelta (simulaatio). */
export function simOrderbookFromCandle(candle: Pick<Candlestick, "close">): Orderbook {
  const price = simPriceFromCandle(candle);
  const key = price.toFixed(8);
  return {
    bids: { [key]: 1000 },
    asks: { [key]: 1000 },
  };
}

export function simulationTimeframesForSymbol(symbolOptions: SymbolOptions): string[] {
  const tfs = symbolOptions.timeframes?.filter(Boolean) ?? [];
  if (tfs.length > 0) return tfs;
  return ["5m"];
}

export function simulationTimeframesForExchange(exchangeOptions: ExchangeOptions): string[] {
  const active = exchangeOptions.symbols?.filter((s) => s.enabled !== false) ?? [];
  const fromSymbols = active.flatMap((s) => simulationTimeframesForSymbol(s));
  const fromTrend = active.flatMap((s) => (s.trend?.timeframe ? [s.trend.timeframe] : []));
  return [...new Set([...fromSymbols, ...fromTrend])];
}

/**
 * Alkusaldo simulaatiolle: yhteinen quote-lompakko lasketaan kerran per valuutta
 * (ei summaa samaa EUR:ää usealta symbolipassilta).
 */
export function computeSimulationStartingBalance(
  symbolPasses: Array<{ name: string; growingMax?: { buy?: number } }>
): number {
  const quoteTotals = new Map<string, number>();
  for (const s of symbolPasses) {
    const parts = s.name?.split("/") || [];
    const quote = parts.length >= 2 ? parts[1] : null;
    if (!quote || quoteTotals.has(quote)) continue;
    quoteTotals.set(quote, s.growingMax?.buy ?? 0);
  }
  let total = 0;
  for (const v of quoteTotals.values()) total += v;
  return total;
}

export function simulationModeErrorFi(mode: string | undefined): string | null {
  if (mode === "grid") {
    return "Grid-moodin simulaatio ei ole vielä tuettu. Kokeile algorithmic-, hilow-, extreme- tai periodic-moodia.";
  }
  if (mode === "consecutive") {
    return "Consecutive-moodin simulaatio ei ole tuettu.";
  }
  if (!isSimulatableExchangeMode(mode)) {
    return `Simulaatio ei tue pörssin moodia "${mode ?? "?"}".`;
  }
  return null;
}
