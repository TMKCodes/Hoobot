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
import path from "path";
import Binance from "node-binance-api";
import { Xeggex } from "./Xeggex/Xeggex";
import { Exchange, isBinance, isNonKYC, isXeggex } from "./Exchange";
import { logToFile } from "../Utilities/LogToFile";

export interface DatedBalances {
  [date: string]: Balances;
}

export interface Balance {
  crypto: number;
  usdt: number;
}

export interface Balances {
  [asset: string]: Balance;
}

export const getCurrentBalances = async (exchange: Exchange): Promise<Balances> => {
  try {
    const fiat = "USDT";
    const currentBalances: Balances = {
      USDT: {
        crypto: 0,
        usdt: 0,
      },
    };
    if (isBinance(exchange)) {
      const balances = await exchange.balance();
      const assets = Object.keys(balances);
      const prices = await exchange.prices();
      const symbols = Object.keys(prices);
      for (let i = 0; i < assets.length; i++) {
        const { available, onOrder } = balances[assets[i]];
        const amount = parseFloat(available) + parseFloat(onOrder);
        if (amount === 0) {
          currentBalances[assets[i]] = {
            crypto: 0,
            usdt: 0,
          };
          continue;
        }
        if (assets[i] === "USDT") {
          currentBalances[assets[i]] = {
            crypto: amount,
            usdt: amount,
          };
        } else {
          let fiatAmount = 0;
          if (symbols.includes(assets[i] + fiat)) {
            fiatAmount = prices[assets[i] + fiat] * amount;
          } else if (symbols.includes(fiat + assets[i])) {
            fiatAmount = amount / prices[fiat + assets[i]];
          } else {
            let tempAmount = amount / prices["BTC" + assets[i]];
            fiatAmount = prices[assets[i] + fiat] * tempAmount;
          }
          currentBalances[assets[i]] = {
            crypto: amount,
            usdt: Number.isNaN(fiatAmount) ? 0 : fiatAmount,
          };
        }
      }
    } else if (isXeggex(exchange) || isNonKYC(exchange)) {
      const balances = await exchange.getTradingBalance();
      const prices = await exchange.getMarkets();
      const symbols = prices.map((price) => price.symbol.split("/").join(""));
      if (balances.length > 0) {
        for (const balance of balances) {
          const amount = parseFloat(balance.available);
          if (balance.asset === "USDT") {
            currentBalances[balance.asset] = {
              crypto: amount,
              usdt: amount,
            };
          } else {
            let fiatAmount = 0;
            const price = prices.find((price) => price.symbol.split("/").join("") === balance.asset + fiat);
            if (symbols.includes(balance.asset + fiat)) {
              fiatAmount = parseFloat(price?.lastPrice!) * amount;
            } else if (symbols.includes(fiat + balance.asset)) {
              fiatAmount = amount / parseFloat(price?.lastPrice!);
            } else {
              const tempPrice = prices.find((price) => price.symbol.split("/").join("") === "BTC" + balance.asset);
              let tempAmount = amount / parseFloat(tempPrice?.lastPrice!);
              fiatAmount = parseFloat(price?.lastPrice!) * tempAmount;
            }
            currentBalances[balance.asset] = {
              crypto: amount,
              usdt: fiatAmount > 0 ? fiatAmount : 0,
            };
          }
        }
      } else {
        // Possibly build empty currentBalances.
      }
    }
    const balanceAssets = Object.keys(currentBalances);
    for (const balanceAsset of balanceAssets) {
      if (currentBalances[balanceAsset].crypto === undefined) {
        currentBalances[balanceAsset].crypto = 0;
      }
      if (currentBalances[balanceAsset].usdt === undefined) {
        currentBalances[balanceAsset].usdt = 0;
      }
    }
    return Object.fromEntries(Object.entries(currentBalances).sort((a, b) => b[1].usdt - a[1].usdt));
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error("Error fetching balances:", error);
    throw error;
  }
};

export const getCurrentBalance = async (exchange: Exchange, asset: string): Promise<Balance> => {
  try {
    const balances = await getCurrentBalances(exchange);
    return balances[asset];
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error("Error fetching balances:", error);
    throw error;
  }
};

export const storeBalances = async (exchange: Exchange, balances: Balances) => {
  const currentDate = new Date().toLocaleString();
  let ex = "binance";
  if (isXeggex(exchange) || isNonKYC(exchange)) {
    ex = "xeggex";
  }
  const logsDir = "./logs";
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }
  const filePath = `./logs/balances-${ex}.json`;
  let existingBalances: DatedBalances[] = [];
  if (fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath, "utf8");
    existingBalances = JSON.parse(fileContent);
  } else {
    fs.writeFileSync(filePath, JSON.stringify([], null, 4));
  }
  existingBalances.push({ [currentDate]: balances });
  fs.writeFileSync(filePath, JSON.stringify(existingBalances, null, 4));
};
