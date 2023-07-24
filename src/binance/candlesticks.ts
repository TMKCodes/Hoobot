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

export async function getLastCandlesticks(binance: Binance, pair: string, interval: string): Promise<candlestick[]> {
  return new Promise<candlestick[]>((resolve, reject) => {
    binance.candlesticks(pair.split("/").join(""), interval, (error: any, ticks: any, symbol: string, interval: string) => {
      console.log(`Start downloading 250 previous candlesticks.`);
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
        console.log(`Downloaded 250 previous candlesticks.`);
        resolve(parsedData);
      }
    }, { limit: 250 });
  });
}


export const listenForCandlesticks = async (binance: Binance, pair: string, interval: string, callback: (candlesticks: candlestick[]) => void) => {
  const maxCandlesticks = 1000;
  try {
    let candlesticks: candlestick[] = await getLastCandlesticks(binance, pair, interval);
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