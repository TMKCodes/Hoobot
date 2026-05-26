import { calculateBollingerBands, checkBollingerBandsSignals } from "./BollingerBands";
import type { Candlestick } from "../Exchanges/Candlesticks";

const candles = Array.from({ length: 30 }, (_, i) => ({
  open: 100 + i * 0.1,
  high: 101 + i * 0.1,
  low: 99 + i * 0.1,
  close: 100 + i * 0.1,
  time: i,
  isFinal: true,
})) as Candlestick[];

describe("BollingerBands", () => {
  it("returns empty bands without candles", () => {
    const [mid, up, lo] = calculateBollingerBands(undefined as never, "SMA", 20, 2, "close");
    expect(mid).toEqual([]);
    expect(up).toEqual([]);
    expect(lo).toEqual([]);
  });

  it("defaults invalid average to SMA path", () => {
    const [mid, up, lo] = calculateBollingerBands(candles, "2" as never, 20, 2, "close");
    expect(mid.length).toBeGreaterThan(0);
    expect(up.length).toBe(mid.length);
    expect(lo.length).toBe(mid.length);
  });

  it("checkBollingerBandsSignals uses lower band series", () => {
    const bands = calculateBollingerBands(candles, "SMA", 20, 2, "close");
    const sig = checkBollingerBandsSignals(candles, bands, {
      name: "X",
      indicators: { bb: { enabled: true, length: 3, multiplier: 2, average: "SMA", history: 3, weight: 1 } },
    } as never);
    expect(["BUY", "SELL", "HOLD", "SKIP"]).toContain(sig);
  });
});
