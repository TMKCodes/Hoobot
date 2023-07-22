export type CandlestickInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d" | "1w" | "1M";

// Configuration options interface
export interface ConfigOptions {
  apiKey: string;
  apiSecret: string;
  pair: string;
  candlestickInterval: CandlestickInterval;
  emaA: number;
  emaB: number;
  maxAmount: number;
  riskPercentage: number;
  overboughtTreshold: number;
  oversoldTreshold: number;
  maxOrderAge: number;
  tradeFee: number;
  [key: string]: string | number; // Index signature
}

// Parse command-line arguments and return options object
export function parseArgs(args: string[]): ConfigOptions {
  if (args.length === 0) {
    // If no command-line arguments, read options from .env file
    return {
      apiKey: process.env.API_KEY || '',
      apiSecret: process.env.API_SECRET || '',
      pair: process.env.PAIR || '',
      candlestickInterval: process.env.CANDLESTICK_INTERVAL as CandlestickInterval || "1m",
      emaA: parseFloat(process.env.EMA_A!) || 7,
      emaB: parseFloat(process.env.EMA_B!) || 26,
      maxAmount: parseFloat(process.env.MAX_AMOUNT!) || 0,
      riskPercentage: parseFloat(process.env.RISK_PERCENTAGE!) || 1,
      overboughtTreshold: parseFloat(process.env.OVERBOUGHT_TRESHOLD!) || 70,
      oversoldTreshold: parseFloat(process.env.OVERSOLD_TRESHOLD!) || 30,
      maxOrderAge: parseFloat(process.env.MAX_ORDER_AGE_SECONDS!) || 60,
      tradeFee: parseFloat(process.env.TRADE_FEE_PERCENTAGE!) || 0.075,
    };
  }
  // If command-line arguments provided, parse them
  const options: ConfigOptions = {
    apiKey: '',
    apiSecret: '',
    pair: '',
    candlestickInterval: "1m",
    emaA: 7,
    emaB: 26,
    maxAmount: 0,
    riskPercentage: 1,
    overboughtTreshold: 70,
    oversoldTreshold: 30,
    maxOrderAge: 60,
    tradeFee: 0.075
  };
  for (let i = 0; i < args.length; i += 2) {
    const argName = args[i].substring(2);
    const argValue = args[i + 1];
    if (options.hasOwnProperty(argName as keyof ConfigOptions)) {
      options[argName as keyof ConfigOptions] = argValue;
    }
  }
  return options;
}