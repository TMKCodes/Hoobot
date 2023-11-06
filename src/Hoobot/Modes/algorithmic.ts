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
import { handleOpenOrders } from "../Binance/orders";
import { filter } from "../Binance/filters";
import { ConfigOptions, getSecondsFromInterval } from "../Utilities/args";
import { ConsoleLogger } from "../Utilities/consoleLogger";
import { Balances, getCurrentBalances } from "../Binance/balances";
import { calculateEMA, logEMASignals, ema } from "../Indicators/EMA";
import { calculateRSI, logRSISignals } from "../Indicators/RSI";
import { calculateMACD, logMACDSignals, macd } from "../Indicators/MACD";
import { candlestick } from "../Binance/candlesticks";
import { calculateSMA, logSMASignals, sma } from "../Indicators/SMA";
import { calculateATR, logATRSignals } from "../Indicators/ATR";
import { calculateBollingerBands, logBollingerBandsSignals } from "../Indicators/BollingerBands";
import { calculateStochasticOscillator, calculateStochasticRSI, logStochasticOscillatorSignals, logStochasticRSISignals } from "../Indicators/StochasticOscillator";
import { buy, sell } from "../Binance/trade";
import { tradeDirection } from "./tradeDirection";
import { calculateOBV, logOBVSignals } from "../Indicators/OBV";
import { calculateCMF, logCMFSignals } from "../Indicators/CMF";



export interface Indicators {
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

export const calculatePercentageDifference = (oldNumber: number, newNumber: number): number => {
  const difference = newNumber - oldNumber;
  const percentageDifference = (difference / Math.abs(oldNumber)) * 100;
  return percentageDifference;
}

export const reverseSign = (number: number) => {
  return -number;
}

// Place buy or sell order based on EMA difference
async function placeTrade(
  discord: Client,
  binance: Binance,
  consoleLogger: ConsoleLogger,
  symbol: string,
  candlesticks: candlestick[],
  indicators: Indicators,
  balances: Balances,
  orderBook: any,
  filter: filter,
  options: ConfigOptions,
) {
  if (options.tradeHistory[symbol.split("/").join("")]?.length > 0) {
    const timeDifferenceInSeconds = (Date.now() - options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 1].time) / 1000;
    consoleLogger.push("Time since last trade:", timeDifferenceInSeconds);
    if (timeDifferenceInSeconds < getSecondsFromInterval(options.candlestickInterval)) {
      return false; // don't trade since the last trade was too new.
    }
  }
  const quoteBalance = balances[symbol.split("/")[0]];
  const baseBalance = balances[symbol.split("/")[1]];
  const direction = await tradeDirection(binance, consoleLogger, symbol.split("/").join(""), baseBalance, quoteBalance, orderBook, candlesticks, indicators, options);
  if (direction === "RECHECK BALANCES") {
    balances = await getCurrentBalances(binance);
    return false;
  } else if (direction === 'SELL') {
    return sell(discord, binance, consoleLogger, symbol, orderBook, filter, options, quoteBalance);
  } else if (direction === 'BUY') {
    return buy(discord, binance, consoleLogger, symbol, orderBook, filter, options, baseBalance)
  } else {
    return false;
  }
}

export async function calculateIndicators(
  consoleLogger: ConsoleLogger,
  candlesticks: candlestick[],
  options: ConfigOptions) {
  const indicators: Indicators = {
    sma: undefined,
    ema: undefined,
    macd: undefined,
    atr: undefined,
    bollingerBands: undefined,
    stochasticOscillator: undefined,
    stochasticRSI: undefined,
  };
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
    logCMFSignals(consoleLogger, indicators.cmf);
  }
  return indicators;
}


function calculateROI(tradeHistory: any[]) {
  let lastTrade = tradeHistory[0];
  // Calculate ROI based on the historical data
  let totalProfit = 0;
  let trades = 0;
  for (let i = 1; i < tradeHistory.length; i++) {
    if (tradeHistory[i].isBuyer) {
      // Calculate profit for the buy trade
      const oldPrice = parseFloat(lastTrade.price);
      const newPrice = parseFloat(tradeHistory[i].price);
      const profit = calculatePercentageDifference(oldPrice, newPrice);
      if (tradeHistory[i + 1] !== undefined) {
        if (tradeHistory[i].price < tradeHistory[i + 1]?.price) {
          totalProfit += reverseSign(profit);
        }
      } else {
        totalProfit += reverseSign(profit);
      }
    } else {
      // Calculate profit for the sell trade
      const oldPrice = parseFloat(lastTrade.price);
      const newPrice = parseFloat(tradeHistory[i].price);
      const profit = calculatePercentageDifference(oldPrice, newPrice); 
      totalProfit += profit;
    }
    if (parseFloat(tradeHistory[i].commission) > 0) {
      if (tradeHistory[i].commissionAsset === "BNB") {
        totalProfit -= 0.075
      } else {
        totalProfit -= 0.1
      }
    }
    trades++;
    lastTrade = tradeHistory[i]; // Update lastTrade for the next iteration
  }
  return [ totalProfit, trades ];
} 

export async function algorithmic(
  discord: Client, 
  binance: Binance, 
  consoleLogger: ConsoleLogger, 
  symbol: string, 
  balances: Balances,
  candlesticks: candlestick[], 
  filter: filter, 
  options: ConfigOptions) {
  try {
    const latestCandle = candlesticks[candlesticks.length - 1];
    const prevCandle = candlesticks[candlesticks.length - 2];
    const candleTime = (new Date(latestCandle.time)).toLocaleString('fi-FI');
    // Push candlestick time and last closeprice.
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
      consoleLogger.push("Max sell amount", options.startingMaxSellAmount + " " + symbol.split("/")[0]);
    }
    if (options.tradeHistory[symbol.split("/").join("")] === undefined) {
      options.tradeHistory[symbol.split("/").join("")] = (await binance.trades(symbol.split("/").join("")));
    }
    const roi = calculateROI(options.tradeHistory[symbol.split("/").join("")]);
    consoleLogger.push("Return of investment", roi[0].toFixed(2));
    consoleLogger.push("Trades", roi[1]);
    // confirm that there are more candlesticks than longEma time period is.
    if (candlesticks.length < options.longEma) {
      consoleLogger.push(`warning`, `Not enough candlesticks for calculations, please wait.`);
      return false;
    }
    const orderBook = await binance.depth(symbol.split("/").join(""));
    // Check if there are open orders, before going further.
    let openOrders: any[] = [];
    openOrders = await binance.openOrders(symbol.split("/").join(""));
    if (openOrders.length > 0) {
      consoleLogger.push(`warning`, `There are open orders. Waiting for them to complete or cancelling them.`);
      return await handleOpenOrders(discord, binance, symbol.split("/").join(""), openOrders, orderBook, options, consoleLogger);
    }
    // Log the symbol
    consoleLogger.push("Balance " + symbol.split("/")[0], balances[symbol.split("/")[0]].toFixed(7));
    consoleLogger.push("Balance " + symbol.split("/")[1], balances[symbol.split("/")[1]].toFixed(7));
    const startTime = Date.now();
    const indicators = await calculateIndicators(consoleLogger, candlesticks, options);
    await placeTrade(discord, binance, consoleLogger, symbol, candlesticks, indicators, balances, orderBook, filter, options);
    const stopTime = Date.now();
    consoleLogger.push(`Calculation speed (ms)`, stopTime - startTime);
    if (options.consoleUpdate === "final" && latestCandle.isFinal === true) {
      consoleLogger.print();
      consoleLogger.flush();
    } else if(options.consoleUpdate === "final" && latestCandle.isFinal === false) {
      consoleLogger.flush();
    } else {
      consoleLogger.print();
      consoleLogger.flush();
    }
  } catch (error: any) {
    console.error(JSON.stringify(error));
  }
}