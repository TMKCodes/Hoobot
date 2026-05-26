import { appendZeroTradesGridWarnings, totalTradesFromSimulationResult } from "./runSimGridCore";
import type { SimulationApiResult } from "./runSimulationCore";

describe("totalTradesFromSimulationResult", () => {
  it("sums symbol trade counts", () => {
    const result: SimulationApiResult = {
      ok: true,
      startingBalance: 100,
      finalPortfolio: 110,
      roi: 0.1,
      roiPercent: "10.00",
      candleRows: 10,
      symbols: [
        { name: "BTC/EUR", trades: 2, stopLosses: 0, stopLossSells: 0, stopLossBuys: 0, takeProfits: 0, holds: 0, sells: 1, buys: 1, growingMax: { buy: 0, sell: 0 } },
        { name: "ETH/EUR", trades: 3, stopLosses: 0, stopLossSells: 0, stopLossBuys: 0, takeProfits: 0, holds: 0, sells: 1, buys: 2, growingMax: { buy: 0, sell: 0 } },
      ],
    };
    expect(totalTradesFromSimulationResult(result)).toBe(5);
  });
});

describe("appendZeroTradesGridWarnings", () => {
  it("adds warning when all ok variants have zero trades", () => {
    const warnings: string[] = [];
    const n = appendZeroTradesGridWarnings(warnings, [
      { variantIndex: 0, ok: true, trades: 0, zeroTrades: true },
      { variantIndex: 1, ok: true, trades: 0, zeroTrades: true },
    ]);
    expect(n).toBe(2);
    expect(warnings.some((w) => w.includes("Kaikissa"))).toBe(true);
  });

  it("returns 0 when some variants traded", () => {
    const warnings: string[] = [];
    const n = appendZeroTradesGridWarnings(warnings, [
      { variantIndex: 0, ok: true, trades: 0, zeroTrades: true },
      { variantIndex: 1, ok: true, trades: 4, zeroTrades: false },
    ]);
    expect(n).toBe(1);
    expect(warnings.some((w) => w.includes("1/2"))).toBe(true);
  });
});
