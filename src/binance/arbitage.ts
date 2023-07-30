import { candlestick } from "./candlesticks";

interface SymbolCandlesticks {
  [symbolPair: string]: {
    candles: candlestick[]
  }
}

interface ProfitInfo {
  amount: number,
  profit: number,
  percentage: number,
}

export const arbitageProfit = (symbolCandles: SymbolCandlesticks, initialAmount: number, initialAsset: string): ProfitInfo => {
  const symbols = Object.keys(symbolCandles);

  let curBaseAmount: number = 0;
  let curBaseAsset: string = symbols[0].replace(initialAsset, "");
  // Check if initialAsset is base or quote asset in first trade.
  const close = parseFloat(symbolCandles[symbols[0]].candles[0].close);
  if (symbols[0].indexOf(initialAsset) === 0) { 
    // initialAsset is base asset.
    curBaseAmount = initialAmount * close;
  } else { 
    // initialAsset is quoteAsset.
    curBaseAmount = initialAmount / close;
  }

  // Now calculate for the inner pairs, skip the first pair and do not calculate last pair.
  for (let i = 1; i < symbols.length - 1; i++) {
    const close = parseFloat(symbolCandles[symbols[i]].candles[0].close);
    if (symbols[i].indexOf(curBaseAsset) === 0) {
      curBaseAmount = curBaseAmount * close;
    } else {
      curBaseAmount = curBaseAmount / close;
    }
    curBaseAsset = symbols[i].replace(curBaseAsset, "");
  }

  // Now calculate the last pair trade.
  const lastClose = parseFloat(symbolCandles[symbols[symbols.length-1]].candles[0].close);
  if (symbols[symbols.length-1].indexOf(curBaseAsset) === 0) { 
    // initialAsset is base asset.
    curBaseAmount = curBaseAmount * lastClose;
  } else { 
    // initialAsset is quoteAsset.
    curBaseAmount = curBaseAmount / lastClose;
  }

  const profit = curBaseAmount - initialAmount;
  const percentage = (profit / initialAmount) * 100;

  return {
    amount: curBaseAmount,
    profit,
    percentage,
  };
}

export const arbitage = async () => {

}