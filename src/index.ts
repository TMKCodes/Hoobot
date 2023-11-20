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

// process.on('unhandledRejection', (reason, promise) => {
//   console.error('Unhandled Rejection at:', promise, 'reason:', reason);
// });

import Binance from 'node-binance-api';
import { loginDiscord, } from './Discord/discord';
import { listenForCandlesticks, Candlesticks, downloadHistoricalCandlesticks, simulateListenForCandlesticks, Candlestick } from './Hoobot/Binance/Candlesticks';
import { ConfigOptions, parseArgs } from './Hoobot/Utilities/args';
import { getCurrentBalances, storeBalancesDaily } from './Hoobot/Binance/Balances';
import { consoleLogger } from './Hoobot/Utilities/consoleLogger';
import { Filters, getFilters } from './Hoobot/Binance/Filters';
import dotenv from 'dotenv';
import { algorithmic, simulateAlgorithmic } from './Hoobot/Modes/Algorithmic';
import { getTradeableSymbols } from './Hoobot/Binance/Symbols';
import { checkLicenseValidity } from './Hoobot/Utilities/license';
import { Orderbook, getOrderbook, listenForOrderbooks } from './Hoobot/Binance/Orderbook';
import { hilow } from './Hoobot/Modes/HiLow';
import { delay, getTradeHistory } from './Hoobot/Binance/Trades';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';


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
      if (process.env.GO_CRAZY !== undefined && process.env.GO_CRAZY !== "false") {
        const symbolInfo = await getTradeableSymbols(binance, process.env.GO_CRAZY);
        const foundSymbols: string[] = [];
        for (const symbol of symbolInfo) {
          if (symbol.quote === process.env.GO_CRAZY) {
            foundSymbols.push(symbol.base + "/" + symbol.quote);
          }
        }
        console.log(JSON.stringify(foundSymbols, null, 2));
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
          listenForCandlesticks(binance, symbol, options.candlestickInterval, symbolCandlesticks, candlesticksToPreload, options, async (candlesticks: Candlesticks) => {
            await algorithmic(discord, binance, logger, symbol, candlesticks, options);
          });
        }
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


export const recalculateNewOptions = (options: ConfigOptions) => {
  const filePath = `simulation/best-configuration.json`;
  try {
    if (existsSync(filePath)) {
      const file = readFileSync(filePath, 'utf-8');
      const prevOptions: ConfigOptions = JSON.parse(file) as ConfigOptions;

      let prevBalance = calculateBalance(prevOptions);
      console.log(prevBalance);
      let balance = calculateBalance(options);
      console.log(balance);

      if (prevBalance > balance) {
        updateOptionsForWorseSimulation(options, prevOptions);
      } else if (prevBalance < balance) {
        writeFileSync(filePath, JSON.stringify(options, null, 2));
      }
    } else {
      writeFileSync(filePath, JSON.stringify(options, null, 2));
    }
  } catch (error) {
    console.error('Error while recalculating options:', error.message);
  }
};

const calculateBalance = (options: ConfigOptions): number => {
  let balance = 0;
  const uniqueQuoteCurrencies = new Set<string>();

  for (const symbol of options.symbols) {
    const symbolKey = symbol.split('/').join('');
    if (options.tradeHistory[symbolKey] && options.tradeHistory[symbolKey].length > 0) {
      const lastTrade = options.tradeHistory[symbolKey].slice(-1)[0];
      const lastPrice = parseFloat(lastTrade.price);
      const [base, quote] = symbol.split('/');
      if (options.balances[base] !== null) {
        const baseBalance = options.balances[base] * lastPrice;
        balance += baseBalance;
      }
      uniqueQuoteCurrencies.add(quote);
    } else {
      console.error(`Trade history not available for symbol: ${symbol}`);
    }
  }
  uniqueQuoteCurrencies.forEach((quote) => {
    balance += options.balances[quote];
  });
  return balance;
};

const updateOptionsForWorseSimulation = (options: ConfigOptions, prevOptions: ConfigOptions) => {
  options.minimumProfitSell = prevOptions.minimumProfitSell + 0.05;
  options.minimumProfitBuy = prevOptions.minimumProfitBuy - 0.05;
  options.stopLossPNL = prevOptions.stopLossPNL + 0.01;
  options.takeProfitPNL = prevOptions.takeProfitPNL + 0.05;
  options.takeProfitMinimumPNL = prevOptions.takeProfitMinimumPNL + 0.01;
  options.takeProfitMinimumPNLDrop = prevOptions.takeProfitMinimumPNLDrop + 0.001;
};

const initBruteForceOptions = (
  options: ConfigOptions
) => {
  const filePath = `simulation/best-configuration.json`; 
  if(options.simulateBruteForce) {
    if (existsSync(filePath)) {
      options = JSON.parse(readFileSync(filePath, 'utf-8') || "{}");
      options.minimumProfitSell = options.minimumProfitSell + 0.05;
      options.minimumProfitBuy = options.minimumProfitBuy - 0.05;
      options.stopLossPNL = options.stopLossPNL + 0.01;
      options.takeProfitPNL = options.takeProfitPNL + 0.05;
      options.takeProfitMinimumPNL = options.takeProfitMinimumPNL + 0.01;
      options.takeProfitMinimumPNLDrop = options.takeProfitMinimumPNLDrop + 0.001;
    } else {
      options.minimumProfitSell = 0.00;
      options.minimumProfitBuy = 0;
      options.stopLoss = true;
      options.stopLossPNL = 100;
      options.takeProfitPNL = 0.5;
      options.takeProfitMinimumPNL = 0.05;
      options.takeProfitMinimumPNLDrop = 0.005
    }
  }
}

export let candlestickArray: Candlestick[];
const simulate = async () => {
  initBruteForceOptions(options);
  do {
    let startingBalance = 0;
    options.startTime = new Date().toISOString();
    options.balances = {};
    const candleStore: Candlesticks = {};
    if(options.mode === "algorithmic") {
      if (process.env.GO_CRAZY !== undefined && process.env.GO_CRAZY !== "false") {
        const symbolInfo = await getTradeableSymbols(binance, process.env.GO_CRAZY);
        const foundSymbols: string[] = [];
        for (const symbol of symbolInfo) {
          if (symbol.quote === process.env.GO_CRAZY) {
            foundSymbols.push(symbol.base + "/" + symbol.quote);
          }
        }
        options.symbols = foundSymbols;
      }
      console.log(JSON.stringify(options.symbols, null, 2));
      candlestickArray = await downloadHistoricalCandlesticks(options.symbols, options.candlestickInterval);
      console.log("Starting simulation with downloaded candlesticks.");
      for (const symbol of options.symbols) {
        options.balances[symbol.split("/")[0]] = 0;
        options.balances[symbol.split("/")[1]] = options.startingMaxBuyAmount[symbol.split("/").join("")] * options.symbols.length;
        startingBalance += options.startingMaxBuyAmount[symbol.split("/").join("")] * options.symbols.length;
        const filter = await getFilters(binance, symbol);
        symbolFilters[symbol.split("/").join("")] = filter;
      }
      const filePath = `./simulation/${options.startTime}/configuration.json`;
      const directory = path.dirname(filePath);
      if (!existsSync(directory)) {
        mkdirSync(directory, { recursive: true });
      }
      writeFileSync(filePath, JSON.stringify(options, null, 2));
      await simulateListenForCandlesticks(options.symbols, candleStore, options, async (symbol: string, interval: string, candlesticks: Candlesticks) => {
        if (candlesticks[symbol.split("/").join("")][interval] == undefined || candlesticks[symbol.split("/").join("")][interval].length === 0) {
          return;
        }
        await simulateAlgorithmic(symbol, candlesticks, options, options.balances, symbolFilters[symbol.split("/").join("")]);
      });
    }
    recalculateNewOptions(options);
    let balance = calculateBalance(options);
    console.log(`Final Balance: ${balance}, ROI = ${(balance - startingBalance) / startingBalance}`);
  } while(options.simulateBruteForce === true)
}
if (options.simulate === true) {
  // compare file manually to best-configuration

  // const configurationPath = `simulation/2023-11-19T13:40:38.665Z/configuration.json`;
  // const TradesPath = `simulation/2023-11-19T13:40:38.665Z/trades.json`;
  // if (existsSync(configurationPath)) {
  //   const file = readFileSync(configurationPath, 'utf-8');
  //   const prevOptions: ConfigOptions = JSON.parse(file) as ConfigOptions;
  //   if (existsSync(TradesPath)) {
  //     const tradesFile = readFileSync(TradesPath, 'utf-8');
  //     const trades = JSON.parse(tradesFile);
  //     prevOptions.balances = trades.balances;
  //     prevOptions.tradeHistory = trades.tradeHistory;
  //     recalculateNewOptions(prevOptions)
  //   }
  // }
  simulate();
} else {
  main();
}

