const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID, UIDS } = require("../../genshinConfig");
const { getCharacterInfo } = require("../../enkaCharacterData");
const { getElementStyle } = require("../../elementStyle");
const { createCanvas, loadImageSafe, drawImageCover, drawReadabilityGradient, cvBarText } = require("../../canvasRenderer");

const CARD_W = 900;
const CARD_H = 500;

const showcaseCache = new Map();

function calculateCV(equipList) {
  let totalCV = 0;
  if (!equipList) return "0.0";
  const artifacts = equipList.filter(item => item.flat?.itemType === "ITEM_RELIQUARY");
  artifacts.forEach(art => {
    const subStats = art.flat?.reliquarySubstats || [];
    subStats.forEach(sub => {
      if (sub.appendPropId === "FIGHT_PROP_CRITICAL") totalCV += sub.statValue * 2;
      if (sub.appendPropId === "FIGHT_PROP_CRITICAL_HURT") totalCV += sub.statValue;
    });
    const mainStat = art.flat?.reliquaryMainstat;
    if (mainStat) {
      if (mainStat.mainPropId === "FIGHT_PROP_CRITICAL") totalCV += mainStat.statValue * 2;
      if (mainStat.mainPropId === "FIGHT_PROP_CRITICAL_HURT") totalCV += mainStat.statValue;
    }
  });
  return totalCV.toFixed(1);
}

function extractStats(avatar) {
  const p = avatar.fightPropMap || {};
  return {
    hp: Math.round(p["2000"] || 0),
    atk: Math.round(p["2001"] || 0),
    def: Math.round(p["2002"] || 0),
    em: Math.round(p["28"] || 0),
    critRate: ((p["20"] || 0) * 100).toFixed(1) + "%",
    critDmg: ((p["22"] || 0) * 100).toFixed(1) + "%",
    er: ((p["23"] || 0) * 100).toFixed(1) + "%"
  };
}

async function renderCard(playerInfo, avatar, charInfo, targetUid) {
  const canvas = createCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext("2d");
  const style = getElementStyle(charInfo?.element);

  ctx.fillStyle = "#12141C";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const splash = await loadImageSafe(charInfo?.splashArt);
  if (splash) {
    drawImageCover(ctx, splash, 0, 0, CARD_W * 0.55, CARD_H);
  }
  drawReadabilityGradient(ctx, CARD_W, CARD_H, "right");

  const colorHex = `#${style.color.toString(16).padStart(6, "0")}`;
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, 8, CARD_H);

  const name = charInfo?.name || `Character ${avatar.avatarId}`;
  const level = avatar.propMap?.["4001"]?.val || "N/A";

  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 40px sans-serif";
  ctx.fillText(`${style.emoji} ${name}`, 40, 60);

  ctx.font = "20px sans-serif";
  ctx.fillStyle = "#B8C4D9";
  ctx.fillText(`${playerInfo.nickname} - Lv.${level} - UID ${targetUid}`, 40, 90);

  const stats = extractStats(avatar);
  const panelX = 500;
  let rowY = 150;
  const rowGap = 38;

  ctx.font = "bold 18px sans-serif";
  ctx.fillStyle = colorHex;
  ctx.fillText("STATS", panelX, rowY);
  rowY += 34;

  const statRows = [
    ["Max HP", stats.hp.toLocaleString()],
    ["ATK", stats.atk.toLocaleString()],
    ["DEF", stats.def.toLocaleString()],
    ["Elemental Mastery", stats.em.toLocaleString()],
    ["Crit Rate", stats.critRate],
    ["Crit DMG", stats.critDmg],
    ["Energy Recharge", stats.er]
  ];

  ctx.font = "18px sans-serif";
  statRows.forEach(([label, value]) => {
    ctx.textAlign = "left";
    ctx.fillStyle = "#B8C4D9";
    ctx.font = "18px sans-serif";
    ctx.fillText(label, panelX, rowY);
    ctx.textAlign = "right";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(value, panelX + 360, rowY);
    rowY += rowGap;
  });

  const cv = calculateCV(avatar.equipList);
  const { bar, tier } = cvBarText(cv);
  rowY += 10;
  ctx.textAlign = "left";
  ctx.fillStyle = "#B8C4D9";
  ctx.font = "16px sans-serif";
  ctx.fillText("ARTIFACT CV", panelX, rowY);
  rowY += 30;
  ctx.font = "bold 26px monospace";
  ctx.fillStyle = "#FFD700";
  ctx.fillText(bar, panelX, rowY);
  ctx.font = "bold 22px sans-serif";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(`${cv}  (${tier})`, panelX, rowY + 32);

  ctx.textAlign = "left";
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#6B7688";
  ctx.fillText("Furina Discord Bot - Enka Network API", 40, CARD_H - 20);

  return canvas.toBuffer("image/png");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("build")
    .setDescription("Fetch Genshin character showcase, CV breakdown, and artifact stats.")
    .addStringOption(option =>
      option.setName("account").setDescription("Select account preset").addChoices(
        { name: "NORMIE (MAIN)", value: "main" },
        { name: "NOT_NORMIE (ALT)", value: "alt" }
      )
    )
    .addStringOption(option => option.setName("uid").setDescription("Or type custom UID directly")),

  async execute(interaction) {
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({ content: "This command can only be used inside the Genshin category.", ephemeral: true });
    }
    if (interaction.channelId !== CHANNELS.BUILD_CHECK) {
      return interaction.reply({ content: `Please use this command in <#${CHANNELS.BUILD_CHECK}>.`, ephemeral: true });
    }

    await interaction.deferReply();

    const accountChoice = interaction.options.getString("account");
    const customUid = interaction.options.getString("uid");
    let targetUid = customUid || (accountChoice === "alt" ? UIDS.ALT : UIDS.MAIN);

    try {
      const response = await axios.get(`https://enka.network/api/uid/${targetUid}`);
      const data = response.data;

      if (!data.avatarInfoList || data.avatarInfoList.length === 0) {
        return interaction.editReply(`No showcased characters found for UID \`${targetUid}\`. Check character showcase settings in-game.`);
      }

      const playerInfo = data.playerInfo;
      const avatarList = data.avatarInfoList;
      showcaseCache.set(targetUid, { playerInfo, avatarList, fetchedAt: Date.now() });

      const selectOptions = await Promise.all(avatarList.map(async (avatar, index) => {
        const charInfo = await getCharacterInfo(avatar.avatarId);
        const style = getElementStyle(charInfo?.element);
        return {
          label: `${style.emoji} ${charInfo?.name || `Character ${avatar.avatarId}`}`,
          description: `Level ${avatar.propMap["4001"]?.val || "N/A"} - ${style.label}`,
          value: `${targetUid}_${index}`
        };
      }));

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("select_build_character")
          .setPlaceholder("Select a showcased character...")
          .addOptions(selectOptions)
      );

      const firstChar = avatarList[0];
      const firstCharInfo = await getCharacterInfo(firstChar.avatarId);
      const buffer = await renderCard(playerInfo, firstChar, firstCharInfo, targetUid);
      const attachment = new AttachmentBuilder(buffer, { name: "build.png" });

      await interaction.editReply({ files: [attachment], components: [row] });

    } catch (error) {
      console.error(error);
      return interaction.editReply(`Failed to fetch data for UID \`${targetUid}\`. API might be down or UID is invalid.`);
    }
  },

  async handleCharacterSelect(interaction) {
    const [targetUid, indexStr] = interaction.values[0].split("_");
    const index = parseInt(indexStr, 10);

    const cached = showcaseCache.get(targetUid);
    if (!cached) {
      return interaction.reply({ content: "This showcase has expired - run `/build` again to refresh it.", ephemeral: true });
    }

    const avatar = cached.avatarList[index];
    if (!avatar) {
      return interaction.reply({ content: "Couldn't find that character in the showcase.", ephemeral: true });
    }

    await interaction.deferUpdate();
    const charInfo = await getCharacterInfo(avatar.avatarId);
    const buffer = await renderCard(cached.playerInfo, avatar, charInfo, targetUid);
    const attachment = new AttachmentBuilder(buffer, { name: "build.png" });

    await interaction.editReply({ files: [attachment] });
  }
};
