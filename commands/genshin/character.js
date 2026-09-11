const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID } = require("../../genshinConfig");
const { findCharacterByName } = require("../../enkaCharacterData");
const { getElementStyle } = require("../../elementStyle");
const { getGuide } = require("../../characterGuides");

const VIEW_CACHE = new Map();

const VIEWS = [
  { id: "profile", label: "Profile", description: "Rating, rarity, element, weapon, voice actors", emoji: "📋" },
  { id: "tier", label: "Tier List Rankings", description: "Main / Sub / Support / Exploration ranks", emoji: "🏆" },
  { id: "build", label: "Best Build", description: "Weapon, artifacts, main stats, substats", emoji: "⚔️" },
  { id: "teams", label: "Team Comps", description: "Premium and F2P teams", emoji: "👥" },
  { id: "stats", label: "Stat Goals", description: "Target stat values", emoji: "🎯" },
  { id: "talents", label: "Talent Priority", description: "Level order and notes", emoji: "🌀" },
  { id: "gear", label: "Weapons & Artifacts", description: "Full gear list with notes", emoji: "🎒" }
];

function normalize(name) {
  return String(name || "").toLowerCase().trim();
}

function baseEmbed(cached, title) {
  const { enkaChar, guide } = cached;
  const style = getElementStyle(guide?.element || enkaChar?.element);
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(style.color)
    .setFooter({ text: "Furina Discord Bot • Character Guide" });
  if (enkaChar?.icon) embed.setThumbnail(enkaChar.icon);
  return { embed, style };
}

function noGuideEmbed(cached, viewLabel) {
  const { displayName } = cached;
  const { embed } = baseEmbed(cached, `${displayName} — ${viewLabel}`);
  embed.setDescription("Guide not added yet.\nSend a Game8-style build page and it will be added here.");
  return embed;
}

function profileEmbed(cached) {
  const { enkaChar, dbChar, guide, displayName } = cached;
  const { embed } = baseEmbed(cached, `${displayName} — Character Information`);
  const lines = [];
  if (guide?.rating) lines.push(`**Rating:** ${guide.rating}`);
  const rarity = guide?.rarity || enkaChar?.rarity;
  if (rarity) lines.push(`**Rarity:** ${"★".repeat(rarity)}`);
  const element = guide?.element || enkaChar?.element;
  if (element) lines.push(`**Element:** ${getElementStyle(element).label}`);
  const weapon = guide?.weapon || enkaChar?.weaponType;
  if (weapon) lines.push(`**Weapon:** ${weapon}`);
  if (guide?.va) {
    lines.push(`**Voice Actors:** ${guide.va.en} (EN), ${guide.va.jp} (JP)`);
  } else if (dbChar?.nation) {
    lines.push(`**Nation:** ${dbChar.nation}`);
  }
  if (dbChar?.title) lines.push(`**Title:** ${dbChar.title}`);
  embed.setDescription(lines.join("\n") || "No information available.");
  return embed;
}

function tierEmbed(cached) {
  const { guide } = cached;
  if (!guide?.tiers) return noGuideEmbed(cached, "Tier List Rankings");
  const { embed } = baseEmbed(cached, `${guide.name} — Tier List Rankings`);
  if (guide.rating) embed.setDescription(`Overall rating: **${guide.rating}**`);
  embed.addFields(
    { name: "Main DPS", value: guide.tiers.main || "-", inline: true },
    { name: "Sub-DPS", value: guide.tiers.sub || "-", inline: true },
    { name: "Support", value: guide.tiers.support || "-", inline: true },
    { name: "Exploration", value: guide.tiers.exploration || "-", inline: true }
  );
  return embed;
}

function buildEmbed(cached) {
  const { guide } = cached;
  if (!guide?.build) return noGuideEmbed(cached, "Best Build");
  const b = guide.build;
  const { embed } = baseEmbed(cached, `${guide.name} — ${b.title || "Best Build"}`);
  const weaponValue = [`**${b.weapon}**`, ...(b.altWeapons || []).slice(0, 5).map(w => `• ${w}`)].join("\n");
  const artValue = [`**${b.artifact}**`, ...(b.altArtifacts || []).slice(0, 3).map(a => `• ${a}`)].join("\n");
  const ms = b.mainStats || {};
  const msValue = [
    ms.sands ? `**Sands:** ${ms.sands}` : null,
    ms.goblet ? `**Goblet:** ${ms.goblet}` : null,
    ms.circlet ? `**Circlet:** ${ms.circlet}` : null
  ].filter(Boolean).join("\n");
  const subValue = (b.subStats || []).slice(0, 5).map((s, i) => `${i + 1}. ${s}`).join("\n");
  embed.addFields(
    { name: "⚔️ Weapon", value: weaponValue.slice(0, 1000) || "-", inline: false },
    { name: "🏺 Artifacts", value: artValue.slice(0, 1000) || "-", inline: false },
    { name: "Main Stats", value: msValue || "-", inline: true },
    { name: "Substat Priority", value: subValue || "-", inline: true }
  );
  return embed;
}

function teamsEmbed(cached) {
  const { guide } = cached;
  if (!guide?.teams?.length) return noGuideEmbed(cached, "Team Comps");
  const { embed } = baseEmbed(cached, `${guide.name} — Team Comps`);
  for (const team of guide.teams.slice(0, 3)) {
    const members = (team.members || []).join("  •  ");
    embed.addFields({
      name: `${team.label || "Team"}: ${members}`,
      value: team.note || "-",
      inline: false
    });
  }
  return embed;
}

function statsEmbed(cached) {
  const { guide } = cached;
  if (!guide?.statGoals?.length) return noGuideEmbed(cached, "Stat Goals");
  const { embed } = baseEmbed(cached, `${guide.name} — Stat Goal Values`);
  const rows = guide.statGoals.map(([stat, goal]) => `${stat} — **${goal}**`);
  embed.setDescription(rows.join("\n").slice(0, 4000));
  return embed;
}

function talentsEmbed(cached) {
  const { guide, dbChar } = cached;
  if (!guide?.talentPriority?.length) return noGuideEmbed(cached, "Talent Priority");
  const { embed } = baseEmbed(cached, `${guide.name} — Talent Priority`);
  const medals = ["🥇 1st", "🥈 2nd", "🥉 3rd"];
  guide.talentPriority.slice(0, 3).forEach((t, i) => {
    embed.addFields({ name: medals[i], value: t, inline: true });
  });
  const note = guide.talentNote
    || (dbChar?.skillTalents || []).slice(0, 2).map(t => t.name).join(" • ");
  if (note) embed.setDescription(note.slice(0, 4000));
  return embed;
}

function gearEmbed(cached) {
  const { guide } = cached;
  if (!guide?.weapons?.length && !guide?.artifacts?.length) return noGuideEmbed(cached, "Weapons & Artifacts");
  const { embed } = baseEmbed(cached, `${guide.name} — Weapons & Artifacts`);
  const weaponLines = (guide.weapons || []).slice(0, 7).map(w =>
    `**${w.name}**${w.tag ? ` (${w.tag})` : ""}${w.note ? `\n${w.note}` : ""}`
  );
  const artLines = (guide.artifacts || []).slice(0, 5).map(a =>
    `**${a.name}**${a.tag ? ` (${a.tag})` : ""}${a.note ? `\n${a.note}` : ""}`
  );
  if (weaponLines.length) embed.addFields({ name: "⚔️ Weapons", value: weaponLines.join("\n\n").slice(0, 1000), inline: false });
  if (artLines.length) embed.addFields({ name: "🏺 Artifacts", value: artLines.join("\n\n").slice(0, 1000), inline: false });
  return embed;
}

const RENDERERS = {
  profile: profileEmbed,
  tier: tierEmbed,
  build: buildEmbed,
  teams: teamsEmbed,
  stats: statsEmbed,
  talents: talentsEmbed,
  gear: gearEmbed
};

function buildRow(cacheKey) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("select_character_view")
      .setPlaceholder("Choose a section...")
      .addOptions(VIEWS.map(v => ({
        label: `${v.emoji} ${v.label}`,
        description: v.description,
        value: `${cacheKey}::${v.id}`
      })))
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("character")
    .setDescription("Character guide: profile, tiers, builds, teams and more.")
    .addStringOption(option =>
      option.setName("name").setDescription("Character name (e.g. sandrone, furina, raiden)").setRequired(true)
    ),

  async execute(interaction) {
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({ content: "This command can only be used inside the Genshin category.", ephemeral: true });
    }
    if (interaction.channelId !== CHANNELS.CHARACTER_INFO) {
      return interaction.reply({ content: `Please use this command in <#${CHANNELS.CHARACTER_INFO}>.`, ephemeral: true });
    }

    await interaction.deferReply();
    const query = interaction.options.getString("name");

    try {
      const enkaChar = await findCharacterByName(query);
      const guide = getGuide(query) || (enkaChar ? getGuide(enkaChar.name) : null);
      if (!enkaChar && !guide) {
        return interaction.editReply(`Could not find character \`${query}\`. Check the spelling and try again.`);
      }

      const displayName = enkaChar?.name || guide.name;
      const cacheKey = enkaChar?.avatarId ? String(enkaChar.avatarId) : "g:" + normalize(displayName);

      let dbChar = null;
      try {
        const dbRes = await axios.get(`https://genshin.jmp.blue/characters/${normalize(displayName)}`, { timeout: 10000 });
        dbChar = dbRes.data;
      } catch {}

      VIEW_CACHE.set(cacheKey, { displayName, enkaChar: enkaChar || null, dbChar, guide });
      if (VIEW_CACHE.size > 50) {
        const first = VIEW_CACHE.keys().next().value;
        VIEW_CACHE.delete(first);
      }

      await interaction.editReply({ embeds: [profileEmbed(VIEW_CACHE.get(cacheKey))], components: [buildRow(cacheKey)] });

    } catch (error) {
      console.error(error);
      return interaction.editReply(`Could not find character \`${query}\`. Check the spelling and try again.`);
    }
  },

  async handleViewSelect(interaction) {
    const raw = interaction.values[0] || "";
    const sep = raw.lastIndexOf("::");
    const cacheKey = raw.slice(0, sep);
    const view = raw.slice(sep + 2);

    const cached = VIEW_CACHE.get(cacheKey);
    if (!cached) {
      return interaction.reply({ content: "This guide has expired - run `/character` again.", ephemeral: true });
    }

    await interaction.deferUpdate();
    try {
      const renderer = RENDERERS[view] || profileEmbed;
      await interaction.editReply({ embeds: [renderer(cached)], components: [buildRow(cacheKey)] });
    } catch (error) {
      console.error("Character view error:", error.message);
      await interaction.editReply({ content: "Could not render that section.", components: [buildRow(cacheKey)] });
    }
  }
};
