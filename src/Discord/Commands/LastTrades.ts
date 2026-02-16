import { SlashCommandBuilder } from "discord.js";
import { ConfigOptions } from "../../Hoobot/Utilities/Args";
import { Trade, getTradeHistory } from "../../Hoobot/Exchanges/Trades";
import { Exchange, getExchangeByName } from "../../Hoobot/Exchanges/Exchange";

export default {
  builder: new SlashCommandBuilder()
    .setName("trades")
    .setDescription("Replies with last 10 trades on symbol.")
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
        const symbolOption = interaction.options.getString("symbol");
        if (!symbolOption) {
          await interaction.reply("Please provide a valid symbol to check.");
          return;
        }
        const symbol: string = symbolOption.toUpperCase();
        const tradeHistory: Trade[] = await getTradeHistory(exchangeByName, symbol);
        const trades = tradeHistory.map((trade) => {
          return {
            orderId: trade.orderId,
            price: trade.price,
            qty: trade.qty,
            quoteQty: trade.quoteQty,
            commission: trade.commission,
            commissionAsset: trade.commissionAsset,
            isBuyer: trade.isBuyer,
            isMaker: trade.isMaker,
            isBestMatch: trade.isBestMatch,
            time: new Date(trade.time).toLocaleString("fi-FI"),
          };
        });
        await interaction.reply(`${exchangeName} ${symbol}: ${JSON.stringify(trades, null, 4)}`);
      } else {
        await interaction.reply(`Sorry exchange does not exist or has not been implemented.`);
      }
    } else {
      await interaction.reply("Please provide a valid exchange name to check.");
    }
  },
};
