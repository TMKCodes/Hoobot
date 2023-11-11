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

import { Client } from "discord.js";
import Binance from "node-binance-api";
import { getOrderBook, openOrders } from "../Binance/Orders";
import { Filter } from "../Binance/Filters";
import { ConfigOptions, getSecondsFromInterval } from "../Utilities/args";
import { ConsoleLogger } from "../Utilities/consoleLogger";
import { Balances } from "../Binance/Balances";
import { calculateEMA, logEMASignals, ema } from "../Indicators/EMA";
import { calculateRSI, logRSISignals } from "../Indicators/RSI";
import { calculateMACD, logMACDSignals, macd } from "../Indicators/MACD";
import { Candlestick } from "../Binance/Candlesticks";
import { calculateSMA, logSMASignals, sma } from "../Indicators/SMA";
import { calculateATR, logATRSignals } from "../Indicators/ATR";
import { calculateBollingerBands, logBollingerBandsSignals } from "../Indicators/BollingerBands";
import { calculateStochasticOscillator, calculateStochasticRSI, logStochasticOscillatorSignals, logStochasticRSISignals } from "../Indicators/StochasticOscillator";
import { buy, calculateROI, getTradeHistory, sell } from "../Binance/Trades";
import { tradeDirection } from "./tradeDirection";
import { calculateOBV, logOBVSignals } from "../Indicators/OBV";
import { calculateCMF, logCMFSignals } from "../Indicators/CMF";
import { calculateAverage, logAverageSignals } from "../Indicators/Average";
import { symbolFilters } from "../..";

export interface Indicators {
  avg?: number;
  sma?: number[];
  ema: ema;
  macd?: macd;
  rsi?: number[];
  atr?: number[];
  bollingerBands?: [number[], number[], number[]];
  stochasticOscillator?: [number[], number[]];
  stochasticRSI?: [number[], number[]];
  obv?: number[];
  cmf?: number[];
}

export const reverseSign = (number: number) => {
  return -number;
}

const placeTrade = async (
  discord: Client,
  binance: Binance,
  consoleLogger: ConsoleLogger,
  symbol: string,
  candlesticks: Candlestick[],
  balances: Balances,
  filter: Filter,
  options: ConfigOptions,
) => {
  if (options.tradeHistory[symbol.split("/").join("")]?.length > 0) {
    const lastTradeTime = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 1].time;
    const currentTime = Date.now();
    const lastTradeDate = new Date(lastTradeTime);
    const timeDifferenceInSeconds = (currentTime - lastTradeTime) / 1000;
    consoleLogger.push("Last trade datetime:", lastTradeDate.toLocaleString("fi-FI"));
    if (timeDifferenceInSeconds < getSecondsFromInterval(options.candlestickInterval)) {
      return false; 
    }
  } else {
    consoleLogger.push("Last trade datetime:", "No trades done yet.");
  }
  if (await openOrders(binance, symbol) !== false) {
    return false;
  }
  const orderBook = await getOrderBook(binance, symbol);
  const baseBalance = balances[symbol.split("/")[0]];
  const quoteBalance = balances[symbol.split("/")[1]];
  const indicators = await calculateIndicators(consoleLogger, candlesticks, options);
  const direction = await tradeDirection(binance, consoleLogger, symbol.split("/").join(""), quoteBalance, baseBalance, orderBook, candlesticks, indicators, options, filter);
  if (direction === 'SELL') {
    return sell(discord, binance, consoleLogger, symbol, orderBook, filter, options, baseBalance);
  } else if (direction === 'BUY') {
    return buy(discord, binance, consoleLogger, symbol, orderBook, filter, options, quoteBalance)
  } else {
    return false;
  }
}

export const calculateIndicators = async (
  consoleLogger: ConsoleLogger,
  candlesticks: Candlestick[],
  options: ConfigOptions
) => {
  const indicators: Indicators = {
    sma: undefined,
    ema: undefined,
    macd: undefined,
    atr: undefined,
    bollingerBands: undefined,
    stochasticOscillator: undefined,
    stochasticRSI: undefined,
  };
  indicators.avg = calculateAverage(candlesticks);
  logAverageSignals(consoleLogger, candlesticks, indicators.avg);
  indicators.sma = calculateSMA(candlesticks, options.smaLength, options.source);
  if (options.useSMA) {
    logSMASignals(consoleLogger, indicators.sma); 
  }
  indicators.ema = {
    short: calculateEMA(candlesticks, options.shortEma, options.source),
    long: calculateEMA(candlesticks, options.longEma, options.source),
  }
  logEMASignals(consoleLogger, indicators.ema.short, indicators.ema.long);
  if (options.useRSI) {
    indicators.rsi = calculateRSI(candlesticks, options.rsiLength, options.rsiSmoothingType, options.rsiSmoothing, options.source, options.rsiHistoryLength);
    logRSISignals(consoleLogger, indicators.rsi, options);
  }
  if (options.useMACD) {
    indicators.macd = calculateMACD(candlesticks, options.fastMacd, options.slowMacd, options.signalMacd, options.source);
    logMACDSignals(consoleLogger, indicators.macd);
  }
  if (options.useATR) {
    indicators.atr = calculateATR(candlesticks, options.atrLength, options.source);
    logATRSignals(consoleLogger, indicators.atr);
  }
  if (options.useBollingerBands) {
    indicators.bollingerBands = calculateBollingerBands(candlesticks, options.bollingerBandsAverageType, options.bollingerBandsLength, options.bollingerBandsMultiplier, options.source);
    logBollingerBandsSignals(consoleLogger, candlesticks, indicators.bollingerBands);
  }
  if (options.useStochasticOscillator) {
    indicators.stochasticOscillator = calculateStochasticOscillator(candlesticks, options.stochasticOscillatorKPeriod, options.stochasticOscillatorDPeriod, options.stochasticOscillatorSmoothing, options.source);
    logStochasticOscillatorSignals(consoleLogger, indicators.stochasticOscillator);
  }
  if (options.useStochasticRSI) {
    indicators.stochasticRSI = calculateStochasticRSI(candlesticks, options.stochasticRSILengthRSI, options.stochasticRSILengthStoch, options.stochasticRSISmoothK, options.stochasticRSISmoothD, options.rsiSmoothingType, options.source);
    logStochasticRSISignals(consoleLogger, indicators.stochasticRSI);
  }
  if (options.useOBV) {
    indicators.obv = calculateOBV(candlesticks);
    logOBVSignals(consoleLogger, candlesticks, indicators.obv);
  }
  if (options.useCMF) {
    indicators.cmf = calculateCMF(candlesticks, options.cmfLength);
    logCMFSignals(consoleLogger, indicators.cmf, options);
  }
  return indicators;
}

export const algorithmic = async (
  discord: Client, 
  binance: Binance, 
  consoleLogger: ConsoleLogger, 
  symbol: string, 
  balances: Balances,
  candlesticks: Candlestick[], 
  options: ConfigOptions
) => {
  try {
    const filter = symbolFilters[symbol.split("/").join("")];
    const latestCandle = candlesticks[candlesticks.length - 1];
    const prevCandle = candlesticks[candlesticks.length - 2];
    const candleTime = (new Date(latestCandle.time)).toLocaleString('fi-FI');
    consoleLogger.push("Symbol", symbol);
    consoleLogger.push(`Amount of candles`, candlesticks.length);
    consoleLogger.push(`Candlestick time`, candleTime);
    if (latestCandle.close > latestCandle.open) {
      consoleLogger.push(`Candlestick Color`, "Green");
    } else {
      consoleLogger.push(`Candlestick Color`, "Red");
    }
    if (prevCandle) {
      if (latestCandle.close > prevCandle.close) {
        consoleLogger.push(`Candlesticks Direction`, "Rising");
      } else if (latestCandle.close < prevCandle.close) {
        consoleLogger.push(`Candlesticks Direction`, "Dropping");
      } else {
        consoleLogger.push(`Candlesticks Direction`, "Stagnant");
      }
    }
    consoleLogger.push(`Candlestick Open`, latestCandle.open.toFixed(7));
    consoleLogger.push(`Candlestick High`, latestCandle.high.toFixed(7));
    consoleLogger.push(`Candlestick Low`, latestCandle.low.toFixed(7));
    consoleLogger.push(`Candlestick Close`, latestCandle.close.toFixed(7));
    if (options.startingMaxBuyAmount > 0 && options.startingMaxBuyAmount !== undefined) {
      consoleLogger.push("Max buy amount", options.startingMaxBuyAmount + " " + symbol.split("/")[1]);
    }
    if (options.startingMaxSellAmount > 0 && options.startingMaxBuyAmount !== undefined) {
      consoleLogger.push("Max sell amount", options.startingMaxSellAmount + " " + symbol.split("/")[1]);
    }
    if (options.tradeHistory[symbol.split("/").join("")] === undefined) {
      options.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(binance, symbol, options);
    }
    const roi = calculateROI(options.tradeHistory[symbol.split("/").join("")]);
    consoleLogger.push("Profit in Base", roi[0].toFixed(7) + " " + symbol.split("/")[0]);
    consoleLogger.push("Profit in Quote", roi[1].toFixed(7) + " " + symbol.split("/")[1]);
    if (candlesticks.length < options.longEma) {
      consoleLogger.push(`warning`, `Not enough candlesticks for calculations, please wait.`);
      return false;
    }
    consoleLogger.push("Balance " + symbol.split("/")[0], balances[symbol.split("/")[0]].toFixed(7));
    consoleLogger.push("Balance " + symbol.split("/")[1], balances[symbol.split("/")[1]].toFixed(7));
    const startTime = Date.now();
    const placedTrade = await placeTrade(discord, binance, consoleLogger, symbol, candlesticks, balances, filter, options);
    const stopTime = Date.now();
    consoleLogger.push(`Calculation speed (ms)`, stopTime - startTime);
    if (options.consoleUpdate === "trade/final" && (placedTrade !== false || latestCandle.isFinal)) {
      consoleLogger.print();
      consoleLogger.flush();
    } else if (options.consoleUpdate === "trade/final" && (placedTrade === false && latestCandle.isFinal === false)) {
      consoleLogger.flush();
    } else if (options.consoleUpdate === "trade" && placedTrade !== false) {
      consoleLogger.print();
      consoleLogger.flush();
    } else if (options.consoleUpdate === "trade" && placedTrade === false) {
      consoleLogger.flush();
    } else if (options.consoleUpdate === "final" && latestCandle.isFinal === true) {
      consoleLogger.print();
      consoleLogger.flush();
    } else if (options.consoleUpdate === "final" && latestCandle.isFinal === false) {
      consoleLogger.flush();
    } else {
      consoleLogger.print();
      consoleLogger.flush();
    }
  } catch (error: any) {
    console.error(JSON.stringify(error));
  }
}