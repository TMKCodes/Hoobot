import { SlashCommandBuilder } from "discord.js";

function getRandomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min);
}

export default {
  builder: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll a number x times between y and z values")
    .addNumberOption((option) => option.setName("amount").setDescription("How many times to roll").setRequired(true))
    .addNumberOption((option) => option.setName("min").setDescription("Minimum value for roll").setRequired(true))
    .addNumberOption((option) => option.setName("max").setDescription("Maximum value for roll").setRequired(true)),
  execute: async (interaction: { options: any; reply: (arg0: string) => any }) => {
    let amount = interaction.options.getNumber("amount");
    const min = interaction.options.getNumber("min");
    const max = interaction.options.getNumber("max");
    if (amount <= 0 || !Number.isInteger(amount)) {
      await interaction.reply("Amount must be a positive integer.");
      return;
    }
    if (min >= max || !Number.isInteger(min) || !Number.isInteger(max)) {
      await interaction.reply("Min must be less than max, and both must be integers.");
      return;
    }
    if (amount > 100) {
      // Prevent spam
      await interaction.reply("Amount cannot exceed 100.");
      return;
    }
    const rolls: number[] = [];
    for (let x = 0; x < amount; x++) {
      rolls.push(getRandomNumber(min, max));
    }
    await interaction.reply(`You rolled: ${rolls.join(", ")}`);
  },
};
