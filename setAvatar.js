require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  try {
    await client.user.setAvatar('./assets/FURINA1_smoothed.png'); // adjust path/filename
    console.log('Avatar updated.');
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit();
});

client.login(process.env.DISCORD_TOKEN);