/* =====================================================================
* Binance Trading Bot - Proprietary License
* Copyright (c) 2023 Hoosat Oy. All rights reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are not permitted without prior written permission
* from Hoosat Oy. Unauthorized reproduction, copying, or use of this
* software, in whole or in part, is strictly prohibited.
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

import Binance from 'node-binance-api';
import { loginDiscord, sendMessageToChannel } from './discord/discord';
import { SymbolCandlesticks, candlestick, getLastCandlesticks, listenForCandlesticks } from './binance/candlesticks';
import { calculateEMA, logEMASignals } from './binance/ema';
import { calculateMACD, logMACDSignals } from './binance/macd';
import { calculateRSI, logRSISignals } from './binance/rsi';
import { ConfigOptions, getSecondsFromInterval, parseArgs } from './binance/args';
import { getBalancesFromWebsocket, getCurrentBalances } from './binance/balances';
import { getLastCompletedOrder, handleOpenOrders, order } from './binance/orders';
import { checkBeforeOrder, tradeDirection } from './binance/tradeChecks';
import { play } from './binance/playSound';
import { Client } from 'discord.js';
import { consoleLogger } from './binance/consoleLogger';
import { filter, filters, getFilters } from './binance/filters';
import dotenv from 'dotenv';
import { algorithmic } from './binance/algorithmic';
import { getTradeableSymbols } from './binance/symbols';
import { arbitrageProfit, findRoundTrips, roundTripsContainsSymbol, uniqueSymbolsOfRoundTrips } from './binance/arbitrage';



// Get configuration options from command-line arguments and dotenv.
dotenv.config();
const args = process.argv.slice(2);
const options = parseArgs(args) as ConfigOptions;

// Initialize Binance client
const binance = new Binance().options({
  APIKEY: options.apiKey,
  APISECRET: options.apiSecret,
  useServerTime: true, // This uses Binance server time for WebSocket requests
  family: 4,
});

// Place to store trading filters for pairs.
let tradingPairFilters: filters = {};

const main = async () => {
  try {
    let discord: any = undefined;
    if(process.env.DISCORD_ENABLED === "true") {
      discord = loginDiscord(binance, options);
    }

    let balances = await getCurrentBalances(binance);
    const balanceLogger = consoleLogger();
    binance.websockets.userData((data: any) => {
      const newBalances = getBalancesFromWebsocket(data);
      if (newBalances !== undefined) {
        balanceLogger.push(`New balance`, balances);
        balanceLogger.print();
        balanceLogger.flush();
      }
    }, (data: any) => {
      // Possible to add discord notification if order has been fulfilled with websocket notification.
    });

    const symbolCandlesticks: SymbolCandlesticks = {};
    if(options.mode === "algorithmic") {
      // Check if options.symbol is an array or a single string
      if (Array.isArray(options.symbols)) {
        // If options.symbol is an array, listen for candlesticks for each symbol separately
        for (const symbol of options.symbols) {
          const filter = await getFilters(binance, symbol);
          tradingPairFilters[symbol.split("/").join("")] = filter;
          const logger = consoleLogger();
          listenForCandlesticks(binance, symbol, options.candlestickInterval, symbolCandlesticks, 250, (candlesticks: candlestick[]) => {
            algorithmic(discord, binance, logger, symbol, balances, candlesticks, filter, options)
          });
        }
      } else {
        // If options.symbol is a single string, listen for candlesticks for that symbol only
        const filter = await getFilters(binance, options.symbols);
        tradingPairFilters[options.symbols.split("/").join("")] = filter;
        const logger = consoleLogger();
        //const candlestick = await getLastCandlesticks(binance, options.symbols as string, interval, 250);
        //algorithmic(discord, binance, logger, options.symbols as string, balances, symbolCandlesticks[options.symbols as string].candles, filter, options)
        listenForCandlesticks(binance, options.symbols, options.candlestickInterval, symbolCandlesticks,  250, (candlesticks: candlestick[]) => {
          algorithmic(discord, binance, logger, options.symbols as string, balances, candlesticks, filter, options)
        });
      }
    } else if (options.mode === "hilow") {

    } else if (options.mode === "arbitrage") {
      const symbolInfo = await getTradeableSymbols(binance);
      if (Array.isArray(options.symbols)) {
        for (const symbol of options.symbols) {
          console.log(`current symbol is there: ${JSON.stringify(symbolInfo.filter(info => info.symbol === symbol.split("/").join("")))}`);
          const roundTrips = findRoundTrips(symbol, symbolInfo);
          console.log(`RoundTrips found: ${roundTrips.length}`);
          const uniqueSymbolsInTrips = uniqueSymbolsOfRoundTrips(roundTrips);
          console.log(`Unique symbols found: ${uniqueSymbolsInTrips.length}`); 
          for (const uniqueSymbol of uniqueSymbolsInTrips) {
            listenForCandlesticks(binance, uniqueSymbol.symbol, options.candlestickInterval, symbolCandlesticks, 0, (candlesticks: candlestick[]) => {
              console.log(`New candlestick for symbol ${uniqueSymbol.symbol}`);
              const currentRoundTrips = roundTripsContainsSymbol(roundTrips, uniqueSymbol.symbol);
              for(const currentRoundTrip of currentRoundTrips) {
                const profit = arbitrageProfit(symbolCandlesticks, currentRoundTrip, 1000);
                if (profit !== undefined) {
                  console.log(currentRoundTrip)
                  console.log(profit);
                }
              }
            })
          }
        }
      }
    }
  } catch (error: any) {
    console.error(JSON.stringify(error));
  }
}

main();

