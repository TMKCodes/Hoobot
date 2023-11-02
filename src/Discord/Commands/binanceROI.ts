import { SlashCommandBuilder } from '@discordjs/builders';
import Binance from 'node-binance-api';
import { ConfigOptions } from '../../Hoobot/Utilities/args';
import { calculatePercentageDifference } from './binanceProfit';
import { reverseSign } from './binancePossibleProfit';

export default {
  builder: new SlashCommandBuilder()
    .setName('roi')
    .setDescription('Calculate ROI for a symbol')
    .addStringOption(option =>
      option.setName('symbol')
        .setDescription('The symbol to calculate ROI for')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('The duration for ROI (1D, 1W, 1M)')
        .setRequired(true)),
  execute: async (interaction, binance: Binance, _config: ConfigOptions) => {
    const symbol = interaction.options.getString('symbol').toUpperCase();
    const duration = interaction.options.getString('duration').toLowerCase();

    let historicalData = []; // Assuming you have historical data for the symbol

    const tradeHistory = await binance.trades(symbol);

    // Get the relevant data based on the selected duration
    switch (duration) {
      case '1d':
        historicalData = getHistoricalDataForDuration(symbol, '1D', tradeHistory); // Function to get 1-day historical data
        break;
      case '1w':
        historicalData = getHistoricalDataForDuration(symbol, '1W', tradeHistory); // Function to get 1-week historical data
        break;
      case '1m':
        historicalData = getHistoricalDataForDuration(symbol, '1M', tradeHistory); // Function to get 1-month historical data
        break;
      default:
        await interaction.reply('Invalid duration. Please use 1D, 1W, or 1M.');
        return;
    }

    console.log(historicalData);

    // Calculate ROI based on the historical data
    let totalProfit = 0;
    let trades = 0;
    let lastTrade: any = undefined;
    if(historicalData.length >= 2) {
      for (const trade of historicalData) {
        if (lastTrade === undefined) {
          // Set last trade since it was undefined.
          lastTrade = trade;
        } else {
          if (trade.isBuyer) {
            // Calculate profit for the buy trade
            const newPrice = parseFloat(trade.price);
            const oldPrice = parseFloat(lastTrade.price);
            const profit = calculatePercentageDifference(oldPrice, newPrice);
            totalProfit += reverseSign(profit);
          } else {
            // Calculate profit for the sell trade
            const newPrice = parseFloat(trade.price);
            const oldPrice = parseFloat(lastTrade.price);
            const profit = calculatePercentageDifference(oldPrice, newPrice); 
            totalProfit += profit;
          }
          trades++;
          lastTrade = trade; // Update lastTrade for the next iteration
        }
      }
    }
    await interaction.reply(`ROI for ${symbol} over ${duration}: ${totalProfit.toFixed(2)}%\nTrades in duration: ${trades}`);
  },
};

// Placeholder function for retrieving historical data
function getHistoricalDataForDuration(symbol: string, duration: string, newTradeHistory: { time: number }[]) {
  // Filter data based on duration
  const targetTimestamp = getTargetTimestamp(duration);
  const filteredData = newTradeHistory.filter(trade => trade.time / 1000 >= targetTimestamp);

  return filteredData;
}

// Helper function to calculate target timestamp based on duration
function getTargetTimestamp(duration: string) {
  const now = Math.floor(new Date().getTime() / 1000);

  switch (duration) {
    case '1D':
      return now - (24 * 60 * 60); // 1 day in seconds
    case '1W':
      return now - (7 * 24 * 60 * 60); // 1 week in seconds
    case '1M':
      return now - (30 * 24 * 60 * 60); // 1 month in seconds
    default:
      throw new Error('Invalid duration');
  }
}
