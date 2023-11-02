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

import { readFileSync } from "fs";
import { ConfigOptions } from "../Utilities/args";
import { ConsoleLogger, consoleLogger } from "../Utilities/consoleLogger";
import { logToFile } from "../Utilities/logToFile";
import { calculatePercentageDifference, order } from "../Binance/orders";
import { Indicators } from "./algorithmic";
import { candlestick } from "../Binance/candlesticks";
import { checkEMASignals } from "../Indicators/EMA";
import { checkMACDSignals } from "../Indicators/MACD";
import { checkRSISignals } from "../Indicators/RSI";
import { sign } from "crypto";
import { checkSMASignals } from "../Indicators/SMA";
import { checkStochasticOscillatorSignals, checkStochasticRSISignals } from "../Indicators/StochasticOscillator";
import { checkBollingerBandsSignals } from "../Indicators/BollingerBands";

export const checkBeforeOrder = (
  quantity: number,
  price: number,
  stopPrice: number,
  tradingPairFilters: any,
  candleTime: string,
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
  
  if (
    !isPriceValid(parseFloat(tradingPairFilters.minPrice), parseFloat(tradingPairFilters.maxPrice), stopPrice, 'Limit price') ||
    !isPriceValid(parseFloat(tradingPairFilters.minPrice), parseFloat(tradingPairFilters.maxPrice), price, 'Stop price') ||
    !isQuantityValid(parseFloat(tradingPairFilters.minQty), parseFloat(tradingPairFilters.maxQty), quantity) 
  ) {
    return false;
  }

  return true;
};

const checkProfitSignals = (consoleLogger: ConsoleLogger, symbol: string, tradeHistory: order[], lastCandlestick: candlestick, options: ConfigOptions) => {
  let check = 'HOLD';
  let lastProfit: number = 0;
  let nextPossibleProfit: number = 0;
  const force = JSON.parse(readFileSync("./force.json", 'utf-8'));
  if(tradeHistory?.length > 1) {
    if(tradeHistory[0].isBuyer === true) { 
      lastProfit = calculatePercentageDifference(parseFloat(tradeHistory[0].price), parseFloat(tradeHistory[1].price));
      nextPossibleProfit = calculatePercentageDifference(parseFloat(tradeHistory[0].price), lastCandlestick.close);
    } else if(tradeHistory[0].isBuyer === false) { 
      lastProfit = calculatePercentageDifference(parseFloat(tradeHistory[1].price), parseFloat(tradeHistory[0].price));
      nextPossibleProfit = calculatePercentageDifference(lastCandlestick.close, parseFloat(tradeHistory[0].price));
    }
    if(force[symbol]?.skip !== true) {
      if (tradeHistory[0].isBuyer === true) { 
        if(options.holdUntilPositiveTrade === true) {
          if(nextPossibleProfit > (options.minimumProfitSell + options.tradeFee)) {
            check = "SELL";
          } else {
            check = "HOLD";
          }
        } else {
          check = "SELL"
        }
      } else if(tradeHistory[0].isBuyer === false) { 
        if(options.holdUntilPositiveTrade === true) {
          if(nextPossibleProfit > (options.minimumProfitBuy + options.tradeFee)) {
            check = "BUY";
          } else {
            check = "HOLD";
          }
        } else {
          check = "BUY";
        }
      }
    } else {
      check = "SKIP";
    }
  } else {
    check = "SKIP";
  }
  
  consoleLogger.push("PROFIT Previous: ", lastProfit);
  consoleLogger.push("PROFIT Next: ", nextPossibleProfit);
  consoleLogger.push("PROFIT Check: ", check);
  return check;
}

const checkBalanceSignals = (consoleLogger: ConsoleLogger, balanceBase: number, balanceQuote: number, closePrice: number, tradeHistory: order[]) => {
  let check = 'HOLD';
  if(balanceBase < (balanceQuote / closePrice)) {
    check = 'BUY';
  } else {
    check = 'SELL';
  }
  if (tradeHistory?.length > 0) {
    if (check !== ((tradeHistory[0].isBuyer === true) ? 'SELL' : 'BUY')) {
      consoleLogger.push("BALANCE check: ", 'RECHECK BALANCES');
      return "RECHECK BALANCES";
    } else {
      consoleLogger.push("BALANCE Check: ", check);
      return check;
    }  
  }
  return check;
}

export const tradeDirection = async (
  consoleLogger: ConsoleLogger,
  symbol: string,
  balanceBase: number, 
  balanceQuote: number, 
  candlesticks: candlestick[], 
  indicators: Indicators,
  tradeHistory: order[], 
  options: ConfigOptions
) => {
  let profitCheck: string = 'HOLD';
  let balanceCheck: string = 'HOLD';
  let emaCheck: string = 'HOLD';
  let macdCheck: string = 'HOLD';
  let rsiCheck: string = 'HOLD';
  let smaCheck: string = 'HOLD';
  let stochCheck: string = 'HOLD';
  let stochRSICheck: string = 'HOLD';
  let stochasticOscillatorCheck: string = 'HOLD';
  let stochasticRSICheck: string = 'HOLD';
  let bollingerBandsCheck: string = 'HOLD';
  const lastCandlestick = candlesticks[candlesticks.length - 1];
  profitCheck = checkProfitSignals(consoleLogger, symbol, tradeHistory, lastCandlestick, options);
  balanceCheck = checkBalanceSignals(consoleLogger, balanceBase, balanceQuote, lastCandlestick.close, tradeHistory);
  smaCheck = checkSMASignals(consoleLogger, indicators, options);
  emaCheck = checkEMASignals(consoleLogger, indicators, options);
  macdCheck = checkMACDSignals(consoleLogger, indicators, options);
  rsiCheck = checkRSISignals(consoleLogger, indicators, options);
  stochCheck = checkStochasticOscillatorSignals(consoleLogger, indicators, options);
  stochRSICheck = checkStochasticRSISignals(consoleLogger, indicators, options);
  stochasticOscillatorCheck = checkStochasticOscillatorSignals(consoleLogger, indicators, options);
  stochasticRSICheck = checkStochasticRSISignals(consoleLogger, indicators, options);
  bollingerBandsCheck = checkBollingerBandsSignals(consoleLogger, indicators, options);
  let tradeDirection = 'HOLD';
  if (profitCheck === 'SELL' && balanceCheck === 'SELL') {
    let signal = 'SELL'
    if(options.useEMA === true && (emaCheck === 'BUY' || emaCheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useEMA === false) {
      emaCheck = "DISABLED";
    }
    if(options.useMACD === true && (macdCheck === 'BUY' || macdCheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useMACD === false) {
      macdCheck = 'DISABLED';
    }
    if(options.useRSI === true && (rsiCheck === 'BUY' || rsiCheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useRSI === false) {
      rsiCheck = 'DISABLED';
    }
    if(options.useSMA === true && (smaCheck === 'BUY' || smaCheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useSMA === false) {
      smaCheck = 'DISABLED';
    }
    if(options.useStochasticOscillator === true && (stochasticOscillatorCheck === 'BUY' || stochasticOscillatorCheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useStochasticOscillator === false) {
      stochasticOscillatorCheck = 'DISABLED';
    }
    if(options.useStochasticRSI === true && (stochasticRSICheck === 'BUY' || stochasticRSICheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useStochasticRSI === false) {
      stochasticRSICheck = 'DISABLED';
    }
    if(options.useBollingerBands === true && (bollingerBandsCheck === 'BUY' || bollingerBandsCheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useBollingerBands === false) {
      bollingerBandsCheck = 'DISABLED';
    }
    tradeDirection = signal;
  } else if(profitCheck == 'BUY' && balanceCheck === 'BUY') {
    let signal = 'BUY'
    if(options.useEMA === true && (emaCheck === 'SELL' || emaCheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useEMA === false) {
      emaCheck = 'DISABLED';
    }
    if(options.useMACD === true && (macdCheck === 'SELL' || macdCheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useMACD === false) {
      macdCheck = 'DISABLED';
    }
    if(options.useRSI === true && (rsiCheck === 'SELL' || rsiCheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useRSI === false) {
      rsiCheck = 'DISABLED';
    }
    if(options.useSMA === true && (smaCheck === 'SELL' || smaCheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useSMA === false) {
      smaCheck = 'DISABLED';
    }
    if(options.useStochasticOscillator === true && (stochasticOscillatorCheck === 'SELL' || stochasticOscillatorCheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useStochasticOscillator === false) {
      stochasticOscillatorCheck = 'DISABLED';
    }
    if(options.useStochasticRSI === true && (stochasticRSICheck === 'SELL' || stochasticRSICheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useStochasticRSI === false) {
      stochasticRSICheck = 'DISABLED';
    }
    if(options.useBollingerBands === true && (bollingerBandsCheck === 'SELL' || bollingerBandsCheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useBollingerBands === false) {
      bollingerBandsCheck = 'DISABLED';
    }
    tradeDirection = signal;
  } else {
    tradeDirection = 'HOLD'
  }
  consoleLogger.push(`TRADE Direction`, tradeDirection);
  return tradeDirection;
}