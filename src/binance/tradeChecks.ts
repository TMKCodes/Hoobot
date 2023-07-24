import { logToFile } from "./logToFile";

export const checkBeforeOrder = (quantity: number, price: number, stopPrice: number, tradingPairFilters: any, candleTime: string) => {
  if(parseFloat(tradingPairFilters.minPrice) > stopPrice) {
    logToFile(`PLACING ORDER WAS FAILURE AT: ${candleTime}, Limit price price too low. `);
    return false;
  }
  if(parseFloat(tradingPairFilters.maxPrice) < stopPrice) {
    logToFile(`PLACING ORDER WAS FAILURE AT: ${candleTime}, Limit price price too high.`);
    return false;
  }
  if(parseFloat(tradingPairFilters.minPrice) > price) {
    logToFile(`PLACING ORDER WAS FAILURE AT: ${candleTime}, Stop price too low.`);
    return false;
  }
  if(parseFloat(tradingPairFilters.maxPrice) < price) {
    logToFile(`PLACING ORDER WAS FAILURE AT: ${candleTime}, Stop price too high.`);
    return false;
  }
  if(parseFloat(tradingPairFilters.minQty) > quantity) {
    logToFile(`PLACING ORDER WAS FAILURE AT: ${candleTime}, Amount too low.`);
    return false;
  }
  if(parseFloat(tradingPairFilters.maxQty) < quantity) {
    logToFile(`PLACING ORDER WAS FAILURE AT: ${candleTime}, Amount too high.`);
    return false;
  }

  // Check if the notional value meets the minimum requirement
  if (tradingPairFilters.minNotional && quantity < parseFloat(tradingPairFilters.minNotional)) {
    logToFile(`PLACING ORDER WAS FAILURE AT: ${candleTime}, Amount in ${options.pair.split("/")[1]} is below the minimum requirement: ${quantity} < ${tradingPairFilters.minNotional}`);
    return false;
  }
  if (tradingPairFilters.maxNotional && quantity > parseFloat(tradingPairFilters.maxNotional)) {
    logToFile(`PLACING ORDER WAS FAILURE AT: ${candleTime}, Amount is ${options.pair.split("/")[1]} above the maximum requirement: ${quantity} < ${tradingPairFilters.maxNotional}`);
    return false;
  }
  return true;
}

export const tradeDirection = (
  balanceA: number, 
  balanceB: number, 
  closePrice: number, 
  shortEma: number, 
  longEma: number, 
  macd: { macdLine: number; signalLine: number; }, 
  rsi: number, 
  candletime: string,
  lastOrder: { isBuyer: any; }, 
  options: { useEMA: boolean; useMACD: boolean; useRSI: boolean; overboughtTreshold: number; oversoldTreshold: number; }
) => {
  let nextOrderCheck: string = `HOLD`;
  let balanceCheck: string = `HOLD`;
  let emaCheck: string = `HOLD`;
  let macdCheck: string = `HOLD`;
  let rsiCheck: string = `HOLD`;

  balanceCheck = ((balanceA * closePrice) < balanceB) ? 'BUY' : 'SELL';

  if (lastOrder === undefined) {
    nextOrderCheck = balanceCheck;
  } else {
    nextOrderCheck = lastOrder.isBuyer ? 'SELL' : 'BUY';
  }

  if (options.useEMA === true) {
    if (shortEma > longEma) {
      emaCheck = 'BUY';
    } else if (shortEma < longEma) {
      emaCheck = 'SELL';
    }
  } else {
    emaCheck = 'DISABLED';
  }

  if(options.useMACD === true) {
    if (macd.macdLine > macd.signalLine && macd.macdLine < 0 ) {
      macdCheck = `BUY`;
    } else if (macd.macdLine < macd.signalLine && macd.macdLine > 0) {
      macdCheck = `SELL`;
    }
  } else {
    macdCheck = 'DISABLED';
  }
  if(options.useRSI === true) {
    if (options.overboughtTreshold === undefined || options.oversoldTreshold === undefined) {
      if (rsi > 50) {
        rsiCheck = 'SELL';
      } else if (rsi < 50) {
        rsiCheck = 'BUY';
      }
    } else {
      if (rsi > options.overboughtTreshold) {
        rsiCheck = 'SELL';
      } else if (rsi < options.oversoldTreshold) {
        rsiCheck = 'BUY';
      }
    }
  } else {
    rsiCheck = 'DISABLED';
  }

  let tradeDirection = 'HOLD';
  if (nextOrderCheck === 'SELL' && balanceCheck === 'SELL') {
    let sellSignal = 'SELL'
    if(options.useEMA === true && emaCheck === 'BUY') {
      sellSignal = 'HOLD';
    }
    if(options.useMACD === true && macdCheck === 'BUY') {
      sellSignal = 'HOLD';
    }
    if(options.useRSI === true && rsiCheck === 'BUY') {
      sellSignal = 'HOLD';
    }
    tradeDirection = sellSignal;
  } else if(nextOrderCheck == 'BUY' && balanceCheck === 'BUY') {
    let sellSignal = 'BUY'
    if(options.useEMA === true && emaCheck === 'SELL') {
      sellSignal = 'HOLD';
    }
    if(options.useMACD === true && macdCheck === 'SELL') {
      sellSignal = 'HOLD';
    }
    if(options.useRSI === true && rsiCheck === 'SELL') {
      sellSignal = 'HOLD';
    }
    tradeDirection = sellSignal;
  }
  logToFile(JSON.stringify({
    lastOrder: nextOrderCheck,
    balance: balanceCheck,
    ema: emaCheck,
    macd: macdCheck,
    rsi: rsiCheck,
    candletime: candletime,
    direction: tradeDirection,
  }, null, 4));
  return tradeDirection;
}