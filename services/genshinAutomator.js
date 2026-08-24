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

    // Old hoyo-codes/category URL was dead — this one is live and returns real codes.
    const res = await axios.get("https://db.hashblen.com/codes").catch(() => null);
    if (!res || !res.data || !res.data.genshin) return;

    const currentCodes = res.data.genshin; // [{ code, description, added_at }]
    const newCodes = currentCodes.filter(c => !knownCodes.includes(c.code));

    if (newCodes.length > 0 && knownCodes.length > 0) {
      newCodes.forEach(c => {
        const rewards = c.description
          ? c.description.split(";").map(r => `• ${r.trim()}`).join("\n")
          : "• Primogems (exact reward not listed)";

        const embed = new EmbedBuilder()
          .setTitle("🎁 New Redeem Code!")
          .setColor("#F2C078") // warm gold, matches Genshin gift-code aesthetic better than pure red alert
          .setThumbnail("https://static.wikia.nocookie.net/gensin-impact/images/7/7a/Item_Primogem.png")
          .addFields(
            { name: "Code", value: `\`\`\`${c.code}\`\`\``, inline: false }, // code block = easy tap-to-copy, no backtick clutter
            { name: "Rewards", value: rewards, inline: false }
          )
          .setURL(`https://genshin.hoyoverse.com/en/gift?code=${c.code}`)
          .setFooter({ text: "Tap the title to redeem • Furina Auto-Scanner" })
          .setTimestamp();

        channel.send({ content: "🔔 New code just dropped!", embeds: [embed] });
      });
    }

    knownCodes = currentCodes.map(c => c.code);
  } catch (err) {
    console.error("Auto Code Scanner Error:", err);
  }
}

async function checkDailyReset(client) {
  try {
    const channel = await client.channels.fetch(CHANNELS.DAILY_REMINDERS).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle("🌅 Daily Reset")
      .setColor("#4FC3F7") // lighter Hydro-ish blue, less "generic Discord blurple"
      .setThumbnail("https://static.wikia.nocookie.net/gensin-impact/images/e/e2/Item_Original_Resin.png")
      .setDescription("Server reset is done — here's today's checklist:")
      .addFields(
        { name: "✅ To Do", value: "• Daily Commissions (4/4)\n• Expedition Rewards\n• Battle Pass Dailies\n• Serenitea Pot Currency", inline: false }
      )
      .setFooter({ text: "Furina Bot • Daily Scheduler" })
      .setTimestamp();

    channel.send({ embeds: [embed] });
  } catch (err) {
    console.error("Daily Reset Automation Error:", err);
  }
}

module.exports = { startAutomation };