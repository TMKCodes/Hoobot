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
import { ConfigOptions } from '../../Hoobot/Utilities/args';

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
      let trades = 1;
      let shortingProfit = 0;
      let shorts = newTradeHistory[0].isBuyer === true ? 1 : 0;
      let longProfit = 0;
      let longs = newTradeHistory[0].isBuyer === true ? 0 : 1;
      let lastTrade = newTradeHistory[0];
      let lastTime = newTradeHistory[0].time;
      if(newTradeHistory.length > 2) {
        for (let i = 1; i < newTradeHistory.length; i++) {
          if (newTradeHistory[i].isBuyer) {
            // Calculate profit for the buy trade
            const newPrice = parseFloat(newTradeHistory[i].price);
            const oldPrice = parseFloat(lastTrade.price);
            const profit = calculatePercentageDifference(oldPrice, newPrice);
            shorts++;
            if (newTradeHistory[i + 1] !== undefined) {
              if (newTradeHistory[i].price < newTradeHistory[i + 1]?.price) {
                totalProfit += reverseSign(profit);
                shortingProfit += reverseSign(profit);
              }
            } else {
              totalProfit += reverseSign(profit);
              shortingProfit += reverseSign(profit);
            }
            if (parseFloat(newTradeHistory[i].commission) > 0) {
              if (newTradeHistory[i].commissionAsset === "BNB") {
                totalProfit -= 0.075
                shortingProfit -= 0.07
              } else {
                totalProfit -= 0.1
                shortingProfit -= 0.1
              }
            }
          } else {
            // Calculate profit for the sell trade
            const newPrice = parseFloat(newTradeHistory[i].price);
            const oldPrice = parseFloat(lastTrade.price);
            const profit = calculatePercentageDifference(oldPrice, newPrice); 
            totalProfit += profit;
            longProfit += profit;
            longs++;
            if (parseFloat(newTradeHistory[i].commission) > 0) {
              if (newTradeHistory[i].commissionAsset === "BNB") {
                totalProfit -= 0.075
                longProfit -= 0.07
              } else {
                totalProfit -= 0.1
                longProfit -= 0.1
              }
            }
          }
          
          trades++;
          lastTrade = newTradeHistory[i]; // Update lastTrade for the next iteration
        }

        // The totalProfit variable now contains the overall profit for all sell orders in the trade history
        await interaction.reply(`Total profit for **${pair}**:** ${totalProfit.toFixed(2)}%**\nTrades done **${trades}**\nLong profit for **${pair}**:** ${longProfit.toFixed(2)}%** (Profit from sales.)\nLongs done **${shorts}**\nShort profit for **${pair}**:** ${shortingProfit.toFixed(2)}%** (Profit from buys.)\nShorts done **${shorts}**\nSince ${(new Date(lastTime).toLocaleString("fi-FI"))}\n`);
      } else {
        await interaction.reply(`Total profit for **${pair}**: Can not calculate percentage, less than two trades.`);
      }
    } catch (error) {
      console.error('Error fetching trade history:', error);
      await interaction.reply('An error occurred while fetching trade history.');
    }
  }
}