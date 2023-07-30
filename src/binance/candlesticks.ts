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

export interface candlestick {
  symbol: string,
  interval: string,
  type: string,
  time: string,
  open: string,
  high: string,
  low: string,
  close: string,
  trades: string,
  volume: string,
  quoteVolume: string,
  buyVolume: string,
  quoteBuyVolume: string,
  isFinal: boolean
}

export async function getLastCandlesticks(binance: Binance, pair: string, interval: string, limit: number = 250): Promise<candlestick[]> {
  return new Promise<candlestick[]>((resolve, reject) => {
    binance.candlesticks(pair.split("/").join(""), interval, (error: any, ticks: any, symbol: string, interval: string) => {
      console.log(`DOWNLOAD 250 PREVIOUS CANDLESTICKS\r\n----------------------------------`);
      if (error) {
        reject(error);
      } else {
        const parsedData: candlestick[] = ticks.map((candle: string[]) => ({
          symbol: symbol,
          interval: interval,
          type: candle[8],
          time: candle[0],
          open: candle[1],
          high: candle[2],
          low: candle[3],
          close: candle[4],
          trades: candle[9],
          volume: candle[5],
          quoteVolume: candle[7],
          buyVolume: candle[10],
          quoteBuyVolume: candle[11],
          isFinal: candle[12],
        }));
        resolve(parsedData);
      }
    }, { limit: limit });
  });
}


export const listenForCandlesticks = async (binance: Binance, pair: string, interval: string, callback: (candlesticks: candlestick[]) => void) => {
  const maxCandlesticks = 1000;
  try {
    let candlesticks: candlestick[] = await getLastCandlesticks(binance, pair, interval, 250);
    console.log(`START LISTENING FOR NEW CANDLESTICKS\r\n----------------------------------`)
    const wsEndpoint = binance.websockets.candlesticks(pair.split("/").join(""), interval, (candlestick: { e: any; E: any; s: any; k: any; }) => {
      let { e:eventType, E:eventTime, s:symbol, k:ticks } = candlestick;
      let { o:open, h:high, l:low, c:close, v:volume, n:trades, i:interval, x:isFinal, q:quoteVolume, V:buyVolume, Q:quoteBuyVolume } = ticks;
      
      // Create a new candlestick with the received data
      const newCandlestick: candlestick = {
        symbol: symbol,
        interval: interval,
        type: eventType,
        time: eventTime,
        open: open,
        high: high,
        low: low,
        close: close,
        trades: trades,
        volume: volume,
        quoteVolume: quoteVolume,
        buyVolume: buyVolume,
        quoteBuyVolume: quoteBuyVolume,
        isFinal: isFinal,
      };

      // Check if the previous candlestick was final.
      if (candlesticks[candlesticks.length - 1].isFinal === true) {
        // Push new since it was final
        candlesticks.push(newCandlestick);
      } else {
        // Update since it was not final
        candlesticks[candlesticks.length - 1] = newCandlestick;
      }

      // Check if the array length exceeds the maximum allowed size
      if (candlesticks.length > maxCandlesticks) {
        // Remove the oldest candlesticks to keep the array size within the limit
        candlesticks = candlesticks.slice(candlesticks.length - maxCandlesticks);
      }
      callback(candlesticks);
    });
  } catch (error: any) {
    console.log(error);
  }
}