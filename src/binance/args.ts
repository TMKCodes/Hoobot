/* =====================================================================
* Binance Trading Bot - Proprietary License
* Copyright (c) 2023 Hoosat Oy. All rights reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are not permitted without prior written permission
* from Hoosat Oy. Unauthorized reproduction, copying, or use of this
* software, in whole or in part, is strictly prohibited.
*
* THIS SOFTWARE IS PROVIDED BY HOOSAT OY "AS IS" AND ANY EXPRESS OR
* IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
* WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
* ARE DISCLAIMED. IN NO EVENT SHALL HOOSAT OY BE LIABLE FOR ANY DIRECT,
* INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
* (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
* SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
* HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
* STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
* ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
* OF THE POSSIBILITY OF SUCH DAMAGE.
*
* The user of this software uses it at their own risk. Hoosat Oy shall
* not be liable for any losses, damages, or liabilities arising from
* the use of this software.
* ===================================================================== */

export type CandlestickInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d" | "1w" | "1M";

export type BotMode = "algorithmic" | "hilow" | "arbitrage"

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
  mode: BotMode;
  symbols: string | string[];
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
      mode: process.env.MODE as BotMode || 'algorithmic',
      symbols: process.env.SYMBOLS ? process.env.SYMBOLS.replace(" ", "").split(",") : [],
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
    mode: 'algorithmic',
    symbols: '',
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