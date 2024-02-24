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

import { Orderbook } from "../Exchanges/Orderbook";
import { ConfigOptions } from "../Utilities/args";
import { ConsoleLogger } from "../Utilities/consoleLogger";
import { Trade, calculatePNLPercentageForLong, calculatePNLPercentageForShort, calculateUnrealizedPNLPercentageForLong, calculateUnrealizedPNLPercentageForShort, readForceSkip } from "../Exchanges/Trades";
import { Candlestick } from "../Exchanges/Candlesticks";
import { reverseSign } from "../Modes/Algorithmic";

const sleep = async (ms: number) => await new Promise(r => setTimeout(r, ms));


export const calculateProfitSignals = async (
  symbol: string,
  newTrend: string,
  next: string,
  lastTrade: Trade,
  lastPNL: number,
  unrealizedPNL: number,
  closeTime: number,
  options: ConfigOptions
) => {
  let check = 'HOLD';
  const timeSinceLastTrade = (closeTime - lastTrade.time)  / (1000 * 60 * 60);
  const hoursSinceLastTrade = Math.ceil((closeTime - lastTrade.time)  / (1000 * 60 * 60));
  // console.log(hoursSinceLastTrade);
  const currentMaxPNL = options.profitCurrentMax[symbol.split("/").join("")];
  const stoppLossAging = (options.stopLossAgingPerHour * hoursSinceLastTrade);
  let stopLoss = currentMaxPNL + options.stopLossPNL + stoppLossAging;
  // console.log(`${currentMaxPNL} + ${options.stopLossPNL} + ${stoppLossAging} = ${stopLoss}`);
  if (stopLoss > 0) {
    stopLoss == 0;
  }
  let takeProfit = currentMaxPNL - options.takeProfitPNL;
  if (takeProfit < options.takeProfitMinimumPNL) {
    takeProfit = options.takeProfitMinimumPNL
  }
  if(options.trendEnabled === true) {
    if (newTrend === "SHORT" && options.currentTrendMode === "LONG" || options.currentTrendMode === undefined) {
      const temp = options.minimumProfitSell;
      options.minimumProfitSell = options.minimumProfitBuy;
      options.minimumProfitBuy = temp;
      options.currentTrendMode = "SHORT";
    } else if(newTrend === "LONG" && options.currentTrendMode == "SHORT") {
      const temp = options.minimumProfitSell;
      options.minimumProfitSell = options.minimumProfitBuy;
      options.minimumProfitBuy = temp;
      options.currentTrendMode = "LONG";
    } else if ((options.currentTrendMode !== "LONG" && options.currentTrendMode !== "SHORT") || options.currentTrendMode === undefined) {
      options.currentTrendMode = "LONG";
    }
  }
  
  const minProfitSell = options.minimumProfitSell + options.tradeFee;
  const minProfitBuy = options.minimumProfitBuy + options.tradeFee;
  if (options.minimumTimeSinceLastTrade > 0 && timeSinceLastTrade > options.minimumTimeSinceLastTrade) {
    if (options.takeProfit === true && unrealizedPNL > 0) {
      check = "TAKE_PROFIT";
    } else if (options.stopLoss === true && unrealizedPNL < 0) {
      check = "STOP_LOSS";
    }
  } else if (next === "SELL") { // NEXT SELL
    if (options.holdUntilPositiveTrade === true && options.minimumProfitSell !== 0) {
      if (options.takeProfit === true && unrealizedPNL > options.takeProfitMinimumPNL && unrealizedPNL < currentMaxPNL && unrealizedPNL < takeProfit) {
        check = "TAKE_PROFIT";
      } else if (options.stopLoss === true && unrealizedPNL <= stopLoss) {
        check = "STOP_LOSS";
      } else if (unrealizedPNL > minProfitSell) {
        check = "SELL";
      } else {
        check = "HOLD"
      }
    } else {
      if (options.takeProfit === true && unrealizedPNL > options.takeProfitMinimumPNL! && unrealizedPNL < currentMaxPNL && unrealizedPNL < takeProfit) {
        check = "TAKE_PROFIT";
      } else if (options.stopLoss === true && unrealizedPNL <= stopLoss) {
        check = "STOP_LOSS";
      } else  {
        check = "SELL";
      }
    }
  } else if (next === "BUY") { // NEXT BUY
    if (options.holdUntilPositiveTrade === true && options.minimumProfitBuy !== 0) {
      if (options.takeProfit === true && unrealizedPNL > options.takeProfitMinimumPNL! && unrealizedPNL < currentMaxPNL && unrealizedPNL < takeProfit) {
        check = "TAKE_PROFIT";
      } else if (options.stopLoss === true && unrealizedPNL <= stopLoss) {
        check = "STOP_LOSS";
      } else if (unrealizedPNL > minProfitBuy) {
        check = "BUY";
      } else {
        check = "HOLD"
      }
    } else {
      if (options.takeProfit === true && unrealizedPNL > options.takeProfitMinimumPNL! && unrealizedPNL < currentMaxPNL && unrealizedPNL < takeProfit) {
        check = "TAKE_PROFIT";
      } else if (options.stopLoss === true && unrealizedPNL <= stopLoss) {
        check = "STOP_LOSS";
      } else {
        check = "BUY";
      }
    }
  }
  if (options.holdUntilPositiveTrade === true && (lastPNL < 0 && unrealizedPNL < 0 && check !== "STOP_LOSS" && check !== "BUY")) {
    check = "HOLD";
  }
  return {
    check,
    takeProfit,
    stopLoss
  };
}

export const checkProfitSignals = async (
  consoleLogger: ConsoleLogger, 
  next: string,
  trend: string,
  symbol: string, 
  orderBook: Orderbook,
  closeTime: number,
  options: ConfigOptions
) => {
  let check = 'HOLD';
  let lastPNL: number = 0;
  let unrealizedPNL: number = 0;
  const skip = readForceSkip(symbol.split("/").join(""))
  if (skip === true) {
    check = "SKIP";
    consoleLogger.push("PNL%", {
      previous: 0,
      unrealized: 0,
      currentMax: 0,
      stopLoss: 0,
      takeProfit: 0,
      direction: check,
    });
  } else {
    if(options.tradeHistory !== undefined && options.tradeHistory[symbol.split("/").join("")]?.length > 0) {
      const lastTrade = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 1];
      if(options.tradeHistory[symbol.split("/").join("")]?.length > 1) {
        const olderTrade = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 2];
        if(olderTrade.isBuyer) { 
          lastPNL = calculatePNLPercentageForLong(parseFloat(olderTrade.price), parseFloat(lastTrade.price));
        } else if(!olderTrade.isBuyer) { 
          lastPNL = calculatePNLPercentageForShort(parseFloat(olderTrade.price), parseFloat(lastTrade.price));
        }
      }
      if (lastTrade.isBuyer) { 
        const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => b - a);
        unrealizedPNL = calculateUnrealizedPNLPercentageForLong(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), orderBookBids[0]);
      } else if (!lastTrade.isBuyer) { 
        const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
        unrealizedPNL = calculateUnrealizedPNLPercentageForShort(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), orderBookAsks[0]);
      }
      if (lastTrade.isBuyer && next === "BUY") {
        unrealizedPNL = reverseSign(unrealizedPNL);
      } else if(!lastTrade.isBuyer && next === "SELL") {
        unrealizedPNL = reverseSign(unrealizedPNL);
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
      const signals = await calculateProfitSignals(symbol, trend, next, lastTrade, lastPNL, unrealizedPNL, closeTime, options);
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
  }
  return check;
}

export const checkProfitSignalsFromCandlesticks = async (
  consoleLogger: ConsoleLogger, 
  next: string,
  trend: string,
  symbol: string, 
  candlesticks: Candlestick[],
  closeTime: number,
  options: ConfigOptions
) => {
  let check = 'HOLD';
  let lastPNL: number = 0;
  let unrealizedPNL: number = 0;
  if(options.tradeHistory !== undefined && options.tradeHistory[symbol.split("/").join("")]?.length > 0) {
    const lastTrade = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 1];
    if(options.tradeHistory[symbol.split("/").join("")]?.length > 1) {
      const olderTrade = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 2];
      if(olderTrade.isBuyer) { 
        lastPNL = calculatePNLPercentageForLong(parseFloat(olderTrade.price), parseFloat(lastTrade.price));
      } else if(!olderTrade.isBuyer) { 
        lastPNL = calculatePNLPercentageForShort(parseFloat(olderTrade.price), parseFloat(lastTrade.price));
      }
    }
    const close = candlesticks[candlesticks.length - 1].close;
    if (lastTrade.isBuyer === true) { 
      unrealizedPNL = calculateUnrealizedPNLPercentageForLong(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), close);
    } else { 
      unrealizedPNL = calculateUnrealizedPNLPercentageForShort(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), close);
    }
    if (lastTrade.isBuyer && next === "BUY") {
      unrealizedPNL = reverseSign(unrealizedPNL);
    } else if(!lastTrade.isBuyer && next === "SELL") {
      unrealizedPNL = reverseSign(unrealizedPNL);
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
    const signals = await calculateProfitSignals(symbol, trend, next, lastTrade, lastPNL, unrealizedPNL, closeTime, options);
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