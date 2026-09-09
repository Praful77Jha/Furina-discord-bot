const axios = require("axios");
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { CHANNELS, UIDS } = require("../genshinConfig");
const codeCommand = require("../commands/genshin/code");
const reminderCommand = require("../commands/genshin/reminders");

const HEADERS = { "User-Agent": "FurinaDiscordBot/1.0" };

let knownCodes = [];

const RESET_HOUR_UTC = 20;

function msUntilNextReset() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), RESET_HOUR_UTC, 0, 0));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

function startAutomation(client) {
  setInterval(() => checkNewCodes(client), 30 * 60 * 1000);

  setTimeout(() => {
    postDailyReminderCard(client);
    postDailyCodesRoundup(client);
    postCurrentBanners(client);
    setInterval(() => postDailyReminderCard(client), 24 * 60 * 60 * 1000);
    setInterval(() => postDailyCodesRoundup(client), 24 * 60 * 60 * 1000);
    setInterval(() => postCurrentBanners(client), 24 * 60 * 60 * 1000);
  }, msUntilNextReset());
}

async function checkNewCodes(client) {
  try {
    const channel = await client.channels.fetch(CHANNELS.REDEEM_CODES).catch(() => null);
    if (!channel) return;

    const res = await axios.get("https://api.ennead.cc/mihoyo/genshin/codes", { headers: HEADERS }).catch(() => null);
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

async function postDailyReminderCard(client) {
  try {
    const channel = await client.channels.fetch(CHANNELS.DAILY_REMINDERS).catch(() => null);
    if (!channel) return;

    const buffer = await reminderCommand.renderReminderCard();
    const attachment = new AttachmentBuilder(buffer, { name: "reminders.png" });
    const row = reminderCommand.buildChecklistRow("auto");

    await channel.send({ files: [attachment], components: [row] });
  } catch (err) {
    console.error("Daily Reminder Card Error:", err);
  }
}

async function postCurrentBanners(client) {
  try {
    const channel = await client.channels.fetch(CHANNELS.BANNER_EVENTS).catch(() => null);
    if (!channel) return;

    const response = await axios.get("https://api.ennead.cc/mihoyo/genshin/calendar", { headers: HEADERS }).catch(() => null);
    const banners = response?.data?.banners || [];
    if (banners.length === 0) return;

    const bannerCommand = require("../commands/genshin/banner");

    const { getElementStyle } = require("../elementStyle");
    const { createCanvas, loadImageSafe, drawImageCover, drawReadabilityGradient, roundRect } = require("../canvasRenderer");

    const BANNER_W = 380;
    const BANNER_H = 420;
    const GAP = 16;

    async function renderSingleBanner(ctx, banner, x, y, index) {
      const fiveStarChar = (banner.characters || []).find(c => c.rarity === 5) || banner.characters?.[0];
      const style = getElementStyle(fiveStarChar?.element);
      const colorHex = `#${style.color.toString(16).padStart(6, "0")}`;

      roundRect(ctx, x, y, BANNER_W, BANNER_H, 12);
      ctx.save();
      ctx.clip();

      ctx.fillStyle = "#0B0E14";
      ctx.fillRect(x, y, BANNER_W, BANNER_H);

      const art = await loadImageSafe(fiveStarChar?.icon);
      if (art) drawImageCover(ctx, art, x, y, BANNER_W, BANNER_H);
      drawReadabilityGradient(ctx, BANNER_W, BANNER_H, "bottom");

      ctx.restore();

      ctx.fillStyle = colorHex;
      ctx.fillRect(x, y, BANNER_W, 4);

      const tag = index === 0 ? "CURRENT" : "UPCOMING";
      ctx.font = "bold 11px sans-serif";
      const tagW = ctx.measureText(tag).width + 16;
      roundRect(ctx, x + 12, y + 14, tagW, 22, 5);
      ctx.fillStyle = colorHex;
      ctx.fill();
      ctx.fillStyle = "#000000";
      ctx.fillText(tag, x + 20, y + 30);

      ctx.textAlign = "left";
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 18px sans-serif";
      const name = banner.name || "Event Wish";
      ctx.fillText(name.length > 22 ? name.slice(0, 20) + "…" : name, x + 16, y + BANNER_H - 100);

      const charList = (banner.characters || []).map(c => {
        const s = getElementStyle(c.element);
        return `${s.emoji} ${c.name}`;
      }).join("  ");
      ctx.font = "13px sans-serif";
      ctx.fillStyle = "#C8D0DC";
      ctx.fillText(charList || "N/A", x + 16, y + BANNER_H - 74);

      const weaponList = (banner.weapons || []).map(w => w.name).join(", ");
      if (weaponList) {
        ctx.fillStyle = "#FFD700";
        ctx.font = "12px sans-serif";
        const wl = weaponList.length > 30 ? weaponList.slice(0, 28) + "…" : weaponList;
        ctx.fillText(`⚔ ${wl}`, x + 16, y + BANNER_H - 52);
      }

      ctx.font = "12px sans-serif";
      ctx.fillStyle = "#6B7A8C";
      const endLabel = banner.end_time ? new Date(banner.end_time * 1000).toLocaleDateString() : "End of Phase";
      ctx.fillText(`Ends: ${endLabel}${banner.version ? `  •  v${banner.version}` : ""}`, x + 16, y + BANNER_H - 22);
    }

    const cards = banners.slice(0, 4);
    const count = cards.length;
    const totalW = count * BANNER_W + (count - 1) * GAP + 40;
    const canvas = createCanvas(totalW, BANNER_H + 60);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#0B0E14";
    ctx.fillRect(0, 0, totalW, BANNER_H + 60);
    ctx.fillStyle = "#4FC3F7";
    ctx.fillRect(0, 0, totalW, 4);

    ctx.textAlign = "left";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("🎯 Banners", 20, 38);

    for (let i = 0; i < count; i++) {
      const x = 20 + i * (BANNER_W + GAP);
      await renderSingleBanner(ctx, cards[i], x, 54, i);
    }

    const buffer = canvas.toBuffer("image/png");
    const attachment = new AttachmentBuilder(buffer, { name: "banners.png" });

    await channel.send({ files: [attachment] });
  } catch (err) {
    console.error("Daily Banner Post Error:", err);
  }
}

module.exports = { startAutomation };
