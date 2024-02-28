/* =====================================================================
* Hoobot - Proprietary License
* Copyright (c) 2023 Hoosat Oy. All rights reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are not permitted without prior written permission
* from Hoosat Oy. Unauthorized reproduction, copying, or use of this
* software, in whole or in part, is strictly prohibited. All 
* modifications in source or binary must be submitted to Hoosat Oy in source format.
*
* THIS SOFTWARE IS PROVIDED BY HOOSAT OY "AS IS" AND ANY EXPRESS OR
* IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
* WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
* ARE DISCLAIMED. IN NO EVENT SHALL HOOSAT OY BE LIABLE FOR ANY DIRECT,
* INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
* (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
* SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
* HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
* STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
* ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
* OF THE POSSIBILITY OF SUCH DAMAGE.
*
* The user of this software uses it at their own risk. Hoosat Oy shall
* not be liable for any losses, damages, or liabilities arising from
* the use of this software.
* ===================================================================== */

import { REST, RESTPostAPIChatInputApplicationCommandsJSONBody, Routes } from 'discord.js';
import { ConfigOptions } from 'src/Hoobot/Utilities/args';
import { logToFile } from '../../Hoobot/Utilities/logToFile';

// const token = process.env.DISCORD_BOT_TOKEN;
// const clientId = process.env.DISCORD_APPLICATION_ID;
// const guildId = process.env.DISCORD_SERVER_ID;

export const deployCommands = (commands: RESTPostAPIChatInputApplicationCommandsJSONBody[], options: ConfigOptions) => {
  if(options.discord.token === undefined) {
    console.log(JSON.stringify(process.env));
    console.log("Discord bot token has not been set.");
  } else if(options.discordApplicationID === undefined) {
    console.log(JSON.stringify(process.env));
    console.log("Discord bot token has not been set.");
  } else if(options.discordServerID === undefined) {
    console.log(JSON.stringify(process.env));
    console.log("Discord bot token has not been set.");
  } else {
    const rest = new REST({version: '10'}).setToken(options.discord.token);
    (async () => {
      try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);
        await rest.put(
          Routes.applicationGuildCommands(options.discord.applicationId!, options.discord.channelId!),
          { body: commands }
        );
        console.log(`Succesfully reloaded application (/) commands.`);
      } catch (error) {
        logToFile("./logs/error.log", JSON.stringify(error));
        console.error(error);
      }
    })();
  }
}