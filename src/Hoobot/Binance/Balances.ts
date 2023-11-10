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

export interface Balances { 
  [coin: string]: number 
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

export const getBalancesFromWebsocket = (
  data: any
): Balances => {
  if (!Array.isArray(data.B)) {
    return {} as Balances;
  }
  const balances: Balances = {};
  for (let obj of data.B) {
    if (!obj.a || !obj.f || !obj.l) {
      console.error("Balance object is missing required properties (a, f, l).", obj);
      continue;
    }
    let { a: asset, f: available, l: onOrder } = obj;
    available = parseFloat(available);
    if (available === 0) continue;
    balances[asset] = available;
  }

  return balances;
}