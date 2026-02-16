import { CacheType, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getCurrentBalances } from "../../Hoobot/Exchanges/Balances";
import { Exchange, getExchangeByName } from "../../Hoobot/Exchanges/Exchange";
import { ConfigOptions } from "../../Hoobot/Utilities/Args";

export interface balancesWithUSDT {
  [symbol: string]: {
    amount: number;
    amountInUSDT: number;
  };
}

export interface result {
  [symbol: string]: string;
}

export default {
  builder: new SlashCommandBuilder()
    .setName("balances")
    .setDescription("Replies with exchange balances!")
    .addStringOption((option) =>
      option.setName("exchange").setDescription("The name of exchange to check").setRequired(true),
    ),
  execute: async (
    interaction: ChatInputCommandInteraction<CacheType>,
    exchanges: Exchange[],
    options: ConfigOptions,
  ) => {
    const exchangeName = interaction.options.getString("exchange");
    if (exchangeName !== null) {
      const exchangeByName = getExchangeByName(exchangeName, exchanges, options);
      if (exchangeByName !== undefined) {
        const sortedBalances = await getCurrentBalances(exchangeByName);
        const resultBalances = Object.entries(sortedBalances).map(
          ([symbol, data]) => `${data.crypto.toFixed(7)} ${symbol} = ${data.usdt.toFixed(2)} USDT`,
        );
        await interaction.reply(`${exchangeName} balances: \r\n${resultBalances.join("\n")}`);
      } else {
        await interaction.reply(`Sorry exchange does not exist or has not been implemented.`);
      }
    } else {
      await interaction.reply("Please provide a valid exchange name to check.");
    }
  },
};
