import { REST, RESTPostAPIChatInputApplicationCommandsJSONBody, Routes } from "discord.js";
import { ConfigOptions } from "src/Hoobot/Utilities/Args";
import { logToFile } from "../../Hoobot/Utilities/LogToFile";

// const token = process.env.DISCORD_BOT_TOKEN;
// const clientId = process.env.DISCORD_APPLICATION_ID;
// const guildId = process.env.DISCORD_SERVER_ID;

export const deployCommands = async (
  commands: RESTPostAPIChatInputApplicationCommandsJSONBody[],
  options: ConfigOptions,
) => {
  if (options.discord.token === undefined) {
    console.log(JSON.stringify(process.env));
    console.log("Discord bot token has not been set.");
    return;
  }
  if (options.discord.applicationId === undefined) {
    console.log(JSON.stringify(process.env));
    console.log("Discord bot application id has not been set.");
    return;
  }
  if (options.discord.serverId === undefined) {
    console.log(JSON.stringify(process.env));
    console.log("Discord bot server id has not been set.");
    return;
  }
  const rest = new REST({ version: "10" }).setToken(options.discord.token);
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);
    await rest.put(Routes.applicationGuildCommands(options.discord.applicationId, options.discord.serverId), {
      body: commands,
    });
    console.log(`Successfully reloaded application (/) commands.`);
  } catch (error) {
    logToFile("./logs/error.log", JSON.stringify(error, null, 4));
    console.error(error);
  }
};
