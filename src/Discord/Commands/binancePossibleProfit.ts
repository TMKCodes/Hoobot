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
import { calculatePercentageDifference } from '../../Hoobot/Binance/trade';


export const reverseSign = (number: number) => {
  return -number;
}

export default {
  builder: new SlashCommandBuilder()
    .setName("possible-profit")
    .setDescription("Replices with Binance possible profit on pair!")
    .addStringOption(option =>
      option.setName('pair')
        .setDescription('The pair to check')),
  execute: async (interaction: { options: any, reply: (arg0: string) => any; }, binance: Binance, _config: ConfigOptions) => {
    const pair = interaction.options.getString('pair').toUpperCase(); // Get the 'pair' value from the interaction options
    if (!pair) {
      await interaction.reply("Please provide a valid pair to check.");
      return;
    }

    try {
      // Get the user's trade history for the given pair
      const tradeHistory = await binance.trades(pair);
      //console.log(JSON.stringify(tradeHistory));

      const orderBook = await binance.depth(pair);
      //console.log(JSON.stringify(orderBook));

      // Find the last trade from the tradeHistory array
      const lastTrade = tradeHistory[tradeHistory.length - 1];

      if (lastTrade.isBuyer === true) {
        // Calculate the percentage change to the current highest bid price
        const currentHighestBidPrice = parseFloat(Object.keys(orderBook.bids).shift()!); // Get the lowest bid price
        const percentageChange = calculatePercentageDifference(lastTrade.price, currentHighestBidPrice) - 0.075;
        await interaction.reply(`>>> Last order was **BUY** order at **${parseFloat(lastTrade.price).toFixed(2)}** price with symbol **${lastTrade.symbol}**.\r\nThe order amount in base asset was **${lastTrade.qty}**\r\nThe order amount in quote asset was **${lastTrade.quoteQty}**\r\nPercentage change to current highest bid **${currentHighestBidPrice}** price: **${percentageChange.toFixed(2)}%**`);
      } else {
        // Calculate the percentage change to the current lowest ask price
        const currentLowestAskPrice = parseFloat(Object.keys(orderBook.asks).shift()!); // Get the highest ask price
        const percentageChange = reverseSign(calculatePercentageDifference(lastTrade.price, currentLowestAskPrice)) - 0.075;
        await interaction.reply(`>>> Last order was **SELL** order at **${parseFloat(lastTrade.price).toFixed(2)}** price with symbol **${lastTrade.symbol}**.\r\nThe order amount in base asset was **${lastTrade.qty}**\r\nThe order amount in quote asset was **${lastTrade.quoteQty}**\r\nPercentage change to current lowest ask **${currentLowestAskPrice}** price: **${percentageChange.toFixed(2)}%**`);
      }

    } catch (error) {
      console.error('Error fetching trade history:', error);
      await interaction.reply('An error occurred while fetching trade history.');
    }
  }

}