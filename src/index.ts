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
import { SymbolCandlesticks, candlestick, listenForCandlesticks } from './Hoobot/Binance/candlesticks';
import { ConfigOptions, parseArgs } from './Hoobot/Utilities/args';
import { getBalancesFromWebsocket, getCurrentBalances } from './Hoobot/Binance/balances';
import { consoleLogger } from './Hoobot/Utilities/consoleLogger';
import { filters, getFilters } from './Hoobot/Binance/filters';
import dotenv from 'dotenv';
import { algorithmic } from './Hoobot/Modes/algorithmic';
import { getTradeableSymbols } from './Hoobot/Binance/symbols';
import { checkLicenseValidity } from './Hoobot/Utilities/license';


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

export let symbolFilters: filters = {};
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

    const balances = await getCurrentBalances(binance);
    binance.websockets.userData((data: any) => {
      const newBalances = getBalancesFromWebsocket(data);
      if (newBalances !== undefined) {
        const balanceKeys = Object.keys(newBalances);
        for (const key of balanceKeys) {
          balances[key] = newBalances[key];
        }
      }
    }, (data: any) => {
      // Possible to add discord notification if order has been fulfilled with websocket notification.
    });

    const candlesticksToPreload = 1000;
    const symbolCandlesticks: SymbolCandlesticks = {};
    if(options.mode === "algorithmic") {
      if (process.env.GO_CRAZY !== undefined) {
        const symbolInfo = await getTradeableSymbols(binance, process.env.GO_CRAZY);
        const foundSymbols: string[] = [];
        for (const symbol of symbolInfo) {
          if (symbol.quote === process.env.GO_CRAZY) {
            foundSymbols.push(symbol.base + "/" + symbol.quote);
          }
        }
        options.symbols = foundSymbols;
      }
      if (Array.isArray(options.symbols)) {
        for (const symbol of options.symbols) {
          const filter = await getFilters(binance, symbol);
          symbolFilters[symbol.split("/").join("")] = filter;
          const logger = consoleLogger();
          listenForCandlesticks(binance, symbol, options.candlestickInterval, symbolCandlesticks, candlesticksToPreload, (candlesticks: candlestick[]) => {
            algorithmic(discord, binance, logger, symbol, balances, candlesticks, options)
          });
        }
      } else {
        const filter = await getFilters(binance, options.symbols);
        symbolFilters[options.symbols.split("/").join("")] = filter;
        const logger = consoleLogger();
        listenForCandlesticks(binance, options.symbols, options.candlestickInterval, symbolCandlesticks,  candlesticksToPreload, (candlesticks: candlestick[]) => {
          algorithmic(discord, binance, logger, options.symbols as string, balances, candlesticks, options)
        });
      }
    }
  } catch (error: any) {
    console.error(JSON.stringify(error));
  }
}

main();

