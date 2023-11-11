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
import { Trade, calculateUnrealizedPNLPercentageForLong, calculateUnrealizedPNLPercentageForShort, getTradeHistory } from '../../Hoobot/Binance/Trades';
import { Orderbook } from '../../Hoobot/Binance/Orderbook';

export default {
  builder: new SlashCommandBuilder()
    .setName("upnl")
    .setDescription("Calculates current possible PNL% for next trade.")
    .addStringOption(option =>
      option.setName('symbol')
        .setDescription('The symbol to check')),
  execute: async (interaction: { options: any, reply: (arg0: string) => any; }, binance: Binance, options: ConfigOptions) => {
    const symbol = interaction.options.getString('symbol').toUpperCase();
    if (!symbol) {
      await interaction.reply("Please provide a valid symbol to check.");
      return;
    }
    try {
      const tradeHistory: Trade[] = await getTradeHistory(binance, symbol, options);
      const orderBook: Orderbook = await binance.depth(symbol.split("/").join(""));
      const lastTrade: Trade = tradeHistory[tradeHistory.length - 1];
      if (lastTrade.isBuyer === true) {
        const currentHighestBidPrice = parseFloat(Object.keys(orderBook.bids).shift()!); 
        const pnl = calculateUnrealizedPNLPercentageForLong(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), currentHighestBidPrice) - options.tradeFee;
        await interaction.reply(`>>> Symbol **${lastTrade.symbol}**.\r\nPrevious **BUY** order at **${parseFloat(lastTrade.price).toFixed(2)}** price\r\nThe order amount in quote asset was **${lastTrade.qty}**\r\nUnrealized PNL% at **${currentHighestBidPrice}** price: **${pnl.toFixed(2)}%**`);
      } else {
        const currentLowestAskPrice = parseFloat(Object.keys(orderBook.asks).shift()!); 
        const pnl = calculateUnrealizedPNLPercentageForShort(parseFloat(lastTrade.qty), parseFloat(lastTrade.price), currentLowestAskPrice) - options.tradeFee;
        await interaction.reply(`>>> Symbol **${lastTrade.symbol}**.\r\nPrevious **SELL** order at **${parseFloat(lastTrade.price).toFixed(2)}** price\r\nThe order amount in quote asset was **${lastTrade.qty}**\r\nUnrealized PNL% at **${currentLowestAskPrice}** price: **${pnl.toFixed(2)}%**`);
      }

    } catch (error) {
      console.error('Error fetching trade history:', error);
      await interaction.reply('An error occurred while fetching trade history.');
    }
  }
}