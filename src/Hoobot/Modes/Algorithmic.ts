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
import { Filter } from "../Exchanges/Filters";
import { ConfigOptions, ExchangeOptions, SymbolOptions, getSecondsFromInterval } from "../Utilities/Args";
import { ConsoleLogger, consoleLogger } from "../Utilities/ConsoleLogger";
import { calculateEMA, ema, checkEMASignals, checkTrendSignal, Trend } from "../Indicators/EMA";
import { calculateRSI, checkRSISignals, logRSISignals } from "../Indicators/RSI";
import { calculateMACD, checkMACDSignals, logMACDSignals, macd } from "../Indicators/MACD";
import { Candlestick, Candlesticks } from "../Exchanges/Candlesticks";
import { calculateSMA, checkSMASignals, logSMASignals } from "../Indicators/SMA";
import { calculateATR, logATRSignals } from "../Indicators/ATR";
import {
  calculateBollingerBands,
  checkBollingerBandsSignals,
  logBollingerBandsSignals,
} from "../Indicators/BollingerBands";
import {
  calculateStochasticOscillator,
  calculateStochasticRSI,
  checkStochasticOscillatorSignals,
  checkStochasticRSISignals,
  logStochasticOscillatorSignals,
  logStochasticRSISignals,
} from "../Indicators/StochasticOscillator";
import { buy, getTradeHistory, sell, simulateBuy, simulateSell } from "../Exchanges/Trades";
import { calculateOBV, checkOBVSignals, logOBVSignals } from "../Indicators/OBV";
import { calculateCMF, checkCMFSignals, logCMFSignals } from "../Indicators/CMF";
import { calculateAverage } from "../Indicators/Average";
import { symbolFilters } from "../..";
import { checkGPTSignals } from "../Indicators/GPT";
import { Orderbook } from "../Exchanges/Orderbook";
import { checkProfitSignals, checkProfitSignalsFromCandlesticks } from "../Indicators/Profit";
import { checkBalanceSignals } from "../Indicators/Balance";
import { Balances, getCurrentBalances } from "../Exchanges/Balances";
import { RenkoBrick, calculateBrickSize, calculateRenko, checkRenkoSignals } from "../Indicators/Renko";
import { Exchange } from "../Exchanges/Exchange";
import { logToFile } from "../Utilities/LogToFile";
import { calculateDMI, checkDMISignals, DMI, logDMISignals } from "../Indicators/DMI";
import { getOpenOrders, handleOpenOrder, handleOpenOrders } from "../Exchanges/Orders";
import { adx, calculateADX, checkADXSignals, logADXSignals } from "../Indicators/ADX";
import { calculateWilliamsR, checkWilliamsRSignals, logWilliamsRSignals } from "../Indicators/WilliamsR";
import { calculateCCI, checkCCISignals, logCCISignals } from "../Indicators/CCI";
import { calculateMFI, checkMFISignals, logMFISignals } from "../Indicators/MFI";
import {
  calculateChaikinOscillator,
  checkChaikinOscillatorSignals,
  logChaikinOscillatorSignals,
} from "../Indicators/ChaikinOscillator";
import { calculateAroon, checkAroonSignals, logAroonSignals, AroonResult } from "../Indicators/Aroon";
import { calculateForceIndex, checkForceIndexSignals, logForceIndexSignals } from "../Indicators/ForceIndex";
import { calculateIchimoku, checkIchimokuSignals, logIchimokuSignals, IchimokuResult } from "../Indicators/Ichimoku";
import {
  calculateParabolicSAR,
  checkParabolicSARSingals,
  logParabolicSARSingals,
  ParabolicSARResult,
} from "../Indicators/ParabolicSAR";
import { calculateVWAP, checkVWAPSignals, logVWAPSignals, VWAPResult } from "../Indicators/VWAP";

export interface Indicators {
  trend: Trend;
  avg: {
    [time: string]: number;
  };
  renko: {
    [time: string]: RenkoBrick[];
  };
  ema: {
    [time: string]: ema;
  };
  adx: {
    [time: string]: adx;
  };
  macd: {
    [time: string]: macd;
  };
  sma: {
    [time: string]: number[];
  };
  rsi: {
    [time: string]: number[];
  };
  atr: {
    [time: string]: number[];
  };
  obv: {
    [time: string]: number[];
  };
  cmf: {
    [time: string]: number[];
  };
  stochasticOscillator: {
    [time: string]: [number[], number[]];
  };
  stochasticRSI: {
    [time: string]: [number[], number[]];
  };
  bollingerBands: {
    [time: string]: [number[], number[], number[]];
  };
  dmi: {
    [time: string]: DMI;
  };
  williamsR: {
    [time: string]: number[];
  };
  cci: {
    [time: string]: number[];
  };
  mfi: {
    [time: string]: number[];
  };
  chaikinOscillator: {
    [time: string]: number[];
  };
  aroon: {
    [time: string]: AroonResult;
  };
  forceIndex: {
    [time: string]: number[];
  };
  ichimoku: {
    [time: string]: IchimokuResult;
  };
  parabolicSAR: {
    [time: string]: ParabolicSARResult;
  };
  vwap: {
    [time: string]: VWAPResult;
  };
  [key: string]: {};
}

export const reverseSign = (number: number) => {
  return -number;
};

interface Weights {
  [key: string]: number;
}

interface Checks {
  [key: string]: string;
}

interface Directions {
  [key: string]: number;
}

export const tradeDirection = async (
  consoleLogger: ConsoleLogger,
  symbol: string,
  orderBook: Orderbook | undefined,
  candlesticks: Candlesticks,
  indicators: Indicators,
  exchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions,
  filter: Filter,
): Promise<string[]> => {
  const startTime = Date.now();
  const timeframes = symbolOptions.timeframes;
  let direction = "HOLD";
  const directions: Directions = {
    BUY: 0,
    SELL: 0,
    HOLD: 0,
  };
  let actions = ["BUY", "SELL", "HOLD"];
  let profit = "SKIP";
  if (candlesticks[symbol.split("/").join("")][timeframes[0]] === undefined) {
    consoleLogger.push("error", `Cant find candles for symbol ${symbol}`);
    return ["HOLD", "HOLD"];
  }
  const closePrice =
    candlesticks[symbol.split("/").join("")][timeframes[0]][
      candlesticks[symbol.split("/").join("")][timeframes[0]]?.length - 1
    ].close;
  const closeTime =
    candlesticks[symbol.split("/").join("")][timeframes[0]][
      candlesticks[symbol.split("/").join("")][timeframes[0]]?.length - 1
    ].time;
  const next = checkBalanceSignals(consoleLogger, symbol, closePrice, exchangeOptions, filter);
  const trend = checkTrendSignal(indicators.trend);
  if (orderBook !== undefined) {
    profit = await checkProfitSignals(consoleLogger, next, trend, orderBook, closeTime, exchangeOptions, symbolOptions);
  } else {
    profit = await checkProfitSignalsFromCandlesticks(
      consoleLogger,
      next,
      trend,
      candlesticks[symbol.split("/").join("")][timeframes[0]],
      closeTime,
      exchangeOptions,
      symbolOptions,
    );
  }
  if (symbolOptions.indicators === undefined) {
    return [profit, "HOLD"];
  }
  const weights: Weights = {
    SMAWeight: symbolOptions.indicators.sma?.weight!,
    EMAWeight: symbolOptions.indicators.ema?.weight!,
    ADXWeight: symbolOptions.indicators.adx?.weight!,
    MACDWeight: symbolOptions.indicators.macd?.weight!,
    RSIWeight: symbolOptions.indicators.rsi?.weight!,
    StochasticOscillatorWeight: symbolOptions.indicators.so?.weight!,
    StochasticRSIWeight: symbolOptions.indicators.srsi?.weight!,
    BollingerBandsWeight: symbolOptions.indicators.bb?.weight!,
    OBVWeight: symbolOptions.indicators.obv?.weight!,
    CMFWeight: symbolOptions.indicators.cmf?.weight!,
    RenkoWeight: symbolOptions.indicators.renko?.weight!,
    DMIWeight: symbolOptions.indicators.dmi?.weight!,
    WilliamsRWeight: symbolOptions.indicators.williamsR?.weight!,
    CCIWeight: symbolOptions.indicators.cci?.weight!,
    MFIWeight: symbolOptions.indicators.mfi?.weight!,
    ChaikinOscillatorWeight: symbolOptions.indicators.chaikin?.weight!,
    AroonWeight: symbolOptions.indicators.aroon?.weight!,
    ForceIndexWeight: symbolOptions.indicators.forceIndex?.weight!,
    IchimokuWeight: symbolOptions.indicators.ichimoku?.weight!,
    ParabolicSARWeight: symbolOptions.indicators.parabolicSAR?.weight!,
    VWAPWeight: symbolOptions.indicators.vwap?.weight!,
  };
  // console.log(timeframes.length);
  for (let timeframeIndex = 0; timeframeIndex < timeframes.length; timeframeIndex++) {
    const checks: Checks = {
      SMA: checkSMASignals(indicators.sma[timeframes[timeframeIndex]], symbolOptions),
      Renko: checkRenkoSignals(indicators.renko[timeframes[timeframeIndex]], symbolOptions),
      EMA: checkEMASignals(indicators.ema[timeframes[timeframeIndex]], symbolOptions),
      ADX: checkADXSignals(indicators.adx[timeframes[timeframeIndex]], symbolOptions),
      MACD: checkMACDSignals(indicators.macd[timeframes[timeframeIndex]], symbolOptions),
      RSI: checkRSISignals(indicators.rsi[timeframes[timeframeIndex]], symbolOptions),
      StochasticOscillator: checkStochasticOscillatorSignals(
        indicators.stochasticOscillator[timeframes[timeframeIndex]],
        symbolOptions,
      ),
      StochasticRSI: checkStochasticRSISignals(indicators.stochasticRSI[timeframes[timeframeIndex]], symbolOptions),
      BollingerBands: checkBollingerBandsSignals(
        candlesticks[symbol.split("/").join("")][timeframes[timeframeIndex]],
        indicators.bollingerBands[timeframes[timeframeIndex]],
        symbolOptions,
      ),
      OBV: checkOBVSignals(
        candlesticks[symbol.split("/").join("")][timeframes[timeframeIndex]],
        indicators.obv[timeframes[timeframeIndex]],
        symbolOptions,
      ),
      CMF: checkCMFSignals(indicators.cmf[timeframes[timeframeIndex]], symbolOptions),
      DMI: checkDMISignals(indicators.dmi[timeframes[timeframeIndex]], symbolOptions),
      WilliamsR: checkWilliamsRSignals(indicators.williamsR[timeframes[timeframeIndex]], symbolOptions),
      CCI: checkCCISignals(indicators.cci[timeframes[timeframeIndex]], symbolOptions),
      MFI: checkMFISignals(indicators.mfi[timeframes[timeframeIndex]], symbolOptions),
      ChaikinOscillator: checkChaikinOscillatorSignals(
        indicators.chaikinOscillator[timeframes[timeframeIndex]],
        symbolOptions,
      ),
      Aroon: checkAroonSignals(indicators.aroon[timeframes[timeframeIndex]], symbolOptions),
      ForceIndex: checkForceIndexSignals(indicators.forceIndex[timeframes[timeframeIndex]], symbolOptions),
      Ichimoku: checkIchimokuSignals(indicators.ichimoku[timeframes[timeframeIndex]], symbolOptions),
      ParabolicSAR: checkParabolicSARSingals(indicators.parabolicSAR[timeframes[timeframeIndex]], symbolOptions),
      VWAP: checkVWAPSignals(indicators.vwap[timeframes[timeframeIndex]], symbolOptions),
    };
    const keys = Object.keys(checks).filter((check) => checks[check] !== "SKIP");
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
        } else if (signal === "BOTH" && (actions[actionsIndex] === "SELL" || actions[actionsIndex] === "BUY")) {
          weightedSum += weight;
        }
        totalWeight += weight;
      }
      // console.log(`Action Index: ${actions[actionsIndex]}`);
      // console.log(`weightedSum: ${weightedSum}`);
      // console.log(`totalWeight: ${totalWeight}`);
      if (totalWeight > 0) {
        const percentage = ((weightedSum / totalWeight) * 100) / timeframes.length;
        // console.log(`percentage:${percentage}`);
        directions[actions[actionsIndex]] += percentage;
      }
    }
  }
  consoleLogger.push("Directions", directions);
  actions = actions.filter((action) => directions[action] !== undefined);
  if (directions[next] >= symbolOptions.agreement) {
    direction = next;
  } else if (
    (profit === "TAKE_PROFIT" || profit === "STOP_LOSS") &&
    directions[next] >= symbolOptions.agreement / 0.75
  ) {
    direction = next;
  } else {
    direction = "HOLD";
  }

  if (symbolOptions.indicators.OpenAI !== undefined && symbolOptions.indicators.OpenAI.enabled) {
    const checkGPT = await checkGPTSignals(consoleLogger, symbol, candlesticks, indicators, symbolOptions);
    if (symbolOptions.indicators.OpenAI.overwrite === true) {
      direction = checkGPT;
    } else {
      if (checkGPT !== "SKIP" && checkGPT !== direction) {
        direction = "HOLD";
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
};

export const placeTrade = async (
  discord: Client,
  exchange: Exchange,
  consoleLogger: ConsoleLogger,
  symbol: string,
  candlesticks: Candlesticks,
  filter: Filter,
  processOptions: ConfigOptions,
  exchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions,
) => {
  const orderBook = exchangeOptions.orderbooks[symbol.split("/").join("")];
  const indicators = calculateIndicators(symbol, candlesticks, symbolOptions, consoleLogger);
  const [profit, direction] = await tradeDirection(
    consoleLogger,
    symbol,
    orderBook,
    candlesticks,
    indicators,
    exchangeOptions,
    symbolOptions,
    filter,
  );
  var handledOpenOrders = true;
  if (symbolOptions.currentOrder !== undefined) {
    handledOpenOrders = await handleOpenOrders(discord, exchange, symbol, orderBook, processOptions, symbolOptions);
  }
  // console.log(handledOpenOrders);
  if (handledOpenOrders) {
    if (direction === "SELL" && (profit === "SELL" || profit === "SKIP")) {
      logToFile(
        "./logs/debug.log",
        `const [${profit}, ${direction}] = await tradeDirection(consoleLogger, ${symbol}, orderBook, candlesticks, indicators, exchangeOptions, symbolOptions, filter);`,
      );
      return sell(
        discord,
        exchange,
        consoleLogger,
        symbol,
        profit,
        orderBook,
        filter,
        processOptions,
        exchangeOptions,
        symbolOptions,
        undefined,
      );
    } else if (direction === "BUY" && (profit === "BUY" || profit === "SKIP")) {
      logToFile(
        "./logs/debug.log",
        `const [${profit}, ${direction}] = await tradeDirection(consoleLogger, ${symbol}, orderBook, candlesticks, indicators, exchangeOptions, symbolOptions, filter);`,
      );
      return buy(
        discord,
        exchange,
        consoleLogger,
        symbol,
        profit,
        orderBook,
        filter,
        processOptions,
        exchangeOptions,
        symbolOptions,
        undefined,
      );
    }
  }
  return false;
};

const subCalculateIndicators = (
  candlesticks: Candlestick[],
  indicators: Indicators,
  timeframe: string,
  symbolOptions: SymbolOptions,
  consoleLogger: ConsoleLogger,
): Indicators => {
  if (symbolOptions.indicators !== undefined) {
    indicators.sma[timeframe] = calculateSMA(
      candlesticks,
      symbolOptions.indicators?.sma?.length!,
      symbolOptions.source,
    );
    if (symbolOptions.indicators.sma?.enabled) {
      logSMASignals(consoleLogger, indicators.sma[timeframe]);
    }
    if (symbolOptions.indicators.rsi?.enabled) {
      indicators.rsi[timeframe] = calculateRSI(
        candlesticks,
        symbolOptions.indicators.rsi.length,
        symbolOptions.indicators.rsi.smoothing?.type,
        symbolOptions.indicators.rsi.smoothing?.length,
        symbolOptions.source,
      );
      logRSISignals(consoleLogger, indicators.rsi[timeframe]);
    }
    if (symbolOptions.indicators.adx?.enabled) {
      indicators.adx[timeframe] = calculateADX(
        candlesticks,
        symbolOptions.indicators.adx.dilength,
        symbolOptions.indicators.adx.adxSmoothing,
      );
      logADXSignals(consoleLogger, indicators.adx[timeframe]);
    }
    if (symbolOptions.indicators.macd?.enabled) {
      indicators.macd[timeframe] = calculateMACD(
        candlesticks,
        symbolOptions.indicators.macd.fast,
        symbolOptions.indicators.macd.slow,
        symbolOptions.indicators.macd.signal,
        symbolOptions.source,
      );
      logMACDSignals(consoleLogger, indicators.macd[timeframe]);
    }
    if (symbolOptions.indicators.atr?.enabled) {
      logATRSignals(consoleLogger, indicators.atr[timeframe]);
    }
    if (symbolOptions.indicators.bb?.enabled) {
      indicators.bollingerBands[timeframe] = calculateBollingerBands(
        candlesticks,
        symbolOptions.indicators.bb.average,
        symbolOptions.indicators.bb.length,
        symbolOptions.indicators.bb.multiplier,
        symbolOptions.source,
      );
      logBollingerBandsSignals(consoleLogger, candlesticks, indicators.bollingerBands[timeframe]);
    }
    if (symbolOptions.indicators.so?.enabled) {
      indicators.stochasticOscillator[timeframe] = calculateStochasticOscillator(
        candlesticks,
        symbolOptions.indicators.so.kPeriod,
        symbolOptions.indicators.so.dPeriod,
        symbolOptions.indicators.so.smoothing,
      );
      logStochasticOscillatorSignals(consoleLogger, indicators.stochasticOscillator[timeframe]);
    }
    if (symbolOptions.indicators.srsi?.enabled) {
      indicators.stochasticRSI[timeframe] = calculateStochasticRSI(
        candlesticks,
        symbolOptions.indicators.srsi.rsiLength,
        symbolOptions.indicators.srsi.stochLength,
        symbolOptions.indicators.srsi.smoothK,
        symbolOptions.indicators.srsi.smoothD,
        symbolOptions.indicators.rsi?.smoothing?.type,
        symbolOptions.source,
      );
      logStochasticRSISignals(consoleLogger, indicators.stochasticRSI[timeframe]);
    }
    if (symbolOptions.indicators.obv?.enabled) {
      indicators.obv[timeframe] = calculateOBV(candlesticks);
      logOBVSignals(consoleLogger, candlesticks, indicators.obv[timeframe]);
    }
    if (symbolOptions.indicators.cmf?.enabled) {
      indicators.cmf[timeframe] = calculateCMF(candlesticks, symbolOptions.indicators.cmf.length);
      logCMFSignals(consoleLogger, indicators.cmf[timeframe], symbolOptions);
    }
    if (symbolOptions.indicators.dmi?.enabled) {
      indicators.dmi[timeframe] = calculateDMI(
        candlesticks,
        symbolOptions.indicators.dmi.dmiLength,
        symbolOptions.indicators.dmi.adxSmoothing,
      );
      logDMISignals(consoleLogger, indicators.dmi[timeframe]);
    }
    if (symbolOptions.indicators.williamsR?.enabled) {
      indicators.williamsR[timeframe] = calculateWilliamsR(candlesticks, symbolOptions.indicators.williamsR.period);
      logWilliamsRSignals(consoleLogger, indicators.williamsR[timeframe]);
    }
    if (symbolOptions.indicators.cci?.enabled) {
      indicators.cci[timeframe] = calculateCCI(candlesticks, symbolOptions.indicators.cci.period);
      logCCISignals(consoleLogger, indicators.cci[timeframe]);
    }
    if (symbolOptions.indicators.mfi?.enabled) {
      indicators.mfi[timeframe] = calculateMFI(candlesticks, symbolOptions.indicators.mfi.period);
      logMFISignals(consoleLogger, indicators.mfi[timeframe]);
    }
    if (symbolOptions.indicators.chaikin?.enabled) {
      indicators.chaikinOscillator[timeframe] = calculateChaikinOscillator(
        candlesticks,
        symbolOptions.indicators.chaikin.fastPeriod,
        symbolOptions.indicators.chaikin.slowPeriod,
      );
      logChaikinOscillatorSignals(consoleLogger, indicators.chaikinOscillator[timeframe]);
    }
    if (symbolOptions.indicators.aroon?.enabled) {
      indicators.aroon[timeframe] = calculateAroon(candlesticks, symbolOptions.indicators.aroon.period);
      logAroonSignals(consoleLogger, indicators.aroon[timeframe]);
    }
    if (symbolOptions.indicators.forceIndex?.enabled) {
      indicators.forceIndex[timeframe] = calculateForceIndex(candlesticks, symbolOptions.indicators.forceIndex.period);
      logForceIndexSignals(consoleLogger, indicators.forceIndex[timeframe]);
    }
    if (symbolOptions.indicators.ichimoku?.enabled) {
      indicators.ichimoku[timeframe] = calculateIchimoku(
        candlesticks,
        symbolOptions.indicators.ichimoku.tenkanPeriod,
        symbolOptions.indicators.ichimoku.kijunPeriod,
        symbolOptions.indicators.ichimoku.senkouPeriod,
        symbolOptions.indicators.ichimoku.displacement,
      );
      logIchimokuSignals(consoleLogger, indicators.ichimoku[timeframe]);
    }
    if (symbolOptions.indicators.parabolicSAR?.enabled) {
      indicators.parabolicSAR[timeframe] = calculateParabolicSAR(
        candlesticks,
        symbolOptions.indicators.parabolicSAR.accelerationFactor,
        symbolOptions.indicators.parabolicSAR.maxAcceleration,
      );
      logParabolicSARSingals(consoleLogger, indicators.parabolicSAR[timeframe]);
    }
    if (symbolOptions.indicators.vwap?.enabled) {
      indicators.vwap[timeframe] = calculateVWAP(
        candlesticks,
        symbolOptions.indicators.vwap.stdDevMultiplier,
        symbolOptions.indicators.vwap.resetPeriod,
      );
      logVWAPSignals(consoleLogger, indicators.vwap[timeframe]);
    }
    return indicators;
  } else {
    return {
      trend: indicators.trend,
      avg: {},
      renko: {},
      ema: {},
      adx: {},
      macd: {},
      sma: {},
      rsi: {},
      atr: {},
      obv: {},
      cmf: {},
      stochasticOscillator: {},
      stochasticRSI: {},
      bollingerBands: {},
      dmi: {},
      williamsR: {},
      cci: {},
      mfi: {},
      chaikinOscillator: {},
      aroon: {},
      forceIndex: {},
      ichimoku: {},
      parabolicSAR: {},
      vwap: {},
    };
  }
};

export const calculateIndicators = (
  symbol: string,
  candlesticks: Candlesticks,
  symbolOptions: SymbolOptions,
  consoleLogger: ConsoleLogger,
): Indicators => {
  let indicators: Indicators = {
    trend: {},
    avg: {},
    sma: {},
    ema: {},
    adx: {},
    macd: {},
    rsi: {},
    atr: {},
    bollingerBands: {},
    stochasticOscillator: {},
    stochasticRSI: {},
    obv: {},
    cmf: {},
    dmi: {},
    renko: {},
    williamsR: {},
    cci: {},
    mfi: {},
    chaikinOscillator: {},
    aroon: {},
    forceIndex: {},
    ichimoku: {},
    parabolicSAR: {},
    vwap: {},
  };
  if (
    symbolOptions.trend?.enabled &&
    candlesticks[symbol.split("/").join("")][symbolOptions.trend.timeframe] !== undefined
  ) {
    indicators.trend = {
      short: calculateEMA(
        candlesticks[symbol.split("/").join("")][symbolOptions.trend?.timeframe!],
        symbolOptions.indicators?.ema?.short!,
        "close",
      ),
      long: calculateEMA(
        candlesticks[symbol.split("/").join("")][symbolOptions.trend?.timeframe!],
        symbolOptions.indicators?.ema?.long!,
        "close",
      ),
    };
  }
  const timeframes = symbolOptions.timeframes;
  for (let i = 0; i < timeframes.length; i++) {
    if (symbolOptions.indicators !== undefined) {
      indicators.avg[timeframes[i]] = calculateAverage(candlesticks[symbol.split("/").join("")][timeframes[i]]);
      //logAverageSignals(consoleLogger, candlesticks[symbol.split("/").join("")][timeframes[i]], indicators.avg[timeframes[i]]);
      indicators.ema[timeframes[i]] = {
        short: calculateEMA(
          candlesticks[symbol.split("/").join("")][timeframes[i]],
          symbolOptions.indicators?.ema?.short!,
          symbolOptions.source,
        ),
        long: calculateEMA(
          candlesticks[symbol.split("/").join("")][timeframes[i]],
          symbolOptions.indicators?.ema?.long!,
          symbolOptions.source,
        ),
      };
      //logEMASignals(consoleLogger, indicators.ema[timeframes[i]]);
      indicators.atr[timeframes[i]] = calculateATR(
        candlesticks[symbol.split("/").join("")][timeframes[i]],
        symbolOptions.indicators?.atr?.length,
        symbolOptions.source,
      );
      if (symbolOptions.indicators.renko !== undefined && symbolOptions.indicators.renko.enabled) {
        symbolOptions.indicators.renko.brickSize = calculateBrickSize(indicators.atr[timeframes[i]], symbolOptions);
        indicators.renko[timeframes[i]] = calculateRenko(
          candlesticks[symbol.split("/").join("")][timeframes[i]],
          symbolOptions.indicators.renko.brickSize,
        );
        //logRenkoSignals(consoleLogger, indicators.renko[timeframes[i]], options);
        indicators = subCalculateIndicators(
          indicators.renko[timeframes[i]] as Candlestick[],
          indicators,
          timeframes[i],
          symbolOptions,
          consoleLogger,
        );
      } else {
        indicators = subCalculateIndicators(
          candlesticks[symbol.split("/").join("")][timeframes[i]],
          indicators,
          timeframes[i],
          symbolOptions,
          consoleLogger,
        );
      }
    }
  }
  return indicators;
};

export const algorithmic = async (
  discord: Client,
  exchange: Exchange,
  consoleLogger: ConsoleLogger,
  symbol: string,
  candlesticks: Candlesticks,
  processOptions: ConfigOptions,
  exchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions,
) => {
  if (exchangeOptions.balances === undefined || exchangeOptions.balances[symbol.split("/").join("")] === undefined) {
    exchangeOptions.balances = await getCurrentBalances(exchange);
  }
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
  exchangeOptions.tradeHistory = exchangeOptions.tradeHistory || {};
  exchangeOptions.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(exchange, symbol);
  if (exchangeOptions.tradeHistory[symbol.split("/").join("")] === undefined) {
    consoleLogger.push("error", `${symbol}: could not retrieve trade history`);
    return false;
  }
  if (candlesticks[symbol.split("/").join("")][timeframe[0]]?.length < symbolOptions.indicators?.ema?.long!) {
    consoleLogger.push(`warning`, `Not enough candlesticks for calculations, please wait.`);
    return false;
  }
  if (!Array.isArray(timeframe) || timeframe?.length === 0) {
    return false;
  }
  const latestCandle =
    candlesticks[symbol.split("/").join("")][timeframe[0]][
      candlesticks[symbol.split("/").join("")][timeframe[0]]?.length - 1
    ];
  const prevCandle =
    candlesticks[symbol.split("/").join("")][timeframe[0]][
      candlesticks[symbol.split("/").join("")][timeframe[0]]?.length - 2
    ];
  const candleTime = new Date(latestCandle.time).toLocaleString("fi-FI");
  consoleLogger.push("Symbol", symbol.split("/").join(""));
  if (exchangeOptions.tradeHistory[symbol.split("/").join("")]?.length > 0) {
    const lastTradeTime =
      exchangeOptions.tradeHistory[symbol.split("/").join("")][
        exchangeOptions.tradeHistory[symbol.split("/").join("")].length - 1
      ].time;
    const lastTradeDate = new Date(lastTradeTime);
    consoleLogger.push("Last trade time", lastTradeDate.toLocaleString("fi-FI"));
  } else {
    consoleLogger.push("Last trade time", "No trades done!");
  }
  if (latestCandle !== undefined) {
    consoleLogger.push("Candlestick", {
      time: candleTime,
      open: latestCandle.open,
      high: latestCandle.high,
      low: latestCandle.low,
      close: latestCandle.close,
      color: latestCandle.close > latestCandle.open ? "Green" : "Red",
      direction:
        latestCandle.close > prevCandle?.close
          ? "Rising"
          : latestCandle.close < prevCandle?.close
            ? "Dropping"
            : "Stagnant",
      final: latestCandle.isFinal,
      candlesticks: candlesticks[symbol.split("/").join("")][timeframe[0]]?.length,
    });
  }
  const [baseCurrency, quoteCurrency] = symbol.split("/");
  const baseBalance = exchangeOptions.balances[baseCurrency]
    ? exchangeOptions.balances[baseCurrency].crypto.toFixed(7) + " " + baseCurrency
    : "0 " + baseCurrency;
  const quoteBalance = exchangeOptions.balances[quoteCurrency]
    ? exchangeOptions.balances[quoteCurrency].crypto.toFixed(7) + " " + quoteCurrency
    : "0 " + quoteCurrency;
  consoleLogger.push("Balance", {
    base: baseBalance,
    quote: quoteBalance,
  });
  const placedTrade = await placeTrade(
    discord,
    exchange,
    consoleLogger,
    symbol,
    candlesticks,
    filter,
    processOptions,
    exchangeOptions,
    symbolOptions,
  );
  const stopTime = Date.now();
  consoleLogger.push(`Calculation speed (ms)`, stopTime - startTime);
  if (latestCandle.isFinal === true) {
    exchangeOptions.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(exchange, symbol);
  }
  if (exchangeOptions.name === "binance") {
    if (exchangeOptions.console === "trade/final" && (placedTrade !== false || latestCandle.isFinal)) {
      consoleLogger.print("blue");
      consoleLogger.flush();
    } else if (exchangeOptions.console === "trade/final" && placedTrade === false && latestCandle.isFinal === false) {
      consoleLogger.flush();
    } else if (exchangeOptions.console === "trade" && placedTrade === true) {
      consoleLogger.print("blue");
      consoleLogger.flush();
    } else if (exchangeOptions.console === "trade" && placedTrade === false) {
      consoleLogger.flush();
    } else if (exchangeOptions.console === "final" && latestCandle.isFinal === true) {
      consoleLogger.print("blue");
      consoleLogger.flush();
    } else if (exchangeOptions.console === "final" && latestCandle.isFinal === false) {
      consoleLogger.flush();
    } else {
      consoleLogger.print("blue");
      consoleLogger.flush();
    }
  } else if (exchangeOptions.name === "xeggex" || exchangeOptions.name === "nonkyc") {
    if (exchangeOptions.console === "trade/final" && (placedTrade !== false || latestCandle.isFinal)) {
      consoleLogger.print("green");
      consoleLogger.flush();
    } else if (exchangeOptions.console === "trade/final" && placedTrade === false && latestCandle.isFinal === false) {
      consoleLogger.flush();
    } else if (exchangeOptions.console === "trade" && placedTrade === true) {
      consoleLogger.print("green");
      consoleLogger.flush();
    } else if (exchangeOptions.console === "trade" && placedTrade === false) {
      consoleLogger.flush();
    } else if (exchangeOptions.console === "final" && latestCandle.isFinal === true) {
      consoleLogger.print("green");
      consoleLogger.flush();
    } else if (exchangeOptions.console === "final" && latestCandle.isFinal === false) {
      consoleLogger.flush();
    } else {
      consoleLogger.print("green");
      consoleLogger.flush();
    }
  }

  return true;
};

const getRandomValueBetween = (x: number, close: number): number => {
  const rangeStart = Math.min(x, close);
  const rangeEnd = Math.max(x, close);
  if (rangeEnd - rangeStart < 0.01) {
    return close;
  }
  const randomValue = Math.random() * (rangeEnd - rangeStart) + rangeStart;
  return Number(randomValue.toFixed(2));
};

export const simulateAlgorithmic = async (
  symbol: string,
  candlesticks: Candlesticks,
  processOptions: ConfigOptions,
  exchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions,
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
  if (exchangeOptions.tradeHistory === undefined) {
    exchangeOptions.tradeHistory = {};
    exchangeOptions.tradeHistory[symbol.split("/").join("")] = [];
  }
  if (exchangeOptions.tradeHistory[symbol.split("/").join("")] === undefined) {
    exchangeOptions.tradeHistory[symbol.split("/").join("")] = [];
  }
  if (candlesticks[symbol.split("/").join("")][timeframes[0]]?.length < symbolOptions.indicators?.ema?.long!) {
    logger.push(`warning`, `Not enough candlesticks for calculations, please wait.`);
    return false;
  }
  const latestCandle =
    candlesticks[symbol.split("/").join("")][timeframes[0]][
      candlesticks[symbol.split("/").join("")][timeframes[0]]?.length - 1
    ];
  const prevCandle =
    candlesticks[symbol.split("/").join("")][timeframes[0]][
      candlesticks[symbol.split("/").join("")][timeframes[0]]?.length - 2
    ];
  const candleTime = new Date(latestCandle.time).toLocaleString("fi-FI");
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
  logger.push("Color", latestCandle.close > latestCandle.open ? "Green" : "Red");
  logger.push("Balance", {
    base: exchangeOptions.balances[symbol.split("/")[0]].crypto.toFixed(7) + " " + symbol.split("/")[0],
    quote: exchangeOptions.balances[symbol.split("/")[1]].crypto.toFixed(7) + " " + symbol.split("/")[1],
  });
  const emptyLogger = consoleLogger();
  const indicators: Indicators = calculateIndicators(symbol, candlesticks, symbolOptions, logger);
  const orderBook = undefined;
  const [profit, direction] = await tradeDirection(
    emptyLogger,
    symbol,
    orderBook,
    candlesticks,
    indicators,
    exchangeOptions,
    symbolOptions,
    filter,
  );
  const sellPrice = getRandomValueBetween(latestCandle.high, latestCandle.close);
  const buyPrice = getRandomValueBetween(latestCandle.low, latestCandle.close);
  if (direction === "SELL") {
    const baseSymbol = symbol.split("/")[0];
    simulateSell(
      symbol,
      balances[baseSymbol].crypto,
      sellPrice,
      balances,
      profit,
      processOptions,
      exchangeOptions,
      symbolOptions,
      latestCandle.time,
      filter,
      logger,
    );
  } else if (direction === "BUY") {
    const quoteSymbol = symbol.split("/")[1];
    simulateBuy(
      symbol,
      balances[quoteSymbol].crypto,
      buyPrice,
      balances,
      profit,
      processOptions,
      exchangeOptions,
      symbolOptions,
      latestCandle.time,
      filter,
      logger,
    );
  } else {
    return false;
  }
  logger.push("TrendMode", symbolOptions.trend?.current);
  logger.push("MinSell", symbolOptions.profit?.minimumSell);
  logger.push("MinBuy", symbolOptions.profit?.minimumBuy);
  logger.print();
  logger.flush();
  return false;
};
