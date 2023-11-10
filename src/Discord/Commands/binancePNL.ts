import { SlashCommandBuilder } from '@discordjs/builders';
import Binance from 'node-binance-api';
import { ConfigOptions } from '../../Hoobot/Utilities/args';
import { Trade, calculatePNLPercentageForLong, calculatePNLPercentageForShort, getTradeHistory } from '../../Hoobot/Binance/trade';

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
    const symbol: string = interaction.options.getString('symbol').toUpperCase();
    const duration: string = interaction.options.getString('duration').toLowerCase();
    if (duration.toUpperCase() !== '1D' && duration.toUpperCase() !== '1W' && duration.toUpperCase() !== '1M' && duration.toUpperCase() !== '1Y') {
      return await interaction.reply('Invalid duration. Please use 1D, 1W, 1M or 1Y.');
    }
    let tradesInDuration: Trade[] = await getHistoricalDataForDuration(binance, symbol, duration, options);
    let pnlPercentage: number = 0;
    for (let i = 1; i < tradesInDuration.length; i++) {
      let olderTrade: Trade = tradesInDuration[i - 1];
      let lastTrade: Trade = tradesInDuration[i];
      let lastPNL: number = 0;
      let commission: number = 0;
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

export const getHistoricalDataForDuration = async (binance: Binance, symbol: string, duration: string, options: ConfigOptions): Promise<Trade[]> => {
  const tradeHistory: Trade[] = await getTradeHistory(binance, symbol, options);
  const targetTimestamp: number = getTargetTimestamp(duration.toUpperCase());
  const tradesInDuration: Trade[] = tradeHistory.filter(trade => trade.time / 1000 >= targetTimestamp);
  const slicedTradeHistory: Trade[] = tradesInDuration.slice(0, tradesInDuration.length - tradesInDuration.length);
  let previousTradeBeforeDuration = slicedTradeHistory[slicedTradeHistory.length - 1];
  if(previousTradeBeforeDuration === undefined) {
    return tradesInDuration
  } else {
    return [previousTradeBeforeDuration, ...tradesInDuration];
  }
}

export const getTargetTimestamp = (duration: string): number => {
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

