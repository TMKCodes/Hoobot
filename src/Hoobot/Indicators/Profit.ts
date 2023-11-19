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
import { calculatePNLPercentageForLong, calculatePNLPercentageForShort, calculateUnrealizedPNLPercentageForLong, calculateUnrealizedPNLPercentageForShort, readForce } from "../Binance/Trades";
import { Candlestick } from "../Binance/Candlesticks";


export const checkProfitSignals = (
  consoleLogger: ConsoleLogger, 
  next: string,
  symbol: string, 
  orderBook: Orderbook,
  options: ConfigOptions
) => {
  let check = 'HOLD';
  let lastPNL: number = 0;
  let unrealizedPNL: number = 0;
  const force = readForce(symbol.split("/").join(""))
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
    const currentMaxPNL = options.profitCurrentMax[symbol.split("/").join("")];
    const stopLoss = currentMaxPNL + options.stopLossPNL
    let takeProfit = currentMaxPNL - options.takeProfitPNL;
    if (takeProfit < options.takeProfitMinimumPNL) {
      takeProfit = options.takeProfitMinimumPNL
    }
    if (unrealizedPNL <= stopLoss && next === 'SELL' && options.stopLoss === true) { 
      check = "STOP_LOSS"
      options.stopLossHit = true;
    } else if (unrealizedPNL > options.takeProfitMinimumPNL && unrealizedPNL < currentMaxPNL && unrealizedPNL < takeProfit && options.takeProfit === true) {
      check = "TAKE_PROFIT"
    } else {
      if(force[symbol.split("/").join("")]?.skip !== true) {
        if (lastTrade.isBuyer === true) { 
          if(options.holdUntilPositiveTrade === true) {
            if (options.minimumProfitSell === 0) {
              check = "SELL";
            } else if(unrealizedPNL > options.minimumProfitSell + options.tradeFee) {
              check = "SELL";
            } else {
              check = "HOLD";
            }
          } else {
            check = "SELL"
          }
        } else { 
          if(options.holdUntilPositiveTrade === true) {
            if (options.minimumProfitBuy === 0) {
              check = "BUY";
            } else if(unrealizedPNL > options.minimumProfitBuy + options.tradeFee) {
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
    }
    consoleLogger.push("PNL%", {
      previous: lastPNL,
      unrealized: unrealizedPNL - options.tradeFee,
      currentMax: currentMaxPNL,
      stopLoss: stopLoss,
      takeProfit: takeProfit,
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
    if (lastTrade.isBuyer === true) { 
      const high = candlesticks[candlesticks.length - 1].high;
      unrealizedPNL = calculateUnrealizedPNLPercentageForLong(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), high);
    } else { 
      const low = candlesticks[candlesticks.length - 1].low;
      unrealizedPNL = calculateUnrealizedPNLPercentageForShort(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), low);
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
    const currentMaxPNL = options.profitCurrentMax[symbol.split("/").join("")]
    const stopLoss = currentMaxPNL + options.stopLossPNL;
    let takeProfit = currentMaxPNL - options.takeProfitPNL;
    if (takeProfit < options.takeProfitMinimumPNL) {
      takeProfit = options.takeProfitMinimumPNL
    }
    if (unrealizedPNL <= stopLoss && next === 'SELL') { 
      check = "STOP_LOSS"
    } else if (unrealizedPNL > options.takeProfitMinimumPNL && unrealizedPNL < currentMaxPNL && unrealizedPNL < takeProfit) {
      check = "TAKE_PROFIT"
    } else { 
        if (lastTrade.isBuyer === true) { 
          if(options.holdUntilPositiveTrade === true) {
            if (options.minimumProfitSell === 0) {
              check = "SELL";
            } else if(unrealizedPNL > options.minimumProfitSell + options.tradeFee) {
              check = "SELL";
            } else {
              check = "HOLD";
            }
          } else {
            check = "SELL"
          }
        } else { 
          if(options.holdUntilPositiveTrade === true) {
            if (options.minimumProfitBuy === 0) {
              check = "BUY";
            } else if(unrealizedPNL > options.minimumProfitBuy + options.tradeFee) {
              check = "BUY";
            } else {
              check = "HOLD";
            }
          } else {
            check = "BUY";
          }
        }
    }
    consoleLogger.push("PNL%", {
      previous: lastPNL,
      unrealized: unrealizedPNL - options.tradeFee,
      currentMax: currentMaxPNL,
      stopLoss: stopLoss,
      takeProfit: takeProfit,
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