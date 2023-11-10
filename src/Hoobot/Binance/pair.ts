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
import { ConfigOptions } from "../Utilities/args";

export const getPrevDayPriceChange = async (
  binance: Binance, 
  symbol: string
) => {
  const prevDay = await binance.prevDay(symbol);
  return parseFloat(prevDay.percentChange);
};

export const findPossiblePairs = async (
  binance: Binance, 
  options: ConfigOptions
) => {
  try {
    // Fetch all symbols and ticker data
    let symbols: any[] = await new Promise((resolve, reject) => {
      binance.prevDay(false, (error: any, prevDay: any) => {
        if (error) {
          reject(error);
        } else {
          const symbols = prevDay.map((s: any) => ({ 
            symbol: s.symbol,
            priceChange: s.priceChange,
            priceChangePercent: s.priceChangePercent,
            weightedAvgPrice: s.weightedAvgPrice,
            prevClosePrice: s.prevClosePrice,
            lastPrice: s.lastPrice,
            lastQty: s.lastQty,
            bidPrice: s.bidPrice,
            bidQty: s.bidQty,
            askPrice: s.askPrice,
            askQty: s.askQty,
            openPrice: s.openPrice,
            highPrice: s.highPrice,
            lowPrice: s.lowPrice,
            volume: s.volume,
            quoteVolume: s.quoteVolume,
            openTime: s.openTime,
            closeTime: s.closeTime,
            firstId: s.firstId,
            lastId: s.lastId,
            count: s.count
          }));
          resolve(symbols);
        }
      });
    });
    // Task 1: Remove symbols that are not USDT/TUSD/BUSD/FIAT
    const validSymbols = ['USDT', 'TUSD', 'BUSD',  'EUR'];
    symbols = symbols.filter(symbolObj => {
      const baseAsset = symbolObj.symbol.substr(-validSymbols[0].length);
      return validSymbols.includes(baseAsset);
    });
    // Task 2: Remove symbols with no volume
    symbols = symbols.filter(symbolObj => parseFloat(symbolObj.volume) > 0);
    // Task 3: Remove symbols with volume less than options.pairMinVolume
    const pairMinVolume = options.pairMinVolume;
    symbols = symbols.filter(symbolObj => parseFloat(symbolObj.volume) >= options.pairMinVolume!);
    // Task 4: Remove symbols with priceChangePercent less than options.pairMinPriceChange
    const pairMinPriceChange = options.pairMinPriceChange;
    symbols = symbols.filter(symbolObj => parseFloat(symbolObj.priceChangePercent) >= options.pairMinPriceChange!);
    // Task 5: Order the symbols based on volume from high to low
    symbols.sort((a, b) => parseFloat(b.volume) - parseFloat(a.volume));
    // Task 6: Order the symbols based on priceChangePercent
    symbols.sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent));
    return(symbols)
  } catch (error) {
    console.error('Error finding good coin pairs:', error);
    return [];
  }
};