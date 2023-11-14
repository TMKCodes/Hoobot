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

import fs from 'fs';
import Binance from "node-binance-api";
import { balancesWithUSDT } from '../../Discord/Commands/binanceBalance';

export interface Balances { 
  [symbol: string]: number 
}


export interface BalancesWith { 
  [symbol: string]: {
    crypto: number,
    fiat: number,
  }; 
}

export interface StoredBalances {
  [date: string] : BalancesWith,
}

export const getCurrentBalance = async (
  binance: Binance, 
  symbol: string
): Promise<number> => {
  try {
    const balance = await binance.balance();
    return parseFloat(balance[symbol].available || "0");
  } catch (error) {
    console.error('Error fetching balances:', error);
    throw error;
  }
}

export const getCurrentBalances = async (
  binance: Binance
): Promise<Balances> => {
  try {
    const balances = await binance.balance();
    const currentBalances = {};
    for (const symbol in balances) {
      const { available, onOrder } = balances[symbol];
      const availableBalance = parseFloat(available);
      const onOrderBalance = parseFloat(onOrder);
      const totalBalance = availableBalance + onOrderBalance;
      currentBalances[symbol] = totalBalance;
    }
    return currentBalances;
  } catch (error) {
    console.error('Error fetching balances:', error);
    throw error;
  }
}

export const getBalancesWith = async (
  binance: Binance,
  fiat: string,
) => {
  const balances: Balances = await getCurrentBalances(binance);
  const newBalances: BalancesWith = {}
  const prices = await binance.prices();
  const priceSymbols = Object.keys(prices);
  const symbols = Object.keys(balances);
  for (const symbol of symbols) {
    if (balances[symbol] > 0) {
      let fiatAmount = 0;
      if (priceSymbols.includes(symbol + fiat)) {
        fiatAmount = prices[symbol + fiat] * balances[symbol];
      }
      newBalances[symbol] = { 
        crypto: balances[symbol],
        fiat: fiatAmount
      };
    }
  }
  const sortedBalances = Object.entries(newBalances)
    .sort(([, a], [, b]) => b.fiat - a.fiat)
    .reduce((obj, [key, value]) => {
      obj[key] = value;
      return obj;
    }, {} as BalancesWith);
  return sortedBalances;
}


export const storeBalancesDaily = async (
  binance: Binance,
  fiat: string
) => {
  storeBalances(binance, fiat);
  const now = new Date();
  const millisecondsUntilNextDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1, // Next day
    0, // Midnight
    0, // Minutes
    0, // Seconds
    0 // Milliseconds
  ).getTime() - now.getTime();

  setTimeout(async () => {
    storeBalances(binance, fiat);
    setInterval(async () => {
      storeBalances(binance, fiat);
    }, 24 * 60 * 60 * 1000); 
  }, millisecondsUntilNextDay);
}

export const storeBalances = async (
  binance: Binance,
  fiat: string
) => {
  const currentDate = new Date().toLocaleString();
  const balances = await getBalancesWith(binance, fiat);
  const filePath = `balances.json`;
  let existingBalances: StoredBalances[] = [];
  if(fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    existingBalances = JSON.parse(fileContent);
  } else {
    fs.writeFileSync(filePath, JSON.stringify([], null, 4));
  }
  existingBalances.push({ [currentDate]: balances });
  fs.writeFileSync(filePath, JSON.stringify(existingBalances, null, 4));
}