import { SlashCommandBuilder } from 'discord.js';

export default {
  builder: new SlashCommandBuilder()
                .setName("ping")
                .setDescription("Replies with pong!"),
  execute: async (interaction: { reply: (arg0: string) => any; }) => {
    await interaction.reply("Pong!");
  }
}
