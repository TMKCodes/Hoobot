import { SlashCommandBuilder } from '@discordjs/builders';
import Binance from 'node-binance-api';
import { ConfigOptions } from '../../Hoobot/Utilities/args';
import { buy, calculatePNLPercentageForLong, calculatePNLPercentageForShort, getTradeHistory } from '../../Hoobot/Binance/trade';
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
  execute: async (interaction, binance: Binance, options: ConfigOptions) => {
    const symbol = interaction.options.getString('symbol').toUpperCase();
    const duration = interaction.options.getString('duration').toLowerCase();
    if (duration.toUpperCase() !== '1D' && duration.toUpperCase() !== '1W' && duration.toUpperCase() !== '1M' && duration.toUpperCase() !== '1Y') {
      return await interaction.reply('Invalid duration. Please use 1D, 1W, 1M or 1Y.');
    }
    let tradesInDuration: Order[] = await getHistoricalDataForDuration(binance, symbol, duration, options);
    let pnlPercentage = 0;
    for (let i = 1; i < tradesInDuration.length; i++) {
      let olderTrade: Order = tradesInDuration[i - 1];
      let lastTrade: Order = tradesInDuration[i];
      let lastPNL = 0;
      let commission = 0;
      if(olderTrade.isBuyer) { 
        lastPNL = calculatePNLPercentageForLong(parseFloat(olderTrade.quoteQty), parseFloat(olderTrade.price), parseFloat(lastTrade.price));
      } else if(!olderTrade.isBuyer) { 
        lastPNL = calculatePNLPercentageForShort(parseFloat(olderTrade.quoteQty), parseFloat(olderTrade.price), parseFloat(lastTrade.price));
      }
      if (parseFloat(olderTrade.commission) > 0) {
        if (olderTrade.commissionAsset === "BNB") {
          commission += 0.075;
        } else {
          commission += 0.1;
        }
      }
      if (parseFloat(lastTrade.commission) > 0) {
        if (lastTrade.commissionAsset === "BNB") {
          commission += 0.075;
        } else {
          commission += 0.1;
        }
      }
      pnlPercentage += lastPNL - commission;
    }
    return await interaction.reply(`PNL% for ${symbol} over ${duration.toUpperCase()}: ${pnlPercentage.toFixed(2)}%.`);
  },
};

export const getHistoricalDataForDuration = async (binance: Binance, symbol: string, duration: string, options: ConfigOptions) => {
  const tradeHistory = await getTradeHistory(binance, symbol, options);
  const targetTimestamp = getTargetTimestamp(duration.toUpperCase());
  const tradesInDuration = tradeHistory.filter(trade => trade.time / 1000 >= targetTimestamp);
  const slicedTradeHistory = tradesInDuration.slice(0, tradesInDuration.length - tradesInDuration.length);
  let previousTradeBeforeDuration = slicedTradeHistory[slicedTradeHistory.length - 1];
  if(previousTradeBeforeDuration === undefined) {
    return tradesInDuration
  } else {
    return [previousTradeBeforeDuration, ...tradesInDuration];
  }
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

