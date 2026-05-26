import { mayExecuteAlgorithmicTrade, simFeeRatePerLeg } from "./tradeGates";

describe("mayExecuteAlgorithmicTrade", () => {
  it("allows SELL path only for explicit sell signals when position exists", () => {
    expect(mayExecuteAlgorithmicTrade("SELL", "SELL", { hasTradeHistory: true })).toBe(true);
    expect(mayExecuteAlgorithmicTrade("TAKE_PROFIT", "SELL", { hasTradeHistory: true })).toBe(true);
    expect(mayExecuteAlgorithmicTrade("TAKE_PROFIT_FORCE", "SELL", { hasTradeHistory: true })).toBe(true);
    expect(mayExecuteAlgorithmicTrade("STOP_LOSS", "SELL", { hasTradeHistory: true })).toBe(true);
    expect(mayExecuteAlgorithmicTrade("HOLD", "SELL", { hasTradeHistory: true })).toBe(false);
    expect(mayExecuteAlgorithmicTrade("SKIP", "SELL", { hasTradeHistory: true })).toBe(false);
  });

  it("allows SKIP for first entry when no trade history", () => {
    expect(mayExecuteAlgorithmicTrade("SKIP", "BUY", { hasTradeHistory: false })).toBe(true);
    expect(mayExecuteAlgorithmicTrade("SKIP", "SELL", { hasTradeHistory: false })).toBe(true);
    expect(mayExecuteAlgorithmicTrade("SKIP", "BUY", { hasTradeHistory: true })).toBe(false);
  });

  it("allows BUY path only for explicit buy signals when position exists", () => {
    expect(mayExecuteAlgorithmicTrade("BUY", "BUY", { hasTradeHistory: true })).toBe(true);
    expect(mayExecuteAlgorithmicTrade("HOLD", "BUY", { hasTradeHistory: true })).toBe(false);
  });
});

describe("simFeeRatePerLeg", () => {
  it("defaults to 0.075% per leg", () => {
    expect(simFeeRatePerLeg()).toBeCloseTo(0.00075);
  });

  it("uses tradeFeePercentage from config", () => {
    expect(simFeeRatePerLeg(0.1)).toBeCloseTo(0.001);
  });
});
