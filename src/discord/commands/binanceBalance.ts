import { SlashCommandBuilder } from 'discord.js';
import { getCurrentBalance } from '../../binance/balances';
import Binance from 'node-binance-api';
import { ConfigOptions } from '../../binance/args';

export default {
  builder: new SlashCommandBuilder()
                .setName("balances")
                .setDescription("Replices with Binance balances!")
                .addStringOption(option =>
                  option.setName('coin')
                    .setDescription('The coin to check')),
  execute: async (interaction: { options: any, reply: (arg0: string) => any; }, binance: Binance, options: ConfigOptions) => {
    const coin = interaction.options.getString('coin').toUpperCase(); // Get the 'coin' value from the interaction options
    if (!coin) {
      await interaction.reply("Please provide a valid coin to check.");
      return;
    }

    const balances = await getCurrentBalance(binance, coin);
    await interaction.reply(`${coin}: ${JSON.stringify(balances)}`);
  }
}
