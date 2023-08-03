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

import { ConfigOptions } from "./args";
import { ConsoleLogger } from "./consoleLogger";
import { logToFile } from "./logToFile";
import { order } from "./orders";

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


export const tradeDirection = (
  consoleLogger: ConsoleLogger,
  balanceA: number, 
  balanceB: number, 
  closePrice: number, 
  shortEma: number, 
  longEma: number, 
  macd: { macdLine: number; signalLine: number; histogram: number; }, 
  rsi: number, 
  lastOrder: order, 
  options: ConfigOptions
) => {
  let nextOrderCheck: string = `HOLD`;
  let balanceCheck: string = `HOLD`;
  let emaCheck: string = `HOLD`;
  let macdCheck: string = `HOLD`;
  let rsiCheck: string = `HOLD`;


  if(balanceA < (balanceB / closePrice)) {
    balanceCheck = 'BUY';
  } else {
    balanceCheck = 'SELL';
  }
  
  if (lastOrder === undefined) {
    nextOrderCheck = balanceCheck;
  } else {
    if (lastOrder.isBuyer === true) {
      nextOrderCheck = 'SELL';
    } else {
      nextOrderCheck = 'BUY';
    }
  }

  if (shortEma > longEma) {
    emaCheck = 'BUY';
  } else if (shortEma < longEma) {
    emaCheck = 'SELL';
  }

  if (macd.macdLine > macd.signalLine && macd.histogram > 0) {
    macdCheck = `BUY`;
  } else if (macd.macdLine < macd.signalLine && macd.macdLine > 0 && macd.histogram < 0) {
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
    if(options.useEMA === true && (emaCheck === 'BUY' || emaCheck === 'HOLD')) {
      sellSignal = 'HOLD';
    } else if(options.useEMA === false) {
      emaCheck = "DISABLED";
    }
    if(options.useMACD === true && (macdCheck === 'BUY' || macdCheck === 'HOLD')) {
      sellSignal = 'HOLD';
    } else if(options.useMACD === false) {
      macdCheck = "DISABLED";
    }
    if(options.useRSI === true && (rsiCheck === 'BUY' || rsiCheck === 'HOLD')) {
      sellSignal = 'HOLD';
    } else if(options.useRSI === false) {
      rsiCheck = "DISABLED";
    }
    tradeDirection = sellSignal;
  } else if(nextOrderCheck == 'BUY' && balanceCheck === 'BUY') {
    let sellSignal = 'BUY'
    if(options.useEMA === true && (emaCheck === 'SELL' || emaCheck === 'HOLD')) {
      sellSignal = 'HOLD';
    } else if(options.useEMA === false) {
      emaCheck = "DISABLED";
    }
    if(options.useMACD === true && (macdCheck === 'SELL' || macdCheck === 'HOLD')) {
      sellSignal = 'HOLD';
    } else if(options.useMACD === false) {
      macdCheck = "DISABLED";
    }
    if(options.useRSI === true && (rsiCheck === 'SELL' || rsiCheck === 'HOLD')) {
      sellSignal = 'HOLD';
    } else if(options.useRSI === false) {
      rsiCheck = "DISABLED";
    }
    tradeDirection = sellSignal;
  }
  consoleLogger.push("Trade checks", {
    'Next order': nextOrderCheck,
    'Balance': balanceCheck,
    'EMA signal': emaCheck,
    'MACD signal': macdCheck,
    'RSI signal': rsiCheck,
  });
  return tradeDirection;
}