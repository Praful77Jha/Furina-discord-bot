const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID, UIDS } = require("../../genshinConfig");
const { readJSON, writeJSON } = require("../../dataStore");
const { createCanvas, roundRect } = require("../../canvasRenderer");

const CLAIMED_FILE = "claimedCodes.json";
const CARD_W = 700;

function loadClaimed() {
  return readJSON(CLAIMED_FILE, { [UIDS.MAIN]: [], [UIDS.ALT]: [] });
}

function saveClaimed(data) {
  writeJSON(CLAIMED_FILE, data);
}

function markClaimed(targetUid, code) {
  const data = loadClaimed();
  if (!data[targetUid]) data[targetUid] = [];
  if (!data[targetUid].includes(code)) data[targetUid].push(code);
  saveClaimed(data);
}

function unmarkClaimed(targetUid, code) {
  const data = loadClaimed();
  if (!data[targetUid]) return;
  data[targetUid] = data[targetUid].filter(c => c !== code);
  saveClaimed(data);
}

async function renderCodesCard(codes, accountLabel) {
  const CARD_H = 80 + codes.length * 90;
  const canvas = createCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0B0E14";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  ctx.fillStyle = "#FFD700";
  ctx.fillRect(0, 0, CARD_W, 4);

  ctx.textAlign = "left";
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 14px sans-serif";
  roundRect(ctx, 24, 18, 120, 26, 6);
  ctx.fill();
  ctx.fillStyle = "#000000";
  ctx.fillText("REDEEM CODES", 34, 36);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText(`🎁  Genshin Codes — ${accountLabel}`, 24, 74);

  let y = 110;
  codes.forEach((code, i) => {
    roundRect(ctx, 20, y, CARD_W - 40, 78, 10);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();

    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 18px monospace";
    ctx.fillText(code.code, 40, y + 30);

    const rewards = Array.isArray(code.rewards) ? code.rewards.join(", ") : "Primogems & Rewards";
    ctx.fillStyle = "#8899B0";
    ctx.font = "14px sans-serif";
    ctx.fillText(rewards, 40, y + 56);

    ctx.fillStyle = "#4FC3F7";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("TAP TO CLAIM →", CARD_W - 40, y + 30);
    ctx.textAlign = "left";

    y += 90;
  });

  return canvas.toBuffer("image/png");
}

async function buildCodesPayload(targetUid, accountLabel) {
  const response = await axios.get("https://api.ennead.cc/mihoyo/genshin/codes").catch(() => null);
  const activeCodes = response?.data?.active || [];
  const claimed = loadClaimed()[targetUid] || [];
  const unclaimed = activeCodes.filter(c => !claimed.includes(c.code));

  if (unclaimed.length === 0) {
    const canvas = createCanvas(CARD_W, 160);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#0B0E14";
    ctx.fillRect(0, 0, CARD_W, 160);
    ctx.fillStyle = "#2ECC71";
    ctx.fillRect(0, 0, CARD_W, 4);

    ctx.textAlign = "center";
    ctx.fillStyle = "#2ECC71";
    ctx.font = "bold 14px sans-serif";
    roundRect(ctx, CARD_W / 2 - 60, 18, 120, 26, 6);
    ctx.fill();
    ctx.fillStyle = "#000000";
    ctx.fillText("ALL CLAIMED", CARD_W / 2, 36);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("✅ No new codes — you're all caught up!", CARD_W / 2, 90);

    ctx.fillStyle = "#556677";
    ctx.font = "13px sans-serif";
    ctx.fillText("Furina Discord Bot • Auto Code Tracker", CARD_W / 2, 130);

    const attachment = new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "codes.png" });
    return { files: [attachment], components: [] };
  }

  const codesToShow = unclaimed.slice(0, 5);
  const buffer = await renderCodesCard(codesToShow, accountLabel);
  const attachment = new AttachmentBuilder(buffer, { name: "codes.png" });

  const redeemRow = new ActionRowBuilder().addComponents(
    codesToShow.map(c =>
      new ButtonBuilder().setLabel(`🎁 ${c.code}`).setStyle(ButtonStyle.Link).setURL(`https://genshin.hoyoverse.com/en/gift?code=${c.code}`)
    )
  );

  const tickRow = new ActionRowBuilder().addComponents(
    codesToShow.map(c =>
      new ButtonBuilder()
        .setCustomId(`codeclaim_${targetUid}_${c.code}`)
        .setLabel(`✅ Claimed`)
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { files: [attachment], components: [redeemRow, tickRow] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("codes")
    .setDescription("Fetch active Genshin redeem codes and tick off ones you've claimed.")
    .addStringOption(option =>
      option.setName("account").setDescription("Select account to check unredeemed status").addChoices(
        { name: "NORMIE (MAIN)", value: "main" },
        { name: "NOT_NORMIE (ALT)", value: "alt" }
      )
    ),

  async execute(interaction) {
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({ content: "This command can only be used inside the Genshin category.", ephemeral: true });
    }
    if (interaction.channelId !== CHANNELS.REDEEM_CODES) {
      return interaction.reply({ content: `Please use this command in <#${CHANNELS.REDEEM_CODES}>.`, ephemeral: true });
    }

    await interaction.deferReply();

    const accountChoice = interaction.options.getString("account") || "main";
    const targetUid = accountChoice === "alt" ? UIDS.ALT : UIDS.MAIN;

    try {
      const payload = await buildCodesPayload(targetUid, accountChoice.toUpperCase());
      await interaction.editReply(payload);
    } catch (error) {
      console.error(error);
      return interaction.editReply("Failed to fetch codes. Please try again later.");
    }
  },

  async handleClaimToggle(interaction) {
    const [, targetUid, code] = interaction.customId.split("_");
    markClaimed(targetUid, code);

    await interaction.deferUpdate();
    const accountLabel = targetUid === UIDS.ALT ? "ALT" : "MAIN";
    const payload = await buildCodesPayload(targetUid, accountLabel);
    await interaction.editReply(payload);
  },

  buildCodesPayload,
  markClaimed,
  unmarkClaimed
};
