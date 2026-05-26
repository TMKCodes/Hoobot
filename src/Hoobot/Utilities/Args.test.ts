/* Unit tests for Args (validateOptions, getSecondsFromInterval, getMinutesFromInterval). */

import {
  validateOptions,
  getSecondsFromInterval,
  getMinutesFromInterval,
  type ConfigOptions,
  type CandlestickInterval,
} from "./Args";

describe("validateOptions", () => {
  it("returns default config when options is null", () => {
    const result = validateOptions(null as unknown as ConfigOptions);
    expect(result).toEqual({
      running: false,
      debug: false,
      startTime: "",
      exchanges: [],
      license: "",
      simulate: false,
      discord: {},
    });
  });

  it("returns default config when options is not an object", () => {
    const result = validateOptions(undefined as unknown as ConfigOptions);
    expect(result.exchanges).toEqual([]);
  });

  it("ensures exchanges is an array", () => {
    const result = validateOptions({
      running: false,
      debug: false,
      startTime: "",
      exchanges: null as unknown as ConfigOptions["exchanges"],
      license: "",
      simulate: false,
      discord: {},
    });
    expect(Array.isArray(result.exchanges)).toBe(true);
    expect(result.exchanges).toHaveLength(0);
  });

  it("normalizes exchange name and mode", () => {
    const result = validateOptions({
      running: false,
      debug: false,
      startTime: "",
      license: "",
      simulate: false,
      discord: {},
      exchanges: [
        { name: undefined, mode: undefined, symbols: [] } as unknown as ConfigOptions["exchanges"][0],
      ],
    });
    expect(result.exchanges[0].name).toBe("");
    expect(result.exchanges[0].mode).toBe("algorithmic");
  });

  it("ensures symbols is array for algorithmic mode", () => {
    const result = validateOptions({
      running: false,
      debug: false,
      startTime: "",
      license: "",
      simulate: false,
      discord: {},
      exchanges: [
        {
          name: "binance",
          mode: "algorithmic",
          symbols: undefined,
        } as unknown as ConfigOptions["exchanges"][0],
      ],
    });
    expect(Array.isArray(result.exchanges[0].symbols)).toBe(true);
  });
});

describe("getSecondsFromInterval", () => {
  it("returns correct seconds for 1m", () => {
    expect(getSecondsFromInterval("1m" as CandlestickInterval)).toBe(60);
  });
  it("returns correct seconds for 1h", () => {
    expect(getSecondsFromInterval("1h" as CandlestickInterval)).toBe(3600);
  });
  it("returns correct seconds for 1d", () => {
    expect(getSecondsFromInterval("1d" as CandlestickInterval)).toBe(86400);
  });
});

describe("getMinutesFromInterval", () => {
  it("returns correct minutes for 1m", () => {
    expect(getMinutesFromInterval("1m" as CandlestickInterval)).toBe(1);
  });
  it("returns correct minutes for 1h", () => {
    expect(getMinutesFromInterval("1h" as CandlestickInterval)).toBe(60);
  });
});
