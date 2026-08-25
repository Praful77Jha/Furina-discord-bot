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
      // gsi.fly.dev never returned real data. api.ennead.cc's calendar endpoint
      // gives real banners with featured character/weapon names, icons, and end dates.
      const response = await axios.get("https://api.ennead.cc/mihoyo/genshin/calendar").catch(() => null);
      const banners = response?.data?.banners || [];

      const embed = new EmbedBuilder()
        .setTitle("⚔️ Active Genshin Banners & Event Wish")
        .setColor("#9B59B6")
        .setDescription("Current active character and weapon wish banners.")
        .setFooter({ text: "Furina Discord Bot • Banner Tracker" });

      if (banners.length === 0) {
        embed.addFields({ name: "Notice", value: "Check in-game announcements for version banner updates!" });
      } else {
        banners.slice(0, 4).forEach(b => {
          const featuredChars = (b.characters || []).map(c => `${c.name} (${c.element})`).join(", ") || "N/A";
          const featuredWeapons = (b.weapons || []).map(w => w.name).join(", ");
          const endDate = b.end_time ? `<t:${b.end_time}:R>` : "End of Phase"; // Discord relative timestamp

          embed.addFields({
            name: b.name || "Event Wish Banner",
            value: `**Featured:** ${featuredChars}${featuredWeapons ? `\n**Weapons:** ${featuredWeapons}` : ""}\n**Ends:** ${endDate}`,
            inline: false
          });
        });

        // Use the first banner's lead character art as a thumbnail if available.
        const firstIcon = banners[0]?.characters?.[0]?.icon;
        if (firstIcon) embed.setThumbnail(firstIcon);
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error(error);
      return interaction.editReply("Could not fetch banner details right now.");
    }
  }
};