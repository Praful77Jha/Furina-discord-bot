const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID } = require("../../genshinConfig");
const { getElementStyle } = require("../../elementStyle");
const { createCanvas, loadImageSafe, drawImageCover, drawReadabilityGradient, roundRect } = require("../../canvasRenderer");

const CARD_W = 900;
const CARD_H = 400;

async function renderBannerCard(banner, index) {
  const canvas = createCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext("2d");

  const fiveStarChar = (banner.characters || []).find(c => c.rarity === 5) || banner.characters?.[0];
  const style = getElementStyle(fiveStarChar?.element);
  const colorHex = `#${style.color.toString(16).padStart(6, "0")}`;

  ctx.fillStyle = "#0B0E14";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const art = await loadImageSafe(fiveStarChar?.icon);
  if (art) drawImageCover(ctx, art, 0, 0, CARD_W, CARD_H);
  drawReadabilityGradient(ctx, CARD_W, CARD_H, "bottom");

  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, CARD_W, 4);

  const tag = index === 0 ? "CURRENT BANNER" : "UPCOMING BANNER";
  const tagWidth = ctx.measureText(tag).width + 24;
  roundRect(ctx, 24, 20, tagWidth, 28, 6);
  ctx.fillStyle = colorHex;
  ctx.fill();
  ctx.fillStyle = "#000000";
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(tag, 36, 39);

  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 32px sans-serif";
  ctx.fillText(banner.name || "Event Wish", 30, CARD_H - 120);

  const charList = (banner.characters || []).map(c => {
    const s = getElementStyle(c.element);
    return `${s.emoji} ${c.name}`;
  }).join("  ");
  ctx.font = "17px sans-serif";
  ctx.fillStyle = "#D0D8E4";
  ctx.fillText(charList || "N/A", 30, CARD_H - 88);

  const weaponList = (banner.weapons || []).map(w => w.name).join(", ");
  if (weaponList) {
    ctx.fillStyle = "#FFD700";
    ctx.font = "15px sans-serif";
    ctx.fillText(`⚔ ${weaponList}`, 30, CARD_H - 62);
  }

  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#6B7A8C";
  const endLabel = banner.end_time ? new Date(banner.end_time * 1000).toLocaleDateString() : "End of Phase";
  ctx.fillText(`Ends: ${endLabel}${banner.version ? `  •  v${banner.version}` : ""}`, 30, CARD_H - 24);

  return canvas.toBuffer("image/png");
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
      const buffers = await Promise.all(cards.map((b, i) => renderBannerCard(b, i)));
      const attachments = buffers.map((buf, i) => new AttachmentBuilder(buf, { name: `banner${i}.png` }));

      await interaction.editReply({ files: attachments });

    } catch (error) {
      console.error(error);
      return interaction.editReply("Could not fetch banner details right now.");
    }
  }
};
