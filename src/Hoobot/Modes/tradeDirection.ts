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
import { ConsoleLogger, consoleLogger } from "../Utilities/consoleLogger";
import { logToFile } from "../Utilities/logToFile";
import { Indicators } from "./algorithmic";
import { Candlestick } from "../Binance/candlesticks";
import { filter } from "../Binance/filters";
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
import { calculatePNLPercentageForLong, calculatePNLPercentageForShort, calculateUnrealizedPNLPercentageForLong, calculateUnrealizedPNLPercentageForShort, getTradeHistory } from "../Binance/trade";
import { OrderBook } from "../Binance/orders";

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
  orderBook: OrderBook,
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
    if(force[symbol]?.skip !== true) {
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
  orderBook: OrderBook,
  balances: number[],
  options: ConfigOptions,
  filter: filter,
) => {
  let check = 'SKIP';
  if (options.panicProfitMinimum > 0) {
    const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => b - a);
    const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
    if (balances[1] > filter.minNotional || (balances[0] * orderBookBids[0]) > filter.minNotional) {
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

const checkBalanceSignals = (
  consoleLogger: ConsoleLogger, 
  symbol: string,
  quoteBalance: number,
  baseBalance: number, 
  closePrice: number,  
  options: ConfigOptions,
  filter: filter,
) => {
  let check = 'HOLD';
  const baseBalanceConverted = (baseBalance * closePrice)
  if (baseBalanceConverted > quoteBalance) {
    check = 'SELL';
  } else {
    check = 'BUY';
  }
  const tradeCheck = checkPreviousTrade(consoleLogger, symbol, options);
  if (tradeCheck === 'SELL' && check === 'BUY') {
    check = 'BUY';
  } else if (tradeCheck === 'BUY' && check === 'SELL') {
    check = 'SELL';
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
  quoteBalance: number, 
  baseBalance: number, 
  orderBook: any,
  candlesticks: Candlestick[], 
  indicators: Indicators,
  options: ConfigOptions,
  filter: filter,
) => {
  let direction = 'HOLD';
  const checks = {
    profit: checkProfitSignals(consoleLogger, symbol, orderBook, options),
    next: checkBalanceSignals(consoleLogger, symbol, quoteBalance, baseBalance, candlesticks[candlesticks.length - 1].close, options, filter),
    SMA: checkSMASignals(consoleLogger, indicators, options),
    EMA: checkEMASignals(consoleLogger, indicators, options),
    MACD: checkMACDSignals(consoleLogger, indicators, options),
    RSI: checkRSISignals(consoleLogger, indicators, options),
    StochasticOscillator: checkStochasticOscillatorSignals(consoleLogger, indicators, options),
    StochasticRSI: checkStochasticRSISignals(consoleLogger, indicators, options),
    BollingerBands: checkBollingerBandsSignals(consoleLogger, candlesticks, indicators, options),
    OBV: checkOBVSignals(consoleLogger, candlesticks, indicators, options),
    CMF: checkCMFSignals(consoleLogger, indicators, options),
    GPT: await checkGPTSignals(consoleLogger, candlesticks, indicators, options),
    panic: checkPanicProfit(consoleLogger, symbol, orderBook, [baseBalance, quoteBalance], options, filter)
  }
  const actions = ['BUY', 'SELL'];
  const whatToCheck = ['SMA', 'EMA', 'MACD', 'RSI', 'StochasticOscillator', 'StochasticRSI', 'BollingerBands', 'OBV', 'CMF'];
  for (const action in actions) {
    if ((checks.profit === action || checks.profit === 'SKIP') && checks.next === action) {
      direction = action;
      for (const checking of whatToCheck) {
        const check = checks[checking];
        const useCheck = options[`use${checking}`];
        const invalidConditions = [action, 'HOLD']
        if (useCheck && invalidConditions.includes(check)) {
          direction = 'HOLD';
          break;
        }
      }
    }
  }
  if (checks.panic !== 'SKIP') {
    direction = checks.panic;
  }
  if (options.openaiOverwrite === true) {
    direction = checks.GPT;
  }
  consoleLogger.push(`TRADE Direction`, direction);
  return direction;
}