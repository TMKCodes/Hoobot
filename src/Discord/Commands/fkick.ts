import { SlashCommandBuilder } from "discord.js";

export default {
  builder: new SlashCommandBuilder()
    .setName("fkick")
    .setDescription("Select a member and kick them (but not really).")
    .addUserOption((option) => option.setName("target").setDescription("The member to kick")),
  execute: async (interaction: { options: any; reply: (arg0: string) => any }) => {
    const member = interaction.options.getMember("target");
    if (!member) {
      return interaction.reply("Please specify a valid member to fake kick.");
    }
    return interaction.reply(`You wanted to kick: ${member.user.username}`);
  },
};
