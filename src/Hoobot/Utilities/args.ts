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
import fs from "fs";
import { Balances } from "../Exchanges/Balances";
import { Orderbooks } from "../Exchanges/Orderbook";
import { TradeHistory } from "../Exchanges/Trades";
import { Order } from "../Exchanges/Orders";
import { logToFile } from "./logToFile";
import { Exchange } from "../Exchanges/Exchange";
import { Filter } from "../Exchanges/Filters";

export interface CurrentProfitMax {
  [symbol: string]: number;
}

export type CandlestickInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d" | "1w" | "1M";

export type BotMode = "algorithmic" | "hilow" | "arbitrage";

export const getSecondsFromInterval = (interval: CandlestickInterval): number => {
  const intervalToSeconds: Record<CandlestickInterval, number> = {
    "1m": 60,
    "3m": 60 * 3,
    "5m": 60 * 5,
    "15m": 60 * 15,
    "30m": 60 * 30,
    "1h": 60 * 60,
    "2h": 60 * 60 * 2,
    "4h": 60 * 60 * 4,
    "6h": 60 * 60 * 6,
    "8h": 60 * 60 * 8,
    "12h": 60 * 60 * 12,
    "1d": 60 * 60 * 24,
    "3d": 60 * 60 * 24 * 3,
    "1w": 60 * 60 * 24 * 7,
    "1M": 60 * 60 * 24 * 30, // Assuming 30 days in a month
  };
  return intervalToSeconds[interval];
};

export const getMinutesFromInterval = (interval: CandlestickInterval): number => {
  const intervalToSeconds: Record<CandlestickInterval, number> = {
    "1m": 1,
    "3m": 3,
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "2h": 60 * 2,
    "4h": 60 * 4,
    "6h": 60 * 6,
    "8h": 60 * 8,
    "12h": 60 * 12,
    "1d": 60 * 24,
    "3d": 60 * 24 * 3,
    "1w": 60 * 24 * 7,
    "1M": 60 * 24 * 30, // Assuming 30 days in a month
  };
  return intervalToSeconds[interval];
};

export interface OpenOrders {
  [symbol: string]: Order[];
}

export interface ExchangeOptions {
  name: string;
  key: string;
  secret: string;
  mode: "algorithmic" | "hilow" | "grid" | "consecutive";
  forceStopOnDisconnect: boolean;
  console: string;
  openOrders: OpenOrders;
  balances: Balances;
  tradeHistory: TradeHistory;
  orderbooks: Orderbooks;
  symbols: SymbolOptions[];
}

export interface GridLevel {
  orderId: string;
  price: number;
  size: string;
  type: "buy" | "sell";
  executed: boolean;
}

export interface SymbolOptions {
  noPreviousTradeCheck: boolean;
  minimumTimeSinceLastTrade: number;
  name: string;
  timeframes: CandlestickInterval[];
  agreement: number;
  source: "close" | "high" | "low";
  consecutiveQuantity: number;
  consecutiveDirection: "SELL" | "BUY" | undefined;
  consecutivePreviousDirection: string | undefined;
  consecutiveNextTrade: string | undefined;
  consecutiveTradeAllowed: boolean | undefined;
  trend?: {
    current: string;
    enabled: boolean;
    timeframe: CandlestickInterval;
    ema: {
      short: number;
      long: number;
    };
  };
  profit?: {
    enabled: boolean;
    minimumSell: number;
    minimumBuy: number;
  };
  price?: {
    enabled: boolean;
    maximumSell: number;
    minimumSell: number;
    maximumBuy: number;
    minimumBuy: number;
  };
  growingMax?: {
    buy: number;
    sell: number;
  };
  closePercentage?: number;
  maximumAgeOfOrder?: number;
  tradeFeePercentage?: number;
  stopLoss?: {
    enabled: boolean;
    stopTrading: boolean;
    pnl: number;
    agingPerHour: number;
    hit: boolean;
  };
  takeProfit?: {
    enabled: boolean;
    limit: number;
    minimum: number;
    drop: number;
    current: number;
  };
  grid: GridLevel[];
  gridOrderSize: number;
  gridLevels: number;
  gridRange: {
    upper: number;
    lower: number;
  };
  gridDensity: "uniform" | "concentrated" | undefined;
  indicators?: {
    sma?: {
      enabled: boolean;
      length: number;
      weight?: number;
    };
    renko?: {
      enabled: boolean;
      weight: number;
      multiplier: number;
      brickSize: number;
    };
    ema?: {
      enabled?: boolean;
      short: number;
      long: number;
      weight?: number;
    };
    macd?: {
      enabled: boolean;
      fast: number;
      slow: number;
      signal: number;
      weight?: number;
    };
    rsi?: {
      enabled: boolean;
      length: number;
      smoothing?: {
        type: "EMA" | "SMA";
        length: number;
      };
      history: number;
      tresholds: {
        overbought: number;
        oversold: number;
      };
      weight?: number;
    };
    atr?: {
      enabled: boolean;
      length: number;
    };
    obv?: {
      enabled: boolean;
      length: number;
      weight?: number;
    };
    cmf?: {
      enabled: boolean;
      length: number;
      history: number;
      tresholds: {
        overbought: number;
        oversold: number;
      };
      weight?: number;
    };
    bb?: {
      enabled: boolean;
      length: number;
      multiplier: number;
      average: "SMA" | "EMA";
      history: number;
      weight?: number;
    };
    so?: {
      enabled: boolean;
      kPeriod: number;
      dPeriod: number;
      smoothing: number;
      tresholds: {
        overbought: number;
        oversold: number;
      };
      weight?: number;
    };
    srsi?: {
      enabled: boolean;
      rsiLength: number;
      stochLength: number;
      kPeriod: number;
      dPeriod: number;
      smoothK: number;
      smoothD: number;
      history: number;
      tresholds: {
        overbought: number;
        oversold: number;
      };
      weight?: number;
    };
    dmi?: {
      enabled: boolean;
      dmiLength: number;
      adxSmoothing: number;
      weight?: number;
    }
    OpenAI?: {
      enabled: boolean;
      key: string;
      model: string;
      history: string;
      overwrite: boolean;
    };
  };
}

export interface DiscordOptions {
  enabled?: boolean;
  token?: string;
  applicationId?: string;
  serverId?: string;
  channelId?: string;
}

export interface ConfigOptions {
  debug: boolean;
  startTime: string;
  exchanges: ExchangeOptions[];
  license: string;
  simulate: boolean;
  discord: DiscordOptions;
  [key: string]: ExchangeOptions[] | DiscordOptions | string | string[] | number | boolean | undefined | number | TradeHistory | Orderbooks | Balances | OpenOrders; // Index signature
}

export const parseArgs = (): ConfigOptions => {
  var options: ConfigOptions = {
    debug: false,
    startTime: "",
    exchanges: [],
    license: "",
    simulate: process.env.SIMULATE === "true" ? true : false,
    discord: {},
  };
  try {
    for (let i = 0; i < options.exchanges.length; i++) {
      options.exchanges[i].tradeHistory = {};
    }
    if (process.env.SIMULATE === "true") {
      const optionsFilename = "./settings/hoobot-options-simulate.json";
      if (fs.existsSync(optionsFilename)) {
        const optionsFile = fs.readFileSync(optionsFilename);
        options = JSON.parse(optionsFile.toString("utf-8"));
      }
    } else {
      const optionsFilename = "./settings/hoobot-options.json";
      if (fs.existsSync(optionsFilename)) {
        const optionsFile = fs.readFileSync(optionsFilename);
        options = JSON.parse(optionsFile.toString("utf-8"));
      }
    }
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error(JSON.stringify(error, null, 4));
  }

  return options;
};
