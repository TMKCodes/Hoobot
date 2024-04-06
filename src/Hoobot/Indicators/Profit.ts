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
import { ExchangeOptions, SymbolOptions } from "../Utilities/args";
import { ConsoleLogger } from "../Utilities/consoleLogger";
import { Trade, calculatePNLPercentageForLong, calculatePNLPercentageForShort, calculateUnrealizedPNLPercentageForLong, calculateUnrealizedPNLPercentageForShort, getPreviousTrades, readForceSkip } from "../Exchanges/Trades";
import { Candlestick } from "../Exchanges/Candlesticks";
import { reverseSign } from "../Modes/Algorithmic";
import { Filter } from "../Exchanges/Filters";

const sleep = async (ms: number) => await new Promise(r => setTimeout(r, ms));


export const calculateProfitSignals = async (
  newTrend: string,
  next: string,
  lastTrade: Trade,
  _lastPNL: number,
  unrealizedPNL: number,
  closeTime: number,
  symbolOptions: SymbolOptions
) => {
  let check = 'HOLD';
  const timeSinceLastTrade = (closeTime - lastTrade.time)  / (1000 * 60 * 60);
  const hoursSinceLastTrade = Math.ceil((closeTime - lastTrade.time)  / (1000 * 60 * 60));
  const currentMaxPNL = symbolOptions.takeProfit?.current!;
  const stoppLossAging = (symbolOptions.stopLoss?.agingPerHour! * hoursSinceLastTrade);
  let stopLoss = currentMaxPNL + symbolOptions.stopLoss?.pnl! + stoppLossAging;
  if (stopLoss > 0) {
    stopLoss == 0;
  }
  let takeProfit = currentMaxPNL - symbolOptions.takeProfit?.drop!;
  if (takeProfit < symbolOptions.takeProfit?.minimum!) {
    takeProfit = symbolOptions.takeProfit?.minimum!
  }
  if(symbolOptions.profit && symbolOptions.trend && symbolOptions.trend.enabled === true) {
    if (newTrend === "SHORT" && (symbolOptions.trend.current === "LONG")) {
      const temp = symbolOptions.profit.minimumSell;
      symbolOptions.profit.minimumSell = symbolOptions.profit.minimumBuy;
      symbolOptions.profit.minimumBuy = temp;
      symbolOptions.trend.current = "SHORT";
    } else if(newTrend === "LONG" && (symbolOptions.trend.current == "SHORT")) {
      const temp = symbolOptions.profit.minimumBuy;
      symbolOptions.profit.minimumBuy = symbolOptions.profit.minimumSell;
      symbolOptions.profit.minimumSell = temp;
      symbolOptions.trend.current = "LONG";
    } else if ((symbolOptions.trend.current !== "LONG" && symbolOptions.trend.current !== "SHORT") || symbolOptions.trend.current === undefined) {
      symbolOptions.trend.current = "LONG";
    }
  }
  
  const minProfitSell = symbolOptions.profit?.minimumSell! + symbolOptions.tradeFeePercentage!;
  const minProfitBuy = symbolOptions.profit?.minimumBuy! + symbolOptions.tradeFeePercentage!;
  const shouldTakeProfit = unrealizedPNL > symbolOptions.takeProfit?.minimum! && unrealizedPNL < currentMaxPNL && unrealizedPNL < takeProfit;
  const shouldStopLoss = unrealizedPNL <= stopLoss;
  if (symbolOptions.trend?.current === "LONG") {
    if (next === "SELL") {
      if (symbolOptions.takeProfit?.enabled === true && shouldTakeProfit === true) {
        check = 'TAKE_PROFIT';
      } else  if (symbolOptions.stopLoss?.enabled === true && shouldStopLoss === true) {
        check = "STOP_LOSS";
      } else if (unrealizedPNL < minProfitSell && symbolOptions.profit?.minimumSell !== 0) {
        check = 'HOLD';
      }  else {
        check = 'SELL';
      }
    } else if (next === "BUY") {
      if (symbolOptions.takeProfit?.enabled === true &&  shouldTakeProfit === true) {
        check = 'TAKE_PROFIT';
      } else if (symbolOptions.stopLoss?.enabled === true && shouldStopLoss === true) {
        check = "STOP_LOSS";
      } else {
        check = 'BUY';
      }
    } else if (next === "BOTH") {
      if (symbolOptions.takeProfit?.enabled === true && shouldTakeProfit === true) {
        check = 'TAKE_PROFIT';
      } else  if (symbolOptions.stopLoss?.enabled === true && shouldStopLoss === true) {
        check = "STOP_LOSS";
      } else if (unrealizedPNL < minProfitSell && symbolOptions.profit?.minimumSell !== 0) {
        check = 'HOLD';
      } else {
        check = 'SELL';
      }
    }
  } else if (symbolOptions.trend?.current === "SHORT") {
    if (next === "SELL") {
      if (symbolOptions.takeProfit?.enabled === true &&  shouldTakeProfit === true) {
        check = 'TAKE_PROFIT';
      } else  if (symbolOptions.stopLoss?.enabled === true && shouldStopLoss === true) {
        check = "STOP_LOSS";
      } else {
        check = 'SELL';
      }
    } else if (next === "BUY") {
      if (symbolOptions.takeProfit?.enabled === true &&  shouldTakeProfit === true) {
        check = 'TAKE_PROFIT';
      } else if (symbolOptions.stopLoss?.enabled === true && shouldStopLoss === true) {
        check = "STOP_LOSS";
      } else if (unrealizedPNL < minProfitBuy && symbolOptions.profit?.minimumBuy !== 0) {
        check = 'HOLD';
      } else {
        check = 'BUY';
      }
    }
  }
  if (symbolOptions.minimumTimeSinceLastTrade > 0 && timeSinceLastTrade > symbolOptions.minimumTimeSinceLastTrade) {
    if (symbolOptions.takeProfit?.enabled === true && shouldTakeProfit === true) {
      check = "TAKE_PROFIT";
    } else if (symbolOptions.stopLoss?.enabled === true && shouldStopLoss === true) {
      check = "STOP_LOSS";
    }
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
  orderBook: Orderbook,
  closeTime: number,
  ExchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions,
  closePrice: number,
  filter: Filter,
) => {
  let check = 'HOLD';
  let lastPNL: number = 0;
  let unrealizedPNL: number = 0;
  let unrealizedSellPNL: number = 0;
  let unrealizedBuyPNL: number = 0;
  const skip = readForceSkip(symbolOptions.name.split("/").join(""));
  if(ExchangeOptions.tradeHistory !== undefined && ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")]?.length > 0) {
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
    } else if (symbolOptions.consectutive || symbolOptions.noPreviousTradeCheck) {
      const { previousTrade, olderTrade } = getPreviousTrades(next, ExchangeOptions, symbolOptions);
      if (olderTrade && previousTrade) {
        if(olderTrade.isBuyer && !previousTrade.isBuyer) { 
          lastPNL = calculatePNLPercentageForLong(parseFloat(olderTrade.price), parseFloat(previousTrade.price));
        } else if(!olderTrade.isBuyer && previousTrade.isBuyer) { 
          lastPNL = calculatePNLPercentageForShort(parseFloat(olderTrade.price), parseFloat(previousTrade.price));
        }
      } else {
        lastPNL = 0;
      }
      if(previousTrade) {
        const quoteBalance = ExchangeOptions.balances[symbolOptions.name.split("/")[1]].crypto;
        const baseBalanceConverted = (ExchangeOptions.balances[symbolOptions.name.split("/")[0]].crypto * closePrice);
        const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => b - a);
        const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
        unrealizedSellPNL = calculateUnrealizedPNLPercentageForLong(parseFloat(previousTrade.qty), parseFloat(previousTrade.price), orderBookBids[0]);
        unrealizedBuyPNL = calculateUnrealizedPNLPercentageForShort(parseFloat(previousTrade.qty), parseFloat(previousTrade.price), orderBookAsks[0]);
        if (unrealizedBuyPNL >= unrealizedSellPNL) {
          if(quoteBalance > (parseFloat(filter.minQty) * 2)) {
            unrealizedPNL = unrealizedBuyPNL;
            next = "BUY";
          }
          
        } else if(unrealizedBuyPNL < unrealizedSellPNL) {
          if(baseBalanceConverted > (parseFloat(filter.minQty) * 2)) {
            unrealizedPNL = unrealizedSellPNL;
            next = "SELL";
          }
          next = "HOLD";
        }
        if (previousTrade.isBuyer && next === "BUY") {
          unrealizedPNL = reverseSign(unrealizedPNL);
        } else if(!previousTrade.isBuyer && next === "SELL") {
          unrealizedPNL = reverseSign(unrealizedPNL);
        }
        if (symbolOptions.takeProfit !== undefined) {
          if (symbolOptions.takeProfit?.current === undefined) {
            if (unrealizedPNL > 0) {
              symbolOptions.takeProfit.current = unrealizedPNL;
            }
            symbolOptions.takeProfit.current = 0;
          }
          if (unrealizedPNL > symbolOptions.takeProfit?.current) {
            symbolOptions.takeProfit.current = unrealizedPNL;
          }
        }
        const signals = await calculateProfitSignals(trend, next, previousTrade, lastPNL, unrealizedPNL, closeTime, symbolOptions);
        check = signals.check;
        if(unrealizedPNL === null) {
          check = "HOLD";
        }
        consoleLogger.push("PNL%", {
          trend: trend,
          previous: lastPNL,
          unrealized: unrealizedPNL,
          currentMax: symbolOptions.takeProfit?.current,
          stopLoss: (signals.stopLoss < 0) ? signals.stopLoss : 0,
          takeProfit: signals.takeProfit,
          direction: check,
        });
      } else {
        check = "SKIP";
        consoleLogger.push("PNL%", {
          trend: trend,
          previous: 0,
          unrealized: 0,
          currentMax: 0,
          stopLoss: 0,
          takeProfit: 0,
          direction: check,
        });
      }
    } else {
      let lastTrade = ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")][ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")].length - 1];
      if(ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")]?.length > 1) {
        const olderTrade = ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")][ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")].length - 2];
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
      if (symbolOptions.takeProfit !== undefined) {
        if (symbolOptions.takeProfit?.current === undefined) {
          if (unrealizedPNL > 0) {
            symbolOptions.takeProfit.current = unrealizedPNL;
          }
          symbolOptions.takeProfit.current = 0;
        }
        if (unrealizedPNL > symbolOptions.takeProfit?.current) {
          symbolOptions.takeProfit.current = unrealizedPNL;
        }
      }
      const signals = await calculateProfitSignals(trend, next, lastTrade, lastPNL, unrealizedPNL, closeTime, symbolOptions);
      check = signals.check;
      consoleLogger.push("PNL%", {
        trend: trend,
        previous: lastPNL,
        unrealized: unrealizedPNL,
        currentMax: symbolOptions.takeProfit?.current,
        stopLoss: (signals.stopLoss < 0) ? signals.stopLoss : 0,
        takeProfit: signals.takeProfit,
        direction: check,
      });
    }
  } else {
    check = "SKIP";
    consoleLogger.push("PNL%", {
      trend: trend,
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

export const checkProfitSignalsFromCandlesticks = async (
  consoleLogger: ConsoleLogger, 
  next: string,
  trend: string,
  candlesticks: Candlestick[],
  closeTime: number,
  ExchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions
) => {
  let check = 'HOLD';
  let lastPNL: number = 0;
  let unrealizedPNL: number = 0;
  if(ExchangeOptions.tradeHistory !== undefined && ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")]?.length > 0) {
    const lastTrade = ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")][ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")].length - 1];
    if(ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")]?.length > 1) {
      const olderTrade = ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")][ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")].length - 2];
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
    if (symbolOptions.takeProfit !== undefined) {
      if (symbolOptions.takeProfit?.current === undefined) {
        if (unrealizedPNL > 0) {
          symbolOptions.takeProfit.current = unrealizedPNL;
        }
        symbolOptions.takeProfit.current = 0;
      }
      if (unrealizedPNL > symbolOptions.takeProfit?.current) {
        symbolOptions.takeProfit.current = unrealizedPNL;
      }
    }
    const signals = await calculateProfitSignals(trend, next, lastTrade, lastPNL, unrealizedPNL, closeTime, symbolOptions);
    check = signals.check;
    consoleLogger.push("PNL%", {
      previous: lastPNL,
      unrealized: unrealizedPNL - symbolOptions.tradeFeePercentage!,
      currentMax: symbolOptions.takeProfit?.current,
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