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

export interface SymbolCandlesticks {
  [symbolPair: string]: {
    candles: candlestick[]
  }
}

export interface candlestick {
  symbol?: string,
  interval?: string,
  type?: string,
  time?: number,
  open?: number,
  high?: number,
  low?: number,
  close?: number,
  trades?: number,
  volume?: number,
  quoteVolume?: number,
  buyVolume?: number,
  quoteBuyVolume?: number,
  isFinal?: boolean
}

export async function getLastCandlesticks(
  binance: Binance, 
  pair: string, 
  interval: string, 
  limit: number = 500
): Promise<candlestick[]> {
  return new Promise<candlestick[]>((resolve, reject) => {
    binance.candlesticks(pair.split("/").join(""), interval, (error: any, ticks: any, symbol: string, interval: string) => {
      if (error) {
        reject(error);
      } else {
        const parsedData: candlestick[] = ticks.map((candle: string[]) => ({
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
      }
    }, { limit: limit });
  });
}


export const listenForCandlesticks = async (
  binance: Binance, 
  symbol: string, 
  interval: string, 
  candleStore: SymbolCandlesticks, 
  historyLength: number, 
  callback: (candlesticks: candlestick[]) => void
) => {
  symbol = symbol.split("/").join("");
  const maxCandlesticks = 5000;
  try {
    if (candleStore[symbol] === undefined) {
      if (historyLength === 0) {
        candleStore[symbol] = { candles: [] }
      } else {
        candleStore[symbol] = { candles: await getLastCandlesticks(binance, symbol, interval, historyLength) }; 
      }
    }
    const wsEndpoint = binance.websockets.candlesticks(symbol, interval, (candlestick: { e: any; E: any; s: any; k: any; }) => {
      let { e:eventType, E:eventTime, s:symbol, k:ticks } = candlestick;
      let { o:open, h:high, l:low, c:close, v:volume, n:trades, i:interval, x:isFinal, q:quoteVolume, V:buyVolume, Q:quoteBuyVolume } = ticks;
      
      // Create a new candlestick with the received data
      const newCandlestick: candlestick = {
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

      // Check if the previous candlestick was final.
      if (candleStore[symbol] === undefined || candleStore[symbol].candles === undefined) {
        candleStore[symbol] = { candles: [newCandlestick] }
      } else if(newCandlestick.isFinal === true) {
        candleStore[symbol].candles.push(newCandlestick);
      } else {
        candleStore[symbol].candles[candleStore[symbol].candles.length - 1] = newCandlestick;
      } 

      // Check if the array length exceeds the maximum allowed size
      if (candleStore[symbol]?.candles?.length > maxCandlesticks) {
        // Remove the oldest candleStore[symbol].candles to keep the array size within the limit
        candleStore[symbol].candles = candleStore[symbol]?.candles.slice(-maxCandlesticks);
      }
      callback(candleStore[symbol].candles);
    });
  } catch (error: any) {
    console.log(error);
  }
}