import { SlashCommandBuilder } from "discord.js";

export default {
  builder: new SlashCommandBuilder().setName("server").setDescription("Display info about this server."),
  execute: async (interaction: { guild: any; reply: (arg0: string) => any }) => {
    if (!interaction.guild) {
      return interaction.reply("This command can only be used in a server.");
    }
    return interaction.reply(`Server name: ${interaction.guild.name}\nTotal members: ${interaction.guild.memberCount}`);
  },
};
