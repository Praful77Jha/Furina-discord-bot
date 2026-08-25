const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID, UIDS } = require("../../genshinConfig");

const claimedCodes = {
  [UIDS.MAIN]: [],
  [UIDS.ALT]: []
};
// NOTE: still in-memory only — resets on every bot restart. Worth moving to a
// Sheet tab or small JSON file on disk if persistent "already redeemed" tracking matters to you.

module.exports = {
  data: new SlashCommandBuilder()
    .setName("codes")
    .setDescription("Fetch active Genshin redeem codes and filter unredeemed ones.")
    .addStringOption(option =>
      option
        .setName("account")
        .setDescription("Select account to check unredeemed status")
        .addChoices(
          { name: "NORMIE (MAIN)", value: "main" },
          { name: "NOT_NORMIE (ALT)", value: "alt" }
        )
    ),

  async execute(interaction) {
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({
        content: "This command can only be used inside the Genshin category.",
        ephemeral: true
      });
    }
    if (interaction.channelId !== CHANNELS.REDEEM_CODES) {
      return interaction.reply({
        content: `Please use this command in <#${CHANNELS.REDEEM_CODES}>.`,
        ephemeral: true
      });
    }

    await interaction.deferReply();

    const accountChoice = interaction.options.getString("account");
    const targetUid = accountChoice === "alt" ? UIDS.ALT : UIDS.MAIN;
    const userClaimed = claimedCodes[targetUid] || [];

    try {
      // Old hoyo-codes/category URL was dead. api.ennead.cc actively maintains this.
      const response = await axios.get("https://api.ennead.cc/mihoyo/genshin/codes").catch(() => null);
      const activeCodes = response?.data?.active || [];

      if (activeCodes.length === 0) {
        return interaction.editReply("No active redeem codes found right now.");
      }

      const embed = new EmbedBuilder()
        .setTitle(`🎁 Active Genshin Codes (${accountChoice ? accountChoice.toUpperCase() : "ALL"})`)
        .setColor("#FFD700")
        .setDescription("Unredeemed codes are highlighted below. Click the direct links to claim them.")
        .setFooter({ text: "Furina Discord Bot • Auto Code Tracker" });

      activeCodes.slice(0, 6).forEach(c => {
        const rewards = Array.isArray(c.rewards) ? c.rewards.join(", ") : "Primogems & Rewards";
        const isClaimed = userClaimed.includes(c.code);
        const statusStr = isClaimed ? "✅ Already Redeemed" : "🆕 **UNCLAIMED**";
        const directLink = `https://genshin.hoyoverse.com/en/gift?code=${c.code}`;

        embed.addFields({
          name: `Code: ${c.code} [${statusStr}]`,
          value: `**Rewards:** ${rewards}\n[👉 Direct Redeem Link](${directLink})`,
          inline: false
        });
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Official Redemption Site")
          .setStyle(ButtonStyle.Link)
          .setURL("https://genshin.hoyoverse.com/en/gift")
      );

      await interaction.editReply({ embeds: [embed], components: [row] });

    } catch (error) {
      console.error(error);
      return interaction.editReply("Failed to fetch codes. Please try again later.");
    }
  }
};