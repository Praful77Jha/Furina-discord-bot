const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID, UIDS } = require("../../genshinConfig");
const { getCharacterInfo } = require("../../enkaCharacterData");
const { getElementStyle } = require("../../elementStyle");
const { createCanvas, loadImageSafe, drawImageCover, drawReadabilityGradient, cvBarText, roundRect } = require("../../canvasRenderer");

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

  ctx.fillStyle = "#0D0F16";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const splash = await loadImageSafe(charInfo?.splashArt);
  if (splash) {
    drawImageCover(ctx, splash, 0, 0, CARD_W * 0.52, CARD_H);
  }
  drawReadabilityGradient(ctx, CARD_W, CARD_H, "right");

  const colorHex = `#${style.color.toString(16).padStart(6, "0")}`;
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, 6, CARD_H);

  const name = charInfo?.name || `Character ${avatar.avatarId}`;
  const level = avatar.propMap?.["4001"]?.val || "N/A";

  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 38px sans-serif";
  ctx.fillText(`${style.emoji} ${name}`, 40, 58);

  ctx.font = "18px sans-serif";
  ctx.fillStyle = "#8899B0";
  ctx.fillText(`${playerInfo.nickname}  •  Lv.${level}  •  UID ${targetUid}`, 40, 84);

  const panelX = 480;
  const panelW = CARD_W - panelX - 30;

  roundRect(ctx, panelX - 16, 28, panelW + 32, 340, 12);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fill();

  const stats = extractStats(avatar);
  let rowY = 70;
  const rowGap = 36;

  ctx.font = "bold 15px sans-serif";
  ctx.fillStyle = colorHex;
  ctx.fillText("STATS", panelX, rowY);
  rowY += 30;

  const statRows = [
    ["Max HP", stats.hp.toLocaleString()],
    ["ATK", stats.atk.toLocaleString()],
    ["DEF", stats.def.toLocaleString()],
    ["Elemental Mastery", stats.em.toLocaleString()],
    ["Crit Rate", stats.critRate],
    ["Crit DMG", stats.critDmg],
    ["Energy Recharge", stats.er]
  ];

  statRows.forEach(([label, value]) => {
    ctx.textAlign = "left";
    ctx.fillStyle = "#7A8AA0";
    ctx.font = "16px sans-serif";
    ctx.fillText(label, panelX, rowY);
    ctx.textAlign = "right";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(value, panelX + panelW - 20, rowY);
    rowY += rowGap;
  });

  const cv = calculateCV(avatar.equipList);
  const cvNum = parseFloat(cv);
  const { bar, tier } = cvBarText(cv);

  let tierColor = "#FF6B6B";
  if (cvNum >= 220) tierColor = "#FFD700";
  else if (cvNum >= 180) tierColor = "#5CD7A6";
  else if (cvNum >= 140) tierColor = "#4FC3F7";
  else if (cvNum >= 100) tierColor = "#B8C4D9";

  roundRect(ctx, panelX - 16, rowY - 8, panelW + 32, 90, 12);
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fill();

  rowY += 12;
  ctx.textAlign = "left";
  ctx.fillStyle = "#7A8AA0";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText("ARTIFACT CV", panelX, rowY);
  rowY += 28;
  ctx.font = "bold 22px monospace";
  ctx.fillStyle = tierColor;
  ctx.fillText(`${cv}`, panelX, rowY);
  ctx.font = "bold 16px sans-serif";
  ctx.fillStyle = tierColor;
  ctx.fillText(`  ${tier}`, panelX + 70, rowY);
  rowY += 28;
  ctx.font = "16px monospace";
  ctx.fillStyle = "#556677";
  ctx.fillText(bar, panelX, rowY);

  ctx.textAlign = "left";
  ctx.font = "13px sans-serif";
  ctx.fillStyle = "#445566";
  ctx.fillText("Furina Discord Bot  •  Enka Network API", 40, CARD_H - 18);

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
