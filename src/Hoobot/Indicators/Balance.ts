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

import { ConsoleLogger } from "../Utilities/consoleLogger";
import { ConfigOptions } from "../Utilities/args";
import { Filter } from "../Binance/Filters";
import { checkPreviousTrade } from "../Binance/Trades";

export const checkBalanceSignals = (
  consoleLogger: ConsoleLogger, 
  symbol: string,
  closePrice: number,  
  options: ConfigOptions,
  filter: Filter,
) => {
  let check = 'HOLD';
  const baseBalance = options.balances[symbol.split("/")[0]];
  const quoteBalance = options.balances[symbol.split("/")[1]];
  const baseBalanceConverted = (baseBalance * closePrice);
  const tradeCheck = checkPreviousTrade(symbol, options);
  if (tradeCheck === 'SELL') {
    if (quoteBalance > parseFloat(filter.minNotional)) {
      check = 'BUY';
    } else {
      check = 'HOLD';
    }
  } else if (tradeCheck === 'BUY') {
    if (baseBalanceConverted > parseFloat(filter.minNotional)) {
      check = 'SELL'
    } else {
      check = 'HOLD';
    }
  }
  if (check === 'SELL' && (baseBalanceConverted < parseFloat(filter.minNotional) || baseBalanceConverted > parseFloat(filter.maxNotional))) {
    check = 'HOLD';
  } else if (check === 'BUY' && (quoteBalance < parseFloat(filter.minNotional) || quoteBalance > parseFloat(filter.maxNotional))) {
    check = 'HOLD';
  }
  consoleLogger.push("Trades", {
    previous: tradeCheck,
    next: check,
  })
  return check;
}