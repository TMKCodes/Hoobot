import { LIVE_BASE_RESERVE, simSellBaseQuantity, simPriceFromCandle } from "./executionSizing";

describe("executionSizing sim helpers", () => {
  it("uses candle close as sim price", () => {
    expect(simPriceFromCandle({ close: 42.5 })).toBe(42.5);
  });

  it("applies base reserve on sim sell quantity", () => {
    expect(simSellBaseQuantity(100)).toBe(100 * LIVE_BASE_RESERVE);
  });
});
