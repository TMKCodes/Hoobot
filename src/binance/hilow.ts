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
import Binance from "node-binance-api";
import { ConsoleLogger } from "./consoleLogger";
import { candlestick } from "./candlesticks";
import { filter } from "./filters";
import { ConfigOptions, getSecondsFromInterval } from "./args";
import { Balances } from "./balances";
import { getLastCompletedOrder, handleOpenOrders } from "./orders";
import { calculateEMA, logEMASignals } from "./ema";
import { calculateRSI, logRSISignals } from "./rsi";
import { calculateMACD, logMACDSignals } from "./macd";



export async function hilow(
  discord: Client, 
  binance: Binance, 
  consoleLogger: ConsoleLogger, 
  symbol: string, 
  balances: Balances,
  candlesticks: candlestick[], 
  filter: filter, 
  options: ConfigOptions) {
    const candleTime = (new Date(candlesticks[candlesticks.length - 1].time)).toLocaleString('fi-FI');
    consoleLogger.push(`Candlestick time`, candleTime);
    const closePrice = parseFloat(candlesticks[candlesticks.length - 1].close);
    consoleLogger.push(`Last close price`, closePrice.toFixed(7));
    if (candlesticks.length < options.longEma) {
      consoleLogger.push(`warning`, `Not enough candlesticks for calculations, please wait.`);
      return
    }
    const orderBook = await binance.depth(symbol.split("/").join(""));

    const tradeHistory = (await binance.trades(symbol.split("/").join(""))).reverse().slice(0, 3);
    
    consoleLogger.push(symbol.split("/")[0], balances[symbol.split("/")[0]].toFixed(7));
    consoleLogger.push(symbol.split("/")[1], balances[symbol.split("/")[1]].toFixed(7));
    const rsi = calculateRSI(candlesticks, options.rsiLength);
    logRSISignals(consoleLogger, rsi, options);
    const lastOrder = await getLastCompletedOrder(binance, symbol);

    //await placeTrade(discord, binance, consoleLogger, symbol, tradeHistory, rsi, balances, orderBook, closePrice, filter, options);
    consoleLogger.print();
    consoleLogger.flush();
}