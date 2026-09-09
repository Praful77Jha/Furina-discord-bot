const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { CHANNELS, CATEGORY_ID } = require("../../genshinConfig");
const { createCanvas, roundRect } = require("../../canvasRenderer");
const { readJSON, writeJSON } = require("../../dataStore");

const CHECKLIST_FILE = "reminderChecklist.json";
const CARD_W = 700;
const CARD_H = 380;

const CHECKLIST_ITEMS = [
  { key: "commissions", label: "Daily Commissions (4/4)", icon: "📜" },
  { key: "expedition", label: "Expedition Rewards", icon: "🧭" },
  { key: "battlepass", label: "Battle Pass Dailies", icon: "🎫" },
  { key: "realm", label: "Serenitea Pot Currency", icon: "🏮" }
];

const DOMAIN_ROTATION = {
  0: { talent: "Freedom, Prosperity, Transience, Admonition, Equity", weapon: "Decarabian, Guyun, Branch of Distant Sea, Forest Dew, Dross" },
  1: { talent: "Freedom, Prosperity, Transience, Admonition, Equity", weapon: "Decarabian, Guyun, Branch of Distant Sea, Forest Dew, Dross" },
  2: { talent: "Resistance, Diligence, Elegance, Ingenuity, Justice", weapon: "Boreal Wolf, Aerosiderite, Narukami, Oasis Garden, Goblet" },
  3: { talent: "Ballad, Gold, Light, Praxis, Order", weapon: "Dandelion Gladiator, Mist Veiled, Mask, Primordial Oasis, Sunlit" },
  4: { talent: "Freedom, Prosperity, Transience, Admonition, Equity", weapon: "Decarabian, Guyun, Branch of Distant Sea, Forest Dew, Dross" },
  5: { talent: "Resistance, Diligence, Elegance, Ingenuity, Justice", weapon: "Boreal Wolf, Aerosiderite, Narukami, Oasis Garden, Goblet" },
  6: { talent: "Ballad, Gold, Light, Praxis, Order", weapon: "Dandelion Gladiator, Mist Veiled, Mask, Primordial Oasis, Sunlit" }
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getUserChecklist(userId) {
  const all = readJSON(CHECKLIST_FILE, {});
  const key = `${userId}_${todayKey()}`;
  return all[key] || {};
}

function toggleUserItem(userId, itemKey) {
  const all = readJSON(CHECKLIST_FILE, {});
  const key = `${userId}_${todayKey()}`;
  if (!all[key]) all[key] = {};
  all[key][itemKey] = !all[key][itemKey];
  writeJSON(CHECKLIST_FILE, all);
  return all[key];
}

async function renderReminderCard() {
  const canvas = createCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext("2d");
  const today = new Date();
  const dayOfWeek = today.getDay();
  const dayOfMonth = today.getDate();
  const isSunday = dayOfWeek === 0;
  const rotation = DOMAIN_ROTATION[dayOfWeek];

  ctx.fillStyle = "#0D0F16";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  ctx.fillStyle = "#4FC3F7";
  ctx.fillRect(0, 0, CARD_W, 5);

  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 30px sans-serif";
  ctx.fillText("🌅 Today's Genshin Schedule", 30, 52);

  ctx.font = "15px sans-serif";
  ctx.fillStyle = "#7A8AA0";
  const resetHour = 4;
  const now = new Date();
  const nextReset = new Date(now);
  nextReset.setUTCHours(resetHour, 0, 0, 0);
  if (nextReset <= now) nextReset.setUTCDate(nextReset.getUTCDate() + 1);
  const diff = nextReset.getTime() - now.getTime();
  const rHours = Math.floor(diff / (1000 * 60 * 60));
  const rMins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  ctx.fillText(`Daily reset in ${rHours}h ${rMins}m  •  04:00 AM server time`, 30, 78);

  let y = 120;

  roundRect(ctx, 20, y - 20, CARD_W - 40, 100, 10);
  ctx.fillStyle = "rgba(79,195,247,0.06)";
  ctx.fill();

  ctx.font = "bold 17px sans-serif";
  ctx.fillStyle = "#4FC3F7";
  ctx.fillText("📚 Farmable Talent Books Today", 36, y);
  y += 28;
  ctx.font = "15px sans-serif";
  ctx.fillStyle = "#C8D0DC";
  ctx.fillText(isSunday ? "All books available today!" : rotation.talent, 36, y);

  y += 48;
  roundRect(ctx, 20, y - 20, CARD_W - 40, 100, 10);
  ctx.fillStyle = "rgba(79,195,247,0.06)";
  ctx.fill();

  ctx.font = "bold 17px sans-serif";
  ctx.fillStyle = "#4FC3F7";
  ctx.fillText("⚔️ Farmable Weapon Materials Today", 36, y);
  y += 28;
  ctx.font = "15px sans-serif";
  ctx.fillStyle = "#C8D0DC";
  ctx.fillText(isSunday ? "All weapon materials available today!" : rotation.weapon, 36, y);

  y += 48;
  const abyssNote = (dayOfMonth === 1 || dayOfMonth === 16) ? "⚠️ Spiral Abyss resets today!" : "🌀 Spiral Abyss in progress";
  const abyssColor = (dayOfMonth === 1 || dayOfMonth === 16) ? "#FFD700" : "#4FC3F7";

  roundRect(ctx, 20, y - 20, CARD_W - 40, 40, 10);
  ctx.fillStyle = "rgba(79,195,247,0.06)";
  ctx.fill();

  ctx.font = "bold 17px sans-serif";
  ctx.fillStyle = abyssColor;
  ctx.fillText(abyssNote, 36, y);

  ctx.font = "13px sans-serif";
  ctx.fillStyle = "#445566";
  ctx.fillText("Furina Discord Bot  •  Daily Scheduler — tick your checklist below", 30, CARD_H - 18);

  return canvas.toBuffer("image/png");
}

function buildChecklistRow(userId) {
  const state = getUserChecklist(userId);
  return new ActionRowBuilder().addComponents(
    CHECKLIST_ITEMS.map(item =>
      new ButtonBuilder()
        .setCustomId(`remindercheck_${item.key}`)
        .setLabel(`${state[item.key] ? "✅" : item.icon} ${item.label}`)
        .setStyle(state[item.key] ? ButtonStyle.Success : ButtonStyle.Secondary)
    )
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reminders")
    .setDescription("Check daily domain rotations, reset schedules, and your personal checklist."),

  async execute(interaction) {
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({ content: "This command can only be used inside the Genshin category.", ephemeral: true });
    }
    if (interaction.channelId !== CHANNELS.DAILY_REMINDERS) {
      return interaction.reply({ content: `Please use this command in <#${CHANNELS.DAILY_REMINDERS}>.`, ephemeral: true });
    }

    await interaction.deferReply();
    const buffer = await renderReminderCard();
    const attachment = new AttachmentBuilder(buffer, { name: "reminders.png" });

    const row = buildChecklistRow(interaction.user.id);
    await interaction.editReply({ files: [attachment], components: [row] });
  },

  async handleChecklistToggle(interaction) {
    const itemKey = interaction.customId.replace("remindercheck_", "");
    const newState = toggleUserItem(interaction.user.id, itemKey);
    const item = CHECKLIST_ITEMS.find(i => i.key === itemKey);

    await interaction.reply({
      content: newState[itemKey] ? `✅ Marked **${item.label}** done for today.` : `⬜ Unmarked **${item.label}**.`,
      ephemeral: true
    });
  },

  renderReminderCard,
  buildChecklistRow,
  CHECKLIST_ITEMS
};
