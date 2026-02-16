import { SlashCommandBuilder } from "discord.js";
import fs from "fs";
import { Balance, getCurrentBalances } from "../../Hoobot/Exchanges/Balances";
import { Exchange, getExchangeByName } from "../../Hoobot/Exchanges/Exchange";
import { ConfigOptions } from "../../Hoobot/Utilities/Args";

export default {
  builder: new SlashCommandBuilder()
    .setName("roi")
    .setDescription("Calculates ROI since first recorded balance.")
    .addStringOption((option) =>
      option.setName("exchange").setDescription("The name of exchange to check").setRequired(true),
    ),
  execute: async (
    interaction: { options: any; reply: (arg0: string) => any },
    exchanges: Exchange[],
    options: ConfigOptions,
  ) => {
    const exchangeName = interaction.options.getString("exchange");
    if (exchangeName !== null) {
      const exchangeByName = getExchangeByName(exchangeName, exchanges, options);
      if (exchangeByName !== undefined) {
        const currentBalances = await getCurrentBalances(exchangeByName);
        if (!fs.existsSync(`./logs/balances-${exchangeName}.json`)) {
          await interaction.reply(
            `There are no stored balances in /logs/balances-${exchangeName}.json file yet. Investigate!`,
          );
        } else {
          const storedBalances = JSON.parse(fs.readFileSync(`./logs/balances-${exchangeName}.json`, "utf-8") || "[]");
          if (!storedBalances || storedBalances.length === 0) {
            await interaction.reply(`Stored balances file exists but is empty or invalid.`);
            return;
          }
          const firstEntry = storedBalances[0];
          const firstEntryKey = Object.keys(firstEntry)[0];
          if (!firstEntryKey || !firstEntry[firstEntryKey]) {
            await interaction.reply(`Invalid stored balances format.`);
            return;
          }
          const totalCurrentFiat = Object.values(currentBalances).reduce((acc, cur) => acc + cur.usdt, 0);
          const totalFirstFiat = Object.values(
            firstEntry[firstEntryKey] as Record<string, { crypto: number; usdt: number }>,
          ).reduce((acc, cur) => acc + cur.usdt, 0);
          if (totalFirstFiat === 0) {
            await interaction.reply(`Initial balance is zero, cannot calculate ROI.`);
            return;
          }
          const diff = totalCurrentFiat - totalFirstFiat;
          const roi = ((totalCurrentFiat - totalFirstFiat) / totalFirstFiat) * 100;
          const totalFiatBalances = storedBalances.map((entry: any) => {
            const balances = entry[Object.keys(entry)[0]] as Record<string, { crypto: number; usdt: number }>;
            return Object.values(balances).reduce((acc, balance) => acc + balance.usdt, 0);
          });
          const validFiatBalances = totalFiatBalances.filter(
            (balance: number) => typeof balance === "number" && !isNaN(balance) && balance > 0,
          );
          if (validFiatBalances.length === 0) {
            await interaction.reply(`No valid balance data found for ROI calculation.`);
            return;
          }
          const maxFiat = Math.max(...validFiatBalances);
          const maxDiff = maxFiat - totalFirstFiat;
          const maxRoi = ((maxFiat - totalFirstFiat) / totalFirstFiat) * 100;

          let msg = "```";
          msg += `Initial Balance: ${totalFirstFiat.toFixed(2)} USDT\r\n\r\n`;
          msg += `Current Balance: ${totalCurrentFiat.toFixed(2)} USDT\r\nCurrent Difference: ${diff.toFixed(
            2,
          )} USDT\r\nCurrent ROI: ${roi.toFixed(2)} %\r\n\r\n`;
          msg += `Max Balance: ${maxFiat.toFixed(2)} USDT\r\nMax Difference: ${maxDiff.toFixed(
            2,
          )} USDT\r\nMax ROI: ${maxRoi.toFixed(2)} %\r\n\r\n`;
          msg += "```";
          await interaction.reply(msg);
        }
      } else {
        await interaction.reply(`Sorry exchange does not exist or has not been implemented.`);
      }
    } else {
      await interaction.reply("Please provide a valid exchange name to check.");
    }
  },
};
