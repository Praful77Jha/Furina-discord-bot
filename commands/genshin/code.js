const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID, UIDS } = require("../../genshinConfig");
const { readJSON, writeJSON } = require("../../dataStore");

const CLAIMED_FILE = "claimedCodes.json";

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

// Builds the {embeds, components} payload for a given account, showing only
// codes that account hasn't ticked off yet. Reused by the slash command AND
// the 24h auto-post job in genshinAutomator.js so both stay in sync.
async function buildCodesPayload(targetUid, accountLabel) {
  const response = await axios.get("https://api.ennead.cc/mihoyo/genshin/codes").catch(() => null);
  const activeCodes = response?.data?.active || [];
  const claimed = loadClaimed()[targetUid] || [];

  const unclaimed = activeCodes.filter(c => !claimed.includes(c.code));

  if (unclaimed.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle(`🎁 Genshin Codes — ${accountLabel}`)
      .setColor("#2ECC71")
      .setDescription("✅ No new codes — you're all caught up!")
      .setFooter({ text: "Furina Discord Bot • Auto Code Tracker" });
    return { embeds: [embed], components: [] };
  }

  const codesToShow = unclaimed.slice(0, 5); // 5 buttons/row cap

  const embed = new EmbedBuilder()
    .setTitle(`🎁 Genshin Codes — ${accountLabel}`)
    .setColor("#FFD700")
    .setDescription(
      codesToShow.map(c => {
        const rewards = Array.isArray(c.rewards) ? c.rewards.join(", ") : "Primogems & Rewards";
        return `🆕 \`${c.code}\`\n> ${rewards}`;
      }).join("\n\n")
    )
    .setFooter({ text: `Furina Discord Bot • Tap ✅ once redeemed in-game${unclaimed.length > 5 ? ` • ${unclaimed.length - 5} more not shown` : ""}` });

  const redeemRow = new ActionRowBuilder().addComponents(
    codesToShow.map(c =>
      new ButtonBuilder().setLabel(c.code).setStyle(ButtonStyle.Link).setURL(`https://genshin.hoyoverse.com/en/gift?code=${c.code}`)
    )
  );

  const tickRow = new ActionRowBuilder().addComponents(
    codesToShow.map(c =>
      new ButtonBuilder()
        .setCustomId(`codeclaim_${targetUid}_${c.code}`)
        .setLabel(`✅ Mark ${c.code} claimed`)
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return { embeds: [embed], components: [redeemRow, tickRow] };
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

  // Called from bot.js when a "Mark claimed" button is tapped.
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
