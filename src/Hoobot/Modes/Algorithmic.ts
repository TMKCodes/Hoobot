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
import { ConsoleLogger, consoleLogger } from "../Utilities/consoleLogger";
import { calculateEMA, ema, checkEMASignals, checkTrendSignal, Trend } from "../Indicators/EMA";
import { calculateRSI, checkRSISignals } from "../Indicators/RSI";
import { calculateMACD, checkMACDSignals, macd } from "../Indicators/MACD";
import {  Candlestick, Candlesticks } from "../Binance/Candlesticks";
import { calculateSMA, checkSMASignals } from "../Indicators/SMA";
import { calculateATR } from "../Indicators/ATR";
import { calculateBollingerBands, checkBollingerBandsSignals } from "../Indicators/BollingerBands";
import { calculateStochasticOscillator, calculateStochasticRSI, checkStochasticOscillatorSignals, checkStochasticRSISignals } from "../Indicators/StochasticOscillator";
import { Trade, buy, calculatePNLPercentageForLong, calculatePNLPercentageForShort, calculateROI, getTradeHistory, sell, simulateBuy, simulateSell } from "../Binance/Trades";
import { calculateOBV, checkOBVSignals } from "../Indicators/OBV";
import { calculateCMF, checkCMFSignals } from "../Indicators/CMF";
import { calculateAverage } from "../Indicators/Average";
import { symbolFilters } from "../..";
import { checkGPTSignals } from "../Indicators/GPT";
import { Orderbook } from "../Binance/Orderbook";
import { checkProfitSignals, checkProfitSignalsFromCandlesticks } from "../Indicators/Profit";
import { checkBalanceSignals } from "../Indicators/Balance";
import { Balances } from "../Binance/Balances";
import { RenkoBrick, calculateBrickSize, calculateRenko, checkRenkoSignals } from "../Indicators/Renko";

export interface Indicators {
  'trend' : Trend;
  'avg': {
    [time: string]:  number;
  },
  'renko': {
    [time: string]: RenkoBrick[];
  }
  'ema': {
    [time: string]: ema;
  },
  'macd':  {
    [time: string]: macd;
  },
  'sma': {
    [time: string]:  number[];
  },
  'rsi':  {
    [time: string]: number[];
  },
  'atr':  {
    [time: string]: number[];
  },
  'obv':  {
    [time: string]: number[];
  },
  'cmf':  {
    [time: string]: number[];
  },
  'stochasticOscillator':  {
    [time: string]: [number[], number[]];
  },
  'stochasticRSI':  {
    [time: string]: [number[], number[]];
  },
  'bollingerBands':  {
    [time: string]: [number[], number[], number[]];
  },
  [key: string]: {},
}

export const reverseSign = (number: number) => {
  return -number;
}

interface Weights {
  [key: string]: number; 
}

interface Checks {
  [key: string]: string; 
}

interface Directions {
  [key: string]: number; 
}

export const tradeDirection =  async (
  consoleLogger: ConsoleLogger,
  symbol: string,
  orderBook: Orderbook | undefined,
  candlesticks: Candlesticks, 
  indicators: Indicators,
  options: ConfigOptions,
  filter: Filter,
): Promise<string[]> => {
  const startTime = Date.now();
  const timeframes = options.candlestickInterval;
  let direction = 'HOLD';
  const directions: Directions = {
    BUY: 0,
    SELL: 0,
    HOLD: 0,
  };
  let actions = ['BUY', 'SELL', 'HOLD'];
  let profit = "SKIP";
  const closePrice = candlesticks[symbol.split("/").join("")][timeframes[0]][candlesticks[symbol.split("/").join("")][timeframes[0]].length - 1].close;
  const closeTime = candlesticks[symbol.split("/").join("")][timeframes[0]][candlesticks[symbol.split("/").join("")][timeframes[0]].length - 1].time;
  const next = checkBalanceSignals(consoleLogger, symbol, closePrice, options, filter);
  const trend = checkTrendSignal(indicators.trend);
  if (orderBook !== undefined) {
    profit = await checkProfitSignals(consoleLogger, next, trend, symbol, orderBook, closeTime, options);
  } else {
    profit = await checkProfitSignalsFromCandlesticks(consoleLogger, next, trend, symbol, candlesticks[symbol.split("/").join("")][timeframes[0]], closeTime, options);
  }
  const weights: Weights = {
    SMAWeight: options.SMAWeight,
    EMAWeight: options.EMAWeight,
    MACDWeight: options.MACDWeight,
    RSIWeight: options.RSIWeight,
    StochasticOscillatorWeight: options.StochasticOscillatorWeight,
    StochasticRSIWeight: options.StochasticRSIWeight,
    BollingerBandsWeight: options.BollingerBandsWeight,
    OBVWeight: options.OBVWeight,
    CMFWeight: options.CMFWeight,
    RenkoWeight: options.RenkoWeight,
  }
  // console.log(timeframes.length);
  for (let timeframeIndex = 0; timeframeIndex < timeframes.length; timeframeIndex++) {
    const checks: Checks = {
      SMA: checkSMASignals(indicators.sma[timeframes[timeframeIndex]], options),
      Renko: checkRenkoSignals(indicators.renko[timeframes[timeframeIndex]], options),
      EMA: checkEMASignals(indicators.ema[timeframes[timeframeIndex]], options),
      MACD: checkMACDSignals(indicators.macd[timeframes[timeframeIndex]], options),
      RSI: checkRSISignals(indicators.rsi[timeframes[timeframeIndex]], options),
      StochasticOscillator: checkStochasticOscillatorSignals(indicators.stochasticOscillator[timeframes[timeframeIndex]], options),
      StochasticRSI: checkStochasticRSISignals(indicators.stochasticRSI[timeframes[timeframeIndex]], options),
      BollingerBands: checkBollingerBandsSignals(candlesticks[symbol.split("/").join("")][timeframes[timeframeIndex]], indicators.bollingerBands[timeframes[timeframeIndex]], options),
      OBV: checkOBVSignals(candlesticks[symbol.split("/").join("")][timeframes[timeframeIndex]], indicators.obv[timeframes[timeframeIndex]], options),
      CMF: checkCMFSignals(indicators.cmf[timeframes[timeframeIndex]], options),
    }
    const keys = Object.keys(checks).filter(check => checks[check] !== 'SKIP');
    // console.log(`Keys: ${JSON.stringify(keys)}`);
    const keysLength = keys.length;
    consoleLogger.push(`Indicator checks ${timeframes[timeframeIndex]}`, checks);
    for (let actionsIndex = 0; actionsIndex < actions.length; actionsIndex++) {
      let weightedSum = 0;
      let totalWeight = 0;
      // console.log(`Keys length: ${keys.length}`);
      // console.log(`Constant keys length: ${keysLength}`);
      for (let keysIndex = 0; keysIndex < keysLength; keysIndex++) {
        const weight = weights[`${keys[keysIndex]}Weight`];
        // console.log(`weights[${`${keys[keysIndex]}Weight`}] = ${weight}`);
        const signal = checks[keys[keysIndex]];
        if (signal === actions[actionsIndex]) {
          weightedSum += weight;
        }
        totalWeight += weight;
      }
      // console.log(`Action Index: ${actions[actionsIndex]}`);
      // console.log(`weightedSum: ${weightedSum}`);
      // console.log(`totalWeight: ${totalWeight}`);
      if (totalWeight > 0) {
        const percentage = (weightedSum / totalWeight) * 100 / timeframes.length;
        // console.log(`percentage:${percentage}`);
        directions[actions[actionsIndex]] += percentage;
      }
    }
  }
  directions.BUY = Number(directions.BUY.toFixed(2));
  directions.SELL = Number(directions.SELL.toFixed(2));
  directions.HOLD = Number(directions.HOLD.toFixed(2));
  consoleLogger.push("Directions", directions);
  actions = actions.filter(action => directions[action] !== undefined);
  for (let actionsIndex = 0; actionsIndex < actions.length; actionsIndex++) {
    // console.log(`${directions[actions[actionsIndex]]} >= ${options.directionAgreement}`)
    if((profit == actions[actionsIndex] || profit === 'SKIP' || profit === "TAKE_PROFIT" || profit === "STOP_LOSS") && next == actions[actionsIndex]) {
      if(profit === "TAKE_PROFIT" && directions[actions[actionsIndex]] >= (options.directionAgreement / 2)) {
        direction = next;
        break;
      } else if(profit === "STOP_LOSS" && directions[actions[actionsIndex]] >= (options.directionAgreement / 2)) {
        direction = next;
        break;
      } else if (directions[actions[actionsIndex]] >= options.directionAgreement) {
        direction = actions[actionsIndex];
        break;
      }
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
  // if (direction === "SELL") {
  //   console.log(`
  //   _______________________
  //   |  _________________  |
  //   | |       SELL   /  | |
  //   | |       /\\    /   | |
  //   | |  /\\  /  \\  /    | |
  //   | | /  \\/    \\/     | |
  //   | |/                | |
  //   | |_________________| |
  //   |  ___ ___ ___   ___  |
  //   | | 7 | 8 | 9 | | + | |
  //   | |___|___|___| |___| |
  //   | | 4 | 5 | 6 | | - | |
  //   | |___|___|___| |___| |
  //   | | 1 | 2 | 3 | | x | |
  //   | |___|___|___| |___| |
  //   | | . | 0 | = | | / | |
  //   | |___|___|___| |___| |
  //   |_____________________|
  //   `);
  // } else if (direction === "BUY") {
  //   console.log(`
  //   _______________________
  //   |  _________________  |
  //   | |              /  | |
  //   | |       /\\    /   | |
  //   | |  /\\  /  \\  /    | |
  //   | | /  \\/    \\/     | |
  //   | |/          BUY   | |
  //   | |_________________| |
  //   |  ___ ___ ___   ___  |
  //   | | 7 | 8 | 9 | | + | |
  //   | |___|___|___| |___| |
  //   | | 4 | 5 | 6 | | - | |
  //   | |___|___|___| |___| |
  //   | | 1 | 2 | 3 | | x | |
  //   | |___|___|___| |___| |
  //   | | . | 0 | = | | / | |
  //   | |___|___|___| |___| |
  //   |_____________________|
  //   `);
  // } else if (direction === "HOLD") {
  //   console.log(`
  //   _______________________
  //   |  _________________  |
  //   | |                 | |
  //   | |      HOLD       | |
  //   | |-----------------| |
  //   | |     WAITING     | |
  //   | |    FOR PULSE    | |
  //   | |_________________| |
  //   |  ___ ___ ___   ___  |
  //   | | 7 | 8 | 9 | | + | |
  //   | |___|___|___| |___| |
  //   | | 4 | 5 | 6 | | - | |
  //   | |___|___|___| |___| |
  //   | | 1 | 2 | 3 | | x | |
  //   | |___|___|___| |___| |
  //   | | . | 0 | = | | / | |
  //   | |___|___|___| |___| |
  //   |_____________________|
  //   `);
  // }
  consoleLogger.push("PROFIT Direction", profit);
  consoleLogger.push(`TRADE Direction`, direction);
  const stopTime = Date.now();
  consoleLogger.push(`Time to decide direction (ms)`, stopTime - startTime);
  return [profit, direction];
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
  if (options.tradeHistory[symbol.split("/").join("")]?.length > 0) {
    const lastTradeTime = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 1].time;
    const currentTime = Date.now();
    const timeDifferenceInSeconds = (currentTime - lastTradeTime) / 1000;
    if (timeDifferenceInSeconds < getSecondsFromInterval(options.candlestickInterval[0])) {
      return false; 
    }
  }
  const orderBook = options.orderbooks[symbol.split("/").join("")];
  consoleLogger.push("Orderbook", {
    ask: Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b)[0],
    bid: Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => b - a)[0]
  })
  const indicators = calculateIndicators(symbol, candlesticks, options);
  const [profit, direction] = await tradeDirection(consoleLogger, symbol, orderBook, candlesticks, indicators, options, filter);
  if (direction === 'SELL') {
    return sell(discord, binance, consoleLogger, symbol, profit, orderBook, filter, options);
  } else if (direction === 'BUY' && options.stopLossHit === false) {
    return buy(discord, binance, consoleLogger, symbol, profit, orderBook, filter, options);
  } else {
    return false;
  }
}

const subCalculateIndicators = (
  candlesticks: Candlestick[],
  indicators: any,
  timeframe: string,
  options: ConfigOptions,
) => {
  indicators.sma[timeframe] = calculateSMA(candlesticks, options.smaLength, options.source);
  if (options.useSMA) {
    // logSMASignals(consoleLogger, indicators.sma[timeframe]); 
  }
  if (options.useRSI) {
    indicators.rsi[timeframe] = calculateRSI(candlesticks, options.rsiLength, options.rsiSmoothingType, options.rsiSmoothing, options.source);
    // logRSISignals(consoleLogger, indicators.rsi[timeframe], options);
  }
  if (options.useMACD) {
    indicators.macd[timeframe] = calculateMACD(candlesticks, options.fastMacd, options.slowMacd, options.signalMacd, options.source);
    // logMACDSignals(consoleLogger, indicators.macd[timeframe]);
  }
  if (options.useATR) {
    // logATRSignals(consoleLogger, indicators.atr[timeframe]);
  }
  if (options.useBollingerBands) {
    indicators.bollingerBands[timeframe] = calculateBollingerBands(candlesticks, options.bollingerBandsAverageType, options.bollingerBandsLength, options.bollingerBandsMultiplier, options.source);
    // logBollingerBandsSignals(consoleLogger, candlesticks, indicators.bollingerBands[timeframe]);
  }
  if (options.useStochasticOscillator) {
    indicators.stochasticOscillator[timeframe] = calculateStochasticOscillator(candlesticks, options.stochasticOscillatorKPeriod, options.stochasticOscillatorDPeriod, options.stochasticOscillatorSmoothing);
    // logStochasticOscillatorSignals(consoleLogger, indicators.stochasticOscillator[timeframe]);
  }
  if (options.useStochasticRSI) {
    indicators.stochasticRSI[timeframe] = calculateStochasticRSI(candlesticks, options.stochasticRSILengthRSI, options.stochasticRSILengthStoch, options.stochasticRSISmoothK, options.stochasticRSISmoothD, options.rsiSmoothingType, options.source);
    // logStochasticRSISignals(consoleLogger, indicators.stochasticRSI[timeframe]);
  }
  if (options.useOBV) {
    indicators.obv[timeframe] = calculateOBV(candlesticks);
    // logOBVSignals(consoleLogger, candlesticks, indicators.obv[timeframe]);
  }
  if (options.useCMF) {
    indicators.cmf[timeframe] = calculateCMF(candlesticks, options.cmfLength);
    // logCMFSignals(consoleLogger, indicators.cmf[timeframe], options);
  }
  return indicators;
}

export const calculateIndicators = (
  symbol: string,
  candlesticks: Candlesticks,
  options: ConfigOptions
): Indicators => {
  let indicators: Indicators = {
    trend: {},
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
    renko: {},
  };
  if (candlesticks[symbol.split("/").join("")][options.trendTimeframe] !== undefined) {
    indicators.trend = {
      short: calculateEMA(candlesticks[symbol.split("/").join("")][options.trendTimeframe], options.trendEMAShort, 'close'),
      long: calculateEMA(candlesticks[symbol.split("/").join("")][options.trendTimeframe], options.trendEMALong, 'close'),
    }
  } else {
    // console.log("ERROR");
  }
  const timeframes = options.candlestickInterval;
  for (let i = 0; i < timeframes.length; i++) {
    indicators.avg[timeframes[i]] = calculateAverage(candlesticks[symbol.split("/").join("")][timeframes[i]]);
    // logAverageSignals(consoleLogger, candlesticks[symbol.split("/").join("")][timeframes[i]], indicators.avg[timeframes[i]]);
    indicators.ema[timeframes[i]] = {
      short: calculateEMA(candlesticks[symbol.split("/").join("")][timeframes[i]], options.shortEma, options.source),
      long: calculateEMA(candlesticks[symbol.split("/").join("")][timeframes[i]], options.longEma, options.source),
    }
    // logEMASignals(consoleLogger, indicators.ema[timeframes[i]]);
    indicators.atr[timeframes[i]] = calculateATR(candlesticks[symbol.split("/").join("")][timeframes[i]], options.atrLength, options.source);
    options.renkoBrickSize = calculateBrickSize(indicators.atr[timeframes[i]], options);
    indicators.renko[timeframes[i]] = calculateRenko(candlesticks[symbol.split("/").join("")][timeframes[i]], options.renkoBrickSize);
    if (options.useRenko) {
      // logRenkoSignals(consoleLogger, indicators.renko[timeframes[i]], options);
      indicators = subCalculateIndicators(indicators.renko[timeframes[i]] as Candlestick[], indicators, timeframes[i], options);
    } else {
      indicators = subCalculateIndicators(candlesticks[symbol.split("/").join("")][timeframes[i]], indicators, timeframes[i], options);
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
    if (candlesticks[symbol.split("/").join("")][timeframe[0]]?.length < 2) {
      return false;
    }
    if (options.tradeHistory[symbol.split("/").join("")] === undefined) {
      options.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(binance, symbol, options);
    }
    if (candlesticks[symbol.split("/").join("")][timeframe[0]]?.length < options.longEma) {
      consoleLogger.push(`warning`, `Not enough candlesticks for calculations, please wait.`);
      return false;
    }
    const latestCandle = candlesticks[symbol.split("/").join("")][timeframe[0]][candlesticks[symbol.split("/").join("")][timeframe[0]]?.length - 1];
    const prevCandle = candlesticks[symbol.split("/").join("")][timeframe[0]][candlesticks[symbol.split("/").join("")][timeframe[0]]?.length - 2];
    const candleTime = (new Date(latestCandle.time)).toLocaleString('fi-FI');
    consoleLogger.push("Symbol", symbol.split("/").join(""));
    if (options.tradeHistory[symbol.split("/").join("")]?.length > 0) {
      const lastTradeTime = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 1].time;
      const lastTradeDate = new Date(lastTradeTime);
      consoleLogger.push("Last trade time:", lastTradeDate.toLocaleString("fi-FI"));
    } else {
      consoleLogger.push("Last trade time:", "No trades done!");
    }
    if (latestCandle !== undefined) {
      consoleLogger.push('Candlestick', {
        time: candleTime,
        color: (latestCandle.close > latestCandle.open) ? "Green" : "Red",
        direction: (latestCandle.close > prevCandle?.close) ? "Rising" : (latestCandle.close < prevCandle?.close) ? "Dropping" : "Stagnant",
        open: latestCandle?.open?.toFixed(7),
        close: latestCandle?.close?.toFixed(7),
        low: latestCandle?.low?.toFixed(7),
        high: latestCandle?.high?.toFixed(7)
      });
    }
    if (options.tradeHistory[symbol.split("/").join("")]?.length > 1) {
      const roi = calculateROI(options.tradeHistory[symbol.split("/").join("")]);
      consoleLogger.push("Profit", {
        base: roi[0].toFixed(7) + " " + symbol.split("/")[0],
        quote: roi[1].toFixed(7) + " " + symbol.split("/")[1]
      });
    } else {
      consoleLogger.push("Profit", {
        base: "0 " + symbol.split("/")[0],
        quote: "0 " + symbol.split("/")[1]
      });
    }
    consoleLogger.push("Balance", {
      base:  options.balances[symbol.split("/")[0]].toFixed(7) + " " + symbol.split("/")[0],
      quote: options.balances[symbol.split("/")[1]].toFixed(7) + " " + symbol.split("/")[1]
    });
    const placedTrade = await placeTrade(discord, binance, consoleLogger, symbol, candlesticks, filter, options);
    const stopTime = Date.now();
    consoleLogger.push(`Calculation speed (ms)`, stopTime - startTime);
    if (latestCandle.isFinal === true) {
      options.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(binance, symbol, options);
    } else if (placedTrade == true) {
      consoleLogger.writeJSONTofile('./trades.json');
    }
    if (options.consoleUpdate === "trade/final" && (placedTrade !== false || latestCandle.isFinal)) {
      consoleLogger.print();
      consoleLogger.flush();
    } else if (options.consoleUpdate === "trade/final" && (placedTrade === false && latestCandle.isFinal === false)) {
      consoleLogger.flush();
    } else if (options.consoleUpdate === "trade" && placedTrade === true) {
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
  return false;
}

const getRandomValueBetween = (x: number, close: number): number => {
  const rangeStart = Math.min(x, close);
  const rangeEnd = Math.max(x, close);
  if (rangeEnd - rangeStart < 0.01) {
    return close;
  }
  const randomValue = Math.random() * (rangeEnd - rangeStart) + rangeStart;
  return Number(randomValue.toFixed(2));
}

export const simulateAlgorithmic = async (
  symbol: string, 
  candlesticks: Candlesticks, 
  options: ConfigOptions,
  balances: Balances,
  filter: Filter,
) => {
  const logger = consoleLogger();
  if (candlesticks[symbol.split("/").join("")] === undefined) {
    return false;
  }
  const timeframes = Object.keys(candlesticks[symbol.split("/").join("")]);
  if (candlesticks[symbol.split("/").join("")][timeframes[0]] === undefined) {
    return false;
  }
  if (candlesticks[symbol.split("/").join("")][timeframes[0]]?.length < 2) {
    return false;
  }
  if (options.tradeHistory[symbol.split("/").join("")] === undefined) {
    options.tradeHistory[symbol.split("/").join("")] = []
  }
  if (candlesticks[symbol.split("/").join("")][timeframes[0]]?.length < options.longEma) {
    logger.push(`warning`, `Not enough candlesticks for calculations, please wait.`);
    return false;
  }
  const latestCandle = candlesticks[symbol.split("/").join("")][timeframes[0]][candlesticks[symbol.split("/").join("")][timeframes[0]]?.length - 1];
  const prevCandle = candlesticks[symbol.split("/").join("")][timeframes[0]][candlesticks[symbol.split("/").join("")][timeframes[0]]?.length - 2];
  const candleTime = (new Date(latestCandle.time)).toLocaleString('fi-FI');
  logger.push("Symbol", symbol.split("/").join(""));
  // if (latestCandle !== undefined) {
  //   logger.push('Candlestick', {
  //     time: candleTime,
  //     color: (latestCandle.close > latestCandle.open) ? "Green" : "Red",
  //     direction: (latestCandle.close > prevCandle?.close) ? "Rising" : (latestCandle.close < prevCandle?.close) ? "Dropping" : "Stagnant",
  //     open: latestCandle?.open?.toFixed(7),
  //     close: latestCandle?.close?.toFixed(7),
  //     low: latestCandle?.low?.toFixed(7),
  //     high: latestCandle?.high?.toFixed(7)
  //   });
  // }
  logger.push("Time", candleTime);
  logger.push("Color", (latestCandle.close > latestCandle.open) ? "Green" : "Red");
  logger.push("Balance", {
    base:  options.balances[symbol.split("/")[0]].toFixed(7) + " " + symbol.split("/")[0],
    quote: options.balances[symbol.split("/")[1]].toFixed(7) + " " + symbol.split("/")[1]
  });
  const emptyLogger = consoleLogger();
  const indicators: Indicators = calculateIndicators(symbol, candlesticks, options);
  const orderBook = undefined;
  const [profit, direction] = await tradeDirection(emptyLogger, symbol, orderBook, candlesticks, indicators, options, filter);
  const sellPrice = getRandomValueBetween(latestCandle.high, latestCandle.close);
  const buyPrice = getRandomValueBetween(latestCandle.low, latestCandle.close); 
  if (direction === 'SELL') {
    const baseSymbol = symbol.split("/")[0];
    simulateSell(symbol, balances[baseSymbol], sellPrice, balances, profit, options, latestCandle.time, filter, logger);
  } else if (direction === 'BUY') {
    const quoteSymbol = symbol.split("/")[1];
    simulateBuy(symbol, balances[quoteSymbol], buyPrice, balances, profit, options, latestCandle.time, filter, logger);
  } else {
    let lastTrade: Trade = {
      symbol: "",
      id: 0,
      orderId: 0,
      orderListID: 0,
      price: "",
      qty: "",
      quoteQty: "",
      commission: "",
      commissionAsset: "",
      time: 0,
      isBuyer: true,
      isMaker: true,
      isBestMatch: true,
    }
    let pnl = 0;
    if (options.tradeHistory !== undefined && options.tradeHistory[symbol.split("/").join("")].length > 0) {
      lastTrade = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 1];
      if(lastTrade.isBuyer) {
        pnl = calculatePNLPercentageForLong(parseFloat(lastTrade.price), sellPrice);
      } else {
        pnl = calculatePNLPercentageForShort(parseFloat(lastTrade.price), buyPrice);
      }
    }
    logger.push("Trade", "holding");
    logger.push("PNL", pnl);
  }
  logger.push("TrendMode", options.currentTrendMode);
  logger.push("MinSell", options.minimumProfitSell);
  logger.push("MinBuy", options.minimumProfitBuy);
  logger.print();
  logger.flush();
  return false;
}

