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

import { readFileSync } from "fs";
import { ConfigOptions } from "./args";
import { ConsoleLogger } from "./consoleLogger";
import { logToFile } from "./logToFile";
import { calculatePercentageDifference, order } from "./orders";

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


export const tradeDirection = async (
  consoleLogger: ConsoleLogger,
  symbol: string,
  balanceBase: number, 
  balanceQuote: number, 
  closePrice: number, 
  shortEma: number, 
  longEma: number, 
  macd: { macdLine: number; signalLine: number; histogram: number; }, 
  rsi: number, 
  tradeHistory: order[], 
  options: ConfigOptions
) => {
  const lastTrade = tradeHistory[0];
  let profitCheck: string = "HOLD";
  let nextTradeCheck: string = `HOLD`;
  let lastProfit: number = 0;
  let nextPossibleProfit: number = 0;
  let balanceCheck: string = `HOLD`;
  let emaCheck: string = `HOLD`;
  let macdCheck: string = `HOLD`;
  let rsiCheck: string = `HOLD`;

  const force = JSON.parse(readFileSync("./force.json", 'utf-8'));

  if(tradeHistory.length >= 2) {
    if(tradeHistory[0].isBuyer === true) { // SELL -> BUY and NEXT SELL
      const profitLastTrade = calculatePercentageDifference(parseFloat(tradeHistory[0].price), parseFloat(tradeHistory[1].price));
      lastProfit = profitLastTrade;
      const possibleProfit = calculatePercentageDifference(parseFloat(tradeHistory[0].price), closePrice);
      nextPossibleProfit = possibleProfit;
    } else if(tradeHistory[0].isBuyer === false) { // BUY -> SELL and NEXT BUY
      const profitLastTrade = calculatePercentageDifference(parseFloat(tradeHistory[1].price), parseFloat(tradeHistory[0].price));
        lastProfit = profitLastTrade;
        const possibleProfit = calculatePercentageDifference(closePrice, parseFloat(tradeHistory[0].price));
        nextPossibleProfit = possibleProfit;
    }
  }

  if(force[symbol]?.skip !== true) {
    if (tradeHistory.length >= 2) {
      if (tradeHistory[0].isBuyer === true) { // SELL -> BUY and NEXT SELL
        if(options.holdUntilPositiveTrade === true) {
          if(nextPossibleProfit > 0.1) {
            profitCheck = "SELL";
          } else {
            profitCheck = "HOLD";
          }
        } else {
          if(lastProfit < 0) {
            if(nextPossibleProfit > 0.1) {
              profitCheck = "SELL";
            } else {
              profitCheck = "HOLD";
            }
          } else {
            profitCheck = "SELL"
          }
        }
      } else if(tradeHistory[0].isBuyer === false) { // BUY -> SELL and NEXT BUY
        if(options.holdUntilPositiveTrade === true) {
          if(nextPossibleProfit > 0.1) {
            profitCheck = "BUY";
          } else {
            profitCheck = "HOLD";
          }
        } else {
          if(lastProfit < 0) {
            if(nextPossibleProfit > 0.1) {
              profitCheck = "BUY";
            } else {
              profitCheck = "HOLD";
            }
          } else {
            profitCheck = "BUY"
          }
        }
        
      }
    } else {
      profitCheck = "SKIP";
    }
  } else {
    profitCheck = "SKIP";
  }
  

  if(balanceBase < (balanceQuote / closePrice)) {
    balanceCheck = 'BUY';
  } else {
    balanceCheck = 'SELL';
  }
  
  if (lastTrade === undefined) {
    nextTradeCheck = balanceCheck;
  } else {
    if (lastTrade.isBuyer === true) {
      nextTradeCheck = 'SELL';
    } else {
      nextTradeCheck = 'BUY';
    }
  }
  if (balanceCheck !== nextTradeCheck) {
    return "RECHECK BALANCES";
  }

  if (shortEma > longEma) {
    emaCheck = 'BUY';
  } else if (shortEma < longEma) {
    emaCheck = 'SELL';
  }

  if (macd.macdLine > macd.signalLine) {
    macdCheck = `BUY`;
  } else if (macd.macdLine < macd.signalLine) {
    macdCheck = `SELL`;
  }
  if (options.overboughtTreshold === undefined || options.oversoldTreshold === undefined) {
    if (rsi > 55) {
      rsiCheck = 'SELL';
    } else if (rsi < 45) {
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
  if (nextTradeCheck === 'SELL' && balanceCheck === 'SELL') {
    let signal = 'SELL'
    if(options.useEMA === true && (emaCheck === 'BUY' || emaCheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useEMA === false) {
      emaCheck = "DISABLED";
    }
    if(options.useMACD === true && (macdCheck === 'BUY' || macdCheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useMACD === false) {
      macdCheck = "DISABLED";
    }
    if(options.useRSI === true && (rsiCheck === 'BUY' || rsiCheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useRSI === false) {
      rsiCheck = "DISABLED";
    }
    if (profitCheck === 'BUY' || profitCheck === 'HOLD') {
      signal = "HOLD";
    }
    tradeDirection = signal;
  } else if(nextTradeCheck == 'BUY' && balanceCheck === 'BUY') {
    let signal = 'BUY'
    if(options.useEMA === true && (emaCheck === 'SELL' || emaCheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useEMA === false) {
      emaCheck = "DISABLED";
    }
    if(options.useMACD === true && (macdCheck === 'SELL' || macdCheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useMACD === false) {
      macdCheck = "DISABLED";
    }
    if(options.useRSI === true && (rsiCheck === 'SELL' || rsiCheck === 'HOLD')) {
      signal = 'HOLD';
    } else if(options.useRSI === false) {
      rsiCheck = "DISABLED";
    }
    if (profitCheck === 'SELL' || profitCheck === 'HOLD') {
      signal = "HOLD";
    }
    tradeDirection = signal;
  }
  consoleLogger.push("Trade checks", {
    'Symbol': symbol,
    'Last profit': lastProfit,
    'Possible profit': nextPossibleProfit,
    'Profit': profitCheck,
    'Next Trade': nextTradeCheck,
    'Balance': balanceCheck,
    'EMA signal': emaCheck,
    'MACD signal': macdCheck,
    'RSI signal': rsiCheck,
  });
  return tradeDirection;
}