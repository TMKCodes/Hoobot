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

import { SlashCommandBuilder } from 'discord.js';
import { Balances, getCurrentBalances } from '../../Hoobot/Binance/Balances';
import Binance from 'node-binance-api';
import { ConfigOptions } from '../../Hoobot/Utilities/args';

export interface balancesWithUSDT { 
  [symbol: string]: {
    amount: number,
    amountInUSDT: number,
  }; 
}

export interface result {
  [symbol: string]: string,
}

export default {
  builder: new SlashCommandBuilder()
    .setName("balances")
    .setDescription("Replices with Binance balances!"),
  execute: async (interaction: { options: any, reply: (arg0: string) => any; }, binance: Binance, config: ConfigOptions) => {
    const balances: Balances = await getCurrentBalances(binance);
    const newBalances: balancesWithUSDT = {}
    const prices = await binance.prices();
    const priceSymbols = Object.keys(prices);
    const symbols = Object.keys(balances);
    for (const symbol of symbols) {
      if (balances[symbol] > 0) {
        let amountInUSDT = 0;
        if (priceSymbols.includes(symbol + "USDT")) {
          amountInUSDT = prices[symbol + "USDT"] * balances[symbol];
        }
        newBalances[symbol] = { 
          amount: balances[symbol],
          amountInUSDT: amountInUSDT
        };
      }
    }
    const sortedBalances = Object.entries(newBalances)
      .sort(([, a], [, b]) => b.amountInUSDT - a.amountInUSDT)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {} as balancesWithUSDT);

    // Extract and sort the resultBalances array based on the sortedBalances keys
    const resultBalances = Object.entries(sortedBalances).map(([symbol, data]) => `${data.amount.toFixed(7)} = ${data.amountInUSDT.toFixed(7)} USDT`);
    await interaction.reply(`${JSON.stringify(resultBalances, null, 4)}`);
  }
}
