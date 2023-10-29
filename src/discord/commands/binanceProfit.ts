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
import Binance from 'node-binance-api';
import { ConfigOptions } from '../../binance/args';

export const calculatePercentageDifference = (oldNumber: number, newNumber: number): number => {
  const difference = newNumber - oldNumber;
  const percentageDifference = (difference / Math.abs(oldNumber)) * 100;
  return percentageDifference;
}

export const getUnixTimestamp = (datetime: string): number => {
  const date = new Date(datetime);
  return Math.floor(date.getTime() / 1000);
}

const reverseSign = (number: number) => {
  return -number;
}

export default {
  builder: new SlashCommandBuilder()
    .setName("profit")
    .setDescription("Replices with Binance profit on pair orders!")
    .addStringOption(option =>
      option.setName('pair')
        .setDescription('The pair to check')),
  execute: async (interaction: { options: any, reply: (arg0: string) => any; }, binance: Binance, _config: ConfigOptions) => {
    const pair = interaction.options.getString('pair').toUpperCase(); // Get the 'pair' value from the interaction options
    if (!pair) {
      await interaction.reply("Please provide a valid pair to check.");
      return;
    }

    const targetDatetime = '2023-07-25 11:29:08';
    const targetTimestamp = getUnixTimestamp(targetDatetime);

    try {
      // Get the user's trade history for the given pair
      const tradeHistory = await binance.trades(pair);
      const newTradeHistory = tradeHistory.filter((trade: { time: number }) => trade.time / 1000 >= targetTimestamp);

      let totalProfit = 0;
      let trades = 0;
      let shortingProfit = 0;
      let shorts = 0;
      let lastTrade: any = undefined;
      let lastTime = "";
      if(newTradeHistory.length >= 2) {
        for (const trade of newTradeHistory) {
          if (lastTrade === undefined) {
            // Set last trade since it was undefined.
            lastTrade = trade;
            lastTime = trade.time;
          } else {
            if (trade.isBuyer) {
              // Calculate profit for the buy trade
              const newPrice = parseFloat(trade.price);
              const oldPrice = parseFloat(lastTrade.price);
              const profit = calculatePercentageDifference(oldPrice, newPrice);
              totalProfit += reverseSign(profit);
            } else {
              // Calculate profit for the sell trade
              const newPrice = parseFloat(trade.price);
              const oldPrice = parseFloat(lastTrade.price);
              const profit = calculatePercentageDifference(oldPrice, newPrice); 
              totalProfit += profit;
              shortingProfit += profit;
              shorts++;
            }
            trades++;
            lastTrade = trade; // Update lastTrade for the next iteration
          }
        }

        // The totalProfit variable now contains the overall profit for all sell orders in the trade history
        await interaction.reply(`Total profit for **${pair}**:** ${totalProfit.toFixed(2)}%**\nTrades done **${trades}**\nShorting profit for **${pair}**:** ${shortingProfit.toFixed(2)}%** (Profit from sales.)\nShorts done **${shorts}**\nSince ${(new Date(lastTime).toLocaleString("fi-FI"))}\nReminder, these calculations do not include trade fees.`);
      } else {
        await interaction.reply(`Total profit for **${pair}**: Can not calculate percentage, less than two trades.`);
      }
    } catch (error) {
      console.error('Error fetching trade history:', error);
      await interaction.reply('An error occurred while fetching trade history.');
    }
  }
}