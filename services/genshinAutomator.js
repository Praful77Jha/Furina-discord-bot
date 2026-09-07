const axios = require("axios");
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { CHANNELS, UIDS } = require("../genshinConfig");
const codeCommand = require("../commands/genshin/code");
const reminderCommand = require("../commands/genshin/reminders");

let knownCodes = [];

// Adjust to your server's actual reset hour in UTC.
// Asia server resets 04:00 (UTC+8) = 20:00 UTC the previous day.
// America resets 04:00 (UTC-5) = 09:00 UTC. Europe resets 04:00 (UTC+1) = 03:00 UTC.
const RESET_HOUR_UTC = 20; // currently set for Asia server — change if MAIN/ALT UIDs are on a different server

function msUntilNextReset() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), RESET_HOUR_UTC, 0, 0));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

function startAutomation(client) {
  setInterval(() => checkNewCodes(client), 30 * 60 * 1000);

  // Align both 24h jobs to the actual daily reset instead of 24h-from-bot-start,
  // then keep them on a stable 24h cadence from that point.
  setTimeout(() => {
    postDailyReminderCard(client);
    postDailyCodesRoundup(client);
    setInterval(() => postDailyReminderCard(client), 24 * 60 * 60 * 1000);
    setInterval(() => postDailyCodesRoundup(client), 24 * 60 * 60 * 1000);
  }, msUntilNextReset());
}

async function checkNewCodes(client) {
  try {
    const channel = await client.channels.fetch(CHANNELS.REDEEM_CODES).catch(() => null);
    if (!channel) return;

    const res = await axios.get("https://api.ennead.cc/mihoyo/genshin/codes").catch(() => null);
    const currentCodes = res?.data?.active || [];
    if (currentCodes.length === 0) return;

    const newCodes = currentCodes.filter(c => !knownCodes.includes(c.code));

    if (newCodes.length > 0 && knownCodes.length > 0) {
      newCodes.forEach(c => {
        const rewards = Array.isArray(c.rewards) ? c.rewards.join(", ") : "Primogems";
        const embed = new EmbedBuilder()
          .setTitle("🚨 NEW REDEEM CODE DETECTED!")
          .setColor("#FF0000")
          .setDescription(`**Code:** \`${c.code}\`\n**Rewards:** ${rewards}\n\n[👉 Click Here to Auto-Claim](https://genshin.hoyoverse.com/en/gift?code=${c.code})`)
          .setFooter({ text: "Furina Discord Bot Auto-Scanner" });

        channel.send({ content: "@everyone New Genshin Code dropped!", embeds: [embed] });
      });
    }

    knownCodes = currentCodes.map(c => c.code);
  } catch (err) {
    console.error("Auto Code Scanner Error:", err);
  }
}

// Runs once every 24h (aligned to reset): posts the full unclaimed-codes
// list for both accounts, same tick buttons as running /codes manually.
async function postDailyCodesRoundup(client) {
  try {
    const channel = await client.channels.fetch(CHANNELS.REDEEM_CODES).catch(() => null);
    if (!channel) return;

    for (const [label, uid] of [["MAIN", UIDS.MAIN], ["ALT", UIDS.ALT]]) {
      const payload = await codeCommand.buildCodesPayload(uid, label);
      await channel.send(payload);
    }
  } catch (err) {
    console.error("Daily Codes Roundup Error:", err);
  }
}

// Runs once every 24h (aligned to reset): posts the reminder card + a fresh
// checklist row. Individual users' ticks are tracked per-button-press
// (see reminders.js handleChecklistToggle), not baked into this image.
async function postDailyReminderCard(client) {
  try {
    const channel = await client.channels.fetch(CHANNELS.DAILY_REMINDERS).catch(() => null);
    if (!channel) return;

    const buffer = await reminderCommand.renderReminderCard();
    const attachment = new AttachmentBuilder(buffer, { name: "reminders.png" });
    const row = reminderCommand.buildChecklistRow("auto"); // fresh day, nobody's ticked yet

    await channel.send({ files: [attachment], components: [row] });
  } catch (err) {
    console.error("Daily Reminder Card Error:", err);
  }
}

module.exports = { startAutomation };
