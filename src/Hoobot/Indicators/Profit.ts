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

import { Orderbook } from "../Binance/Orderbook";
import { ConfigOptions } from "../Utilities/args";
import { ConsoleLogger } from "../Utilities/consoleLogger";
import { Trade, calculatePNLPercentageForLong, calculatePNLPercentageForShort, calculateUnrealizedPNLPercentageForLong, calculateUnrealizedPNLPercentageForShort, readForce } from "../Binance/Trades";
import { Candlestick } from "../Binance/Candlesticks";


export const calculateProfitSignals = (
  symbol: string,
  trend: string,
  lastTrade: Trade,
  unrealizedPNL: number,
  options: ConfigOptions
) => {
  let check = 'HOLD';
  const currentMaxPNL = options.profitCurrentMax[symbol.split("/").join("")]
  let stopLoss = currentMaxPNL + options.stopLossPNL;
  if (stopLoss > 0) {
    stopLoss == 0;
  }
  let takeProfit = currentMaxPNL - options.takeProfitPNL;
  if (takeProfit < options.takeProfitMinimumPNL) {
    takeProfit = options.takeProfitMinimumPNL
  }
  const minProfitSell = options.minimumProfitSell + options.tradeFee;
  const minProfitBuy = options.minimumProfitBuy + options.tradeFee;
  if (lastTrade.isBuyer) { // NEXT SELL
    if(options.holdUntilPositiveTrade === true && options.minimumProfitSell !== 0) {
      if (trend === "UP" && options.takeProfit === true && unrealizedPNL > options.takeProfitMinimumPNL && unrealizedPNL < currentMaxPNL && unrealizedPNL < takeProfit) {
        check = "TAKE_PROFIT";
      } else if (trend === "DOWN" && options.stopLoss === true && unrealizedPNL <= stopLoss) {
        check = "STOP_LOSS";
      } else if (trend === "UP" && unrealizedPNL > minProfitSell) {
        check = "SELL";
      } else {
        check = "HOLD"
      }
    } else {
      if (trend === "UP" && options.takeProfit === true && unrealizedPNL > options.takeProfitMinimumPNL && unrealizedPNL < currentMaxPNL && unrealizedPNL < takeProfit) {
        check = "TAKE_PROFIT";
      } else if (trend === "DOWN" && options.stopLoss === true && unrealizedPNL <= stopLoss) {
        check = "STOP_LOSS";
      }if (unrealizedPNL > 0) {
        check = "SELL";
      } else {
        check = "HOLD";
      }
    }
  } else if (!lastTrade.isBuyer) { // NEXT BUY
    if (options.holdUntilPositiveTrade === true && options.minimumProfitBuy !== 0) {
      if (trend === "DOWN" && options.takeProfit === true && unrealizedPNL > options.takeProfitMinimumPNL && unrealizedPNL < currentMaxPNL && unrealizedPNL < takeProfit) {
        check = "TAKE_PROFIT";
      } else if (trend === "UP" && options.stopLoss === true && unrealizedPNL <= stopLoss) {
        check = "STOP_LOSS";
      } else if (trend === "DOWN" && unrealizedPNL > minProfitBuy) {
        check = "BUY";
      } else {
        check = "HOLD"
      }
    } else {
      if (trend === "DOWN" && options.takeProfit === true && unrealizedPNL > options.takeProfitMinimumPNL && unrealizedPNL < currentMaxPNL && unrealizedPNL < takeProfit) {
        check = "TAKE_PROFIT";
      } else if (trend === "UP" && options.stopLoss === true && unrealizedPNL <= stopLoss) {
        check = "STOP_LOSS";
      } else {
        check = "BUY";
      }
    }
  }
  return {
    check,
    takeProfit,
    stopLoss
  };
}

export const checkProfitSignals = (
  consoleLogger: ConsoleLogger, 
  next: string,
  trend: string,
  symbol: string, 
  orderBook: Orderbook,
  options: ConfigOptions
) => {
  let check = 'HOLD';
  let lastPNL: number = 0;
  let unrealizedPNL: number = 0;
  const force = readForce(symbol.split("/").join(""))
  if (force.skip === "true") {
    return "SKIP";
  }
  if(options.tradeHistory[symbol.split("/").join("")]?.length > 0) {
    const lastTrade = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 1];
    if(options.tradeHistory[symbol.split("/").join("")]?.length > 1) {
      const olderTrade = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 2];
      if(olderTrade.isBuyer) { 
        lastPNL = calculatePNLPercentageForLong(parseFloat(olderTrade.qty), parseFloat(olderTrade.price), parseFloat(lastTrade.price));
      } else if(!olderTrade.isBuyer) { 
        lastPNL = calculatePNLPercentageForShort(parseFloat(olderTrade.qty), parseFloat(olderTrade.price), parseFloat(lastTrade.price));
      }
    }
    if (lastTrade.isBuyer === true) { 
      const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => b - a);
      unrealizedPNL = calculateUnrealizedPNLPercentageForLong(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), orderBookBids[0]);
    } else { 
      const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
      unrealizedPNL = calculateUnrealizedPNLPercentageForShort(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), orderBookAsks[0]);
    }
    if (options.profitCurrentMax[symbol.split("/").join("")] === undefined) {
      if (unrealizedPNL > 0) {
        options.profitCurrentMax[symbol.split("/").join("")] = unrealizedPNL;
      }
      options.profitCurrentMax[symbol.split("/").join("")] = 0;
    }
    if (unrealizedPNL > options.profitCurrentMax[symbol.split("/").join("")]) {
      options.profitCurrentMax[symbol.split("/").join("")] = unrealizedPNL;
    }
    const signals = calculateProfitSignals(symbol, trend, lastTrade, unrealizedPNL, options);
    check = signals.check;
    consoleLogger.push("PNL%", {
      previous: lastPNL,
      unrealized: unrealizedPNL - options.tradeFee,
      currentMax: options.profitCurrentMax[symbol.split("/").join("")],
      stopLoss: signals.stopLoss,
      takeProfit: signals.takeProfit,
      direction: check,
    });
  } else {
    check = "SKIP";
    consoleLogger.push("PNL%", {
      previous: 0,
      unrealized: 0,
      currentMax: 0,
      stopLoss: 0,
      takeProfit: 0,
      direction: check,
    });
  }
  return check;
}

export const checkProfitSignalsFromCandlesticks = (
  consoleLogger: ConsoleLogger, 
  next: string,
  trend: string,
  symbol: string, 
  candlesticks: Candlestick[],
  options: ConfigOptions
) => {
  let check = 'HOLD';
  let lastPNL: number = 0;
  let unrealizedPNL: number = 0;
  if(options.tradeHistory[symbol.split("/").join("")]?.length > 0) {
    const lastTrade = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 1];
    if(options.tradeHistory[symbol.split("/").join("")]?.length > 1) {
      const olderTrade = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 2];
      if(olderTrade.isBuyer) { 
        lastPNL = calculatePNLPercentageForLong(parseFloat(olderTrade.qty), parseFloat(olderTrade.price), parseFloat(lastTrade.price));
      } else if(!olderTrade.isBuyer) { 
        lastPNL = calculatePNLPercentageForShort(parseFloat(olderTrade.qty), parseFloat(olderTrade.price), parseFloat(lastTrade.price));
      }
    }
    const close = candlesticks[candlesticks.length - 1].close;
    const time = candlesticks[candlesticks.length - 1].time;
    if (lastTrade.isBuyer === true) { 
      unrealizedPNL = calculateUnrealizedPNLPercentageForLong(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), close);
    } else { 
      unrealizedPNL = calculateUnrealizedPNLPercentageForShort(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), close);
    }
    if (options.profitCurrentMax[symbol.split("/").join("")] === undefined) {
      if (unrealizedPNL > 0) {
        options.profitCurrentMax[symbol.split("/").join("")] = unrealizedPNL;
      }
      options.profitCurrentMax[symbol.split("/").join("")] = 0;
    }
    if (unrealizedPNL > options.profitCurrentMax[symbol.split("/").join("")]) {
      options.profitCurrentMax[symbol.split("/").join("")] = unrealizedPNL;
    }
    const signals = calculateProfitSignals(symbol, trend, lastTrade, unrealizedPNL, options);
    check = signals.check;
    consoleLogger.push("PNL%", {
      previous: lastPNL,
      unrealized: unrealizedPNL - options.tradeFee,
      currentMax: options.profitCurrentMax[symbol.split("/").join("")],
      stopLoss: signals.stopLoss,
      takeProfit: signals.takeProfit,
      direction: check,
    });
  } else {
    check = "SKIP";
    consoleLogger.push("PNL%", {
      previous: 0,
      unrealized: 0,
      currentMax: 0,
      stopLoss: 0,
      takeProfit: 0,
      direction: check,
    });
  }
  return check;
}