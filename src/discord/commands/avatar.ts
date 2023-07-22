import { SlashCommandBuilder } from 'discord.js';

export default {
  builder: new SlashCommandBuilder()
                .setName('avatar')
                .setDescription('Get the avatar URL of the selected user, or your own avatar.')
                .addUserOption(option => option.setName('target').setDescription('The user\'s avatar to show')),
  execute: async (interaction: {
    user: any;
    options: any; 
    reply: (arg0: string) => any; 
  }) => {
    const user = interaction.options.getUser('target');
		if (user) return interaction.reply(`${user.username}'s avatar: ${user.displayAvatarURL()}`);
		return interaction.reply(`Your avatar: ${interaction.user.displayAvatarURL()}`);
  }
}
