import { checkADXSignals } from "./ADX";
import type { SymbolOptions } from "../Utilities/Args";

const symbolOptions: SymbolOptions = {
  name: "BTC/EUR",
  indicators: {
    adx: { enabled: true, weight: 1, dilength: 14, adxSmoothing: 14 },
  },
} as SymbolOptions;

describe("checkADXSignals", () => {
  it("returns directional signal when ADX is strong (not BOTH)", () => {
    const sig = checkADXSignals(
      {
        adx: [30],
        plusDI: [28],
        minusDI: [12],
      },
      symbolOptions
    );
    expect(sig).toBe("BUY");
    expect(sig).not.toBe("BOTH");
  });

  it("returns SELL when minus DI dominates in trending ADX", () => {
    const sig = checkADXSignals(
      {
        adx: [26],
        plusDI: [10],
        minusDI: [22],
      },
      symbolOptions
    );
    expect(sig).toBe("SELL");
  });
});
