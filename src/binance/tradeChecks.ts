import { ConfigOptions } from "./args";
import { logToFile } from "./logToFile";
import { order } from "./orders";

export const checkBeforeOrder = (
  quantity: number,
  price: number,
  stopPrice: number,
  tradingPairFilters: any,
  candleTime: string,
  options: ConfigOptions
) => {
  const logFailure = (message: string) => {
    logToFile(`PLACING ORDER WAS FAILURE AT: ${candleTime}, ${message}`);
    return false;
  };

  const isPriceValid = (min: number, max: number, value: number, type: string) => {
    if (value < min) {
      return logFailure(`${type} too low.`);
    } else if (value > max) {
      return logFailure(`${type} too high.`);
    }
    return true;
  };

  const isQuantityValid = (min: number, max: number, value: number) => {
    if (value < min) {
      return logFailure(`Amount too low.`);
    } else if (value > max) {
      return logFailure(`Amount too high.`);
    }
    return true;
  };

  const isNotionalValid = (minNotional: number, maxNotional: number, quantity: number) => {
    if (tradingPairFilters.minNotional && quantity < minNotional) {
      return logFailure(`Amount in ${options.pair.split("/")[1]} is below the minimum requirement.`);
    } else if (tradingPairFilters.maxNotional && quantity > maxNotional) {
      return logFailure(`Amount in ${options.pair.split("/")[1]} is above the maximum requirement.`);
    }
    return true;
  };

  if (
    !isPriceValid(parseFloat(tradingPairFilters.minPrice), parseFloat(tradingPairFilters.maxPrice), stopPrice, 'Limit price') ||
    !isPriceValid(parseFloat(tradingPairFilters.minPrice), parseFloat(tradingPairFilters.maxPrice), price, 'Stop price') ||
    !isQuantityValid(parseFloat(tradingPairFilters.minQty), parseFloat(tradingPairFilters.maxQty), quantity) ||
    !isNotionalValid(parseFloat(tradingPairFilters.minNotional), parseFloat(tradingPairFilters.maxNotional), quantity)
  ) {
    return false;
  }

  return true;
};


export const tradeDirection = (
  balanceA: number, 
  balanceB: number, 
  closePrice: number, 
  shortEma: number, 
  longEma: number, 
  macd: { macdLine: number; signalLine: number; }, 
  rsi: number, 
  candletime: string,
  lastOrder: order, 
  options: ConfigOptions
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

  if (shortEma > longEma) {
    emaCheck = 'BUY';
  } else if (shortEma < longEma) {
    emaCheck = 'SELL';
  }

  if (macd.macdLine > macd.signalLine && macd.macdLine < 0 ) {
    macdCheck = `BUY`;
  } else if (macd.macdLine < macd.signalLine && macd.macdLine > 0) {
    macdCheck = `SELL`;
  }
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
  const checks = JSON.stringify({
    lastOrder: nextOrderCheck,
    balance: balanceCheck,
    ema: emaCheck,
    macd: macdCheck,
    rsi: rsiCheck,
    candletime: candletime,
    direction: tradeDirection,
  }, null, 4);
  logToFile(checks);
  console.log(checks);
  return tradeDirection;
}