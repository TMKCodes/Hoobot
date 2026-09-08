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
    .setDescription("Replices with exchange balances!")
    .addStringOption((option) =>
      option.setName("exchange").setDescription("The name of exchange to check").setRequired(true),
    ),
  execute: async (
    interaction: ChatInputCommandInteraction<CacheType>,
    exchanges: Exchange[],
    options: ConfigOptions,
  ) => {
    await interaction.deferReply();
    const exchangeName = interaction.options.getString("exchange");
    if (exchangeName !== null) {
      const exchangeByName = getExchangeByName(exchangeName, exchanges, options);
      if (exchangeByName !== undefined) {
        const sortedBalances = await getCurrentBalances(exchangeByName);
        const resultBalances = Object.entries(sortedBalances).map(
          ([symbol, data]) => {
            const crypto = Number.isFinite(data.crypto) ? data.crypto.toFixed(7) : "0.0000000";
            const usdt = Number.isFinite(data.usdt) ? data.usdt.toFixed(2) : "0.00";
            return `${crypto} ${symbol} = ${usdt} USDT`;
          }
        );
        await interaction.editReply(`${exchangeName} balances: \r\n${JSON.stringify(resultBalances, null, 4)}`);
      } else {
        await interaction.editReply(`Sorry exchange does not exist or has not been implemented.`);
      }
    } else {
      await interaction.editReply("Please provide a valid exchange name to check.");
    }
  },
};
