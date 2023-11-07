import { SlashCommandBuilder } from '@discordjs/builders';
import Binance from 'node-binance-api';
import { ConfigOptions } from '../../Hoobot/Utilities/args';
import { getHistoricalDataForDuration } from './binanceROI';
import { getTradeHistory, sell } from '../../Hoobot/Binance/trade';
import { Order } from '../../Hoobot/Binance/orders';

export default {
  builder: new SlashCommandBuilder()
    .setName('pnl')
    .setDescription('Calculate PNL for a trade')
    .addStringOption(option =>
      option.setName('symbol')
        .setDescription('The symbol to calculate PNL for')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('The duration for PNL (1D, 1W, 1M)')
        .setRequired(true)),
  execute: async (interaction, binance: Binance, _config: ConfigOptions) => {
    const symbol = interaction.options.getString('symbol').toUpperCase();
    const duration = interaction.options.getString('duration').toLowerCase();

    let tradesInDuration: Order[] = []; // Assuming you have historical data for the symbol

    const tradeHistory = await getTradeHistory(binance, symbol);

    // Get the relevant data based on the selected duration
    switch (duration) {
      case '1d':
        tradesInDuration = getHistoricalDataForDuration(symbol, '1D', tradeHistory); // Function to get 1-day historical data
        break;
      case '1w':
        tradesInDuration = getHistoricalDataForDuration(symbol, '1W', tradeHistory); // Function to get 1-week historical data
        break;
      case '1m':
        tradesInDuration = getHistoricalDataForDuration(symbol, '1M', tradeHistory); // Function to get 1-month historical data
        break;
      default:
        await interaction.reply('Invalid duration. Please use 1D, 1W, or 1M.');
        return;
    }
    const slicedTradeHistory = tradeHistory.slice(0, tradeHistory.length - tradesInDuration.length);
    let lastTrade = slicedTradeHistory[slicedTradeHistory.length - 1];
    if (lastTrade === undefined) {
      lastTrade = tradesInDuration[0];
    }
    let pnlPercentage = 0;
    for (let i = 1; i < tradesInDuration.length; i++) {
      const buyTrade = tradesInDuration[i];
      if (buyTrade.isBuyer) {
        const sellTrade = tradesInDuration.slice(i, tradesInDuration.length).find(trade => !trade.isBuyer);
        if (sellTrade) {
          let commission = 0;
          if (parseFloat(buyTrade.commission) > 0) {
            if (buyTrade.commissionAsset === "BNB") {
              commission += parseFloat(buyTrade.qty) * 0.075;
            } else {
              commission += parseFloat(buyTrade.qty) * 0.1;
            }
          }
          if (parseFloat(sellTrade.commission) > 0) {
            if (sellTrade.commissionAsset === "BNB") {
              commission += parseFloat(sellTrade.qty) * 0.075;
            } else {
              commission += parseFloat(sellTrade.qty) * 0.1;
            }
          }
          const exit = parseFloat(sellTrade.price) * parseFloat(sellTrade.qty);
          const entry = parseFloat(buyTrade.price) * parseFloat(buyTrade.qty);
          const pnl =  (exit / entry - 1) * 100;
          pnlPercentage += pnl;
        }
      }
    }
    await interaction.reply(`PNL% for ${symbol} over ${duration.toUpperCase()}: ${pnlPercentage.toFixed(2)}%.`);
  },
};

