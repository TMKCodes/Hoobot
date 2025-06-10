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
import {
  CandlestickInterval,
  ConfigOptions,
  ExchangeOptions,
  SymbolOptions,
  getMinutesFromInterval,
} from "../Utilities/Args";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import AdmZip from "adm-zip";
import path from "path";
import { Exchange, isBinance, isNonKYC, isXeggex } from "./Exchange";
import { XeggexCandles, XeggexResponse } from "./Xeggex/Xeggex";
import { logToFile } from "../Utilities/LogToFile";

export interface Candlesticks {
  [symbol: string]: {
    [time: string]: Candlestick[];
  };
}

export interface Candlestick {
  symbol: string;
  interval: string;
  type: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  trades: number;
  volume: number;
  quoteVolume: number;
  buyVolume: number;
  quoteBuyVolume: number;
  isFinal: boolean;
  [key: string]: string | number | boolean;
}

export async function getLastCandlesticks(
  exchange: Exchange,
  symbol: string,
  interval: CandlestickInterval,
  limit: number = 500
): Promise<Candlestick[]> {
  return new Promise<Candlestick[]>(async (resolve, _reject) => {
    if (isBinance(exchange)) {
      exchange.candlesticks(
        symbol.split("/").join(""),
        interval,
        (_error: any, ticks: any, symbol: string, interval: string) => {
          try {
            const parsedData: Candlestick[] = ticks.map((candle: string[]) => ({
              symbol: symbol,
              interval: interval,
              type: candle[8],
              time: parseFloat(candle[0]),
              open: parseFloat(candle[1]),
              high: parseFloat(candle[2]),
              low: parseFloat(candle[3]),
              close: parseFloat(candle[4]),
              trades: parseFloat(candle[9]),
              volume: parseFloat(candle[5]),
              quoteVolume: parseFloat(candle[7]),
              buyVolume: parseFloat(candle[10]),
              quoteBuyVolume: parseFloat(candle[11]),
              isFinal: candle[12],
            }));
            resolve(parsedData);
          } catch (error) {
            logToFile("./logs/error.log", JSON.stringify(error, null, 4));
            console.error(error);
          }
        },
        { limit: limit }
      );
    } else if (isXeggex(exchange) || isNonKYC(exchange)) {
      const candlesticks = await exchange.getCandles(symbol, null, null, getMinutesFromInterval(interval), limit, 1);
      const parsedData: Candlestick[] = candlesticks.bars.map(
        (candle: { time: number; close: number; open: number; high: number; low: number; volume: number }) => ({
          symbol: symbol,
          interval: interval,
          type: "kline",
          time: candle.time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          trades: 0,
          volume: candle.volume,
          quoteVolume: 0,
          buyVolume: 0,
          quoteBuyVolume: 0,
          isFinal: true,
        })
      );
      resolve(parsedData);
    }
  });
}

export const listenForCandlesticks = async (
  exchange: Exchange,
  symbol: string,
  intervals: CandlestickInterval[],
  candleStore: Candlesticks,
  historyLength: number,
  symbolOptions: SymbolOptions,
  callback: (candlesticks: Candlesticks) => Promise<void>
): Promise<void> => {
  const maxCandlesticks = 5000;
  let timeframes = [...intervals];
  if (isBinance(exchange) && symbolOptions.trend?.enabled) {
    if (!intervals.includes(symbolOptions.trend?.timeframe!)) {
      timeframes.push(symbolOptions.trend?.timeframe!);
    }
  }
  try {
    for (let i = 0; i < timeframes.length; i++) {
      if (isBinance(exchange)) {
        const websocket = exchange.websockets;
        symbol = symbol.split("/").join("");
        websocket.candlesticks(symbol, timeframes[i], async (candlestick: { e: any; E: any; s: any; k: any }) => {
          let { e: eventType, E: eventTime, s: symbol, k: ticks } = candlestick;
          let {
            o: open,
            h: high,
            l: low,
            c: close,
            v: volume,
            n: trades,
            i: interval,
            x: isFinal,
            q: quoteVolume,
            V: buyVolume,
            Q: quoteBuyVolume,
          } = ticks;
          const newCandlestick: Candlestick = {
            symbol: symbol,
            interval: interval,
            type: eventType,
            time: parseFloat(eventTime),
            open: parseFloat(open),
            high: parseFloat(high),
            low: parseFloat(low),
            close: parseFloat(close),
            trades: parseFloat(trades),
            volume: parseFloat(volume),
            quoteVolume: parseFloat(quoteVolume),
            buyVolume: parseFloat(buyVolume),
            quoteBuyVolume: parseFloat(quoteBuyVolume),
            isFinal: isFinal,
          };
          if (candleStore[symbol] === undefined) {
            const oldCandlesticks = await getLastCandlesticks(exchange, symbol, timeframes[i], historyLength);
            candleStore[symbol] = {
              [timeframes[i]]: [...oldCandlesticks, newCandlestick],
            };
          } else if (candleStore[symbol][timeframes[i]] === undefined) {
            candleStore[symbol][timeframes[i]] = [
              ...(await getLastCandlesticks(exchange, symbol, timeframes[i], historyLength)),
              newCandlestick,
            ];
          } else if (newCandlestick.isFinal === true) {
            candleStore[symbol][timeframes[i]].push(newCandlestick);
          } else {
            candleStore[symbol][timeframes[i]][candleStore[symbol][timeframes[i]].length - 1] = newCandlestick;
          }
          if (candleStore[symbol][timeframes[i]].length > maxCandlesticks) {
            candleStore[symbol][timeframes[i]] = candleStore[symbol][timeframes[i]].slice(-maxCandlesticks);
          }
          if (!(symbolOptions.stopLoss?.hit === true && symbolOptions.stopLoss?.stopTrading === true)) {
            await callback(candleStore);
          } else {
            websocket.terminate();
          }
        });
      } else if (isXeggex(exchange)) {
        // exchange.subscribeTicker(symbol, async (response: XeggexResponse) => {
        //   console.log(JSON.stringify(response, null, 4));
        //   if (response.method === "ticker") {
        //     const ticker = (response.params as XeggexTicker);
        //     const newCandlestick: Candlestick = {
        //       symbol: symbol,
        //       interval: timeframe[i],
        //       type: "kline",
        //       time: new Date(ticker.updatedAt).getTime(),
        //       open: parseFloat(ticker.lastPrice),
        //       high: parseFloat(ticker.highPrice),
        //       low: parseFloat(ticker.lowPrice),
        //       close: parseFloat(ticker.lastPrice),
        //       trades: 0,
        //       volume: parseFloat(ticker.volume),
        //       quoteVolume: 0,
        //       buyVolume: 0,
        //       quoteBuyVolume: 0,
        //       isFinal: false,
        //     };
        //     if (candleStore[symbol.split("/").join("")] === undefined) {
        //       candleStore[symbol.split("/").join("")] = {
        //         [timeframe[i]]: [...(await getLastCandlesticks(exchange, symbol, timeframe[i], historyLength)), newCandlestick]
        //       }
        //     } else if (candleStore[symbol.split("/").join("")][timeframe[i]] === undefined) {
        //       candleStore[symbol.split("/").join("")][timeframe[i]] = [...(await getLastCandlesticks(exchange, symbol, timeframe[i], historyLength)), newCandlestick];
        //     } else if(newCandlestick.isFinal === true) {
        //       candleStore[symbol.split("/").join("")][timeframe[i]].push(newCandlestick);
        //     } else {
        //       candleStore[symbol.split("/").join("")][timeframe[i]][candleStore[symbol.split("/").join("")][timeframe[i]].length - 1] = newCandlestick;
        //     }
        //     if (candleStore[symbol.split("/").join("")][timeframe[i]].length > maxCandlesticks) {
        //       candleStore[symbol.split("/").join("")][timeframe[i]] = candleStore[symbol.split("/").join("")][timeframe[i]].slice(-maxCandlesticks);
        //     }
        //     if (!(symbolOptions.stopLoss?.hit === true && symbolOptions.stopLoss?.stopTrading === true))  {
        //       await callback(candleStore);
        //     } else {
        //       exchange.unsubscribeCandles(symbol, getMinutesFromInterval(timeframe[i]));
        //       exchange.unsubscribeTicker(symbol);
        //     }
        //   }
        // });
        exchange.subscribeCandles(
          symbol,
          getMinutesFromInterval(timeframes[i]),
          async (response: XeggexResponse) => {
            if (response.method === "updateCandles") {
              const candles = (response.params as XeggexCandles).data;
              if (candles.length < 1) {
                return;
              }
              const candle = candles[0];
              const timeOfCandle = new Date(candle.timestamp).getTime();
              // const currentTime = new Date().getTime() - (30 * 1000);
              let isFinal = false;
              if (
                candleStore[symbol.split("/").join("")] !== undefined &&
                candleStore[symbol.split("/").join("")][timeframes[i]] !== undefined &&
                candleStore[symbol.split("/").join("")][timeframes[i]].length > 0
              ) {
                const previousCandle =
                  candleStore[symbol.split("/").join("")][timeframes[i]][
                    candleStore[symbol.split("/").join("")][timeframes[i]].length - 1
                  ];
                if (previousCandle.time !== timeOfCandle) {
                  isFinal = true;
                }
              } else if (candleStore[symbol.split("/").join("")] === undefined) {
                isFinal = true;
              }
              const newCandlestick: Candlestick = {
                symbol: symbol,
                interval: timeframes[i],
                type: "",
                time: timeOfCandle,
                open: parseFloat(candle.open),
                high: parseFloat(candle.max),
                low: parseFloat(candle.min),
                close: parseFloat(candle.close),
                trades: 0,
                volume: parseFloat(candle.volume),
                quoteVolume: 0,
                buyVolume: 0,
                quoteBuyVolume: 0,
                isFinal: isFinal,
              };
              if (candleStore[symbol.split("/").join("")] === undefined) {
                candleStore[symbol.split("/").join("")] = {
                  [timeframes[i]]: [
                    ...(await getLastCandlesticks(exchange, symbol, timeframes[i], historyLength)),
                    newCandlestick,
                  ],
                };
              } else if (candleStore[symbol.split("/").join("")][timeframes[i]] === undefined) {
                candleStore[symbol.split("/").join("")][timeframes[i]] = [
                  ...(await getLastCandlesticks(exchange, symbol, timeframes[i], historyLength)),
                  newCandlestick,
                ];
              } else if (newCandlestick.isFinal === true) {
                candleStore[symbol.split("/").join("")][timeframes[i]].push(newCandlestick);
              } else {
                candleStore[symbol.split("/").join("")][timeframes[i]][
                  candleStore[symbol.split("/").join("")][timeframes[i]].length - 1
                ] = newCandlestick;
              }
              if (candleStore[symbol.split("/").join("")][timeframes[i]].length > maxCandlesticks) {
                candleStore[symbol.split("/").join("")][timeframes[i]] = candleStore[symbol.split("/").join("")][
                  timeframes[i]
                ].slice(-maxCandlesticks);
              }
              if (!(symbolOptions.stopLoss?.hit === true && symbolOptions.stopLoss?.stopTrading === true)) {
                await callback(candleStore);
              } else {
                exchange.unsubscribeCandles(symbol, getMinutesFromInterval(timeframes[i]));
                exchange.unsubscribeTicker(symbol);
              }
            }
          },
          10
        );
      }
    }
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error(error);
  }
};

interface Candlerow {
  opentime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closetime: number;
  quoteVolume: number;
  trades: number;
  takerQtyBase: number;
  takerQtyQuote: number;
  unused: number;
}

export const readCsvFile = async (filePath: string): Promise<Candlerow[]> => {
  try {
    const data = readFileSync(filePath, { encoding: "utf8" });
    const lines = data.split("\n");
    const rows: Candlerow[] = [];
    for (let i = 0; i < lines.length; i++) {
      const values = lines[i].split(",");
      const row: Candlerow = {
        opentime: parseInt(values[0], 10),
        open: parseFloat(values[1]),
        high: parseFloat(values[2]),
        low: parseFloat(values[3]),
        close: parseFloat(values[4]),
        volume: parseFloat(values[5]),
        quoteVolume: parseFloat(values[6]),
        closetime: parseInt(values[7], 10),
        trades: parseInt(values[8], 10),
        takerQtyBase: parseFloat(values[9]),
        takerQtyQuote: parseFloat(values[10]),
        unused: parseInt(values[11], 10),
      };
      rows.push(row);
    }
    return rows;
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error(error);
  }
  return [];
};

export const downloadAndExtractZipFile = async (url: string, destinationPath: string): Promise<boolean | string> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return "404 NOT FOUND";
    }
    const buffer = await response.arrayBuffer();
    const zipFilePath = path.join(destinationPath, "downloaded.zip");
    writeFileSync(zipFilePath, Buffer.from(buffer));
    const zip = new AdmZip(zipFilePath);
    zip.extractAllTo(destinationPath, true);
    unlinkSync(zipFilePath);
    return true;
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error("Error:", error);
  }
  return false;
};

const addLeadingZero = (n: number) => {
  return n < 10 ? `0${n}` : `${n}`;
};

function shellSortCandlesticksByTime(nums: Candlestick[]): Candlestick[] {
  const n = nums.length;
  let gap = Math.floor(n / 2);
  while (gap > 0) {
    for (let i = gap; i < n; i++) {
      const temp = nums[i];
      let j = i;
      while (j >= gap && nums[j - gap].time > temp.time) {
        nums[j] = nums[j - gap];
        j -= gap;
      }
      nums[j] = temp;
    }
    gap = Math.floor(gap / 2);
  }
  return nums;
}

export const downloadHistoricalCandlesticks = async (
  symbols: string[],
  intervals: string[]
): Promise<Candlestick[]> => {
  let allCandlesticks: Candlestick[] = [];
  for (let symbolIndex = 0; symbolIndex < symbols?.length; symbolIndex++) {
    console.log(`Downloading symbol ${symbols[symbolIndex]} candlesticks.`);
    for (let intervalIndex = 0; intervalIndex < intervals?.length; intervalIndex++) {
      let currentYear = new Date().getFullYear();
      let currentMonth = new Date().getMonth() + 1;
      const startYear = 2020;
      const startMonth = 1;
      for (let year = startYear; year <= currentYear; year++) {
        for (
          let month = year === startYear ? startMonth : 1;
          month <= (year === currentYear ? currentMonth : 12);
          month++
        ) {
          const formattedYear = year.toString();
          const formattedMonth = addLeadingZero(month);
          const url = `https://data.binance.vision/data/spot/monthly/klines/${symbols[symbolIndex]
            .split("/")
            .join("")
            .toLocaleUpperCase()}/${intervals[intervalIndex]}/${symbols[symbolIndex]
            .split("/")
            .join("")
            .toLocaleUpperCase()}-${intervals[intervalIndex]}-${formattedYear}-${formattedMonth}.zip`;
          const destinationPath = "./candlestore/";
          if (!existsSync(destinationPath)) {
            try {
              mkdirSync(destinationPath);
              console.log(`Directory '${destinationPath}' created successfully.`);
            } catch (error) {
              logToFile("./logs/error.log", JSON.stringify(error, null, 4));
              console.error(`Error creating directory '${destinationPath}': ${error}`);
            }
          }
          const filePath = `./candlestore/${symbols[symbolIndex].split("/").join("").toLocaleUpperCase()}-${
            intervals[intervalIndex]
          }-${formattedYear}-${formattedMonth}.csv`;
          if (!existsSync(filePath)) {
            const dlresult = await downloadAndExtractZipFile(url, destinationPath);
            console.log(`Downloaded file ${url}: ${dlresult}`);
          }
          if (existsSync(filePath)) {
            const candledata = await readCsvFile(filePath);
            for (let candledataIndex = 0; candledataIndex <= candledata.length; candledataIndex++) {
              const candlestick: Candlestick = {
                symbol: symbols[symbolIndex]?.split("/").join(""),
                interval: intervals[intervalIndex],
                type: "",
                time: candledata[candledataIndex]?.opentime,
                open: candledata[candledataIndex]?.open,
                high: candledata[candledataIndex]?.high,
                low: candledata[candledataIndex]?.low,
                close: candledata[candledataIndex]?.close,
                trades: candledata[candledataIndex]?.trades,
                volume: candledata[candledataIndex]?.volume,
                quoteVolume: candledata[candledataIndex]?.quoteVolume,
                buyVolume: candledata[candledataIndex]?.takerQtyBase,
                quoteBuyVolume: candledata[candledataIndex]?.takerQtyQuote,
                isFinal: true,
              };
              allCandlesticks.push(candlestick);
            }
          }
        }
      }
    }
    console.log(`Downloaded symbol ${symbols[symbolIndex]} candlesticks.`);
  }
  console.log(`Sorting candlesticks.`);
  allCandlesticks = shellSortCandlesticksByTime(allCandlesticks);
  console.log(`Candlesticks sorted.`);
  return allCandlesticks;
};

export const simulateListenForCandlesticks = async (
  symbols: string[],
  candlesticks: Candlestick[],
  candleStore: Candlesticks,
  options: ConfigOptions,
  callback: (symbol: string, interval: string, candlesticks: Candlesticks) => Promise<void>
) => {
  const maxCandlesticks = 2000;
  for (let candleIndex = 0; candleIndex < candlesticks.length; candleIndex++) {
    const candlestick = candlesticks[candleIndex];
    const symbol = candlesticks[candleIndex]?.symbol;
    const interval = candlesticks[candleIndex]?.interval;
    if (!(symbol in candleStore)) {
      candleStore[symbol] = {};
    }
    if (!(interval in candleStore[symbol])) {
      candleStore[symbol][interval] = [];
    }
    candleStore[symbol][interval].push(candlestick);
    if (candleStore[symbol][interval]?.length > maxCandlesticks) {
      candleStore[symbol][interval] = candleStore[symbol][interval].slice(-maxCandlesticks);
    }
    if (candleStore[symbol][interval]?.length > 250) {
      let splittedSymbol = "";
      for (let symbolsIndex = 0; symbolsIndex < symbols.length; symbolsIndex++) {
        if (symbol == symbols[symbolsIndex].split("/").join("")) {
          splittedSymbol = symbols[symbolsIndex];
          break;
        }
      }
      if (!(options.stopLossHit === true && options.stopLossStopTrading === true)) {
        await callback(splittedSymbol, interval, candleStore);
      } else {
        break;
      }
    }
  }
};
