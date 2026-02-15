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

import { SlashCommandBuilder } from "discord.js";
import { ConfigOptions } from "../../Hoobot/Utilities/Args";
import {
  Trade,
  calculateUnrealizedPNLPercentageForLong,
  calculateUnrealizedPNLPercentageForShort,
  getTradeHistory,
} from "../../Hoobot/Exchanges/Trades";
import { Orderbook } from "../../Hoobot/Exchanges/Orderbook";
import { logToFile } from "../../Hoobot/Utilities/LogToFile";
import { Exchange, getExchangeByName, getExchangeOption } from "../../Hoobot/Exchanges/Exchange";

export default {
  builder: new SlashCommandBuilder()
    .setName("upnl")
    .setDescription("Calculates current possible PNL% for next trade.")
    .addStringOption((option) =>
      option.setName("exchange").setDescription("The name of exchange to check").setRequired(true),
    )
    .addStringOption((option) => option.setName("symbol").setDescription("The symbol to check").setRequired(true)),
  execute: async (
    interaction: { options: any; reply: (arg0: string) => any },
    exchanges: Exchange[],
    options: ConfigOptions,
  ) => {
    const exchangeName = interaction.options.getString("exchange");
    if (exchangeName !== null) {
      const exchangeByName = getExchangeByName(exchangeName, exchanges, options);
      if (exchangeByName !== undefined) {
        const symbolStr = interaction.options.getString("symbol");
        if (!symbolStr) {
          await interaction.reply("Please provide a valid symbol to check.");
          return;
        }
        const symbol = symbolStr.toUpperCase();
        try {
          const tradeHistory: Trade[] = await getTradeHistory(exchangeByName, symbol);
          if (tradeHistory.length === 0) {
            await interaction.reply("No trade history found for this symbol.");
            return;
          }
          const exchangeOption = getExchangeOption(exchangeByName, options);
          const orderBook: Orderbook = exchangeOption.orderbooks[symbol.split("/").join("")];
          const lastTrade: Trade = tradeHistory[tradeHistory.length - 1];
          if (lastTrade.isBuyer === true) {
            const bidKeys = Object.keys(orderBook.bids);
            if (bidKeys.length === 0) {
              await interaction.reply("No bid data available in orderbook.");
              return;
            }
            const currentHighestBidPrice = parseFloat(bidKeys[0]);
            const pnl = calculateUnrealizedPNLPercentageForLong(
              parseFloat(lastTrade.qty),
              parseFloat(lastTrade.price),
              currentHighestBidPrice,
            );
            let msg = "```";
            msg += `Symbol ${lastTrade.symbol}.\r\n`;
            msg += `Previous BUY order at ${parseFloat(lastTrade.price).toFixed(2)} price\r\n`;
            msg += `The trade date was ${new Date(lastTrade.time).toLocaleString("fi-FI")}\r\n`;
            msg += `The order amount in quote asset was ${lastTrade.qty}\r\n`;
            msg += `Unrealized PNL% at ${currentHighestBidPrice} price: ${pnl.toFixed(2)}%\r\n`;
            msg += "```";
            await interaction.reply(msg);
          } else {
            const askKeys = Object.keys(orderBook.asks);
            if (askKeys.length === 0) {
              await interaction.reply("No ask data available in orderbook.");
              return;
            }
            const currentLowestAskPrice = parseFloat(askKeys[0]);
            const pnl = calculateUnrealizedPNLPercentageForShort(
              parseFloat(lastTrade.qty),
              parseFloat(lastTrade.price),
              currentLowestAskPrice,
            );
            let msg = "```";
            msg += `Symbol ${lastTrade.symbol}.\r\n`;
            msg += `Previous SELL order at ${parseFloat(lastTrade.price).toFixed(2)} price\r\n`;
            msg += `The trade date was ${new Date(lastTrade.time).toLocaleString("fi-FI")}\r\n`;
            msg += `The order amount in quote asset was ${lastTrade.qty}\r\n`;
            msg += `Unrealized PNL% at ${currentLowestAskPrice} price: ${pnl.toFixed(2)}%\r\n`;
            msg += "```";
            await interaction.reply(msg);
          }
        } catch (error) {
          logToFile("./logs/error.log", JSON.stringify(error, null, 4));
          console.error("Error fetching trade history:", error);
          await interaction.reply("An error occurred while fetching trade history.");
        }
      } else {
        await interaction.reply(`Sorry exchange does not exist or has not been implemented.`);
      }
    } else {
      await interaction.reply("Please provide a valid exchange name to check.");
    }
  },
};
