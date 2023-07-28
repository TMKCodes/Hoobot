export type CandlestickInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d" | "1w" | "1M";

export const getSecondsFromInterval = (interval: CandlestickInterval): number => {
  const intervalToSeconds: Record<CandlestickInterval, number> = {
    "1m": 60,
    "3m": 60 * 3,
    "5m": 60 * 5,
    "15m": 60 * 15,
    "30m": 60 * 30,
    "1h": 60 * 60,
    "2h": 60 * 60 * 2,
    "4h": 60 * 60 * 4,
    "6h": 60 * 60 * 6,
    "8h": 60 * 60 * 8,
    "12h": 60 * 60 * 12,
    "1d": 60 * 60 * 24,
    "3d": 60 * 60 * 24 * 3,
    "1w": 60 * 60 * 24 * 7,
    "1M": 60 * 60 * 24 * 30, // Assuming 30 days in a month
  }
  return intervalToSeconds[interval];
}

// Configuration options interface
export interface ConfigOptions {
  apiKey: string;
  apiSecret: string;
  pair: string | string[];
  candlestickInterval: CandlestickInterval;
  shortEma: number;
  longEma: number;
  rsiLength: number;
  useEMA: boolean; 
  useMACD: boolean; 
  useRSI: boolean; 
  maxAmount: number;
  riskPercentage: number;
  overboughtTreshold: number;
  oversoldTreshold: number;
  maxOrderAge: number;
  tradeFee: number;
  pairMinVolume?: number;
  pairMinPriceChange?: number;
  [key: string]: string | string[] | number | boolean | undefined; // Index signature
}

// Parse command-line arguments and return options object
export function parseArgs(args: string[]): ConfigOptions {
  if (args.length === 0) {
    // If no command-line arguments, read options from .env file
    return {
      apiKey: process.env.API_KEY || '',
      apiSecret: process.env.API_SECRET || '',
      pair: process.env.PAIR ? process.env.PAIR.split(",") : [],
      candlestickInterval: process.env.CANDLESTICK_INTERVAL as CandlestickInterval || "1m",
      shortEma: parseFloat(process.env.SHORT_EMA!) || 7,
      longEma: parseFloat(process.env.LONG_EMA!) || 26,
      rsiLength: parseFloat(process.env.RSI_LENGTH!) || 14,
      useEMA: process.env.USE_EMA === "true" ? true : false,
      useMACD: process.env.USE_MACD === "true" ? true : false,
      useRSI: process.env.USE_RSI === "true" ? true : false,
      maxAmount: parseFloat(process.env.MAX_AMOUNT!) || 0,
      riskPercentage: parseFloat(process.env.RISK_PERCENTAGE!) || 1,
      overboughtTreshold: parseFloat(process.env.OVERBOUGHT_TRESHOLD!) || 70,
      oversoldTreshold: parseFloat(process.env.OVERSOLD_TRESHOLD!) || 30,
      maxOrderAge: parseFloat(process.env.MAX_ORDER_AGE_SECONDS!) || 60,
      tradeFee: parseFloat(process.env.TRADE_FEE_PERCENTAGE!) || 0.075,
      pairMinVolume: parseFloat(process.env.PAIR_MIN_VOLUME!) || 100,
      pairMinPriceChange: parseFloat(process.env.PAIR_MIN_PRICE_CHANGE!) || 5,
    };
  }
  // If command-line arguments provided, parse them
  const options: ConfigOptions = {
    apiKey: '',
    apiSecret: '',
    pair: '',
    candlestickInterval: "1m",
    shortEma: 7,
    longEma: 26,
    rsiLength: 14,
    useEMA: true,
    useMACD: true,
    useRSI: true,
    maxAmount: 0,
    riskPercentage: 1,
    overboughtTreshold: 70,
    oversoldTreshold: 30,
    maxOrderAge: 60,
    tradeFee: 0.075,
    pairMinVolume: parseFloat(process.env.PAIR_MIN_VOLUME!) || 100,
    pairMinPriceChange: parseFloat(process.env.PAIR_MIN_PRICE_CHANGE!) || 5,
  };
  for (let i = 0; i < args.length; i += 2) {
    const argName = args[i].substring(2);
    const argValue = args[i + 1];
    if (options.hasOwnProperty(argName as keyof ConfigOptions)) {
      if (argValue === 'false') {
        options[argName as keyof ConfigOptions] = false;
      } else {
        options[argName as keyof ConfigOptions] = argValue;
      }
    }
  }
  return options;
}