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
import { Filter } from "../Binance/Filters";
import { ConfigOptions, getSecondsFromInterval } from "../Utilities/args";
import { ConsoleLogger } from "../Utilities/consoleLogger";
import { calculateEMA, logEMASignals, ema, checkEMASignals } from "../Indicators/EMA";
import { calculateRSI, checkRSISignals, logRSISignals } from "../Indicators/RSI";
import { calculateMACD, checkMACDSignals, logMACDSignals, macd } from "../Indicators/MACD";
import {  Candlesticks } from "../Binance/Candlesticks";
import { calculateSMA, checkSMASignals, logSMASignals, sma } from "../Indicators/SMA";
import { calculateATR, logATRSignals } from "../Indicators/ATR";
import { calculateBollingerBands, checkBollingerBandsSignals, logBollingerBandsSignals } from "../Indicators/BollingerBands";
import { calculateStochasticOscillator, calculateStochasticRSI, checkStochasticOscillatorSignals, checkStochasticRSISignals, logStochasticOscillatorSignals, logStochasticRSISignals } from "../Indicators/StochasticOscillator";
import { buy, calculateROI, getTradeHistory, sell } from "../Binance/Trades";
import { calculateOBV, checkOBVSignals, logOBVSignals } from "../Indicators/OBV";
import { calculateCMF, checkCMFSignals, logCMFSignals } from "../Indicators/CMF";
import { calculateAverage, logAverageSignals } from "../Indicators/Average";
import { symbolFilters } from "../..";
import { checkGPTSignals } from "../Indicators/GPT";
import { Orderbook } from "../Binance/Orderbook";
import { checkProfitSignals } from "../Indicators/Profit";
import { checkBalanceSignals } from "../Indicators/Balance";
import { checkPanicProfit } from "../Indicators/Panic";
import { dir } from "console";
import { sign } from "crypto";

export interface Indicators {
  avg?: {
    [time: string]:  number;
  },
  sma?: {
    [time: string]:  number[];
  },
  ema?: {
    [time: string]: ema;
  },
  macd?:  {
    [time: string]: macd;
  },
  rsi?:  {
    [time: string]: number[];
  },
  atr?:  {
    [time: string]: number[];
  },
  bollingerBands?:  {
    [time: string]: [number[], number[], number[]];
  },
  stochasticOscillator?:  {
    [time: string]: [number[], number[]];
  },
  stochasticRSI?:  {
    [time: string]: [number[], number[]];
  },
  obv?:  {
    [time: string]: number[];
  },
  cmf?:  {
    [time: string]: number[];
  },
}

export const reverseSign = (number: number) => {
  return -number;
}

export const tradeDirection = async (
  consoleLogger: ConsoleLogger,
  symbol: string,
  orderBook: Orderbook,
  candlesticks: Candlesticks, 
  indicators: Indicators,
  options: ConfigOptions,
  filter: Filter,
) => {
  const startTime = Date.now();
  const timeframes = Object.keys(candlesticks[symbol.split("/").join("")]);
  let direction = 'TORN';
  const directions = {
    BUY: 0,
    SELL: 0,
    HOLD: 0,
  };
  let actions = ['BUY', 'SELL', 'HOLD'];
  const profit = checkProfitSignals(consoleLogger, symbol, orderBook, options);
  const next = await checkBalanceSignals(consoleLogger, symbol, candlesticks[symbol.split("/").join("")][timeframes[0]][candlesticks[symbol.split("/").join("")][timeframes[0]].length - 1].close, options, filter);
  for (let timeframeIndex = 0; timeframeIndex < timeframes.length; timeframeIndex++) {
    const weights = {
      SMAWeight: options.SMAWeight,
      EMAWeight: options.EMAWeight,
      MACDWeight: options.MACDWeight,
      RSIWeight: options.RSIWeight,
      StochasticOscillatorWeight: options.StochasticOscillatorWeight,
      StochasticRSIWeight: options.StochasticRSIWeight,
      BollingerBandsWeight: options.bollingerBandsWeight,
      OBVWeight: options.OBVWeight,
      CMFWeight: options.CMFWeight,
    }
    const checks = {
      SMA: checkSMASignals(consoleLogger, indicators.sma[timeframes[timeframeIndex]], options),
      EMA: checkEMASignals(consoleLogger, indicators.ema[timeframes[timeframeIndex]], options),
      MACD: checkMACDSignals(consoleLogger, indicators.macd[timeframes[timeframeIndex]], options),
      RSI: checkRSISignals(consoleLogger, indicators.rsi[timeframes[timeframeIndex]], options),
      StochasticOscillator: checkStochasticOscillatorSignals(consoleLogger, indicators.stochasticOscillator[timeframes[timeframeIndex]], options),
      StochasticRSI: checkStochasticRSISignals(consoleLogger, indicators.stochasticRSI[timeframes[timeframeIndex]], options),
      BollingerBands: checkBollingerBandsSignals(consoleLogger, candlesticks[symbol.split("/").join("")][timeframes[timeframeIndex]], indicators.bollingerBands[timeframes[timeframeIndex]], options),
      OBV: checkOBVSignals(consoleLogger, candlesticks[symbol.split("/").join("")][timeframes[timeframeIndex]], indicators.obv[timeframes[timeframeIndex]], options),
      CMF: checkCMFSignals(consoleLogger, indicators.cmf[timeframes[timeframeIndex]], options),
    }
    const keys = Object.keys(checks)
    .filter(check => checks[check] !== 'SKIP');
    consoleLogger.push(`Indicator checks ${timeframes[timeframeIndex]}`, checks);
    for (let actionsIndex = 0; actionsIndex < actions.length; actionsIndex++) {
      let weightedSum = 0;
      let totalWeight = 0;
      for (let keysIndex = 0; keysIndex < keys.length; keysIndex++) {
        const weight = weights[`${keys[keysIndex]}Weight`];
        const signal = checks[keys[keysIndex]];
        if (signal === actions[actionsIndex]) {
          weightedSum += weight;
        }
        totalWeight += weight;
      }
      if (totalWeight > 0) {
        const percentage = (weightedSum / totalWeight) * 100 / timeframes.length;
        directions[actions[actionsIndex]] += percentage;
      }
    }
  }
  consoleLogger.push("Directions", directions);
  actions = actions.filter(action => directions[action] !== undefined);
  for (let actionsIndex = 0; actionsIndex < actions.length; actionsIndex++) {
    if((profit == actions[actionsIndex] || profit === 'SKIP') && next == actions[actionsIndex]) {
      if (directions[actions[actionsIndex]] >= options.directionAgreement) {
        direction = actions[actionsIndex];
        break;
      }
    }
  }
  if (options.panicProfitMinimum > 0) {
    const panic = checkPanicProfit(consoleLogger, symbol, orderBook, options, filter);
    if (panic !== 'SKIP' && panic !== direction) {
      direction = panic;
    } 
  }
  if (options.useGPT) {
    const checkGPT = await checkGPTSignals(consoleLogger, symbol, candlesticks, indicators, options);
    if (options.openaiOverwrite === true) {
      direction = checkGPT;
    } else {
      if (checkGPT !== "SKIP" && checkGPT !== direction) {
        direction = 'HOLD';
      }
    }
  }
  consoleLogger.push(`TRADE Direction`, direction);
  const stopTime = Date.now();
  consoleLogger.push(`Time to decide direction (ms)`, stopTime - startTime);
  return direction;
}

export const placeTrade = async (
  discord: Client,
  binance: Binance,
  consoleLogger: ConsoleLogger,
  symbol: string,
  candlesticks: Candlesticks,
  filter: Filter,
  options: ConfigOptions,
) => {
  const startTime = Date.now();
  if (options.tradeHistory[symbol.split("/").join("")]?.length > 0) {
    const lastTradeTime = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 1].time;
    const currentTime = Date.now();
    const lastTradeDate = new Date(lastTradeTime);
    const timeDifferenceInSeconds = (currentTime - lastTradeTime) / 1000;
    consoleLogger.push("Last trade datetime:", lastTradeDate.toLocaleString("fi-FI"));
    if (timeDifferenceInSeconds < getSecondsFromInterval(options.candlestickInterval[0])) {
      return false; 
    }
  } else {
    consoleLogger.push("Last trade datetime:", "No trades done yet.");
  }
  const orderBook = options.orderbooks[symbol.split("/").join("")];
  consoleLogger.push("ASK", Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b)[0]);
  consoleLogger.push("BID", Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => b - a)[0]);
  const indicators = await calculateIndicators(consoleLogger, symbol, candlesticks, options);
  const direction = await tradeDirection(consoleLogger, symbol, orderBook, candlesticks, indicators, options, filter);
  const stopTime = Date.now();
  consoleLogger.push(`Time to place a trade (ms)`, stopTime - startTime);
  if (direction === 'SELL') {
    return sell(discord, binance, consoleLogger, symbol, orderBook, filter, options);
  } else if (direction === 'BUY') {
    return buy(discord, binance, consoleLogger, symbol, orderBook, filter, options);
  } else {
    return false;
  }
}

export const calculateIndicators = async (
  consoleLogger: ConsoleLogger,
  symbol: string,
  candlesticks: Candlesticks,
  options: ConfigOptions
) => {
  const indicators: Indicators = {
    avg: {},
    sma: {},
    ema: {},
    macd: {},
    rsi: {},
    atr: {},
    bollingerBands: {},
    stochasticOscillator: {},
    stochasticRSI: {},
    obv: {},
    cmf: {},
  };
  const timeframes = Object.keys(candlesticks[symbol.split("/").join("")]);
  for (let i = 0; i < timeframes.length; i++) {
    indicators.avg[timeframes[i]] = calculateAverage(candlesticks[symbol.split("/").join("")][timeframes[i]]);
    logAverageSignals(consoleLogger, candlesticks[symbol.split("/").join("")][timeframes[i]], indicators.avg[timeframes[i]]);
    indicators.sma[timeframes[i]] = calculateSMA(candlesticks[symbol.split("/").join("")][timeframes[i]], options.smaLength, options.source);
    if (options.useSMA) {
      logSMASignals(consoleLogger, indicators.sma[timeframes[i]]); 
    }
    indicators.ema[timeframes[i]] = {
      short: calculateEMA(candlesticks[symbol.split("/").join("")][timeframes[i]], options.shortEma, options.source),
      long: calculateEMA(candlesticks[symbol.split("/").join("")][timeframes[i]], options.longEma, options.source),
    }
    logEMASignals(consoleLogger, indicators.ema[timeframes[i]]);
    if (options.useRSI) {
      indicators.rsi[timeframes[i]] = calculateRSI(candlesticks[symbol.split("/").join("")][timeframes[i]], options.rsiLength, options.rsiSmoothingType, options.rsiSmoothing, options.source, options.rsiHistoryLength);
      logRSISignals(consoleLogger, indicators.rsi[timeframes[i]], options);
    }
    if (options.useMACD) {
      indicators.macd[timeframes[i]] = calculateMACD(candlesticks[symbol.split("/").join("")][timeframes[i]], options.fastMacd, options.slowMacd, options.signalMacd, options.source);
      logMACDSignals(consoleLogger, indicators.macd[timeframes[i]]);
    }
    if (options.useATR) {
      indicators.atr[timeframes[i]] = calculateATR(candlesticks[symbol.split("/").join("")][timeframes[i]], options.atrLength, options.source);
      logATRSignals(consoleLogger, indicators.atr[timeframes[i]]);
    }
    if (options.useBollingerBands) {
      indicators.bollingerBands[timeframes[i]] = calculateBollingerBands(candlesticks[symbol.split("/").join("")][timeframes[i]], options.bollingerBandsAverageType, options.bollingerBandsLength, options.bollingerBandsMultiplier, options.source);
      logBollingerBandsSignals(consoleLogger, candlesticks[symbol.split("/").join("")][timeframes[i]], indicators.bollingerBands[timeframes[i]]);
    }
    if (options.useStochasticOscillator) {
      indicators.stochasticOscillator[timeframes[i]] = calculateStochasticOscillator(candlesticks[symbol.split("/").join("")][timeframes[i]], options.stochasticOscillatorKPeriod, options.stochasticOscillatorDPeriod, options.stochasticOscillatorSmoothing, options.source);
      logStochasticOscillatorSignals(consoleLogger, indicators.stochasticOscillator[timeframes[i]]);
    }
    if (options.useStochasticRSI) {
      indicators.stochasticRSI[timeframes[i]] = calculateStochasticRSI(candlesticks[symbol.split("/").join("")][timeframes[i]], options.stochasticRSILengthRSI, options.stochasticRSILengthStoch, options.stochasticRSISmoothK, options.stochasticRSISmoothD, options.rsiSmoothingType, options.source);
      logStochasticRSISignals(consoleLogger, indicators.stochasticRSI[timeframes[i]]);
    }
    if (options.useOBV) {
      indicators.obv[timeframes[i]] = calculateOBV(candlesticks[symbol.split("/").join("")][timeframes[i]]);
      logOBVSignals(consoleLogger, candlesticks[symbol.split("/").join("")][timeframes[i]], indicators.obv[timeframes[i]]);
    }
    if (options.useCMF) {
      indicators.cmf[timeframes[i]] = calculateCMF(candlesticks[symbol.split("/").join("")][timeframes[i]], options.cmfLength);
      logCMFSignals(consoleLogger, indicators.cmf[timeframes[i]], options);
    }
  }
  return indicators;
}

export const algorithmic = async (
  discord: Client, 
  binance: Binance, 
  consoleLogger: ConsoleLogger, 
  symbol: string, 
  candlesticks: Candlesticks, 
  options: ConfigOptions
) => {
  try {
    const startTime = Date.now();
    const filter = symbolFilters[symbol.split("/").join("")];
    if (candlesticks[symbol.split("/").join("")] === undefined) {
      return false;
    }
    const timeframe = Object.keys(candlesticks[symbol.split("/").join("")]);
    if (candlesticks[symbol.split("/").join("")][timeframe[0]] === undefined) {
      return false;
    }
    const latestCandle = candlesticks[symbol.split("/").join("")][timeframe[0]][candlesticks[symbol.split("/").join("")][timeframe[0]].length - 1];
    const prevCandle = candlesticks[symbol.split("/").join("")][timeframe[0]][candlesticks[symbol.split("/").join("")][timeframe[0]].length - 2];
    const candleTime = (new Date(latestCandle.time)).toLocaleString('fi-FI');
    consoleLogger.push("Symbol", symbol.split("/").join(""));
    consoleLogger.push("Displayed timeframe", timeframe[0]);
    consoleLogger.push(`Amount of candles`, candlesticks[symbol.split("/").join("")][timeframe[0]]?.length);
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
    if (candlesticks[symbol.split("/").join("")][timeframe[0]]?.length < options.longEma) {
      consoleLogger.push(`warning`, `Not enough candlesticks for calculations, please wait.`);
      return false;
    }
    consoleLogger.push("Balance " + symbol.split("/")[0], options.balances[symbol.split("/")[0]].toFixed(7));
    consoleLogger.push("Balance " + symbol.split("/")[1], options.balances[symbol.split("/")[1]].toFixed(7));
    const placedTrade = await placeTrade(discord, binance, consoleLogger, symbol, candlesticks, filter, options);
    const stopTime = Date.now();
    consoleLogger.push(`Calculation speed (ms)`, stopTime - startTime);
    if (latestCandle.isFinal === true) {
      options.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(binance, symbol, options);
      consoleLogger.writeJSONTofile('./trades.json');
    } else if (placedTrade == true) {
      consoleLogger.writeJSONTofile('./trades.json');
    }
    if (options.consoleUpdate === "trade/final" && (placedTrade !== false || latestCandle.isFinal)) {
      consoleLogger.print();
      consoleLogger.flush();
    } else if (options.consoleUpdate === "trade/final" && (placedTrade === false && latestCandle.isFinal === false)) {
      consoleLogger.flush();
    } else if (options.consoleUpdate === "trade" && placedTrade === true) {
      consoleLogger.writeJSONTofile('./trades.json');
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
    return true;
  } catch (error: any) {
    console.error(JSON.stringify(error));
  }
}