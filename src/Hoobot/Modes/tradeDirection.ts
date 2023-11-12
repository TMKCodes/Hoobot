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

import { readFileSync } from "fs";
import { ConfigOptions } from "../Utilities/args";
import { ConsoleLogger } from "../Utilities/consoleLogger";
import { logToFile } from "../Utilities/logToFile";
import { Indicators } from "./algorithmic";
import { Candlesticks } from "../Binance/Candlesticks";
import { Filter } from "../Binance/Filters";
import { checkEMASignals } from "../Indicators/EMA";
import { checkMACDSignals } from "../Indicators/MACD";
import { checkRSISignals } from "../Indicators/RSI";
import { checkSMASignals } from "../Indicators/SMA";
import { checkStochasticOscillatorSignals, checkStochasticRSISignals } from "../Indicators/StochasticOscillator";
import { checkBollingerBandsSignals } from "../Indicators/BollingerBands";
import { checkGPTSignals } from "../Indicators/GPT";
import Binance from "node-binance-api";
import { checkOBVSignals } from "../Indicators/OBV";
import { checkCMFSignals } from "../Indicators/CMF";
import { calculatePNLPercentageForLong, calculatePNLPercentageForShort, calculateUnrealizedPNLPercentageForLong, calculateUnrealizedPNLPercentageForShort } from "../Binance/Trades";
import { Orderbook } from "../Binance/Orderbook";
import { time } from "console";


export const checkBeforeOrder = (
  symbol: string,
  direction: string,
  quantity: number,
  price: number,
  tradingPairFilters: any,
) => {
  const logFailure = (message: string) => {
    logToFile(`ORDER PLACEMENT FAILURE: ${symbol}, ${direction}, ${quantity}, ${price}, ${message}\r\n`);
    return false;
  };

  const isPriceValid = (min: number, max: number, value: number) => {
    if (value < min) {
      return logFailure(`Price too low.`);
    } else if (value > max) {
      return logFailure(`Price too high.`);
    }
    return true;
  };

  const isQuantityValid = (min: number, max: number, value: number) => {
    if (value < min) {
      return logFailure(`Amount too low.`);
    } else if (value > max) {
      return logFailure(`Amount too high.`);
    }
    return true;
  };
  
  if (
    !isPriceValid(parseFloat(tradingPairFilters.minPrice), parseFloat(tradingPairFilters.maxPrice), price) ||
    !isQuantityValid(parseFloat(tradingPairFilters.minQty), parseFloat(tradingPairFilters.maxQty), quantity) 
  ) {
    return false;
  }

  return true;
};

const checkProfitSignals = (
  consoleLogger: ConsoleLogger, 
  symbol: string, 
  orderBook: Orderbook,
  options: ConfigOptions
) => {
  let check = 'HOLD';
  let lastPNL: number = 0;
  let unrealizedPNL: number = 0;
  const force = JSON.parse(readFileSync("./force.json", 'utf-8'));
  if(options.tradeHistory[symbol.split("/").join("")]?.length > 0) {
    const lastTrade = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 1];
    if(options.tradeHistory[symbol.split("/").join("")]?.length > 1) {
      const olderTrade = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 2];
      if(olderTrade.isBuyer) { 
        lastPNL = calculatePNLPercentageForLong(parseFloat(olderTrade.quoteQty), parseFloat(olderTrade.price), parseFloat(lastTrade.price));
      } else if(!olderTrade.isBuyer) { 
        lastPNL = calculatePNLPercentageForShort(parseFloat(olderTrade.quoteQty), parseFloat(olderTrade.price), parseFloat(lastTrade.price));
      }
    }
    if (lastTrade.isBuyer === true) { 
      const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => b - a);
      unrealizedPNL = calculateUnrealizedPNLPercentageForLong(parseFloat(lastTrade.quoteQty), parseFloat(lastTrade.price), orderBookBids[0]);
    } else { 
      const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
      unrealizedPNL = calculateUnrealizedPNLPercentageForShort(parseFloat(lastTrade.quoteQty), parseFloat(lastTrade.price), orderBookAsks[0]);
    }
    if(force[symbol.split("/").join("")]?.skip !== true) {
      if (lastTrade.isBuyer === true) { 
        if(options.holdUntilPositiveTrade === true) {
          if(unrealizedPNL > options.minimumProfitSell + options.tradeFee) {
            check = "SELL";
          } else {
            check = "HOLD";
          }
        } else {
          check = "SELL"
        }
      } else { 
        if(options.holdUntilPositiveTrade === true) {
          if(unrealizedPNL > options.minimumProfitBuy + options.tradeFee) {
            check = "BUY";
          } else {
            check = "HOLD";
          }
        } else {
          check = "BUY";
        }
      }
    } else {
      check = "SKIP";
    }
    consoleLogger.push("PROFIT Previous PNL%", lastPNL);
    consoleLogger.push("PROFIT Unrealized PNL%", unrealizedPNL - options.tradeFee);
  } else {
    consoleLogger.push("PROFIT Previous PNL%", 0);
    consoleLogger.push("PROFIT Unrealized PNL%", 0);
    check = "SKIP";
  }
  consoleLogger.push("PROFIT Check", check);
  return check;
}


const checkPanicProfit = (
  consoleLogger: ConsoleLogger, 
  symbol: string, 
  orderBook: Orderbook,
  options: ConfigOptions,
  filter: Filter,
) => {
  let check = 'SKIP';
  if (options.panicProfitMinimum > 0) {
    const baseBalance = options.balances[symbol.split("/")[0]];
    const quoteBalance = options.balances[symbol.split("/")[1]];
    const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => b - a);
    const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
    if (quoteBalance > filter.minNotional || (baseBalance * orderBookBids[0]) > filter.minNotional) {
      if (options.tradeHistory[symbol.split("/").join("")]?.length > 0) {
        let unrealizedPNL: number = 0;
        const lastTrade = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 1];
        if (lastTrade.isBuyer === true) { 
          unrealizedPNL = calculateUnrealizedPNLPercentageForLong(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), orderBookBids[0]);
        } else { 
          unrealizedPNL = calculateUnrealizedPNLPercentageForShort(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), orderBookAsks[0]);
        }
        if (unrealizedPNL > options.panicProfitMinimum) {
          if (unrealizedPNL < options.panicProfitCurrentMax[symbol.split("/").join("")])  {
            if (unrealizedPNL < options.panicProfitCurrentMax[symbol.split("/").join("")] - options.panicProfitMinimumDrop) {
              if (lastTrade.isBuyer) {
                check = 'SELL';
              } else {
                check = 'BUY';
              }
            } 
          } else {
            options.panicProfitCurrentMax[symbol.split("/").join("")] = unrealizedPNL;
          }
          consoleLogger.push("PANIC Current MAX PNL%", options.panicProfitCurrentMax[symbol.split("/").join("")]);
          consoleLogger.push("PANIC Current PNL%", unrealizedPNL);
          consoleLogger.push("PANIC Current PANIC PNL%", options.panicProfitCurrentMax[symbol.split("/").join("")] - options.panicProfitMinimumDrop);
        }
      }
    }
  }
  consoleLogger.push("PANIC Check", check);
  return check;
}


const checkPreviousTrade = (
  consoleLogger: ConsoleLogger, 
  symbol: string,
  options: ConfigOptions
) => {
  let check = 'BUY';
  if (options.tradeHistory[symbol.split("/").join("")].length > 0) {
    const lastTrade = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 1];
    if (lastTrade.isBuyer) {
      check = 'BUY';
    } else {
      check = 'SELL';
    }
  }
  consoleLogger.push("PREVIOUS TRADE Check", check);
  return check;
}

const checkBalanceSignals = async (
  binance: Binance,
  consoleLogger: ConsoleLogger, 
  symbol: string,
  closePrice: number,  
  options: ConfigOptions,
  filter: Filter,
) => {
  let check = 'HOLD';
  const baseBalance = options.balances[symbol.split("/")[0]];
  const quoteBalance = options.balances[symbol.split("/")[1]];
  const baseBalanceConverted = (baseBalance * closePrice);
  const tradeCheck = checkPreviousTrade(consoleLogger, symbol, options);
  if (tradeCheck === 'SELL') {
    if (quoteBalance > parseFloat(filter.minNotional)) {
      check = 'BUY';
    } else {
      check = 'HOLD';
    }
  } else if (tradeCheck === 'BUY') {
    if (baseBalanceConverted > parseFloat(filter.minNotional)) {
      check = 'SELL'
    } else {
      check = 'HOLD';
    }
  }
  if (check === 'SELL' && (baseBalanceConverted < filter.minNotional || baseBalanceConverted > filter.maxNotional)) {
    check = 'HOLD';
  } else if (check === 'BUY' && (quoteBalance < filter.minNotional || quoteBalance > filter.maxNotional)) {
    check = 'HOLD';
  }
  consoleLogger.push("NEXT TRADE Check", check);
  return check;
}

export const tradeDirection = async (
  binance: Binance,
  consoleLogger: ConsoleLogger,
  symbol: string,
  orderBook: Orderbook,
  candlesticks: Candlesticks, 
  indicators: Indicators,
  options: ConfigOptions,
  filter: Filter,
) => {
  symbol = symbol.split("/").join("");
  const startTime = Date.now();
  let directions = [];
  const timeframes = Object.keys(candlesticks[symbol]);
  for (let i = 0; i < timeframes.length; i++) {
    let direction = 'HOLD';
    const checks = {
      profit: checkProfitSignals(consoleLogger, symbol, orderBook, options),
      next: await checkBalanceSignals(binance, consoleLogger, symbol, candlesticks[symbol][timeframes[i]][candlesticks[symbol][timeframes[i]].length - 1].close, options, filter),
      SMA: checkSMASignals(consoleLogger, indicators.sma[timeframes[i]], options),
      EMA: checkEMASignals(consoleLogger, indicators.ema[timeframes[i]], options),
      MACD: checkMACDSignals(consoleLogger, indicators.macd[timeframes[i]], options),
      RSI: checkRSISignals(consoleLogger, indicators.rsi[timeframes[i]], options),
      StochasticOscillator: checkStochasticOscillatorSignals(consoleLogger, indicators.stochasticOscillator[timeframes[i]], options),
      StochasticRSI: checkStochasticRSISignals(consoleLogger, indicators.stochasticRSI[timeframes[i]], options),
      BollingerBands: checkBollingerBandsSignals(consoleLogger, candlesticks[symbol][timeframes[i]], indicators.bollingerBands[timeframes[i]], options),
      OBV: checkOBVSignals(consoleLogger, candlesticks[symbol][timeframes[i]], indicators.obv[timeframes[i]], options),
      CMF: checkCMFSignals(consoleLogger, indicators.cmf[timeframes[i]], options),
      panic: checkPanicProfit(consoleLogger, symbol, orderBook, options, filter)
    }
    const actions = ['BUY', 'SELL'];
    const whatToCheck = ['SMA', 'EMA', 'MACD', 'RSI', 'StochasticOscillator', 'StochasticRSI', 'BollingerBands', 'OBV', 'CMF'];
    for (let i = 0; i < actions.length; i++) {
      if ((checks.profit === actions[i] || checks.profit === 'SKIP') && checks.next === actions[i]) {
        direction = actions[i];
        for (let i = 0; i < whatToCheck.length; i++) {
          const check = checks[whatToCheck[i]];
          const useCheck = options[`use${whatToCheck[i]}`];
          const invalidConditions = [actions[i], 'HOLD'];
          if (useCheck && invalidConditions.includes(check)) {
            direction = 'HOLD';
            break;
          }
        }
      }
    }
    if (checks.panic !== 'SKIP') {
      if (checks.panic === checks.next) {
        direction = checks.panic;
      }
    }
    directions.push(direction);
  }
  let rightDirection = 'HOLD';
  if (directions.length === 0) {
    console.log("ERROR: Could not check directions!");
  } else {
    let sell = 0;
    let buy = 0;
    let hold = 0;
    for (let i = 0; i < directions.length; i++) {
      if (directions[i] === "BUY") {
        buy++;
      } else if (directions[i] === "SELL") {
        sell++;
      } else {
        hold++;
      }
    }
    consoleLogger.push("Timeframe Direction", sell + " SELL, " + buy + " BUY, " + hold + " HOLD");
    if (sell === 0 && buy === timeframes.length) {
      rightDirection = 'BUY';
    } else if (buy === 0 && sell === timeframes.length) {
      rightDirection = 'SELL';
    }
  }
  if (options.useGPT) {
    const checkGPT = await checkGPTSignals(consoleLogger, symbol, candlesticks, indicators, options);
    if (options.openaiOverwrite === true) {
      rightDirection = checkGPT;
    } else {
      if (rightDirection !== checkGPT) {
        rightDirection = 'HOLD';
      }
    }
  }
  consoleLogger.push(`TRADE Direction`, rightDirection);
  const stopTime = Date.now();
  consoleLogger.push(`Time to decide direction (ms)`, stopTime - startTime);
  return rightDirection;
}