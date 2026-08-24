const axios = require("axios");
const { EmbedBuilder } = require("discord.js");
const { CHANNELS } = require("../genshinConfig");

let knownCodes = [];

function startAutomation(client) {
  setInterval(() => checkNewCodes(client), 30 * 60 * 1000);
  setInterval(() => checkDailyReset(client), 24 * 60 * 60 * 1000);
}

async function checkNewCodes(client) {
  try {
    const channel = await client.channels.fetch(CHANNELS.REDEEM_CODES).catch(() => null);
    if (!channel) return;

    const res = await axios.get("https://raw.githubusercontent.com/hoyo-codes/category/main/genshin.json").catch(() => null);
    if (!res || !res.data) return;

    const currentCodes = res.data;
    const newCodes = currentCodes.filter(c => !knownCodes.includes(c.code || c));

    if (newCodes.length > 0 && knownCodes.length > 0) {
      newCodes.forEach(c => {
        const code = c.code || c;
        const reward = c.rewards || c.reward || "Primogems";
        const embed = new EmbedBuilder()
          .setTitle("🚨 NEW REDEEM CODE DETECTED!")
          .setColor("#FF0000")
          .setDescription(`**Code:** \`${code}\`\n**Rewards:** ${reward}\n\n[👉 Click Here to Auto-Claim](https://genshin.hoyoverse.com/en/gift?code=${code})`)
          .setFooter({ text: "Furina Discord Bot Auto-Scanner" });

        channel.send({ content: "@everyone New Genshin Code dropped!", embeds: [embed] });
      });
    }

    knownCodes = currentCodes.map(c => c.code || c);
  } catch (err) {
    console.error("Auto Code Scanner Error:", err);
  }
}

async function checkDailyReset(client) {
  try {
    const channel = await client.channels.fetch(CHANNELS.DAILY_REMINDERS).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle("🔔 Daily Reset & Domain Rotation Notice")
      .setColor("#3498DB")
      .setDescription("Daily server reset is complete! Remember to complete your daily commissions and spend your Original Resin.")
      .addFields(
        { name: "Daily Checklist", value: "• Daily Commissions (4/4)\n• Expedition Rewards\n• Battle Pass Dailies\n• Serenitea Pot Realm Currency" }
      )
      .setFooter({ text: "Furina Bot • Daily Scheduler" });

    channel.send({ embeds: [embed] });
  } catch (err) {
    console.error("Daily Reset Automation Error:", err);
  }
}

module.exports = { startAutomation };