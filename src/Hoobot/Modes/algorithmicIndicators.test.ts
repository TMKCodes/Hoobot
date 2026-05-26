import type { SymbolOptions } from "../Utilities/Args";
import {
  applyRecommendedAlgorithmicIndicators,
  recommendedAlgorithmicIndicators,
  shouldApplyComplementaryIndicators,
} from "./algorithmicIndicators";

describe("algorithmicIndicators", () => {
  it("enables complementary set and disables redundant", () => {
    const sym = {
      name: "X/USDT",
      indicatorsPreset: "complementary",
      indicators: {
        macd: { enabled: false, fast: 5, slow: 15, signal: 6, weight: 1 },
        rsi: { enabled: false, length: 5, history: 5, tresholds: { overbought: 70, oversold: 30 }, weight: 1 },
        so: { enabled: true, kPeriod: 14, dPeriod: 1, smoothing: 3, tresholds: { overbought: 80, oversold: 20 }, weight: 1 },
      },
    } as SymbolOptions;
    applyRecommendedAlgorithmicIndicators(sym);
    expect(sym.indicators?.macd?.enabled).toBe(true);
    expect(sym.indicators?.macd?.fast).toBe(5);
    expect(sym.indicators?.rsi?.enabled).toBe(true);
    expect(sym.indicators?.adx?.enabled).toBe(true);
    expect(sym.indicators?.bb?.enabled).toBe(true);
    expect(sym.indicators?.cmf?.enabled).toBe(true);
    expect(sym.indicators?.so?.enabled).toBe(false);
    expect(sym.indicators?.renko?.enabled).toBe(false);
  });

  it("skips apply when custom preset", () => {
    expect(shouldApplyComplementaryIndicators({ indicatorsPreset: "custom" } as SymbolOptions)).toBe(false);
    expect(shouldApplyComplementaryIndicators({} as SymbolOptions)).toBe(true);
  });

  it("preset has five voting indicators", () => {
    const r = recommendedAlgorithmicIndicators();
    const voting = ["macd", "rsi", "adx", "bb", "cmf"] as const;
    for (const k of voting) {
      expect(r[k]?.enabled).toBe(true);
    }
    expect(r.atr?.enabled).toBe(true);
    expect(r.atr?.weight).toBe(0);
  });
});
