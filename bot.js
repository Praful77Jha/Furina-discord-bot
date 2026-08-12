const { Client, GatewayIntentBits } = require('discord.js');
require('.env').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.once('ready', () => {
    console.log(`Bot online as ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
    if (message.author.bot) return; // ignore bot's own messages

    if (message.content === '!ping') {
        message.reply('Pong! Bot is working ✅');
    }
});

client.login(process.env.DISCORD_TOKEN);