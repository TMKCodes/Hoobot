import { SlashCommandBuilder } from 'discord.js';
import { getCurrentBalance } from '../../binance/balances';
import Binance from 'node-binance-api';
import { ConfigOptions } from '../../binance/args';

export default {
  builder: new SlashCommandBuilder()
                .setName("balances")
                .setDescription("Replices with Binance balances!"),
  execute: async (interaction: { reply: (arg0: string) => any; }, binance: Binance, options: ConfigOptions) => {
    const { pair, balances } = await getCurrentBalance(binance, options);
    await interaction.reply(`Trading balances: ${pair.split("/")[0]} = ${balances[0]} / ${pair.split("/")[1]} = ${balances[1]}` );
  }
}
