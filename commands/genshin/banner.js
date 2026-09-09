const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID } = require("../../genshinConfig");
const { getElementStyle } = require("../../elementStyle");
const { createCanvas, loadImageSafe, drawImageCover, drawReadabilityGradient, roundRect } = require("../../canvasRenderer");

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
  if (banner.end_time) {
    const endDate = new Date(banner.end_time * 1000);
    const diff = endDate.getTime() - Date.now();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const countdown = diff > 0 ? `${days}d ${hours}h left` : "Ending soon";
    ctx.fillText(`${countdown}  •  v${banner.version || "?"}`, x + 16, y + BANNER_H - 22);
  } else {
    ctx.fillText(`End of Phase${banner.version ? `  •  v${banner.version}` : ""}`, x + 16, y + BANNER_H - 22);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("banner")
    .setDescription("Check current and upcoming Genshin Impact banners."),

  async execute(interaction) {
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({ content: "This command can only be used inside the Genshin category.", ephemeral: true });
    }
    if (interaction.channelId !== CHANNELS.BANNER_EVENTS) {
      return interaction.reply({ content: `Please use this command in <#${CHANNELS.BANNER_EVENTS}>.`, ephemeral: true });
    }

    await interaction.deferReply();

    try {
      const response = await axios.get("https://api.ennead.cc/mihoyo/genshin/calendar").catch(() => null);
      const banners = response?.data?.banners || [];

      if (banners.length === 0) {
        return interaction.editReply("No active banners found — check in-game announcements for version updates!");
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

      await interaction.editReply({ files: [attachment] });

    } catch (error) {
      console.error(error);
      return interaction.editReply("Could not fetch banner details right now.");
    }
  }
};
