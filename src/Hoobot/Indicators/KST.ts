import { Candlestick } from "../Exchanges/Candlesticks";
import { calculateSMA } from "./SMA";

export const calculateROC = (candles: Candlestick[], period: number, source: string = "close"): Candlestick[] => {
  const data = candles.map((candle) => candle[source] as number);
  return data
    .map((value, index, arr) => {
      if (index < period) return 0; // Not enough data to calculate ROC
      const prevValue = arr[index - period];
      if (prevValue === 0) return 0; // Avoid division by zero
      return ((value - prevValue) / prevValue) * 100;
    })
    .slice(period)
    .map((roc) => ({ close: roc }) as Candlestick);
};

export const calculateKST = (
  candles: Candlestick[],
  RocLen1: number,
  RocLen2: number,
  RocLen3: number,
  RocLen4: number,
  SmaLen1: number,
  SmaLen2: number,
  SmaLen3: number,
  SmaLen4: number,
  SigLen: number,
  source: string = "close",
): { kst: number[]; signalLine: number[] } => {
  const smaRoc1 = calculateSMA(calculateROC(candles, RocLen1, source), SmaLen1, "close");
  const smaRoc2 = calculateSMA(calculateROC(candles, RocLen2, source), SmaLen2, "close");
  const smaRoc3 = calculateSMA(calculateROC(candles, RocLen3, source), SmaLen3, "close");
  const smaRoc4 = calculateSMA(calculateROC(candles, RocLen4, source), SmaLen4, "close");
  const minLength = Math.min(smaRoc1.length, smaRoc2.length, smaRoc3.length, smaRoc4.length);
  let kst: number[] = [];
  for (let i = 0; i < minLength; i++) {
    const kstValue = smaRoc1[i] * 1 + smaRoc2[i] * 2 + smaRoc3[i] * 3 + smaRoc4[i] * 4;
    kst.push(kstValue);
  }
  const signalLine = calculateSMA(
    kst.map((k) => ({ close: k }) as Candlestick),
    SigLen,
    "close",
  );
  return { kst, signalLine };
};
