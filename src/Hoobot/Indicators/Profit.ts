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
import { Trade, calculatePNLPercentageForLong, calculatePNLPercentageForShort, calculateUnrealizedPNLPercentageForLong, calculateUnrealizedPNLPercentageForShort, readForceSkip } from "../Exchanges/Trades";
import { Candlestick } from "../Exchanges/Candlesticks";
import { reverseSign } from "../Modes/Algorithmic";

const sleep = async (ms: number) => await new Promise(r => setTimeout(r, ms));


export const calculateProfitSignals = async (
  newTrend: string,
  next: string,
  lastTrade: Trade,
  lastPNL: number,
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
  let takeProfit = currentMaxPNL - symbolOptions.takeProfit?.current!;
  if (takeProfit < symbolOptions.takeProfit?.minimum!) {
    takeProfit = symbolOptions.takeProfit?.minimum!
  }

  if(symbolOptions.profit !== undefined && symbolOptions.trend !== undefined && symbolOptions.trend.enabled === true) {
    if (newTrend === "SHORT" && symbolOptions.trend.current === "LONG" || symbolOptions.trend.current === undefined) {
      const temp = symbolOptions.profit.minimumSell;
      symbolOptions.profit.minimumSell = symbolOptions.profit.minimumBuy;
      symbolOptions.profit.minimumBuy = temp;
      symbolOptions.trend.current = "SHORT";
    } else if(newTrend === "LONG" && symbolOptions.trend.current == "SHORT") {
      const temp = symbolOptions.profit.minimumSell;
      symbolOptions.profit.minimumSell = symbolOptions.profit.minimumBuy;
      symbolOptions.profit.minimumBuy = temp;
      symbolOptions.trend.current = "LONG";
    } else if ((symbolOptions.trend.current !== "LONG" && symbolOptions.trend.current !== "SHORT") || symbolOptions.trend.current === undefined) {
      symbolOptions.trend.current = "LONG";
    }
  }
  
  const minProfitSell = symbolOptions.profit?.minimumSell! + symbolOptions.tradeFeePercentage!;
  const minProfitBuy = symbolOptions.profit?.minimumBuy! + symbolOptions.tradeFeePercentage!;
  if (symbolOptions.minimumTimeSinceLastTrade > 0 && timeSinceLastTrade > symbolOptions.minimumTimeSinceLastTrade) {
    if (symbolOptions.profit?.enabled === true && unrealizedPNL > 0) {
      check = "TAKE_PROFIT";
    } else if (symbolOptions.stopLoss?.enabled === true && unrealizedPNL < 0) {
      check = "STOP_LOSS";
    }
  } else if (next === "SELL") { // NEXT SELL
    if (symbolOptions.profit?.enabled === true && symbolOptions.profit?.minimumSell !== 0) {
      if (symbolOptions.profit?.enabled === true && unrealizedPNL > symbolOptions.takeProfit?.minimum! && unrealizedPNL < currentMaxPNL && unrealizedPNL < takeProfit) {
        check = "TAKE_PROFIT";
      } else if (symbolOptions.stopLoss?.enabled === true && unrealizedPNL <= stopLoss) {
        check = "STOP_LOSS";
      } else if (unrealizedPNL > minProfitSell) {
        check = "SELL";
      } else {
        check = "HOLD"
      }
    } else {
      if (symbolOptions.profit?.enabled === true && unrealizedPNL > symbolOptions.takeProfit?.minimum! && unrealizedPNL < currentMaxPNL && unrealizedPNL < takeProfit) {
        check = "TAKE_PROFIT";
      } else if (symbolOptions.stopLoss?.enabled === true && unrealizedPNL <= stopLoss) {
        check = "STOP_LOSS";
      } else  {
        check = "SELL";
      }
    }
  } else if (next === "BUY") { // NEXT BUY
    if (symbolOptions.profit?.enabled === true && symbolOptions.profit?.minimumBuy !== 0) {
      if (symbolOptions.profit?.enabled === true && unrealizedPNL > symbolOptions.takeProfit?.minimum! && unrealizedPNL < currentMaxPNL && unrealizedPNL < takeProfit) {
        check = "TAKE_PROFIT";
      } else if (symbolOptions.stopLoss?.enabled === true && unrealizedPNL <= stopLoss) {
        check = "STOP_LOSS";
      } else if (unrealizedPNL > minProfitBuy) {
        check = "BUY";
      } else {
        check = "HOLD"
      }
    } else {
      if (symbolOptions.profit?.enabled === true && unrealizedPNL > symbolOptions.takeProfit?.minimum! && unrealizedPNL < currentMaxPNL && unrealizedPNL < takeProfit) {
        check = "TAKE_PROFIT";
      } else if (symbolOptions.stopLoss?.enabled === true && unrealizedPNL <= stopLoss) {
        check = "STOP_LOSS";
      } else {
        check = "BUY";
      }
    }
  }
  if (symbolOptions.profit?.enabled === true && (lastPNL < 0 && unrealizedPNL < 0 && check !== "STOP_LOSS" && check !== "BUY")) {
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
  orderBook: Orderbook,
  closeTime: number,
  ExchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions
) => {
  let check = 'HOLD';
  let lastPNL: number = 0;
  let unrealizedPNL: number = 0;
  const skip = readForceSkip(symbolOptions.name.split("/").join(""))
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