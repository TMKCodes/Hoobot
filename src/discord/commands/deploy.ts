import { REST, RESTPostAPIChatInputApplicationCommandsJSONBody, Routes } from 'discord.js';

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_SERVER_ID;

export const deployCommands = (commands: RESTPostAPIChatInputApplicationCommandsJSONBody[]) => {
  if(token === undefined) {
    console.log("Discord bot token has not been set.");
  } else if(clientId === undefined) {
    console.log("Discord bot token has not been set.");
  } else if(guildId === undefined) {
    console.log("Discord bot token has not been set.");
  } else {
    const rest = new REST({version: '10'}).setToken(token);
    (async () => {
      try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);
        await rest.put(
          Routes.applicationGuildCommands(clientId, guildId),
          { body: commands }
        );
        console.log(`Succesfully reloaded application (/) commands.`);
      } catch (error) {
        console.log(error);
      }
    })();
  }
}