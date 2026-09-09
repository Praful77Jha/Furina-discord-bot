const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID, UIDS } = require("../../genshinConfig");
const { readJSON, writeJSON } = require("../../dataStore");
const { createCanvas, roundRect, loadImageSafe } = require("../../canvasRenderer");

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

function getTimeUntilReset() {
  const now = new Date();
  const resetHour = 20;
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), resetHour, 0, 0));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  const diff = next.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m`;
}

function drawCheckbox(ctx, x, y, checked) {
  roundRect(ctx, x, y, 22, 22, 4);
  if (checked) {
    ctx.fillStyle = "#2ECC71";
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("✓", x + 11, y + 17);
    ctx.textAlign = "left";
  } else {
    ctx.strokeStyle = "#4A5568";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

async function renderCodesCard(codes, accountLabel, claimed) {
  const CARD_H = 100 + codes.length * 80;
  const canvas = createCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0B0E14";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  ctx.fillStyle = "#FFD700";
  ctx.fillRect(0, 0, CARD_W, 4);

  ctx.textAlign = "left";
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 12px sans-serif";
  roundRect(ctx, 20, 16, 110, 22, 5);
  ctx.fill();
  ctx.fillStyle = "#000000";
  ctx.fillText("REDEEM CODES", 28, 32);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(`🎁  Genshin Codes — ${accountLabel}`, 20, 68);

  ctx.fillStyle = "#6B7A8C";
  ctx.font = "13px sans-serif";
  ctx.fillText(`⏱ Resets in ${getTimeUntilReset()}`, 20, 90);

  let y = 110;
  codes.forEach((code) => {
    const isClaimed = claimed.includes(code.code);

    roundRect(ctx, 20, y, CARD_W - 40, 68, 10);
    ctx.fillStyle = isClaimed ? "rgba(46,204,113,0.06)" : "rgba(255,255,255,0.04)";
    ctx.fill();

    if (isClaimed) {
      ctx.strokeStyle = "rgba(46,204,113,0.3)";
      ctx.lineWidth = 1;
      roundRect(ctx, 20, y, CARD_W - 40, 68, 10);
      ctx.stroke();
    }

    drawCheckbox(ctx, 36, y + 22, isClaimed);

    ctx.fillStyle = isClaimed ? "#556677" : "#FFD700";
    ctx.font = "bold 16px monospace";
    ctx.fillText(code.code, 68, y + 30);

    const rewards = Array.isArray(code.rewards) ? code.rewards.join(", ") : "Primogems & Rewards";
    ctx.fillStyle = isClaimed ? "#445566" : "#8899B0";
    ctx.font = "13px sans-serif";
    ctx.fillText(rewards, 68, y + 52);

    if (isClaimed) {
      ctx.fillStyle = "#2ECC71";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("CLAIMED", CARD_W - 36, y + 30);
      ctx.textAlign = "left";
    } else {
      ctx.fillStyle = "#4FC3F7";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("TAP ✓ TO CLAIM", CARD_W - 36, y + 30);
      ctx.textAlign = "left";
    }

    y += 80;
  });

  return canvas.toBuffer("image/png");
}

async function renderAllClaimedCard(accountLabel) {
  const CARD_H = 180;
  const canvas = createCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0B0E14";
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = "#2ECC71";
  ctx.fillRect(0, 0, CARD_W, 4);

  ctx.textAlign = "center";
  ctx.fillStyle = "#2ECC71";
  ctx.font = "bold 12px sans-serif";
  roundRect(ctx, CARD_W / 2 - 55, 16, 110, 22, 5);
  ctx.fill();
  ctx.fillStyle = "#000000";
  ctx.fillText("ALL CLAIMED", CARD_W / 2, 32);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("✅ No new codes", CARD_W / 2, 85);

  ctx.fillStyle = "#8899B0";
  ctx.font = "14px sans-serif";
  ctx.fillText("You're all caught up!", CARD_W / 2, 112);

  ctx.fillStyle = "#6B7A8C";
  ctx.font = "13px sans-serif";
  ctx.fillText(`⏱ Next codes in ${getTimeUntilReset()}`, CARD_W / 2, 145);

  ctx.fillStyle = "#445566";
  ctx.font = "12px sans-serif";
  ctx.fillText("Furina Discord Bot • Auto Code Tracker", CARD_W / 2, CARD_H - 14);

  return canvas.toBuffer("image/png");
}

async function buildCodesPayload(targetUid, accountLabel) {
  const response = await axios.get("https://api.ennead.cc/mihoyo/genshin/codes").catch(() => null);
  const activeCodes = response?.data?.active || [];
  const claimed = loadClaimed()[targetUid] || [];
  const unclaimed = activeCodes.filter(c => !claimed.includes(c.code));

  if (unclaimed.length === 0) {
    const buffer = await renderAllClaimedCard(accountLabel);
    const attachment = new AttachmentBuilder(buffer, { name: "codes.png" });
    return { files: [attachment], components: [] };
  }

  const codesToShow = unclaimed.slice(0, 5);
  const buffer = await renderCodesCard(codesToShow, accountLabel, claimed);
  const attachment = new AttachmentBuilder(buffer, { name: "codes.png" });

  const tickRow = new ActionRowBuilder().addComponents(
    codesToShow.map(c =>
      new ButtonBuilder()
        .setCustomId(`codeclaim_${targetUid}_${c.code}`)
        .setLabel(claimed.includes(c.code) ? `✅ ${c.code}` : `☐ ${c.code}`)
        .setStyle(claimed.includes(c.code) ? ButtonStyle.Success : ButtonStyle.Secondary)
    )
  );

  return { files: [attachment], components: [tickRow] };
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
    const claimed = loadClaimed()[targetUid] || [];

    if (claimed.includes(code)) {
      unmarkClaimed(targetUid, code);
    } else {
      markClaimed(targetUid, code);
    }

    await interaction.deferUpdate();
    const accountLabel = targetUid === UIDS.ALT ? "ALT" : "MAIN";
    const payload = await buildCodesPayload(targetUid, accountLabel);
    await interaction.editReply(payload);
  },

  buildCodesPayload,
  markClaimed,
  unmarkClaimed
};
