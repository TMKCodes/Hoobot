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

import Binance from 'node-binance-api';
import { loginDiscord, } from './Discord/discord';
import { listenForCandlesticks, Candlesticks } from './Hoobot/Binance/Candlesticks';
import { ConfigOptions, parseArgs } from './Hoobot/Utilities/args';
import { getCurrentBalances, storeBalancesDaily } from './Hoobot/Binance/Balances';
import { consoleLogger } from './Hoobot/Utilities/consoleLogger';
import { Filters, getFilters } from './Hoobot/Binance/Filters';
import dotenv from 'dotenv';
import { algorithmic } from './Hoobot/Modes/Algorithmic';
import { getTradeableSymbols } from './Hoobot/Binance/Symbols';
import { checkLicenseValidity } from './Hoobot/Utilities/license';
import { Orderbook, getOrderbook, listenForOrderbooks } from './Hoobot/Binance/Orderbook';
import { hilow } from './Hoobot/Modes/HiLow';


// Get configuration options from command-line arguments and dotenv.
dotenv.config();
const args = process.argv.slice(2);
const options = parseArgs(args) as ConfigOptions;

// Initialize Binance client
const binance = new Binance().options({
  APIKEY: options.apiKey,
  APISECRET: options.apiSecret,
  useServerTime: true, 
  family: 4,
});

export let symbolFilters: Filters = {};
const main = async () => {
  try {
    if (await checkLicenseValidity(options.license)) {
      console.log('License key is valid. Enjoy the trading with Hoobot!');
    } else {
      console.log('Invalid license key. Please purchase a valid license. Contact toni.lukkaroinen@hoosat.fi to purchase Hoobot Hoobot. There are preventions to notice this if you remove this check.');
    }
    let discord: any = undefined;
    if(options.discordEnabled === true) {
      discord = loginDiscord(binance, options);
    }

    options.balances = await getCurrentBalances(binance);
    storeBalancesDaily(binance, "USDT");

    const candlesticksToPreload = 1000;
    const symbolCandlesticks: Candlesticks = {};
    if(options.mode === "algorithmic") {
      if (process.env.GO_CRAZY !== undefined) {
        const symbolInfo = await getTradeableSymbols(binance, process.env.GO_CRAZY);
        const foundSymbols: string[] = [];
        for (const symbol of symbolInfo) {
          if (symbol.quote === process.env.GO_CRAZY) {
            foundSymbols.push(symbol.base + "/" + symbol.quote);
          }
        }
        console.log(foundSymbols);
        options.symbols = foundSymbols;
      }
      if (Array.isArray(options.symbols)) {
        for (const symbol of options.symbols) {
          options.orderbooks[symbol.split("/").join("")] = await getOrderbook(binance, symbol);
        }
        for (const symbol of options.symbols) {
          const filter = await getFilters(binance, symbol);
          symbolFilters[symbol.split("/").join("")] = filter;
          const logger = consoleLogger();
          listenForOrderbooks(binance, symbol, (symbol: string, orderbook: Orderbook) => {
            if(options.orderbooks[symbol.split("/").join("")] === undefined) {
              options.orderbooks[symbol.split("/").join("")] =  {
                bids: [],
                asks: []
              }
            }
            options.orderbooks[symbol.split("/").join("")] = orderbook;
          });
          listenForCandlesticks(binance, symbol, options.candlestickInterval, symbolCandlesticks, candlesticksToPreload, (candlesticks: Candlesticks) => {
            algorithmic(discord, binance, logger, symbol, candlesticks, options)
          });
        }
      } else {
        const filter = await getFilters(binance, options.symbols);
        symbolFilters[options.symbols.split("/").join("")] = filter;
        const logger = consoleLogger();
        options.orderbooks[options.symbols.split("/").join("")] = await getOrderbook(binance, options.symbols);
        listenForOrderbooks(binance, options.symbols, (symbol: string, orderbook: Orderbook) => {
          if(options.orderbooks[symbol.split("/").join("")] === undefined) {
            options.orderbooks[symbol.split("/").join("")] =  {
              bids: [],
              asks: []
            }
          }
          options.orderbooks[symbol.split("/").join("")] = orderbook;
        });
        listenForCandlesticks(binance, options.symbols, options.candlestickInterval, symbolCandlesticks,  candlesticksToPreload, (candlesticks: Candlesticks) => {
          algorithmic(discord, binance, logger, options.symbols as string, candlesticks, options)
        });
      }
    } else if (options.mode === "hilow") {
      for (const symbol of options.symbols) {
        options.orderbooks[symbol.split("/").join("")] = await getOrderbook(binance, symbol);
      }
      for (const symbol of options.symbols) {
        const filter = await getFilters(binance, symbol);
        symbolFilters[symbol.split("/").join("")] = filter;
        listenForOrderbooks(binance, symbol, (_symbol: string, orderbook: Orderbook) => {
          if(options.orderbooks[symbol.split("/").join("")] === undefined) {
            options.orderbooks[symbol.split("/").join("")] =  {
              bids: [],
              asks: []
            }
          }
          options.orderbooks[symbol.split("/").join("")] = orderbook;
          const logger = consoleLogger();
          hilow(discord, binance, logger, symbol, options);
        });
      }
    }
  } catch (error: any) {
    console.error(JSON.stringify(error));
  }
}

main();

