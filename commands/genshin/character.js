const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID } = require("../../genshinConfig");
const { findCharacterByName } = require("../../enkaCharacterData");
const { getElementStyle } = require("../../elementStyle");
const { createCanvas, loadImageSafe, drawImageCover, drawReadabilityGradient, roundRect } = require("../../canvasRenderer");

const CARD_W = 900;
const CARD_H = 620;

async function renderCharacterCard(enkaChar, dbChar) {
  const canvas = createCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext("2d");
  const style = getElementStyle(enkaChar.element);
  const colorHex = `#${style.color.toString(16).padStart(6, "0")}`;

  ctx.fillStyle = "#0D0F16";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const splash = await loadImageSafe(enkaChar.splashArt);
  if (splash) {
    drawImageCover(ctx, splash, 0, 0, CARD_W * 0.45, CARD_H);
  }
  drawReadabilityGradient(ctx, CARD_W, CARD_H, "right");

  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, 8, CARD_H);

  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 36px sans-serif";
  ctx.fillText(`${style.emoji} ${enkaChar.name}`, 40, 55);

  ctx.font = "18px sans-serif";
  ctx.fillStyle = "#B8C4D9";
  const rarity = enkaChar.rarity ? "⭐".repeat(enkaChar.rarity) : "N/A";
  ctx.fillText(`${rarity}   ${style.label}   ${enkaChar.weaponType || "N/A"}`, 40, 82);

  const panelX = 420;
  let y = 55;

  if (dbChar?.skillTalents?.length) {
    ctx.fillStyle = colorHex;
    ctx.font = "bold 17px sans-serif";
    ctx.fillText("🌀 TALENTS", panelX, y);
    y += 28;

    dbChar.skillTalents.forEach(t => {
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 15px sans-serif";
      ctx.fillText(t.name, panelX, y);
      y += 20;
      ctx.fillStyle = "#8899B0";
      ctx.font = "13px sans-serif";
      const desc = (t.description || "").split("\n")[0].slice(0, 80);
      ctx.fillText(desc + (desc.length >= 80 ? "…" : ""), panelX, y);
      y += 24;
    });

    if (dbChar.passiveTalents?.length) {
      y += 4;
      ctx.fillStyle = colorHex;
      ctx.font = "bold 15px sans-serif";
      ctx.fillText("PASSIVES", panelX, y);
      y += 22;
      dbChar.passiveTalents.slice(0, 3).forEach(p => {
        ctx.fillStyle = "#CCCCCC";
        ctx.font = "13px sans-serif";
        ctx.fillText(`• ${p.name}`, panelX, y);
        y += 18;
      });
    }
  }

  if (dbChar?.constellations?.length) {
    y += 10;
    ctx.fillStyle = colorHex;
    ctx.font = "bold 17px sans-serif";
    ctx.fillText("⭐ CONSTELLATIONS", panelX, y);
    y += 28;

    dbChar.constellations.forEach(c => {
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText(`C${c.level}`, panelX, y);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText(` ${c.name}`, panelX + 32, y);
      y += 18;
      ctx.fillStyle = "#8899B0";
      ctx.font = "12px sans-serif";
      const desc = (c.description || "").split("\n")[0].slice(0, 75);
      ctx.fillText(desc + (desc.length >= 75 ? "…" : ""), panelX, y);
      y += 20;
    });
  }

  ctx.font = "13px sans-serif";
  ctx.fillStyle = "#6B7688";
  ctx.fillText("Furina Discord Bot • Enka + genshin.jmp.blue", 40, CARD_H - 18);

  return canvas.toBuffer("image/png");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("character")
    .setDescription("Fetch talents, constellations, and info for a Genshin character.")
    .addStringOption(option =>
      option.setName("name").setDescription("Character name (e.g. furina, raiden, zhongli)").setRequired(true)
    ),

  async execute(interaction) {
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({ content: "This command can only be used inside the Genshin category.", ephemeral: true });
    }
    if (interaction.channelId !== CHANNELS.CHARACTER_INFO) {
      return interaction.reply({ content: `Please use this command in <#${CHANNELS.CHARACTER_INFO}>.`, ephemeral: true });
    }

    await interaction.deferReply();
    const query = interaction.options.getString("name");

    try {
      const enkaChar = await findCharacterByName(query);
      if (!enkaChar) {
        return interaction.editReply(`Could not find character \`${query}\`. Check the spelling and try again.`);
      }

      let dbChar = null;
      try {
        const dbRes = await axios.get(`https://genshin.jmp.blue/characters/${enkaChar.name.toLowerCase()}`, { timeout: 10000 });
        dbChar = dbRes.data;
      } catch {
        // genshin.jmp.blue may not have every character — fall back to basic info only
      }

      const buffer = await renderCharacterCard(enkaChar, dbChar);
      const attachment = new AttachmentBuilder(buffer, { name: "character.png" });
      await interaction.editReply({ files: [attachment] });

    } catch (error) {
      console.error(error);
      return interaction.editReply(`Could not find character \`${query}\`. Check the spelling and try again.`);
    }
  }
};
