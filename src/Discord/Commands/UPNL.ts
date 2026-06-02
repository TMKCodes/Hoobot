import { SlashCommandBuilder } from "discord.js";
import { ConfigOptions, toSymbolKey } from "../../Hoobot/Utilities/Args";
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
    interaction: {
      options: any;
      deferReply: () => Promise<unknown>;
      editReply: (arg0: string | { content: string }) => Promise<unknown>;
      reply: (arg0: string) => any;
    },
    exchanges: Exchange[],
    options: ConfigOptions,
  ) => {
    await interaction.deferReply();
    const exchangeName = interaction.options.getString("exchange");
    if (exchangeName !== null) {
      const exchangeByName = getExchangeByName(exchangeName, exchanges, options);
      if (exchangeByName !== undefined) {
        const symbolRaw = interaction.options.getString("symbol");
        if (!symbolRaw) {
          await interaction.editReply("Please provide a valid symbol to check.");
          return;
        }
        const symbol = symbolRaw.toUpperCase();
        try {
          const tradeHistory: Trade[] = await getTradeHistory(exchangeByName, symbol);
          if (!tradeHistory?.length) {
            await interaction.editReply("No trade history for this symbol yet.");
            return;
          }
          const exchangeOption = getExchangeOption(exchangeByName, options);
          const symbolKey = toSymbolKey(symbol);
          const orderBook: Orderbook | undefined = exchangeOption?.orderbooks?.[symbolKey];
          if (
            !orderBook?.bids ||
            !orderBook?.asks ||
            Object.keys(orderBook.bids).length === 0 ||
            Object.keys(orderBook.asks).length === 0
          ) {
            await interaction.editReply("Order book not available for this symbol. Wait for data to load.");
            return;
          }
          const lastTrade: Trade = tradeHistory[tradeHistory.length - 1];
          if (lastTrade.isBuyer === true) {
            const currentHighestBidPrice = parseFloat(Object.keys(orderBook.bids).shift()!);
            const pnl = calculateUnrealizedPNLPercentageForLong(
              parseFloat(lastTrade.qty),
              parseFloat(lastTrade.price),
              currentHighestBidPrice,
            );
            let msg = "```";
            msg += `Symbol ${lastTrade.symbol}.\r\n`;
            msg += `Previous BUY order at ${parseFloat(lastTrade.price).toFixed(2)} price\r\n`;
            msg += `The trade date was ${new Date(lastTrade.time).toLocaleString("FI-fi")}\r\n`;
            msg += `The order amount in quote asset was ${lastTrade.qty}\r\n`;
            msg += `Unrealized PNL% at ${currentHighestBidPrice} price: ${pnl.toFixed(2)}%\r\n`;
            msg += "```";
            await interaction.editReply(msg);
          } else {
            const currentLowestAskPrice = parseFloat(Object.keys(orderBook.asks).shift()!);
            const pnl = calculateUnrealizedPNLPercentageForShort(
              parseFloat(lastTrade.qty),
              parseFloat(lastTrade.price),
              currentLowestAskPrice,
            );
            let msg = "```";
            msg += `Symbol ${lastTrade.symbol}.\r\n`;
            msg += `Previous SELL order at ${parseFloat(lastTrade.price).toFixed(2)} price\r\n`;
            msg += `The trade date was ${new Date(lastTrade.time).toLocaleString("FI-fi")}\r\n`;
            msg += `The order amount in quote asset was ${lastTrade.qty}\r\n`;
            msg += `Unrealized PNL% at ${currentLowestAskPrice} price: ${pnl.toFixed(2)}%`;
            msg += "```";
            await interaction.editReply(msg);
          }
        } catch (error) {
          logToFile("./logs/error.log", JSON.stringify(error, null, 4));
          console.error("Error fetching trade history:", error);
          await interaction.editReply("An error occurred while fetching trade history.");
        }
      } else {
        await interaction.editReply(`Sorry exchange does not exist or has not been implemented.`);
      }
    } else {
      await interaction.editReply("Please provide a valid exchange name to check.");
    }
  },
};
