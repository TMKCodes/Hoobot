import { SlashCommandBuilder } from '@discordjs/builders';
import Binance from 'node-binance-api';
import { ConfigOptions } from '../../Hoobot/Utilities/args';
import { getTradeHistory } from '../../Hoobot/Binance/trade';
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
    if (duration.toUpperCase() !== '1D' && duration.toUpperCase() !== '1W' && duration.toUpperCase() !== '1M' && duration.toUpperCase() !== '1Y') {
      return await interaction.reply('Invalid duration. Please use 1D, 1W, 1M or 1Y.');
    }
    let tradesInDuration: Order[] = await getHistoricalDataForDuration(binance, symbol, duration);
    let pnlPercentage = 0;
    for (let i = 1; i < tradesInDuration.length; i++) {
      const buyTrade = tradesInDuration[i];
      if (buyTrade.isBuyer) {
        const sellTrade = tradesInDuration.slice(i, tradesInDuration.length).find(trade => !trade.isBuyer);
        if (sellTrade) {
          let buyCommission = 0;
          let sellCommission = 0;
          if (parseFloat(buyTrade.commission) > 0) {
            if (buyTrade.commissionAsset === "BNB") {
              buyCommission += parseFloat(buyTrade.qty) * 0.075;
            } else {
              buyCommission += parseFloat(buyTrade.qty) * 0.1;
            }
          }
          if (parseFloat(sellTrade.commission) > 0) {
            if (sellTrade.commissionAsset === "BNB") {
              sellCommission += parseFloat(sellTrade.qty) * 0.075;
            } else {
              sellCommission += parseFloat(sellTrade.qty) * 0.1;
            }
          }
          const exitFee = (1 - (sellCommission / 100))
          const exit = parseFloat(sellTrade.price) * parseFloat(sellTrade.qty) * exitFee;
          const entryFee = (1 - (buyCommission / 100))
          const entry = parseFloat(buyTrade.price) * parseFloat(buyTrade.qty) * entryFee;
          const pnl =  (exit / entry - 1) * 100;
          pnlPercentage += pnl;
        }
      }
    }
    return await interaction.reply(`PNL% for ${symbol} over ${duration.toUpperCase()}: ${pnlPercentage.toFixed(2)}%.`);
  },
};



export const getHistoricalDataForDuration = async (binance: Binance, symbol: string, duration: string) => {
  const tradeHistory = await getTradeHistory(binance, symbol);
  const targetTimestamp = getTargetTimestamp(duration.toUpperCase());
  const tradesInDuration = tradeHistory.filter(trade => trade.time / 1000 >= targetTimestamp);
  const slicedTradeHistory = tradesInDuration.slice(0, tradesInDuration.length - tradesInDuration.length);
  let previousTradeBeforeDuration = slicedTradeHistory[slicedTradeHistory.length - 1];
  return [previousTradeBeforeDuration, ...tradesInDuration];
}

export function getTargetTimestamp(duration: string) {
  const now = Math.floor(new Date().getTime() / 1000);
  switch (duration.toUpperCase()) {
    case '1D' :
      return now - (24 * 60 * 60); 
    case '1W':
      return now - (7 * 24 * 60 * 60);
    case '1M':
      return now - (30 * 24 * 60 * 60); 
    case '1Y':
      return now - (30 * 24 * 60 * 60 * 12);
    default:
      throw new Error('Invalid duration');
  }
}

