import { REST, RESTPostAPIChatInputApplicationCommandsJSONBody, Routes } from 'discord.js';
import { DiscordOptions } from "../../Hoobot/Utilities/Args";
import { logToFile } from '../../Hoobot/Utilities/LogToFile';

// const token = process.env.DISCORD_BOT_TOKEN;
// const clientId = process.env.DISCORD_APPLICATION_ID;
// const guildId = process.env.DISCORD_SERVER_ID;

export const deployCommands = async (
  commands: RESTPostAPIChatInputApplicationCommandsJSONBody[],
  discord: DiscordOptions | undefined
) => {
  if (!discord?.token) {
    console.log("Discord: token not set, skipping command deploy.");
    return;
  }
  if (!discord.applicationId) {
    console.log("Discord: applicationId not set, skipping command deploy.");
    return;
  }
  if (!discord.serverId) {
    console.log("Discord: serverId not set, skipping command deploy.");
    return;
  }
  const rest = new REST({ version: "10" }).setToken(discord.token);
  try {
    console.log(`Discord: refreshing ${commands.length} (/) commands.`);
    await rest.put(
      Routes.applicationGuildCommands(discord.applicationId, discord.serverId),
      { body: commands }
    );
    console.log("Discord: application (/) commands reloaded.");
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error("Discord deploy error:", error);
  }
};