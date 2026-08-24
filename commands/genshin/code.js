const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID } = require("../../genshinConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("codes")
    .setDescription("Fetch active Genshin Impact redeem codes with direct redemption links."),

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

    try {
      const response = await axios.get("https://hoyo-codes.p.rapidapi.com/genshin", {
        headers: {
          "x-rapidapi-host": "hoyo-codes.p.rapidapi.com"
        }
      }).catch(() => null);

      let codesList = [];
      
      if (response && response.data && response.data.codes) {
        codesList = response.data.codes;
      } else {
        const fallbackRes = await axios.get("https://raw.githubusercontent.com/hoyo-codes/category/main/genshin.json").catch(() => null);
        if (fallbackRes && fallbackRes.data) {
          codesList = fallbackRes.data;
        }
      }

      if (!codesList || codesList.length === 0) {
        return interaction.editReply("No active redeem codes found right now. Check back later!");
      }

      const embed = new EmbedBuilder()
        .setTitle("🎁 Active Genshin Impact Redeem Codes")
        .setColor("#FFD700")
        .setDescription("Click the code links or use the official HoYoVERSE redemption site to claim your rewards.")
        .setFooter({ text: "Furina Discord Bot • Auto Code Tracker" });

      codesList.slice(0, 5).forEach(c => {
        const code = c.code || c;
        const rewards = c.rewards || c.reward || "Primogems & Rewards";
        const directLink = `https://genshin.hoyoverse.com/en/gift?code=${code}`;
        embed.addFields({
          name: `Code: ${code}`,
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
      return interaction.editReply("Failed to fetch redeem codes. Please try again later.");
    }
  }
};