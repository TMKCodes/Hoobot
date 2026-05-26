import {
  computeSimulationStartingBalance,
  isSimulatableExchangeMode,
  simulationModeErrorFi,
  simulationTimeframesForSymbol,
} from "./simModeHelpers";
import type { SymbolOptions } from "../Utilities/Args";

describe("simModeHelpers", () => {
  it("accepts algorithmic hilow extreme periodic", () => {
    expect(isSimulatableExchangeMode("algorithmic")).toBe(true);
    expect(isSimulatableExchangeMode("hilow")).toBe(true);
    expect(isSimulatableExchangeMode("extreme")).toBe(true);
    expect(isSimulatableExchangeMode("periodic")).toBe(true);
    expect(isSimulatableExchangeMode("grid")).toBe(false);
  });

  it("returns grid error message", () => {
    expect(simulationModeErrorFi("grid")).toMatch(/Grid-moodin simulaatio/i);
  });

  it("defaults hilow symbol to 5m timeframe", () => {
    const sym = { name: "BTC/EUR" } as SymbolOptions;
    expect(simulationTimeframesForSymbol(sym)).toEqual(["5m"]);
  });

  it("counts shared quote wallet once for starting balance", () => {
    const passes = [
      { name: "BTC/EUR", growingMax: { buy: 100 } },
      { name: "ETH/EUR", growingMax: { buy: 100 } },
      { name: "BTC/USDT", growingMax: { buy: 50 } },
    ];
    expect(computeSimulationStartingBalance(passes)).toBe(150);
  });
});
