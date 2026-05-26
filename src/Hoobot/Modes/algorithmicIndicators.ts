/* =====================================================================
 * Hoobot - Proprietary License
 * Copyright (c) 2023 Hoosat Oy. All rights reserved.
 * ===================================================================== */

/**
 * Algorithmic: toisiaan täydentävä indikaattorisetti (ei päällekkäisiä stoch/RSI/DMI-duplikaatteja).
 * - MACD: momentum ja käännös
 * - RSI: yli-/alimyynti
 * - ADX: trendin voima ja suunta
 * - Bollinger: hinta kaistan reunoilla
 * - CMF: rahavirta / volyymin vahvistus
 * - ATR: laskenta (adaptiivinen vol), ei äänestä
 *
 * Trendi (1d EMA) pidetään erillään symbolOptions.trend -lohkossa.
 */

import type { SymbolOptions } from "../Utilities/Args";

export type IndicatorsPreset = "complementary" | "custom";

type IndicatorBlock = NonNullable<SymbolOptions["indicators"]>;

const off = { enabled: false as const };

/** Oletusparametrit + enabled/weight — ydin preset. */
export function recommendedAlgorithmicIndicators(): IndicatorBlock {
  return {
    sma: { ...off, length: 7, weight: 0 },
    renko: { ...off, weight: 0, multiplier: 1, brickSize: 0 },
    ema: { ...off, short: 9, long: 21, weight: 0 },
    macd: {
      enabled: true,
      fast: 12,
      slow: 26,
      signal: 9,
      weight: 1.2,
    },
    rsi: {
      enabled: true,
      length: 14,
      smoothing: { type: "EMA", length: 14 },
      history: 3,
      tresholds: { overbought: 70, oversold: 30 },
      weight: 1,
    },
    adx: {
      enabled: true,
      dilength: 14,
      adxSmoothing: 14,
      weight: 1,
    },
    atr: {
      enabled: true,
      length: 14,
      weight: 0,
    },
    obv: { ...off, length: 14, weight: 0 },
    cmf: {
      enabled: true,
      length: 20,
      history: 3,
      tresholds: { overbought: 0.1, oversold: -0.1 },
      weight: 0.9,
    },
    bb: {
      enabled: true,
      length: 20,
      multiplier: 2,
      average: "SMA",
      history: 3,
      weight: 1,
    },
    so: {
      enabled: false,
      kPeriod: 14,
      dPeriod: 3,
      smoothing: 3,
      tresholds: { overbought: 80, oversold: 20 },
      weight: 0,
    },
    srsi: {
      enabled: false,
      rsiLength: 14,
      stochLength: 14,
      kPeriod: 3,
      dPeriod: 3,
      smoothK: 3,
      smoothD: 3,
      history: 3,
      tresholds: { overbought: 80, oversold: 20 },
      weight: 0,
    },
    dmi: {
      enabled: false,
      dmiLength: 14,
      adxSmoothing: 14,
      weight: 0,
    },
    OpenAI: {
      enabled: false,
      key: "",
      model: "",
      history: "",
      overwrite: false,
    },
  };
}

const PRESET_KEYS: (keyof IndicatorBlock)[] = [
  "sma",
  "renko",
  "ema",
  "macd",
  "rsi",
  "adx",
  "atr",
  "obv",
  "cmf",
  "bb",
  "so",
  "srsi",
  "dmi",
  "OpenAI",
];

/**
 * Yhdistää suositellun setin: enabled/weight presetistä, numeroparametrit säilyvät jos käyttäjä on säätänyt.
 */
export function applyRecommendedAlgorithmicIndicators(sym: SymbolOptions): void {
  const rec = recommendedAlgorithmicIndicators();
  if (!sym.indicators) {
    sym.indicators = rec;
    sym.indicatorsPreset = "complementary";
    return;
  }
  const cur = sym.indicators;
  for (const key of PRESET_KEYS) {
    const presetBlock = rec[key];
    if (!presetBlock) continue;
    const existing = cur[key];
    cur[key] = {
      ...(presetBlock as object),
      ...(existing && typeof existing === "object" ? (existing as object) : {}),
      enabled: presetBlock.enabled,
      weight: "weight" in presetBlock ? presetBlock.weight : (existing as { weight?: number })?.weight,
    } as never;
  }
  sym.indicatorsPreset = "complementary";
}

export function shouldApplyComplementaryIndicators(sym: SymbolOptions): boolean {
  return sym.indicatorsPreset !== "custom";
}
