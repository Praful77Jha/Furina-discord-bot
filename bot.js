require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();
const commandsArray = [];

// Recursively load all commands from subfolders
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      commandsArray.push(command.data.toJSON());
    } else {
      console.log(`[WARNING] The command at ${filePath} is missing "data" or "execute".`);
    }
  }
}

// Register Slash Commands with Discord
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log(`🔄 Registering ${commandsArray.length} slash commands...`);
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commandsArray }
    );
    console.log('✅ Slash commands successfully registered!');
  } catch (error) {
    console.error('❌ Slash Command Registration Error:', error);
  }
});

// Handle Slash Command Execution
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    const replyOptions = { content: `❌ Error: ${error.message}`, flags: 64 };
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(replyOptions);
      } else {
        await interaction.reply(replyOptions);
      }
    } catch (followUpError) {
      // Interaction was already invalid/acknowledged elsewhere (e.g. two bot
      // instances running at once) - log it but don't crash the process.
      console.error('Failed to send error reply:', followUpError.message);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
const http = require('http');
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('JACK Bot is running!');
}).listen(PORT, () => console.log(`Server listening on port ${PORT}`));