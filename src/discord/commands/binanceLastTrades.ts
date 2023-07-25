import { SlashCommandBuilder } from 'discord.js';
import { getCurrentBalance } from '../../binance/balances';
import Binance from 'node-binance-api';
import { ConfigOptions } from '../../binance/args';

export default {
  builder: new SlashCommandBuilder()
                .setName("trades")
                .setDescription("Replis with last 10 trades on pair.")
                .addStringOption(option =>
                  option.setName('pair')
                    .setDescription('The pair to check')),
  execute: async (interaction: { options: any, reply: (arg0: string) => any; }, binance: Binance, options: ConfigOptions) => {
    const pair = interaction.options.getString('pair').toUpperCase(); // Get the 'pair' value from the interaction options
    if (!pair) {
      await interaction.reply("Please provide a valid pair to check.");
      return;
    }
    const tradeHistory = (await binance.trades(pair)).reverse().slice(0, 10);
    const trades = tradeHistory.map((trade) => {
      return {
        orderId: trade.orderId,
        price: trade.price,
        quantity: trade.qty,
        quoteQuantity: trade.quoteQuantity,
        commission: trade.commission,
        commissionAsset: trade.commissionAsset,
        isBuyer: trade.isBuyer,
        isMaker: trade.isMaker,
        isBestMatch: trade.isBestMatch,
        time: (new Date(trade.time).toLocaleString("fi-FI")),
      }
    })
    await interaction.reply(`${pair}: ${JSON.stringify(trades, null, 4)}`);
  }
}
