const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID } = require("../../genshinConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("banner")
    .setDescription("Check current and upcoming Genshin Impact banners."),

  async execute(interaction) {
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({ 
        content: "This command can only be used inside the Genshin category.", 
        ephemeral: true 
      });
    }
    if (interaction.channelId !== CHANNELS.BANNER_EVENTS) {
      return interaction.reply({ 
        content: `Please use this command in <#${CHANNELS.BANNER_EVENTS}>.`, 
        ephemeral: true 
      });
    }

    await interaction.deferReply();

    try {
      const response = await axios.get("https://gsi.fly.dev/v2/banners").catch(() => null);
      const banners = response?.data?.result || [];

      const embed = new EmbedBuilder()
        .setTitle("⚔️ Active Genshin Banners & Event Wish")
        .setColor("#9B59B6")
        .setDescription("Current active character and weapon wish banners.")
        .setFooter({ text: "Furina Discord Bot • Banner Tracker" });

      if (banners.length === 0) {
        embed.addFields({ name: "Notice", value: "Check in-game announcements for version banner updates!" });
      } else {
        banners.slice(0, 4).forEach(b => {
          embed.addFields({
            name: b.name || "Event Wish Banner",
            value: `**Featured:** ${b.featured || "5-Star Character/Weapon"}\n**Ends:** ${b.end || "End of Phase"}`,
            inline: false
          });
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      return interaction.editReply("Could not fetch banner details right now.");
    }
  }
};