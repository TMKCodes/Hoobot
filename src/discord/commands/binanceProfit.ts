import { SlashCommandBuilder } from 'discord.js';
import Binance from 'node-binance-api';
import { ConfigOptions } from '../../binance/args';


function percentageChange(oldValue, newValue) {
  const percentageChange = ((newValue - oldValue) / Math.abs(oldValue)) * 100;
  return percentageChange;
}

export default {
  builder: new SlashCommandBuilder()
    .setName("profit")
    .setDescription("Replices with Binance profit on pair orders!")
    .addStringOption(option =>
      option.setName('pair')
        .setDescription('The pair to check')),
  execute: async (interaction: { options: any, reply: (arg0: string) => any; }, binance: Binance, config: ConfigOptions) => {
    const pair = interaction.options.getString('pair').toUpperCase(); // Get the 'pair' value from the interaction options
    if (!pair) {
      await interaction.reply("Please provide a valid pair to check.");
      return;
    }

    try {
      // Get the user's trade history for the given pair
      const tradeHistory = await binance.trades(pair);
      console.log(JSON.stringify(tradeHistory))

      let totalProfit = 0;
      let lastTrade: any = undefined;

      for (const trade of tradeHistory) {
        if (lastTrade === undefined) {
          // Set last trade since it was undefined.
          lastTrade = trade;
        } else {
          if (trade.isBuyer) {
            // Calculate profit for the buy trade
            // Calculate profit for the buy trade
            const newPrice = parseFloat(trade.price);
            const oldPrice = parseFloat(lastTrade.price);
            const profit = percentageChange(oldPrice, newPrice);
            const profitPositive = profit > 0;
            if(profitPositive) {
              totalProfit -= profit;
            } else {
              totalProfit += profit;
            }
          } else {
            // Calculate profit for the sell trade
            const newPrice = parseFloat(trade.price);
            const oldPrice = parseFloat(lastTrade.price);
            const profit = percentageChange(oldPrice, newPrice); 
            totalProfit += profit;
          }
          lastTrade = trade; // Update lastTrade for the next iteration
        }
      }

      // The totalProfit variable now contains the overall profit for all sell orders in the trade history
      await interaction.reply(`Total profit for ${pair}: ${totalProfit.toFixed(2)} %`);
    } catch (error) {
      console.error('Error fetching trade history:', error);
      await interaction.reply('An error occurred while fetching trade history.');
    }
  }
}