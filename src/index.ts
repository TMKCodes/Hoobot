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

import Binance from "node-binance-api";
import { loginDiscord, sendMessageToChannel } from "./Discord/discord";
import {
  listenForCandlesticks,
  Candlesticks,
  downloadHistoricalCandlesticks,
  simulateListenForCandlesticks,
  Candlestick,
} from "./Hoobot/Exchanges/Candlesticks";
import { ExchangeOptions, parseArgs } from "./Hoobot/Utilities/Args";
import { getCurrentBalances, storeBalances } from "./Hoobot/Exchanges/Balances";
import { consoleLogger } from "./Hoobot/Utilities/ConsoleLogger";
import { Filters, getFilters } from "./Hoobot/Exchanges/Filters";
import dotenv from "dotenv";
import { algorithmic, simulateAlgorithmic } from "./Hoobot/Modes/Algorithmic";
import { checkLicenseValidity } from "./Hoobot/Utilities/License";
import { Orderbook, listenForOrderbooks } from "./Hoobot/Exchanges/Orderbook";
import { hilow } from "./Hoobot/Modes/HiLow";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { Xeggex } from "./Hoobot/Exchanges/Xeggex/Xeggex";
import { Exchange, getExchangeOption, isBinance, isXeggex, isNonKYC } from "./Hoobot/Exchanges/Exchange";
import { logToFile } from "./Hoobot/Utilities/LogToFile";
import { NonKYC } from "./Hoobot/Exchanges/NonKYC/NonKYC";
import { Trade, getTradeHistory, listenForTrades } from "./Hoobot/Exchanges/Trades";
import { gridTrading } from "./Hoobot/Modes/Grid";
import { consecutive } from "./Hoobot/Modes/Consecutive";
import { periodic } from "./Hoobot/Modes/Periodic";
import express, { Express } from "express";

export var symbolFilters: Filters = {};

// Get configuration options from command-line arguments and dotenv.
dotenv.config();

// Initialize Binance client

const options = parseArgs();

const runExchange = async (exchange: Exchange, discord: any, exchangeOptions: ExchangeOptions) => {
  exchangeOptions.balances = await getCurrentBalances(exchange);
  storeBalances(exchange, exchangeOptions.balances);
  const candlesticksToPreload = 1000;
  const symbolCandlesticks: Candlesticks = {};
  if (exchangeOptions.mode === "algorithmic") {
    console.log(`Start running exchange ${exchangeOptions.name} on algorithmic mode.`);
    if (Array.isArray(exchangeOptions.symbols)) {
      if (exchangeOptions.orderbooks === undefined) {
        exchangeOptions.orderbooks = {};
      }
      for (const symbolOptions of exchangeOptions.symbols) {
        symbolFilters[symbolOptions.name.split("/").join("")] = await getFilters(exchange, symbolOptions.name);
        if (process.env.HOOSAT_NETWORKS_DEVELOPER === "true") {
          if (isXeggex(exchange) || isNonKYC(exchange)) {
            console.log("Starting to listen for trades with Hoosat Network enabled");
            listenForTrades(exchange, symbolOptions.name, async (trade: Trade) => {
              if (trade.isBuyer) {
                const buyAmount = (parseFloat(trade.qty) * parseFloat(trade.price)).toFixed(6);
                if (parseFloat(buyAmount) > 10) {
                  let msg = "```";
                  msg += `Someone made buy order for symbol ${trade.symbol} in Xeggex!\r\n`;
                  msg += `For the quantity of: ${trade.qty} ${trade.symbol.split("/")[0]}\r\n`;
                  msg += `With the price of: ${trade.price}\r\n`;
                  msg += `Which equals: ${buyAmount} ${trade.symbol.split("/")[1]}`;
                  msg += "```";
                  console.log(msg);
                  sendMessageToChannel(discord, "1244212931286269972", msg);
                }
              }
            });
          }
        }
        listenForOrderbooks(exchange, symbolOptions.name, (symbol: string, orderbook: Orderbook) => {
          if (exchangeOptions.orderbooks === undefined) {
            exchangeOptions.orderbooks = {};
          }
          if (
            exchangeOptions.orderbooks !== undefined &&
            exchangeOptions.orderbooks[symbol.split("/").join("")] === undefined
          ) {
            exchangeOptions.orderbooks[symbol.split("/").join("")] = {
              bids: {},
              asks: {},
            };
          }
          exchangeOptions.orderbooks[symbol.split("/").join("")] = orderbook;
        });
        listenForCandlesticks(
          exchange,
          symbolOptions.name,
          symbolOptions.timeframes,
          symbolCandlesticks,
          candlesticksToPreload,
          symbolOptions,
          async (candlesticks: Candlesticks) => {
            const logger = consoleLogger();
            await algorithmic(
              discord,
              exchange,
              logger,
              symbolOptions.name,
              candlesticks,
              options,
              exchangeOptions,
              symbolOptions
            );
          }
        );
      }
    }
  } else if (exchangeOptions.mode === "consecutive") {
    console.log(`Start running exchange ${exchangeOptions.name} on consecutive mode.`);
    if (Array.isArray(exchangeOptions.symbols)) {
      if (exchangeOptions.orderbooks === undefined) {
        exchangeOptions.orderbooks = {};
      }
      for (const symbolOptions of exchangeOptions.symbols) {
        symbolFilters[symbolOptions.name.split("/").join("")] = await getFilters(exchange, symbolOptions.name);
        listenForOrderbooks(exchange, symbolOptions.name, (symbol: string, orderbook: Orderbook) => {
          if (exchangeOptions.orderbooks === undefined) {
            exchangeOptions.orderbooks = {};
          }
          if (
            exchangeOptions.orderbooks !== undefined &&
            exchangeOptions.orderbooks[symbol.split("/").join("")] === undefined
          ) {
            exchangeOptions.orderbooks[symbol.split("/").join("")] = {
              bids: {},
              asks: {},
            };
          }
          exchangeOptions.orderbooks[symbol.split("/").join("")] = orderbook;
        });
        listenForCandlesticks(
          exchange,
          symbolOptions.name,
          symbolOptions.timeframes,
          symbolCandlesticks,
          candlesticksToPreload,
          symbolOptions,
          async (candlesticks: Candlesticks) => {
            const logger = consoleLogger();
            await consecutive(
              discord,
              exchange,
              logger,
              symbolOptions.name,
              candlesticks,
              options,
              exchangeOptions,
              symbolOptions
            );
          }
        );
      }
    }
  } else if (exchangeOptions.mode === "hilow") {
    console.log(`Start running exchange  ${exchangeOptions.name} on hilow mode.`);
    for (const symbolOptions of exchangeOptions.symbols) {
      const filter = await getFilters(exchange, symbolOptions.name);
      symbolFilters[symbolOptions.name.split("/").join("")] = filter;
      listenForOrderbooks(exchange, symbolOptions.name, (_symbol: string, orderbook: Orderbook) => {
        if (exchangeOptions.orderbooks === undefined) {
          exchangeOptions.orderbooks = {};
        }
        if (
          exchangeOptions.orderbooks !== undefined &&
          exchangeOptions.orderbooks[symbolOptions.name.split("/").join("")] === undefined
        ) {
          exchangeOptions.orderbooks[symbolOptions.name.split("/").join("")] = {
            bids: {},
            asks: {},
          };
        }
        exchangeOptions.orderbooks[symbolOptions.name.split("/").join("")] = orderbook;
        const logger = consoleLogger();
        hilow(discord, exchange, logger, symbolOptions.name, options, exchangeOptions, symbolOptions);
      });
    }
  } else if (exchangeOptions.mode === "periodic") {
    console.log(`Start running exchange  ${exchangeOptions.name} on periodic mode.`);
    for (const symbolOptions of exchangeOptions.symbols) {
      const filter = await getFilters(exchange, symbolOptions.name);
      symbolFilters[symbolOptions.name.split("/").join("")] = filter;
      listenForOrderbooks(exchange, symbolOptions.name, (_symbol: string, orderbook: Orderbook) => {
        if (exchangeOptions.orderbooks === undefined) {
          exchangeOptions.orderbooks = {};
        }
        if (
          exchangeOptions.orderbooks !== undefined &&
          exchangeOptions.orderbooks[symbolOptions.name.split("/").join("")] === undefined
        ) {
          exchangeOptions.orderbooks[symbolOptions.name.split("/").join("")] = {
            bids: {},
            asks: {},
          };
        }
        exchangeOptions.orderbooks[symbolOptions.name.split("/").join("")] = orderbook;
        const logger = consoleLogger();
        periodic(discord, exchange, logger, symbolOptions.name, options, exchangeOptions, symbolOptions);
      });
    }
  } else if (exchangeOptions.mode === "grid") {
    console.log(`Start running exchange ${exchangeOptions.name} on grid trading mode.`);
    if (Array.isArray(exchangeOptions.symbols)) {
      for (const symbolOptions of exchangeOptions.symbols) {
        symbolFilters[symbolOptions.name.split("/").join("")] = await getFilters(exchange, symbolOptions.name);
        listenForOrderbooks(exchange, symbolOptions.name, (symbol: string, orderbook: Orderbook) => {
          if (exchangeOptions.orderbooks === undefined) {
            exchangeOptions.orderbooks = {};
          }
          if (
            exchangeOptions.orderbooks !== undefined &&
            exchangeOptions.orderbooks[symbol.split("/").join("")] === undefined
          ) {
            exchangeOptions.orderbooks[symbol.split("/").join("")] = {
              bids: {},
              asks: {},
            };
          }
          exchangeOptions.orderbooks[symbol.split("/").join("")] = orderbook;
        });
        // listenForTrades(exchange, symbolOptions.name, async (trade: Trade) => {
        //   let msg = "```";
        //   msg += `Order executed: ${trade.symbol}\r\n`;
        //   msg += `${trade.isBuyer === true ? "Buy" : "Sell"} ID: ${trade.orderId}\r\n`;
        //   msg += `Price: ${trade.price}\r\n`;
        //   msg += `Qty: ${trade.qty}\r\n`;
        //   msg += `Time now ${new Date().toLocaleString("fi-fi")}\r\n`;
        //   msg += "```";
        //   sendMessageToChannel(discord, options.discord.channelId!, msg);
        // });
        listenForCandlesticks(
          exchange,
          symbolOptions.name,
          symbolOptions.timeframes,
          symbolCandlesticks,
          candlesticksToPreload,
          symbolOptions,
          async (candlesticks: Candlesticks) => {
            const logger = consoleLogger();
            await gridTrading(
              discord,
              exchange,
              logger,
              symbolOptions.name,
              candlesticks,
              options,
              exchangeOptions,
              symbolOptions
            );
          }
        );
      }
    }
  }
};

const startBinance = async (exchangeOptions: ExchangeOptions) => {
  const exchange = new Binance();
  exchange.options({
    APIKEY: exchangeOptions.key,
    APISECRET: exchangeOptions.secret,
    useServerTime: true,
    family: 4,
  });
  return exchange;
};

const startXeggex = async (exchangeOptions: ExchangeOptions) => {
  if (exchangeOptions.forceStopOnDisconnect === undefined) {
    exchangeOptions.forceStopOnDisconnect = false;
  }
  const exchange = new Xeggex(exchangeOptions.key, exchangeOptions.secret, exchangeOptions.forceStopOnDisconnect);
  await exchange.waitConnect();
  return exchange;
};

const startNonKYC = async (exchangeOptions: ExchangeOptions) => {
  const exchange = new NonKYC(exchangeOptions.key, exchangeOptions.secret, exchangeOptions.forceStopOnDisconnect);
  await exchange.waitConnect();
  return exchange;
};

const hoobot = async () => {
  try {
    if (await checkLicenseValidity(options.license)) {
      console.log("License key is valid. Enjoy the trading with Hoobot!");
    } else {
      console.log(
        "Invalid license key. Please purchase a valid license. Contact toni.lukkaroinen@hoosat.fi to purchase Hoobot Hoobot. There are preventions to notice this if you remove this check."
      );
    }
    var discord: any = undefined;
    const exchanges: Exchange[] = [];
    if (options.discord.enabled === true) {
      discord = await loginDiscord(exchanges, options);
    }
    for (var exchangeOptions of options.exchanges) {
      let exchange;
      if (exchangeOptions.name === "binance") {
        exchange = await startBinance(exchangeOptions);
        exchanges.push(exchange);
      } else if (exchangeOptions.name === "xeggex") {
        exchange = await startXeggex(exchangeOptions);
        exchanges.push(exchange);
      } else if (exchangeOptions.name === "nonkyc") {
        exchange = await startNonKYC(exchangeOptions);
        exchanges.push(exchange);
      }
      if (exchange !== undefined) {
        runExchange(exchange, discord, exchangeOptions);
      }
    }
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error(JSON.stringify(error, null, 4));
  }
};

const calculateBalance = (options: ExchangeOptions): number => {
  let balance = 0;
  try {
    const uniqueQuoteCurrencies = new Set<string>();
    for (const symbolOptions of options.symbols) {
      const symbolKey = symbolOptions.name.split("/").join("");
      if (
        options.tradeHistory !== undefined &&
        options.tradeHistory[symbolKey] &&
        options.tradeHistory[symbolKey].length > 0
      ) {
        const lastTrade = options.tradeHistory[symbolKey].slice(-1)[0];
        const lastPrice = parseFloat(lastTrade.price);
        const [base, quote] = symbolOptions.name.split("/");
        if (options.balances !== undefined && options.balances[base] !== null) {
          const baseBalance = options.balances[base].crypto * lastPrice;
          balance += baseBalance;
        }
        uniqueQuoteCurrencies.add(quote);
      }
    }
    uniqueQuoteCurrencies.forEach((quote) => {
      if (options.balances !== undefined) {
        balance += options.balances[quote].crypto;
      }
    });
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error(error);
  }
  return balance;
};

const simulate = async () => {
  const exchange = new Binance();
  const exchangeOptions: ExchangeOptions = options.exchanges.filter(
    (exchangeOption) => exchangeOption.name === "binance"
  )[0];
  exchange.options({
    APIKEY: exchangeOptions.key,
    APISECRET: exchangeOptions.secret,
    useServerTime: true,
    family: 4,
  });
  const Logger = consoleLogger();
  let startingBalance = 0;
  options.startTime = new Date().toISOString();
  let candleStore: Candlesticks = {};
  if (exchangeOptions.mode === "algorithmic") {
    exchangeOptions.balances = {};
    Logger.push("simulation-symbols", exchangeOptions.symbols);
    Logger.print();
    Logger.flush();
    const symbols = exchangeOptions.symbols.map((symbol) => symbol.name);
    const timeframes = [
      ...new Set(exchangeOptions.symbols.flatMap((symbol) => symbol.timeframes)),
      ...new Set(exchangeOptions.symbols.flatMap((symbol) => symbol.trend?.timeframe!)),
    ];
    const allCandlesticks = await downloadHistoricalCandlesticks(symbols, timeframes);
    console.log("Starting simulation with downloaded candlesticks.");
    for (const symbolOptions of exchangeOptions.symbols) {
      const timeframes = [...symbolOptions.timeframes];
      if (symbolOptions.trend?.enabled) {
        if (!timeframes.includes(symbolOptions.trend?.timeframe!)) {
          timeframes.push(symbolOptions.trend?.timeframe!);
        }
      }
      exchangeOptions.balances[symbolOptions.name.split("/")[0]] = {
        crypto: 0,
        usdt: 0,
      };
      exchangeOptions.balances[symbolOptions.name.split("/")[1]] = {
        crypto: symbolOptions.growingMax?.buy!,
        usdt: 0,
      };
      startingBalance += symbolOptions.growingMax?.buy! * symbols.length;
      const filter = await getFilters(exchange, symbolOptions.name);
      symbolFilters[symbolOptions.name.split("/").join("")] = filter;
      const sanitizedStartTime = options.startTime.replace(/:/g, "-");
      const filePath = `./simulation/${sanitizedStartTime}/configuration.json`;
      if (!existsSync(`./simulation`)) {
        mkdirSync(`./simulation`);
      }
      const directory = path.dirname(filePath);
      if (!existsSync(directory)) {
        mkdirSync(directory, { recursive: true });
      }
      writeFileSync(filePath, JSON.stringify(options, null, 2));
      await simulateListenForCandlesticks(
        symbols,
        allCandlesticks,
        candleStore,
        options,
        async (symbol: string, interval: string, candlesticks: Candlesticks) => {
          try {
            if (
              candlesticks[symbol.split("/").join("")][interval] == undefined ||
              candlesticks[symbol.split("/").join("")][interval].length === 0
            ) {
              return;
            }
            await simulateAlgorithmic(
              symbolOptions.name,
              candlesticks,
              options,
              exchangeOptions,
              symbolOptions,
              exchangeOptions.balances!,
              symbolFilters[symbol.split("/").join("")]
            );
          } catch (error) {
            logToFile("./logs/error.log", JSON.stringify(error, null, 4));
            console.error(error);
          }
        }
      );
    }
    let balance = calculateBalance(exchangeOptions);
    Logger.push("Starting balance", startingBalance.toFixed(2));
    Logger.push("Final Balance", balance.toFixed(2));
    Logger.push("ROI", ((balance - startingBalance) / startingBalance).toFixed(2));
    for (const symbol of exchangeOptions.symbols) {
      Logger.push(`${symbol.name} max trade`, symbol.growingMax);
      Logger.push(`${symbol.name} trades`, exchangeOptions.tradeHistory[symbol.name.split("/").join("")].length);
      Logger.push(
        `${symbol.name} stop losses`,
        exchangeOptions.tradeHistory[symbol.name.split("/").join("")].filter((trade) => trade.profit === "STOP_LOSS")
          .length
      );
      Logger.push(
        `${symbol.name} take profits`,
        exchangeOptions.tradeHistory[symbol.name.split("/").join("")].filter((trade) => trade.profit === "TAKE_PROFIT")
          .length
      );
      Logger.push(
        `${symbol.name} sells`,
        exchangeOptions.tradeHistory[symbol.name.split("/").join("")].filter((trade) => trade.profit === "SELL").length
      );
      Logger.push(
        `${symbol.name} buys`,
        exchangeOptions.tradeHistory[symbol.name.split("/").join("")].filter((trade) => trade.profit === "BUY").length
      );
    }
    Logger.print();
    Logger.flush();
  }
};

const webServer = async () => {
  const app = express();
  const PORT = process.env.PORT || 5656;

  // Serve static files from the build/frontend directory
  let frontendPath = "./build/Frontend";
  if (process.env.DEVELOPMENT === "true") {
    frontendPath = "./src/Frontend";
  }
  app.use(express.static(frontendPath));

  // Serve index.html on root route
  app.get("/", (_, res) => {
    res.sendFile(frontendPath + "/index.html");
  });

  // Start the server and return the Express app instance
  await new Promise<void>((resolve) => {
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
      resolve();
    });
  });

  return app;
};

if (process.env.SIMULATE === "true") {
  simulate();
} else {
  webServer();
  hoobot();
}
