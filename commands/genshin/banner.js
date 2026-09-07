const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID } = require("../../genshinConfig");
const { getElementStyle } = require("../../elementStyle");
const { createCanvas, loadImageSafe, drawImageCover, drawReadabilityGradient } = require("../../canvasRenderer");

const CARD_W = 800;
const CARD_H = 320;

async function renderBannerCard(banner) {
  const canvas = createCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext("2d");

  const fiveStarChar = (banner.characters || []).find(c => c.rarity === 5) || banner.characters?.[0];
  const style = getElementStyle(fiveStarChar?.element);
  const colorHex = `#${style.color.toString(16).padStart(6, "0")}`;

  ctx.fillStyle = "#12141C";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const art = await loadImageSafe(fiveStarChar?.icon);
  if (art) drawImageCover(ctx, art, 0, 0, CARD_W, CARD_H);
  drawReadabilityGradient(ctx, CARD_W, CARD_H, "bottom");

  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, CARD_W, 6);

  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 30px sans-serif";
  ctx.fillText(`${style.emoji} ${banner.name || "Event Wish Banner"}`, 30, CARD_H - 110);

  const charList = (banner.characters || []).map(c => c.name).join(", ") || "N/A";
  ctx.font = "18px sans-serif";
  ctx.fillStyle = "#E4E9F2";
  ctx.fillText(`Featured: ${charList}`, 30, CARD_H - 78);

  const weaponList = (banner.weapons || []).map(w => w.name).join(", ");
  if (weaponList) {
    ctx.fillText(`Weapons: ${weaponList}`, 30, CARD_H - 50);
  }

  ctx.font = "16px sans-serif";
  ctx.fillStyle = "#B8C4D9";
  const endLabel = banner.end_time ? new Date(banner.end_time * 1000).toLocaleDateString() : "End of Phase";
  ctx.fillText(`Ends: ${endLabel}${banner.version ? `  •  v${banner.version}` : ""}`, 30, CARD_H - 20);

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
      const buffers = await Promise.all(cards.map(renderBannerCard));
      const attachments = buffers.map((buf, i) => new AttachmentBuilder(buf, { name: `banner${i}.png` }));

      await interaction.editReply({ files: attachments });

    } catch (error) {
      console.error(error);
      return interaction.editReply("Could not fetch banner details right now.");
    }
  }
};
