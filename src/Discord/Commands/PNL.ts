import { SlashCommandBuilder } from '@discordjs/builders';
import { ConfigOptions } from '../../Hoobot/Utilities/Args';
import { Trade, calculatePNLPercentageForLong, calculatePNLPercentageForShort, getTradeHistory } from '../../Hoobot/Exchanges/Trades';
import { Exchange, getExchangeByName } from '../../Hoobot/Exchanges/Exchange';

export default {
  builder: new SlashCommandBuilder()
    .setName('pnl')
    .setDescription('Calculate PNL for a trade')
    .addStringOption(option =>
      option.setName('exchange')
        .setDescription('The name of exchange to check')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('symbol')
        .setDescription('The symbol to calculate PNL for')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('The duration for PNL (1D, 1W, 1M)')
        .setRequired(true)),
  execute: async (interaction: { options: { getString: (arg0: string) => string; }; reply: (arg0: string) => any; }, exchanges: Exchange[], options: ConfigOptions) => {
    const exchangeName = interaction.options.getString('exchange'); 
    if (exchangeName !== null) {
      const exchangeByName = getExchangeByName(exchangeName, exchanges, options); 
      if(exchangeByName !== undefined) {
        const symbol: string = interaction.options.getString('symbol').toUpperCase();
        const duration: string = interaction.options.getString('duration').toLowerCase();
        if (duration.toUpperCase() !== '1D' && duration.toUpperCase() !== '1W' && duration.toUpperCase() !== '1M' && duration.toUpperCase() !== '1Y') {
          return await interaction.reply('Invalid duration. Please use 1D, 1W, 1M or 1Y.');
        }
        let tradesInDuration: Trade[] = await getHistoricalDataForDuration(exchangeByName, symbol, duration, options);
        let pnlPercentage: number = 0;
        for (let i = 1; i < tradesInDuration.length; i++) {
          let olderTrade: Trade = tradesInDuration[i - 1];
          let lastTrade: Trade = tradesInDuration[i];
          let lastPNL: number = 0;
          let commission: number = 0;
          if(olderTrade.isBuyer) { 
            lastPNL = calculatePNLPercentageForLong(parseFloat(olderTrade.price), parseFloat(lastTrade.price));
          } else if(!olderTrade.isBuyer) { 
            lastPNL = calculatePNLPercentageForShort(parseFloat(olderTrade.price), parseFloat(lastTrade.price));
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
        let msg = '```';
        msg += `PNL% for ${symbol} over ${duration.toUpperCase()}: ${pnlPercentage.toFixed(2)}%.\r\n`;
        msg += '```';
        return await interaction.reply(msg);
      } else {
        await interaction.reply(`Sorry exchange does not exist or has not been implemented.`);
      }
    } else {
      await interaction.reply("Please provide a valid exchange name to check.");
    }
  }
};

export const getHistoricalDataForDuration = async (exchange: Exchange, symbol: string, duration: string, options: ConfigOptions): Promise<Trade[]> => {
  const tradeHistory: Trade[] = await getTradeHistory(exchange, symbol, options);
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

