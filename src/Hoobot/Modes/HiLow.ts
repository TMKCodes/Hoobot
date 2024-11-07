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
import { ConsoleLogger } from "../Utilities/consoleLogger";
import { ConfigOptions, ExchangeOptions, SymbolOptions } from "../Utilities/args";
import { buy, calculateROI, calculateUnrealizedPNLPercentageForLong, calculateUnrealizedPNLPercentageForShort, getTradeHistory, sell } from "../Exchanges/Trades";
import { Exchange } from "../Exchanges/Exchange";
import { logToFile } from "../Utilities/logToFile";

export const hilow = async (
  discord: Client, 
  exchange: Exchange, 
  consoleLogger: ConsoleLogger, 
  symbol: string, 
  processOptions: ConfigOptions,
  exchangeOptions: ExchangeOptions,
  symbolOptions: SymbolOptions
) => {
  try { 
    const filter = symbolFilters[symbol.split("/").join("")];
    if (exchangeOptions.tradeHistory[symbol.split("/").join("")] === undefined) {
      exchangeOptions.tradeHistory[symbol.split("/").join("")] = await getTradeHistory(exchange, symbol, processOptions);
    }
    const tradeHistory = exchangeOptions.tradeHistory[symbol.split("/").join("")];
    const lastTrade = tradeHistory[tradeHistory.length - 1];
    consoleLogger.push("Symbol", symbol.split("/").join(""));
    const roi = calculateROI(exchangeOptions.tradeHistory[symbol.split("/").join("")]);
    consoleLogger.push("Profit in Base", roi[0].toFixed(7) + " " + symbol.split("/")[0]);
    consoleLogger.push("Profit in Quote", roi[1].toFixed(7) + " " + symbol.split("/")[1]);
    if (symbolOptions.growingMax?.buy! > 0) {
      consoleLogger.push("Max buy amount", symbolOptions.growingMax?.buy + " " + symbol.split("/")[1]);
    }
    const orderBook = exchangeOptions.orderbooks[symbol.split("/").join("")];
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
    if (symbolOptions.takeProfit !== undefined && symbolOptions.takeProfit.enabled == true) {
      const maxProfit = (symbolOptions.takeProfit?.current === undefined) ? 0 : symbolOptions.takeProfit.current;
      const minMaxProfitDrop = maxProfit - symbolOptions.takeProfit?.drop!;
      consoleLogger.push("PANIC Current MAX PNL%", maxProfit);
      consoleLogger.push("PANIC Current PNL%", unrealizedPNL);
      consoleLogger.push("PANIC Current PANIC PNL%", minMaxProfitDrop);
      if (unrealizedPNL > symbolOptions.takeProfit?.minimum!) {
        if (unrealizedPNL > maxProfit) {
          symbolOptions.takeProfit.current = unrealizedPNL;
        }
        if (unrealizedPNL < (maxProfit - symbolOptions.takeProfit?.drop!)) {
          if (lastTrade.isBuyer) {
            if (unrealizedPNL > symbolOptions.profit?.minimumSell! + symbolOptions.tradeFeePercentage!) {
              sell(discord, exchange, consoleLogger, symbol, "", orderBook, filter, processOptions, exchangeOptions, symbolOptions, undefined);
              symbolOptions.takeProfit.current = 0;
            }
          } else {
            if (unrealizedPNL > symbolOptions.profit?.minimumBuy! + symbolOptions.tradeFeePercentage!) {
              buy(discord, exchange, consoleLogger, symbol, "", orderBook, filter, processOptions, exchangeOptions, symbolOptions, undefined);
              symbolOptions.takeProfit.current = 0;
            }
          }
        }
      }
    }
    consoleLogger.print();
    consoleLogger.flush();
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error(JSON.stringify(error, null, 4));
  }
  return true;
}