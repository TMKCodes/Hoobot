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
import { symbolFilters } from "../..";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import { ConfigOptions, ExchangeOptions, getSecondsFromInterval, SymbolOptions } from "../Utilities/Args";
import { buy, calculateROI, calculateUnrealizedPNLPercentageForLong, calculateUnrealizedPNLPercentageForShort, getTradeHistory, sell } from "../Exchanges/Trades";
import { Exchange } from "../Exchanges/Exchange";
import { logToFile } from "../Utilities/LogToFile";
import { Candlesticks } from "../Exchanges/Candlesticks";
import { calculateIndicators, Indicators } from "./Algorithmic";
import { Filter } from "../Exchanges/Filters";
import { Orderbook } from "../Exchanges/Orderbook";
import { checkBalanceSignals } from "../Indicators/Balance";
import { checkEMASignals, checkTrendSignal } from "../Indicators/EMA";
import { checkSMASignals } from "../Indicators/SMA";
import { checkRenkoSignals } from "../Indicators/Renko";
import { checkMACDSignals } from "../Indicators/MACD";
import { checkRSISignals } from "../Indicators/RSI";
import { checkStochasticOscillatorSignals, checkStochasticRSISignals } from "../Indicators/StochasticOscillator";
import { checkBollingerBandsSignals } from "../Indicators/BollingerBands";
import { checkOBVSignals } from "../Indicators/OBV";
import { checkCMFSignals } from "../Indicators/CMF";

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
  candlesticks: Candlesticks, 
  indicators: Indicators,
  exchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions,
  filter: Filter,
): Promise<string> => {
  const startTime = Date.now();
  const timeframes = symbolOptions.timeframes;
  let calculatedDirection = 'HOLD';
  const directions: Directions = {
    BUY: 0,
    SELL: 0,
    HOLD: 0,
  };
  let actions = ['BUY', 'SELL', 'HOLD'];
  const closePrice = candlesticks[symbol.split("/").join("")][timeframes[0]][candlesticks[symbol.split("/").join("")][timeframes[0]].length - 1].close;
  const next = checkBalanceSignals(consoleLogger, symbol, closePrice, exchangeOptions, filter);
  if (symbolOptions.indicators === undefined) {
    return "HOLD";
  }
  const weights: Weights = {
    SMAWeight: symbolOptions.indicators.sma?.weight!,
    EMAWeight: symbolOptions.indicators.ema?.weight!,
    MACDWeight: symbolOptions.indicators.macd?.weight!,
    RSIWeight: symbolOptions.indicators.rsi?.weight!,
    StochasticOscillatorWeight: symbolOptions.indicators.so?.weight!,
    StochasticRSIWeight: symbolOptions.indicators.srsi?.weight!,
    BollingerBandsWeight: symbolOptions.indicators.bb?.weight!,
    OBVWeight: symbolOptions.indicators.obv?.weight!,
    CMFWeight: symbolOptions.indicators.cmf?.weight!,
    RenkoWeight: symbolOptions.indicators.renko?.weight!,
  }
  // console.log(timeframes.length);
  for (let timeframeIndex = 0; timeframeIndex < timeframes.length; timeframeIndex++) {
    const checks: Checks = {
      SMA: checkSMASignals(indicators.sma[timeframes[timeframeIndex]], symbolOptions),
      Renko: checkRenkoSignals(indicators.renko[timeframes[timeframeIndex]], symbolOptions),
      EMA: checkEMASignals(indicators.ema[timeframes[timeframeIndex]], symbolOptions),
      MACD: checkMACDSignals(indicators.macd[timeframes[timeframeIndex]], symbolOptions),
      RSI: checkRSISignals(indicators.rsi[timeframes[timeframeIndex]], symbolOptions),
      StochasticOscillator: checkStochasticOscillatorSignals(indicators.stochasticOscillator[timeframes[timeframeIndex]], symbolOptions),
      StochasticRSI: checkStochasticRSISignals(indicators.stochasticRSI[timeframes[timeframeIndex]], symbolOptions),
      BollingerBands: checkBollingerBandsSignals(candlesticks[symbol.split("/").join("")][timeframes[timeframeIndex]], indicators.bollingerBands[timeframes[timeframeIndex]], symbolOptions),
      OBV: checkOBVSignals(candlesticks[symbol.split("/").join("")][timeframes[timeframeIndex]], indicators.obv[timeframes[timeframeIndex]], symbolOptions),
      CMF: checkCMFSignals(indicators.cmf[timeframes[timeframeIndex]], symbolOptions),
    }
    const keys = Object.keys(checks).filter(check => checks[check] !== 'SKIP');
    const keysLength = keys.length;
    consoleLogger.push(`Indicator checks ${timeframes[timeframeIndex]}`, checks);
    for (let actionsIndex = 0; actionsIndex < actions.length; actionsIndex++) {
      let weightedSum = 0;
      let totalWeight = 0;
      for (let keysIndex = 0; keysIndex < keysLength; keysIndex++) {
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
  directions.BUY = Number(directions.BUY.toFixed(2));
  directions.SELL = Number(directions.SELL.toFixed(2));
  directions.HOLD = Number(directions.HOLD.toFixed(2));
  actions = actions.filter(action => directions[action] !== undefined);
  for (let actionsIndex = 0; actionsIndex < actions.length; actionsIndex++) {
    if(next == actions[actionsIndex]) {
      if (directions[actions[actionsIndex]] >= symbolOptions.agreement) {
        calculatedDirection = actions[actionsIndex];
        break;
      }
    }
  }
  if (symbolOptions.consecutiveTradeAllowed === undefined) {
    symbolOptions.consecutiveTradeAllowed = true;
  }
  if (symbolOptions.consecutiveTradeAllowed === false) {
    if (symbolOptions.consecutiveDirection != calculatedDirection) {
      symbolOptions.consecutiveTradeAllowed = true;
    }
  }
  const stopTime = Date.now();
  consoleLogger.push("Directions", {
    allowed: symbolOptions.consecutiveTradeAllowed,
    target: symbolOptions.consecutiveDirection,
    current: calculatedDirection
  })
  consoleLogger.push(`Time to decide direction (ms)`, stopTime - startTime);
  if (symbolOptions.consecutiveTradeAllowed === true) {
    if (symbolOptions.consecutiveDirection !== undefined) {
      if (symbolOptions.consecutiveDirection === calculatedDirection) {
        return calculatedDirection
      }
    }
  }
  return "HOLD"
}


export const placeTrade = async (
  discord: Client,
  exchange: Exchange,
  consoleLogger: ConsoleLogger,
  symbol: string,
  candlesticks: Candlesticks,
  filter: Filter,
  processOptions: ConfigOptions,
  exchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions
) => {
  if (exchangeOptions.tradeHistory[symbol.split("/").join("")]?.length > 0) {
    const lastTradeTime = exchangeOptions.tradeHistory[symbol.split("/").join("")][exchangeOptions.tradeHistory[symbol.split("/").join("")].length - 1].time;
    const currentTime = Date.now();
    const timeDifferenceInSeconds = (currentTime - lastTradeTime) / 1000;
    if (timeDifferenceInSeconds < getSecondsFromInterval(symbolOptions.timeframes[0])) {
      return false; 
    }
  }
  const orderBook = exchangeOptions.orderbooks[symbol.split("/").join("")];
  const indicators = calculateIndicators(symbol, candlesticks, symbolOptions, consoleLogger);
  const direction = await tradeDirection(consoleLogger, symbol, candlesticks, indicators, exchangeOptions, symbolOptions, filter);
  if (direction === 'SELL') {
    const sold = await sell(discord, exchange, consoleLogger, symbol, "SKIP", orderBook, filter, processOptions, exchangeOptions, symbolOptions, symbolOptions.consecutiveQuantity);
    if (sold !== false) {
      symbolOptions.consecutiveTradeAllowed = false
    }
    return sold; 
  } else if (direction === 'BUY') {
    const bought = await buy(discord, exchange, consoleLogger, symbol, "SKIP", orderBook, filter, processOptions, exchangeOptions, symbolOptions, symbolOptions.consecutiveQuantity);
    if (bought !== false) {
      symbolOptions.consecutiveTradeAllowed = false
    }
    return bought;
  } else {
    return false;
  }
}

export const consecutive = async (
  discord: Client, 
  exchange: Exchange, 
  consoleLogger: ConsoleLogger, 
  symbol: string, 
  candlesticks: Candlesticks, 
  processOptions: ConfigOptions,
  exchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions
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
    if (exchangeOptions.tradeHistory === undefined) {
      exchangeOptions.tradeHistory = {};
      exchangeOptions.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(exchange, symbol, processOptions);
    }
    if (exchangeOptions.tradeHistory[symbol.split("/").join("")] === undefined) {
      exchangeOptions.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(exchange, symbol, processOptions);
    }
    if (exchangeOptions.tradeHistory[symbol.split("/").join("")] === undefined) {
      console.error(`${symbol}: could not retrieve trade history`);
      return false;
    }
    if (candlesticks[symbol.split("/").join("")][timeframe[0]]?.length < symbolOptions.indicators?.ema?.long!) {
      consoleLogger.push(`warning`, `Not enough candlesticks for calculations, please wait.`);
      return false;
    }
    const latestCandle = candlesticks[symbol.split("/").join("")][timeframe[0]][candlesticks[symbol.split("/").join("")][timeframe[0]]?.length - 1];
    const prevCandle = candlesticks[symbol.split("/").join("")][timeframe[0]][candlesticks[symbol.split("/").join("")][timeframe[0]]?.length - 2];
    const candleTime = (new Date(latestCandle.time)).toLocaleString('fi-FI');
    consoleLogger.push("Symbol", symbol.split("/").join(""));
    if (exchangeOptions.tradeHistory[symbol.split("/").join("")]?.length > 0) {
      const lastTradeTime = exchangeOptions.tradeHistory[symbol.split("/").join("")][exchangeOptions.tradeHistory[symbol.split("/").join("")].length - 1].time;
      const lastTradeDate = new Date(lastTradeTime);
      consoleLogger.push("Last trade time", lastTradeDate.toLocaleString("fi-FI"));
    } else {
      consoleLogger.push("Last trade time", "No trades done!");
    }
    if (latestCandle !== undefined) {
      consoleLogger.push('Candlestick', {
        time: candleTime,
        open: latestCandle.open,
        high: latestCandle.high,
        low: latestCandle.low,
        close: latestCandle.close,
        color: (latestCandle.close > latestCandle.open) ? "Green" : "Red",
        direction: (latestCandle.close > prevCandle?.close) ? "Rising" : (latestCandle.close < prevCandle?.close) ? "Dropping" : "Stagnant",
        final: latestCandle.isFinal,
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
      quote: quoteBalance
    });
    const placedTrade = await placeTrade(discord, exchange, consoleLogger, symbol, candlesticks, filter, processOptions, exchangeOptions, symbolOptions);
    const stopTime = Date.now();
    consoleLogger.push(`Calculation speed (ms)`, stopTime - startTime);
    if (latestCandle.isFinal === true) {
      exchangeOptions.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(exchange, symbol, processOptions);
    }
    if (exchangeOptions.name === "binance") {
      if (exchangeOptions.console === "trade/final" && (placedTrade !== false || latestCandle.isFinal)) {
        consoleLogger.print("blue");
        consoleLogger.flush();
      } else if (exchangeOptions.console === "trade/final" && (placedTrade === false && latestCandle.isFinal === false)) {
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
    } else if(exchangeOptions.name === "xeggex") {
      if (exchangeOptions.console === "trade/final" && (placedTrade !== false || latestCandle.isFinal)) {
        consoleLogger.print("green");
        consoleLogger.flush();
      } else if (exchangeOptions.console === "trade/final" && (placedTrade === false && latestCandle.isFinal === false)) {
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
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error(JSON.stringify(error, null, 4));
  }
  return true;
}