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
import { Xeggex } from "./Xeggex/Xeggex";
import { ConfigOptions, ExchangeOptions } from "../Utilities/args";

export type Exchange = Binance | Xeggex;

export const isBinance = (exchange: any): exchange is Binance => {
  return exchange !== undefined && 'candlesticks' in exchange;
}

export const isXeggex = (exchange: any): exchange is Xeggex => {
  return exchange !== undefined && 'subscribeCandles' in exchange;
}

export const getExchangeOption = (exchange: Exchange, options: ConfigOptions): ExchangeOptions => {
  const exchangeOption = options.exchanges.filter((exchangeOption) => {
    if(isBinance(exchange)) {
      if (exchangeOption.name === "binance") {
        return true;
      }
    } else if(isXeggex(exchange)) {
      if (exchangeOption.name === "xeggex") {
        return true
      }
    }
    return false;
  })[0];
  return exchangeOption;
} 

export const getExchangeByName = (name: string, exchanges: Exchange[], options: ConfigOptions): Exchange | undefined => {
  for(const exchange of exchanges) {
    const exchangeOption = getExchangeOption(exchange, options);
    if(exchangeOption.name === name) {
      return exchange;
    }
  }
  return undefined;
}