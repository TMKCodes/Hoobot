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
import { calculateEMA, logEMASignals, ema, checkEMASignals, checkTrendSignal } from "../Indicators/EMA";
import { calculateRSI, checkRSISignals, logRSISignals } from "../Indicators/RSI";
import { calculateMACD, checkMACDSignals, logMACDSignals, macd } from "../Indicators/MACD";
import {  Candlesticks } from "../Binance/Candlesticks";
import { calculateSMA, checkSMASignals, logSMASignals, sma } from "../Indicators/SMA";
import { calculateATR, logATRSignals } from "../Indicators/ATR";
import { calculateBollingerBands, checkBollingerBandsSignals, logBollingerBandsSignals } from "../Indicators/BollingerBands";
import { calculateStochasticOscillator, calculateStochasticRSI, checkStochasticOscillatorSignals, checkStochasticRSISignals, logStochasticOscillatorSignals, logStochasticRSISignals } from "../Indicators/StochasticOscillator";
import { buy, calculateROI, getTradeHistory, sell, simulateBuy, simulateSell } from "../Binance/Trades";
import { calculateOBV, checkOBVSignals, logOBVSignals } from "../Indicators/OBV";
import { calculateCMF, checkCMFSignals, logCMFSignals } from "../Indicators/CMF";
import { calculateAverage, logAverageSignals } from "../Indicators/Average";
import { symbolFilters } from "../..";
import { checkGPTSignals } from "../Indicators/GPT";
import { Orderbook } from "../Binance/Orderbook";
import { checkProfitSignals, checkProfitSignalsFromCandlesticks } from "../Indicators/Profit";
import { checkBalanceSignals } from "../Indicators/Balance";
import { Balances } from "../Binance/Balances";
import { RenkoBrick, calculateRenko, checkRenkoSignals, logRenkoSignals } from "../Indicators/Renko";
import { time } from "console";

export interface Indicators {
  avg?: {
    [time: string]:  number;
  },
  renko?: {
    [time: string]: RenkoBrick[];
  }
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

export const tradeDirection =  async (
  consoleLogger: ConsoleLogger,
  symbol: string,
  orderBook: Orderbook | undefined,
  candlesticks: Candlesticks, 
  indicators: Indicators,
  options: ConfigOptions,
  filter: Filter,
): Promise<string> => {
  const startTime = Date.now();
  const timeframes = Object.keys(candlesticks[symbol.split("/").join("")]);
  let direction = 'HOLD';
  const directions = {
    BUY: 0,
    SELL: 0,
    HOLD: 0,
  };
  let actions = ['BUY', 'SELL', 'HOLD'];
  let profit = "SKIP";
  const closePrice = candlesticks[symbol.split("/").join("")][timeframes[0]][candlesticks[symbol.split("/").join("")][timeframes[0]].length - 1].close;
  const next = checkBalanceSignals(consoleLogger, symbol, closePrice, options, filter);
  const trend = checkTrendSignal(indicators.ema[timeframes[timeframes.length - 1]]);
  if (orderBook !== undefined) {
    profit = checkProfitSignals(consoleLogger, next, trend, symbol, orderBook, options);
  } else {
    profit = checkProfitSignalsFromCandlesticks(consoleLogger, next, trend, symbol, candlesticks[symbol.split("/").join("")][timeframes[0]], options);
  }
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
    RenkoWeight: options.RenkoWeight,
  }
  for (let timeframeIndex = 0; timeframeIndex < timeframes.length; timeframeIndex++) {
    const checks = {
      SMA: checkSMASignals(consoleLogger, indicators.sma[timeframes[timeframeIndex]], options),
      Renko: checkRenkoSignals(consoleLogger, indicators.renko[timeframes[timeframeIndex]], options),
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
    if((profit == actions[actionsIndex] || profit === 'SKIP' || profit === "TAKE_PROFIT" || profit === "STOP_LOSS") && next == actions[actionsIndex]) {
      if(profit === "TAKE_PROFIT" && directions[actions[actionsIndex]] >= options.directionAgreement) {
        direction = next;
        break;
      } else if(profit === "STOP_LOSS" && directions[actions[actionsIndex]] >= options.directionAgreement) {
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
  const indicators = calculateIndicators(consoleLogger, symbol, candlesticks, options);
  const direction = await tradeDirection(consoleLogger, symbol, orderBook, candlesticks, indicators, options, filter);
  if (direction === 'SELL') {
    return sell(discord, binance, consoleLogger, symbol, orderBook, filter, options);
  } else if (direction === 'BUY' && options.stopLossHit === false) {
    return buy(discord, binance, consoleLogger, symbol, orderBook, filter, options);
  } else {
    return false;
  }
}

export const calculateIndicators = (
  consoleLogger: ConsoleLogger,
  symbol: string,
  candlesticks: Candlesticks,
  options: ConfigOptions
): Indicators => {
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
    renko: {},
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
    indicators.atr[timeframes[i]] = calculateATR(candlesticks[symbol.split("/").join("")][timeframes[i]], options.atrLength, options.source);
    const averageAtr = indicators.atr[timeframes[i]].reduce((sum, atr) => sum + atr, 0) / indicators.atr[timeframes[i]].length;
    const renkoBrickSize = averageAtr * options.atrLength;
    indicators.renko[timeframes[i]] = calculateRenko(candlesticks[symbol.split("/").join("")][timeframes[i]], renkoBrickSize);
    if (options.useRenko) {
      logRenkoSignals(consoleLogger, indicators.renko[timeframes[i]]);
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
      // const base =  options.balances[symbol.split("/")[0]] * latestCandle.close;
      // const quote = options.balances[symbol.split("/")[1]];
      // if (base > 5 || quote > 5) {
      //   consoleLogger.print();
      //   consoleLogger.flush();
      // }
      consoleLogger.print();
      consoleLogger.flush();
    }
    return true;
  } catch (error: any) {
    console.error(JSON.stringify(error));
  }
}

export const simulateAlgorithmic = async (
  symbol: string, 
  candlesticks: Candlesticks, 
  options: ConfigOptions,
  balances: Balances,
  filter: Filter,
) => {
  const logger = consoleLogger();
  logger.push("Simulation", "true");
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
    options.tradeHistory[symbol.split("/").join("")] = []
  }
  if (candlesticks[symbol.split("/").join("")][timeframe[0]]?.length < options.longEma) {
    logger.push(`warning`, `Not enough candlesticks for calculations, please wait.`);
    return false;
  }
  const latestCandle = candlesticks[symbol.split("/").join("")][timeframe[0]][candlesticks[symbol.split("/").join("")][timeframe[0]]?.length - 1];
  const prevCandle = candlesticks[symbol.split("/").join("")][timeframe[0]][candlesticks[symbol.split("/").join("")][timeframe[0]]?.length - 2];
  const candleTime = (new Date(latestCandle.time)).toLocaleString('fi-FI');
  logger.push("Symbol", symbol.split("/").join(""));
  if (latestCandle !== undefined) {
    logger.push('Candlestick', {
      time: candleTime,
      color: (latestCandle.close > latestCandle.open) ? "Green" : "Red",
      direction: (latestCandle.close > prevCandle?.close) ? "Rising" : (latestCandle.close < prevCandle?.close) ? "Dropping" : "Stagnant",
      open: latestCandle?.open?.toFixed(7),
      close: latestCandle?.close?.toFixed(7),
      low: latestCandle?.low?.toFixed(7),
      high: latestCandle?.high?.toFixed(7)
    });
  }
  logger.push("Balance", {
    base:  options.balances[symbol.split("/")[0]].toFixed(7) + " " + symbol.split("/")[0],
    quote: options.balances[symbol.split("/")[1]].toFixed(7) + " " + symbol.split("/")[1]
  });
  const indicators: Indicators = calculateIndicators(logger, symbol, candlesticks, options);
  const orderBook = undefined;
  const direction = await tradeDirection(logger, symbol, orderBook, candlesticks, indicators, options, filter);
  const high = latestCandle.high;
  const low = latestCandle.low;
  const close = latestCandle.close;
  const open = latestCandle.open;
  const midpoint = (low + high) / 2;
  if (direction === 'SELL') {
    const baseSymbol = symbol.split("/")[0];
    if(options.source === "close") {
      simulateSell(symbol, balances[baseSymbol], close, balances, options, latestCandle.time, filter, logger);
    } else if(options.source == "open") {
      simulateSell(symbol, balances[baseSymbol], open, balances, options, latestCandle.time, filter, logger);
    } else if(options.source === "high") {
      simulateSell(symbol, balances[baseSymbol], high, balances, options, latestCandle.time, filter, logger);
    } else if(options.source === "low") {
      simulateSell(symbol, balances[baseSymbol], low, balances, options, latestCandle.time, filter, logger);
    } else if(options.source === "midpoint") {
      simulateSell(symbol, balances[baseSymbol], midpoint, balances, options, latestCandle.time, filter, logger);
    }
  } else if (direction === 'BUY') {
    const quoteSymbol = symbol.split("/")[1];
    if(options.source === "close") {
      simulateBuy(symbol, balances[quoteSymbol], close, balances, options, latestCandle.time, filter, logger);
    } else if(options.source == "open") {
      simulateBuy(symbol, balances[quoteSymbol], open, balances, options, latestCandle.time, filter, logger);
    } else if(options.source === "high") {
      simulateBuy(symbol, balances[quoteSymbol], low, balances, options, latestCandle.time, filter, logger);
    } else if(options.source === "low") {
      simulateBuy(symbol, balances[quoteSymbol], high, balances, options, latestCandle.time, filter, logger);
    } else if(options.source === "midpoint") {
      simulateBuy(symbol, balances[quoteSymbol], midpoint, balances, options, latestCandle.time, filter, logger);
    }
  }
}

