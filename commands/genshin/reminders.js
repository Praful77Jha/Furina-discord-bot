const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { CHANNELS, CATEGORY_ID } = require("../../genshinConfig");

const DOMAIN_ROTATION = {
  0: {
    talent: "Freedom, Prosperity, Transience, Admonition, Equity",
    weapon: "Decarabian, Guyun, Branch of Distant Sea, Forest Dew, Dross"
  },
  1: {
    talent: "Freedom, Prosperity, Transience, Admonition, Equity",
    weapon: "Decarabian, Guyun, Branch of Distant Sea, Forest Dew, Dross"
  },
  2: {
    talent: "Resistance, Diligence, Elegance, Ingenuity, Justice",
    weapon: "Boreal Wolf, Aerosiderite, Narukami, Oasis Garden, Goblet"
  },
  3: {
    talent: "Ballad, Gold, Light, Praxis, Order",
    weapon: "Dandelion Gladiator, Mist Veiled, Mask, Primordial Oasis, Sunlit"
  },
  4: {
    talent: "Freedom, Prosperity, Transience, Admonition, Equity",
    weapon: "Decarabian, Guyun, Branch of Distant Sea, Forest Dew, Dross"
  },
  5: {
    talent: "Resistance, Diligence, Elegance, Ingenuity, Justice",
    weapon: "Boreal Wolf, Aerosiderite, Narukami, Oasis Garden, Goblet"
  },
  6: {
    talent: "Ballad, Gold, Light, Praxis, Order",
    weapon: "Dandelion Gladiator, Mist Veiled, Mask, Primordial Oasis, Sunlit"
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reminders")
    .setDescription("Check daily domain rotations, reset schedules, and tasks."),

  async execute(interaction) {
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({ 
        content: "This command can only be used inside the Genshin category.", 
        ephemeral: true 
      });
    }
    if (interaction.channelId !== CHANNELS.DAILY_REMINDERS) {
      return interaction.reply({ 
        content: `Please use this command in <#${CHANNELS.DAILY_REMINDERS}>.`, 
        ephemeral: true 
      });
    }

    const today = new Date();
    const dayOfWeek = today.getDay();
    const dayOfMonth = today.getDate();
    const rotation = DOMAIN_ROTATION[dayOfWeek];

    const isSunday = dayOfWeek === 0;
    const talentText = isSunday ? "All Talent Books Available Today!" : rotation.talent;
    const weaponText = isSunday ? "All Weapon Ascension Materials Available Today!" : rotation.weapon;

    let abyssStatus = "In Progress";
    if (dayOfMonth === 1 || dayOfMonth === 16) {
      abyssStatus = "⚠️ Resets Today!";
    }

    const embed = new EmbedBuilder()
      .setTitle("🔔 Today's Genshin Schedule & Reminders")
      .setColor("#3498DB")
      .setDescription("Daily server resets occur at 04:00 AM server time.")
      .addFields(
        { name: "📚 Farmable Talent Books Today", value: talentText, inline: false },
        { name: "⚔️ Farmable Weapon Materials Today", value: weaponText, inline: false },
        { name: "🌀 Spiral Abyss Status", value: abyssStatus, inline: true },
        { name: "📋 Daily Checklist", value: "• Commissions (4/4)\n• Expedition Rewards\n• Battle Pass Dailies\n• Serenitea Pot Realm Currency", inline: false }
      )
      .setFooter({ text: "Furina Discord Bot • Daily Scheduler" });

    await interaction.reply({ embeds: [embed] });
  }
};