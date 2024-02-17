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
import Binance from "node-binance-api";
import { ConsoleLogger } from "../Utilities/consoleLogger";
import { ConfigOptions } from "../Utilities/args";
import { buy, calculateROI, calculateUnrealizedPNLPercentageForLong, calculateUnrealizedPNLPercentageForShort, getTradeHistory, sell } from "../Binance/Trades";

export const hilow = async (
  discord: Client, 
  binance: Binance, 
  consoleLogger: ConsoleLogger, 
  symbol: string, 
  options: ConfigOptions
) => {
  const filter = symbolFilters[symbol.split("/").join("")];
  if (options.tradeHistory[symbol.split("/").join("")] === undefined) {
    options.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(binance, symbol, options);
  }
  const tradeHistory = options.tradeHistory[symbol.split("/").join("")];
  const lastTrade = tradeHistory[tradeHistory.length - 1];
  consoleLogger.push("Symbol", symbol.split("/").join(""));
  const roi = calculateROI(options.tradeHistory[symbol.split("/").join("")]);
  consoleLogger.push("Profit in Base", roi[0].toFixed(7) + " " + symbol.split("/")[0]);
  consoleLogger.push("Profit in Quote", roi[1].toFixed(7) + " " + symbol.split("/")[1]);
  if (options.startingMaxBuyAmount[symbol.split("/").join("")] > 0 && options.startingMaxBuyAmount !== undefined) {
    consoleLogger.push("Max buy amount", options.startingMaxBuyAmount + " " + symbol.split("/")[1]);
  }
  const orderBook = options.orderbooks[symbol.split("/").join("")];
  const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
  const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => b - a);
  let unrealizedPNL: number = 0;
  if (lastTrade === undefined) {
    console.log(`Do a manual trade on symbol ${symbol}`);
    return false;
  }
  if (lastTrade.isBuyer === true) { 
    unrealizedPNL = calculateUnrealizedPNLPercentageForLong(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), orderBookBids[0]);
  } else { 
    unrealizedPNL = calculateUnrealizedPNLPercentageForShort(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), orderBookAsks[0]);
  }
  const maxProfit = (options.profitCurrentMax[symbol.split("/").join("")] === undefined) ? 0 : options.profitCurrentMax[symbol.split("/").join("")];
  const minMaxProfitDrop = maxProfit - options.takeProfitMinimumPNLDrop;
  consoleLogger.push("PANIC Current MAX PNL%", maxProfit);
  consoleLogger.push("PANIC Current PNL%", unrealizedPNL);
  consoleLogger.push("PANIC Current PANIC PNL%", minMaxProfitDrop);
  if (unrealizedPNL > options.takeProfitMinimumPNL) {
    if (unrealizedPNL > maxProfit) {
      options.profitCurrentMax[symbol.split("/").join("")] = unrealizedPNL;
    }
    if (unrealizedPNL < (maxProfit - options.takeProfitMinimumPNLDrop)) {
      if (lastTrade.isBuyer) {
        if (unrealizedPNL > options.minimumProfitSell + options.tradeFee) {
          sell(discord, binance, consoleLogger, symbol, "", orderBook, filter, options);
          options.profitCurrentMax[symbol.split("/").join("")] = 0;
        }
      } else {
        if (unrealizedPNL > options.minimumProfitBuy + options.tradeFee) {
          buy(discord, binance, consoleLogger, symbol, "", orderBook, filter, options);
          options.profitCurrentMax[symbol.split("/").join("")] = 0;
        }
      }
    }
  }
  consoleLogger.print();
  consoleLogger.flush();
  return true;
}