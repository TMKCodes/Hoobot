/* =====================================================================
* Hoobot - Proprietary License
* Copyright (c) 2023 Hoosat Oy. All rights reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are not permitted without prior written permission
* from Hoosat Oy. Unauthorized reproduction, copying, or use of this
* software, in whole or in part, is strictly prohibited. All 
* modifications in source or binary must be submitted to Hoosat Oy in source format.
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
  consoleUpdate: string;
  smaLength: number;
  atrLength: number;
  bollingerBandsLength: number;
  bollingerBandsMultiplier: number;
  bollingerBandsAverageType: string;
  bollingerBAndsHistoryLength: number;
  stochasticOscillatorKPeriod: number;
  stochasticOscillatorDPeriod: number;
  stochasticOscillatorSmoothing: number;
  stochasticOscillatorOverboughtTreshold: number;
  stochasticOscillatorOversoldTreshold: number;
  stochasticRSIOverboughtTreshold: number;
  stochasticRSIOversoldTreshold: number;
  stochasticRSILengthRSI: number;
  stochasticRSILengthStoch: number;
  stochasticRSISmoothK: number;
  stochasticRSISmoothD: number;
  shortEma: number;
  longEma: number;
  fastMacd: number;
  slowMacd: number;
  signalMacd: number;
  source: string;
  rsiLength: number;
  rsiSmoothing: number;
  rsiSmoothingType: string;
  rsiHistoryLength: number;
  useSMA: boolean;
  useEMA: boolean; 
  useMACD: boolean; 
  useRSI: boolean;
  useATR: boolean;
  useBollingerBands: boolean;
  useStochasticOscillator: boolean;
  useStochasticRSI: boolean;
  startingMaxBuyAmount: number;
  startingMaxSellAmount: number;
  closePercentage: number;
  overboughtTreshold: number;
  oversoldTreshold: number;
  maxOrderAge: number;
  tradeFee: number;
  pairMinVolume?: number;
  pairMinPriceChange?: number;
  holdUntilPositiveTrade?: boolean;
  minimumProfitSell: number;
  minimumProfitBuy: number;
  license: string;
  debug: boolean;
  discordEnabled: boolean,
  discordBotToken: string,
  discordApplicationID: string,
  discordServerID: string,
  discordChannelID:  string,
  openaiApiKey: string,
  openaiModel: string,
  openaiHistoryLength: number,
  openaiOverwrite: boolean,
  [key: string]: string | string[] | number | boolean | undefined | number; // Index signature
}

// Parse command-line arguments and return options object
export function parseArgs(args: string[]): ConfigOptions {
  
  // If command-line arguments provided, parse them
  const options: ConfigOptions = {
    
    // Binance
    apiKey: process.env.API_KEY || '',
    apiSecret: process.env.API_SECRET || '',

    // Hoobot
    license: process.env.LICENSE || "",
    mode: process.env.MODE as BotMode || 'algorithmic',
    symbols: process.env.SYMBOLS ? process.env.SYMBOLS.replace(/ /g, "").split(",") : [],
    candlestickInterval: process.env.CANDLESTICK_INTERVAL as CandlestickInterval || "1m",
    source: process.env.SOURCE || "close",
    consoleUpdate: process.env.CONSOLE_UPDATE || "final",
    
    // Indicators to use
    useEMA: process.env.USE_EMA === "true" ? true : false,
    useMACD: process.env.USE_MACD === "true" ? true : false,
    useRSI: process.env.USE_RSI === "true" ? true : false,
    useSMA: process.env.USE_SMA === "true" ? true : false,
    useATR: process.env.USE_ATR === "true" ? true : false,
    useBollingerBands: process.env.USE_BOLLINGER_BANDS === "true" ? true : false,
    useStochasticOscillator: process.env.USE_STOCHASTIC_OSCILLATOR === "true" ? true : false,
    useStochasticRSI: process.env.USE_STOCHASTIC_RSI === "true" ? true : false,
    
    // Indicator parameters
    smaLength: parseFloat(process.env.SMA_LENGTH) || 7,
    shortEma: parseFloat(process.env.EMA_SHORT!) || 7,
    longEma: parseFloat(process.env.EMA_LONG!) || 26,
    fastMacd: parseFloat(process.env.MACD_FAST!) || 7,
    slowMacd: parseFloat(process.env.MACD_SLOW!) || 26,
    signalMacd: parseFloat(process.env.MACD_SIGNAL!) || 9,
    rsiLength: parseFloat(process.env.RSI_LENGTH!) || 9,
    rsiSmoothing: parseFloat(process.env.RSI_SMOOTHING!) || 12,
    rsiSmoothingType: process.env.RSI_SMOOTHING_TYPE || "SMA",
    rsiHistoryLength: parseFloat(process.env.RSI_HISTORY_LENGTH!) || 5,
    overboughtTreshold: parseFloat(process.env.RSI_OVERBOUGHT_TRESHOLD!) || 70,
    oversoldTreshold: parseFloat(process.env.RSI_OVERSOLD_TRESHOLD!) || 30,
    atrLength: parseFloat(process.env.ATR_LENGTH) || 14,
    bollingerBandsLength: parseFloat(process.env.BOLLINGER_BANDS_LENGTH) || 20,
    bollingerBandsMultiplier: parseFloat(process.env.BOLLINGER_BANDS_MULTIPLIER) || 2,
    bollingerBandsAverageType: process.env.BOLLINGER_BANDS_AVERAGE_TYPE || 'EMA',
    bollingerBAndsHistoryLength: parseFloat(process.env.BOLLINGER_BANDS_HISTORY_LENGTH) || 5,

    stochasticOscillatorKPeriod: parseFloat(process.env.STOCHASTIC_OSCILLATOR_KPERIOD) || 14,
    stochasticOscillatorDPeriod: parseFloat(process.env.STOCHASTIC_OSCILLATOR_DPERIOD) || 1,
    stochasticOscillatorSmoothing: parseFloat(process.env.STOCHASTIC_OSCILLATOR_SMOOTHING) || 3,
    stochasticOscillatorOverboughtTreshold: parseFloat(process.env.STOCHASTIC_OSCILLATOR_OVERBOUGHT_TRESHOLD) || 80,
    stochasticOscillatorOversoldTreshold: parseFloat(process.env.STOCHASTIC_OSCILLATOR_OVERSOLD_TRESHOLD) || 20,
    stochasticRSILengthRSI: parseFloat(process.env.STOCHASTIC_RSI_LENGTH_RSI) || 14,
    stochasticRSILengthStoch: parseFloat(process.env.STOCHASTIC_RSI_LENGTH_STOCHASTIC) || 14,
    stochasticRSISmoothK: parseFloat(process.env.STOCHASTIC_RSI_SMOOTH_K) || 3,
    stochasticRSISmoothD: parseFloat(process.env.STOCHASTIC_RSI_SMOOTH_D) || 3,
    stochasticRSIOverboughtTreshold: parseFloat(process.env.STOCHASTIC_RSI_OVERBOUGHT_TRESHOLD) || 80,
    stochasticRSIOversoldTreshold: parseFloat(process.env.STOCHASTIC_RSI_OVERSOLD_TRESHOLD) || 20,
    
    // Limits
    startingMaxBuyAmount: parseFloat(process.env.STARTING_MAX_BUY_AMOUNT!) || 0,
    startingMaxSellAmount: parseFloat(process.env.STARTING_MAX_SELL_AMOUNT!) || 0,
    closePercentage: parseFloat(process.env.CLOSE_PERCENTAGE!) || 1,
    maxOrderAge: parseFloat(process.env.MAX_ORDER_AGE_SECONDS!) || 60,
    tradeFee: parseFloat(process.env.TRADE_FEE_PERCENTAGE!) || 0.075,
    holdUntilPositiveTrade: process.env.HOLD_UNTIL_POSITIVE_TRADE === "true" ? true : false,
    minimumProfitSell: parseFloat(process.env.MINIMUM_PROFIT_SELL!) || 0.01,
    minimumProfitBuy: parseFloat(process.env.MINIMUM_PROFIT_BUY!) || 0.01,
    
    // Discord
    discordEnabled: process.env.DISCORD_ENABLED === "true" ? true : false || false,
    discordBotToken: process.env.DISCORD_BOT_TOKEN || "",
    discordApplicationID: process.env.DISCORD_APPLICATION_ID || "",
    discordServerID: process.env.DISCORD_SERVER_ID || "",
    discordChannelID:  process.env.DISCORD_CHANNEL_ID || "",

    // OpenAI
    openaiApiKey: process.env.OPENAI_API_KEY || undefined,
    openaiModel: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
    openaiHistoryLength: parseFloat(process.env.OPENAI_HISTORY_LENGTH!) || 5,
    openaiOverwrite:  process.env.OPENAI_OVERWRITE === "true" ? true : false || false,
    
    // Developer
    debug: process.env.DEBUG === "true" ? true : false || false,

    // Arbitrage
    pairMinVolume: parseFloat(process.env.PAIR_MIN_VOLUME!) || 100,
    pairMinPriceChange: parseFloat(process.env.PAIR_MIN_PRICE_CHANGE!) || 5,
  };
  if (args.length === 0) {
    // If no command-line arguments, read options from .env file
    return options;
  }
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