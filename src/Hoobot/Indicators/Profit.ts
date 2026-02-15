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
import { ExchangeOptions, SymbolOptions } from "../Utilities/Args";
import { ConsoleLogger } from "../Utilities/ConsoleLogger";
import {
  Trade,
  calculatePNLPercentageForLong,
  calculatePNLPercentageForShort,
  calculateUnrealizedPNLPercentageForLong,
  calculateUnrealizedPNLPercentageForShort,
  getPreviousTrades,
  readForceSkip,
} from "../Exchanges/Trades";
import { Candlestick } from "../Exchanges/Candlesticks";
import { reverseSign } from "../Modes/Algorithmic";
import { Filter } from "../Exchanges/Filters";

const sleep = async (ms: number) => await new Promise((r) => setTimeout(r, ms));

export const calculateProfitSignals = async (
  newTrend: string,
  next: string,
  lastTrade: Trade,
  _lastPNL: number,
  unrealizedPNL: number,
  closeTime: number,
  symbolOptions: SymbolOptions
) => {
  let check = "HOLD";

  // Calculate time since the last trade
  const timeSinceLastTrade = (closeTime - lastTrade.time) / (1000 * 60 * 60); // Time in hours
  const hoursSinceLastTrade = Math.ceil(timeSinceLastTrade);

  // Calculate stop loss and take profit
  const currentMaxPNL = symbolOptions.takeProfit?.current ?? 0;
  const stopLossAging = (symbolOptions.stopLoss?.agingPerHour ?? 0) * hoursSinceLastTrade;
  let stopLoss = currentMaxPNL + (symbolOptions.stopLoss?.pnl ?? 0) + stopLossAging;

  // Ensure stopLoss is not positive
  if (stopLoss > 0) {
    stopLoss = 0;
  }

  let takeProfit = currentMaxPNL - (symbolOptions.takeProfit?.drop ?? 0);
  if (takeProfit < (symbolOptions.takeProfit?.minimum ?? 0)) {
    takeProfit = symbolOptions.takeProfit?.minimum!;
  }

  // Handle trend changes if trend is enabled
  if (symbolOptions.profit && symbolOptions.trend?.enabled) {
    if (newTrend === "SHORT" && symbolOptions.trend.current === "LONG") {
      // Swap minimumSell and minimumBuy for SHORT trend
      [symbolOptions.profit.minimumSell, symbolOptions.profit.minimumBuy] = [
        symbolOptions.profit.minimumBuy,
        symbolOptions.profit.minimumSell,
      ];
      symbolOptions.trend.current = "SHORT";
    } else if (newTrend === "LONG" && symbolOptions.trend.current === "SHORT") {
      // Swap minimumBuy and minimumSell for LONG trend
      [symbolOptions.profit.minimumBuy, symbolOptions.profit.minimumSell] = [
        symbolOptions.profit.minimumSell,
        symbolOptions.profit.minimumBuy,
      ];
      symbolOptions.trend.current = "LONG";
    } else if (!["LONG", "SHORT"].includes(symbolOptions.trend.current ?? "")) {
      // Default to LONG if trend is undefined or invalid
      symbolOptions.trend.current = "LONG";
    }
  }

  // Calculate minimum profit thresholds
  const minProfitSell = (symbolOptions.profit?.minimumSell ?? 0) + (symbolOptions.tradeFeePercentage ?? 0);
  const minProfitBuy = (symbolOptions.profit?.minimumBuy ?? 0) + (symbolOptions.tradeFeePercentage ?? 0);

  // Determine if take profit or stop loss conditions are met
  const shouldTakeProfit =
    unrealizedPNL > (symbolOptions.takeProfit?.minimum ?? 0) &&
    unrealizedPNL < currentMaxPNL &&
    unrealizedPNL < takeProfit;

  const shouldStopLoss = unrealizedPNL <= stopLoss;

  // Decision-making based on trend and next action
  if (symbolOptions.trend?.current === "LONG") {
    if (next === "SELL") {
      if (symbolOptions.takeProfit?.enabled && shouldTakeProfit) {
        check = "TAKE_PROFIT";
      } else if (symbolOptions.stopLoss?.enabled && shouldStopLoss) {
        check = "STOP_LOSS";
      } else if (unrealizedPNL < minProfitSell && (symbolOptions.profit?.minimumSell ?? 0) !== 0) {
        check = "HOLD";
      } else {
        check = "SELL";
      }
    } else if (next === "BUY") {
      if (symbolOptions.takeProfit?.enabled && shouldTakeProfit) {
        check = "TAKE_PROFIT";
      } else if (symbolOptions.stopLoss?.enabled && shouldStopLoss) {
        check = "STOP_LOSS";
      } else {
        check = "BUY";
      }
    } else if (next === "BOTH") {
      if (symbolOptions.takeProfit?.enabled && shouldTakeProfit) {
        check = "TAKE_PROFIT";
      } else if (symbolOptions.stopLoss?.enabled && shouldStopLoss) {
        check = "STOP_LOSS";
      } else if (unrealizedPNL < minProfitSell && (symbolOptions.profit?.minimumSell ?? 0) !== 0) {
        check = "HOLD";
      } else {
        check = "SELL";
      }
    }
  } else if (symbolOptions.trend?.current === "SHORT") {
    if (next === "SELL") {
      if (symbolOptions.takeProfit?.enabled && shouldTakeProfit) {
        check = "TAKE_PROFIT";
      } else if (symbolOptions.stopLoss?.enabled && shouldStopLoss) {
        check = "STOP_LOSS";
      } else {
        check = "SELL";
      }
    } else if (next === "BUY") {
      if (symbolOptions.takeProfit?.enabled && shouldTakeProfit) {
        check = "TAKE_PROFIT";
      } else if (symbolOptions.stopLoss?.enabled && shouldStopLoss) {
        check = "STOP_LOSS";
      } else if (unrealizedPNL < minProfitBuy && (symbolOptions.profit?.minimumBuy ?? 0) !== 0) {
        check = "HOLD";
      } else {
        check = "BUY";
      }
    }
  } else {
    // If trend is not enabled, fallback to basic conditions
    if (symbolOptions.takeProfit?.enabled && shouldTakeProfit) {
      check = "TAKE_PROFIT";
    } else if (symbolOptions.stopLoss?.enabled && shouldStopLoss) {
      check = "STOP_LOSS";
    } else if (next === "SELL" && unrealizedPNL >= minProfitSell) {
      check = "SELL";
    } else if (next === "BUY" && unrealizedPNL >= minProfitBuy) {
      check = "BUY";
    } else if (next === "SELL" && symbolOptions.profit?.minimumSell === 0) {
      check = "SELL";
    } else if (next === "BUY" && symbolOptions.profit?.minimumBuy === 0) {
      check = "BUY"
    }
  }

  // Additional check for minimum time since last trade
  if (symbolOptions.minimumTimeSinceLastTrade > 0 && timeSinceLastTrade > symbolOptions.minimumTimeSinceLastTrade) {
    if (symbolOptions.takeProfit?.enabled && shouldTakeProfit) {
      check = "TAKE_PROFIT";
    } else if (symbolOptions.stopLoss?.enabled && shouldStopLoss) {
      check = "STOP_LOSS";
    }
  }

  return {
    check,
    takeProfit,
    stopLoss,
  };
};

export const checkProfitSignals = async (
  consoleLogger: ConsoleLogger,
  next: string,
  trend: string,
  orderBook: Orderbook,
  closeTime: number,
  ExchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions
) => {
  let check = "HOLD";
  let lastPNL: number = 0;
  let unrealizedPNL: number = 0;
  if (
    ExchangeOptions.tradeHistory !== undefined &&
    ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")]?.length > 0
  ) {
    let lastTrade =
      ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")][
        ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")].length - 1
      ];
    if (ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")]?.length > 1) {
      const olderTrade =
        ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")][
          ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")].length - 2
        ];
      if (olderTrade.isBuyer) {
        lastPNL = calculatePNLPercentageForLong(parseFloat(olderTrade.price), parseFloat(lastTrade.price));
      } else if (!olderTrade.isBuyer) {
        lastPNL = calculatePNLPercentageForShort(parseFloat(olderTrade.price), parseFloat(lastTrade.price));
      }
    }
    if (lastTrade.isBuyer) {
      // selling
      const orderBookAsks = Object.keys(orderBook.asks)
        .map((price) => parseFloat(price))
        .sort((a, b) => a - b);
      unrealizedPNL = calculateUnrealizedPNLPercentageForLong(
        parseFloat(lastTrade.qty),
        parseFloat(lastTrade.price),
        orderBookAsks[0]
      );
    } else if (!lastTrade.isBuyer) {
      // buying
      const orderBookBids = Object.keys(orderBook.bids)
        .map((price) => parseFloat(price))
        .sort((a, b) => b - a);
      unrealizedPNL = calculateUnrealizedPNLPercentageForShort(
        parseFloat(lastTrade.qty),
        parseFloat(lastTrade.price),
        orderBookBids[0]
      );
    }
    if (lastTrade.isBuyer && next === "BUY") {
      unrealizedPNL = reverseSign(unrealizedPNL);
    } else if (!lastTrade.isBuyer && next === "SELL") {
      unrealizedPNL = reverseSign(unrealizedPNL);
    }
    if (symbolOptions.takeProfit !== undefined) {
      if (symbolOptions.takeProfit?.current === undefined) {
        symbolOptions.takeProfit.current = unrealizedPNL > 0 ? unrealizedPNL : 0;
      }
      if (unrealizedPNL > symbolOptions.takeProfit?.current) {
        symbolOptions.takeProfit.current = unrealizedPNL;
      }
    }
    const signals = await calculateProfitSignals(
      trend,
      next,
      lastTrade,
      lastPNL,
      unrealizedPNL,
      closeTime,
      symbolOptions
    );
    check = signals.check;
    consoleLogger.push("PNL%", {
      trend: trend,
      previous: lastPNL,
      unrealized: unrealizedPNL,
      currentMax: symbolOptions.takeProfit?.current,
      stopLoss: signals.stopLoss < 0 ? signals.stopLoss : 0,
      takeProfit: signals.takeProfit,
      next: next,
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
      next: next,
      direction: check,
    });
  }
  return check;
};

export const checkProfitSignalsFromCandlesticks = async (
  consoleLogger: ConsoleLogger,
  next: string,
  trend: string,
  candlesticks: Candlestick[],
  closeTime: number,
  ExchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions
) => {
  let check = "HOLD";
  let lastPNL: number = 0;
  let unrealizedPNL: number = 0;
  if (
    ExchangeOptions.tradeHistory !== undefined &&
    ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")]?.length > 0
  ) {
    const lastTrade =
      ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")][
        ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")].length - 1
      ];
    if (ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")]?.length > 1) {
      const olderTrade =
        ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")][
          ExchangeOptions.tradeHistory[symbolOptions.name.split("/").join("")].length - 2
        ];
      if (olderTrade.isBuyer) {
        lastPNL = calculatePNLPercentageForLong(parseFloat(olderTrade.price), parseFloat(lastTrade.price));
      } else if (!olderTrade.isBuyer) {
        lastPNL = calculatePNLPercentageForShort(parseFloat(olderTrade.price), parseFloat(lastTrade.price));
      }
    }
    const close = candlesticks[candlesticks.length - 1].close;
    if (lastTrade.isBuyer === true) {
      unrealizedPNL = calculateUnrealizedPNLPercentageForLong(
        parseFloat(lastTrade.qty),
        parseFloat(lastTrade.price),
        close
      );
    } else {
      unrealizedPNL = calculateUnrealizedPNLPercentageForShort(
        parseFloat(lastTrade.qty),
        parseFloat(lastTrade.price),
        close
      );
    }
    if (lastTrade.isBuyer && next === "BUY") {
      unrealizedPNL = reverseSign(unrealizedPNL);
    } else if (!lastTrade.isBuyer && next === "SELL") {
      unrealizedPNL = reverseSign(unrealizedPNL);
    }
    if (symbolOptions.takeProfit !== undefined) {
      if (symbolOptions.takeProfit?.current === undefined) {
        symbolOptions.takeProfit.current = unrealizedPNL > 0 ? unrealizedPNL : 0;
      }
      if (unrealizedPNL > symbolOptions.takeProfit?.current) {
        symbolOptions.takeProfit.current = unrealizedPNL;
      }
    }
    const signals = await calculateProfitSignals(
      trend,
      next,
      lastTrade,
      lastPNL,
      unrealizedPNL,
      closeTime,
      symbolOptions
    );
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
};
