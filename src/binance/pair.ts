import Binance from "node-binance-api";
import { ConfigOptions } from "./args";


const getPrevDayPriceChange = async (binance: Binance, symbol: string) => {
  const prevDay = await binance.prevDay(symbol);
  return parseFloat(prevDay.percentChange);
};

export const findPossiblePairs = async (binance: Binance, options: ConfigOptions) => {
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
    console.log(symbols.length);

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

    console.log(symbols.length);
    return(symbols)
  } catch (error) {
    console.error('Error finding good coin pairs:', error);
    return [];
  }
};