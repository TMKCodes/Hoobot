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

import { Filter } from "../Binance/Filters";
import { Orderbook } from "../Binance/Orderbook";
import { calculateUnrealizedPNLPercentageForLong, calculateUnrealizedPNLPercentageForShort } from "../Binance/Trades";
import { ConfigOptions } from "../Utilities/args";
import { ConsoleLogger } from "../Utilities/consoleLogger";

export const checkPanicProfit = (
  consoleLogger: ConsoleLogger, 
  symbol: string, 
  orderBook: Orderbook,
  options: ConfigOptions,
  filter: Filter,
): string => {
  let check = 'SKIP';
  let unrealizedPNL: number = 0;
  if (options.panicProfitMinimum > 0) {
    if (options.tradeHistory[symbol.split("/").join("")]?.length > 0) {
      const lastTrade = options.tradeHistory[symbol.split("/").join("")][options.tradeHistory[symbol.split("/").join("")].length - 1];
      if (lastTrade.isBuyer === true) { 
        const orderBookBids = Object.keys(orderBook.bids).map(price => parseFloat(price)).sort((a, b) => b - a);
        unrealizedPNL = calculateUnrealizedPNLPercentageForLong(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), orderBookBids[0]);
      } else { 
        const orderBookAsks = Object.keys(orderBook.asks).map(price => parseFloat(price)).sort((a, b) => a - b);
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
  return check;
}