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

import fs from "fs";
import Binance from "node-binance-api";
import { loginDiscord } from "./Discord/discord";
import {
  listenForCandlesticks,
  Candlesticks,
  downloadHistoricalCandlesticks,
  simulateListenForCandlesticks,
} from "./Hoobot/Exchanges/Candlesticks";
import { ExchangeOptions, parseArgs, getMinutesFromInterval } from "./Hoobot/Utilities/Args";
import { getCurrentBalances, storeBalances } from "./Hoobot/Exchanges/Balances";
import { consoleLogger } from "./Hoobot/Utilities/ConsoleLogger";
import { Filters, getFilters } from "./Hoobot/Exchanges/Filters";
import dotenv from "dotenv";
import { algorithmic, simulateAlgorithmic } from "./Hoobot/Modes/Algorithmic";
import { checkLicenseValidity } from "./Hoobot/Utilities/License";
import { Orderbook, getOrderbook, listenForOrderbooks } from "./Hoobot/Exchanges/Orderbook";
import { hilow } from "./Hoobot/Modes/HiLow";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { Exchange } from "./Hoobot/Exchanges/Exchange";
import { logToFile } from "./Hoobot/Utilities/LogToFile";
import { NonKYC } from "./Hoobot/Exchanges/NonKYC/NonKYC";
import { Mexc } from "./Hoobot/Exchanges/Mexc/Mexc";
import { gridTrading } from "./Hoobot/Modes/Grid";
import { periodic } from "./Hoobot/Modes/Periodic";
import { fileURLToPath } from "url";
import express from "express";

export var symbolFilters: Filters = {};

// Get configuration options from command-line arguments and dotenv.
dotenv.config();

// Initialize Binance client

var options = parseArgs();

const runExchange = async (exchange: Exchange, discord: any, exchangeOptions: ExchangeOptions) => {
  exchangeOptions.balances = await getCurrentBalances(exchange);
  storeBalances(exchange, exchangeOptions.balances);
  const candlesticksToPreload = 10000;
  const symbolCandlesticks: Candlesticks = {};
  if (exchangeOptions.mode === "algorithmic") {
    console.log(`Start running exchange ${exchangeOptions.name} on algorithmic mode.`);
    if (Array.isArray(exchangeOptions.symbols)) {
      if (exchangeOptions.orderbooks === undefined) {
        exchangeOptions.orderbooks = {};
      }
      for (const symbolOptions of exchangeOptions.symbols) {
        exchangeOptions.orderbooks[symbolOptions.name.split("/").join("")] = await getOrderbook(
          exchange,
          symbolOptions.name,
        );
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
            // console.log("Got a Candle");
            await algorithmic(
              discord,
              exchange,
              logger,
              symbolOptions.name,
              candlesticks,
              options,
              exchangeOptions,
              symbolOptions,
            );
          },
        );
      }
    }
  } else if (exchangeOptions.mode === "hilow") {
    console.log(`Start running exchange  ${exchangeOptions.name} on hilow mode.`);
    for (const symbolOptions of exchangeOptions.symbols) {
      exchangeOptions.orderbooks[symbolOptions.name.split("/").join("")] = await getOrderbook(
        exchange,
        symbolOptions.name,
      );
      symbolFilters[symbolOptions.name.split("/").join("")] = await getFilters(exchange, symbolOptions.name);
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
      exchangeOptions.orderbooks[symbolOptions.name.split("/").join("")] = await getOrderbook(
        exchange,
        symbolOptions.name,
      );
      symbolFilters[symbolOptions.name.split("/").join("")] = await getFilters(exchange, symbolOptions.name);
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
        exchangeOptions.orderbooks[symbolOptions.name.split("/").join("")] = await getOrderbook(
          exchange,
          symbolOptions.name,
        );
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
              symbolOptions,
            );
          },
        );
      }
    }
  }
};

const startBinance = async (exchangeOptions: ExchangeOptions): Promise<Exchange> => {
  const exchange = new Binance();
  exchange.options({
    APIKEY: exchangeOptions.key,
    APISECRET: exchangeOptions.secret,
    useServerTime: true,
    family: 4,
  });
  console.log("Started Binance");
  return exchange;
};

const startNonKYC = async (exchangeOptions: ExchangeOptions): Promise<Exchange> => {
  if (exchangeOptions.forceStopOnDisconnect === undefined) {
    exchangeOptions.forceStopOnDisconnect = false;
  }
  const exchange = new NonKYC(exchangeOptions.key, exchangeOptions.secret, exchangeOptions.forceStopOnDisconnect);
  await exchange.waitConnect();
  console.log("Started NonKYC");
  return exchange;
};

const startMexc = async (exchangeOptions: ExchangeOptions): Promise<Exchange> => {
  if (exchangeOptions.forceStopOnDisconnect === undefined) {
    exchangeOptions.forceStopOnDisconnect = false;
  }
  const exchange = new Mexc({ key: exchangeOptions.key, secret: exchangeOptions.secret });
  await exchange.waitConnect();
  console.log("Started Mexc");
  return exchange;
};

const delay = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const hoobot = async () => {
  try {
    if (await checkLicenseValidity(options.license)) {
      console.log("License key is valid. Enjoy the trading with Hoobot!");
    } else {
      console.log(
        "Invalid license key. Please purchase a valid license. Contact toni.lukkaroinen@hoosat.fi to purchase Hoobot Hoobot. There are preventions to notice this if you remove this check.",
      );
    }
    var discord: any = undefined;
    const exchanges: Exchange[] = [];
    if (options.discord.enabled === true) {
      discord = await loginDiscord(exchanges, options);
    }
    for (var exchangeOptions of options.exchanges) {
      if (exchangeOptions.name === "nonkyc") {
        const setupNonKYC = async (exchangeOptions: any, discord: any): Promise<Exchange> => {
          exchangeOptions.socket = await startNonKYC(exchangeOptions);
          exchangeOptions.socket.on("try-to-reconnect", async () => {
            console.log("Trying to reconnect");
            exchangeOptions.socket = await setupNonKYC(exchangeOptions, discord);
            runExchange(exchangeOptions.socket, discord, exchangeOptions);
          });
          return exchangeOptions.socket;
        };
        exchangeOptions.socket = await setupNonKYC(exchangeOptions, discord);
        exchanges.push(exchangeOptions.socket);
      }
      if (exchangeOptions.name === "mexc") {
        exchangeOptions.socket = await startMexc(exchangeOptions);
        exchanges.push(exchangeOptions.socket);
      }
      if (exchangeOptions.name === "binance") {
        exchangeOptions.socket = await startBinance(exchangeOptions);
        exchanges.push(exchangeOptions.socket);
      }
      if (exchangeOptions.socket !== undefined) {
        runExchange(exchangeOptions.socket, discord, exchangeOptions);
        await delay(1000);
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
    (exchangeOption) => exchangeOption.name === "binance",
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
      startingBalance += symbolOptions.growingMax?.buy!;
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
              candlesticks[symbol.split("/").join("")][interval] === undefined ||
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
              symbolFilters[symbol.split("/").join("")],
            );
          } catch (error) {
            logToFile("./logs/error.log", JSON.stringify(error, null, 4));
            console.error(error);
          }
        },
      );
    }
    let balance = calculateBalance(exchangeOptions);
    Logger.push("Starting balance", startingBalance.toFixed(2));
    Logger.push("Final Balance", balance.toFixed(2));
    Logger.push("ROI", startingBalance === 0 ? "0.00" : ((balance - startingBalance) / startingBalance).toFixed(2));
    for (const symbol of exchangeOptions.symbols) {
      Logger.push(`${symbol.name} max trade`, symbol.growingMax);
      Logger.push(`${symbol.name} trades`, exchangeOptions.tradeHistory[symbol.name.split("/").join("")].length);
      Logger.push(
        `${symbol.name} stop losses`,
        exchangeOptions.tradeHistory[symbol.name.split("/").join("")].filter((trade) => trade.profit === "STOP_LOSS")
          .length,
      );
      Logger.push(
        `${symbol.name} take profits`,
        exchangeOptions.tradeHistory[symbol.name.split("/").join("")].filter((trade) => trade.profit === "TAKE_PROFIT")
          .length,
      );
      Logger.push(
        `${symbol.name} sells`,
        exchangeOptions.tradeHistory[symbol.name.split("/").join("")].filter((trade) => trade.profit === "SELL").length,
      );
      Logger.push(
        `${symbol.name} buys`,
        exchangeOptions.tradeHistory[symbol.name.split("/").join("")].filter((trade) => trade.profit === "BUY").length,
      );
    }
    Logger.print();
    Logger.flush();
  }
};

const stopHoobot = () => {
  console.log("Exchanges to shut down %d", options.exchanges.length);
  for (var i = 0; i < options.exchanges.length; i++) {
    console.log(
      "Symbols to to shut down %d in the exchange %s",
      options.exchanges[i].symbols.length,
      options.exchanges[i].name,
    );
    if (options.exchanges[i].name === "nonkyc") {
      for (var x = 0; x < options.exchanges[i].symbols.length; x++) {
        for (var y = 0; y < options.exchanges[i].symbols[x].timeframes.length; y++) {
          (options.exchanges[i].socket as NonKYC).unsubscribeCandles(
            options.exchanges[i].symbols[x].name,
            getMinutesFromInterval(options.exchanges[i].symbols[x].timeframes[y]),
          );
        }
        (options.exchanges[i].socket as NonKYC).unsubscribeOrderbook(options.exchanges[i].symbols[x].name);
        (options.exchanges[i].socket as NonKYC).unsubscribeTrades(options.exchanges[i].symbols[x].name);
        (options.exchanges[i].socket as NonKYC).unsubscribeTicker(options.exchanges[i].symbols[x].name);
        (options.exchanges[i].socket as NonKYC).unsubscribeReports();
      }
      (options.exchanges[i].socket as NonKYC).disconnect();
    } else if (options.exchanges[i].name === "binance") {
      (options.exchanges[i].socket as Binance).websockets.terminate();
    }
  }
};

const webServer = async () => {
  const app = express();
  const PORT = process.env.PORT || 5656;

  const optionsFilename = "./settings/hoobot-options.json";

  app.use(express.json());

  // Serve static files from the build/frontend directory
  let frontendPath = path.join(__dirname, "Frontend");
  if (process.env.DEVELOPMENT === "true") {
    frontendPath = path.join(__dirname, "Frontend");
  }
  app.use(express.static(frontendPath));

  // Serve index.html on root route
  app.get("/", (_, res) => {
    console.log(frontendPath);
    res.sendFile(frontendPath + "/index.html");
  });

  app.get("/simulate", (_, res) => {
    simulate();
    res.json({ message: "Hoobot started" });
  });

  app.get("/run", (_, res) => {
    if (options.running !== true) {
      options.running = true;
      const optionsInFile = parseArgs();
      optionsInFile.running = true;
      fs.writeFileSync(optionsFilename, JSON.stringify(optionsInFile, null, 2));
      hoobot();
      res.json({ message: "Hoobot started" });
    } else {
      res.json({ message: "Hoobot was already running, can't restart." });
    }
  });

  app.get("/stop", (_, res) => {
    console.log("Got command to stop hoobot");
    if (options.running === true) {
      options.running = false;
      const optionsInFile = parseArgs();
      optionsInFile.running = false;
      fs.writeFileSync(optionsFilename, JSON.stringify(optionsInFile, null, 2));
      stopHoobot();
      res.json({ message: "Hoobot stopping" });
    } else {
      res.json({ message: "Couldn't stop hoobot, since it was not running." });
    }
  });

  app.get("/settings", (_, res) => {
    if (fs.existsSync(optionsFilename)) {
      const optionsInFile = parseArgs();
      res.json(optionsInFile);
    }
  });

  app.post("/settings", (req, res) => {
    var running = options.running;
    if (running === true) {
      stopHoobot();
    }
    const optionsFilename = "./settings/hoobot-options.json";
    var newOptions = req.body;
    newOptions.running = running;
    fs.writeFileSync(optionsFilename, JSON.stringify(newOptions, null, 2));
    options = newOptions;
    if (options.running === true) {
      hoobot();
    }
    res.json({ message: "Options updated successfully", options });
  });

  // Start the server and return the Express app instance
  await new Promise<void>((resolve) => {
    app.listen(PORT, () => {
      console.log(`Open Hoobot at http://localhost:${PORT}`);
      resolve();
    });
  });

  return app;
};

if (process.env.NOWEBUI === "true") {
  hoobot();
} else {
  if (options.running) {
    hoobot();
  }
  webServer();
}
