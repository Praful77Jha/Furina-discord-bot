const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID, UIDS } = require("../../genshinConfig");
const { getCharacterInfo } = require("../../enkaCharacterData");
const { getElementStyle } = require("../../elementStyle");

const HEADERS = { "User-Agent": "FurinaDiscordBot/1.0" };

// Cache of the merged Akasha+Enka character list per UID, so autocomplete
// doesn't have to hit both APIs on every keystroke.
const SHOWCASE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const showcaseCache = new Map(); // uid -> { data: [{ name, avatarId, isLive }], fetchedAt }

// Full character history from Akasha.cv (everything ever calculated, not just live showcase)
async function getAkashaCharacters(uid) {
  try {
    const response = await axios.get(`https://akasha.cv/api/getCalculationsForUser/${uid}`, {
      headers: HEADERS,
      timeout: 15000
    });
    const raw = response.data.data || response.data;

    // Dedupe by characterId - Akasha can have multiple calc entries per character
    const byId = new Map();
    for (const entry of raw) {
      if (!byId.has(entry.characterId)) {
        byId.set(entry.characterId, { name: entry.name, avatarId: entry.characterId });
      }
    }
    return [...byId.values()];
  } catch (err) {
    console.error("Akasha fetch error:", err.message);
    return [];
  }
}

// Just the avatarIds currently in the live in-game showcase
async function getLiveShowcaseIds(uid) {
  try {
    const response = await axios.get(`https://enka.network/api/uid/${uid}`, { headers: HEADERS, timeout: 15000 });
    const avatarList = response.data.avatarInfoList || [];
    return new Set(avatarList.map(a => a.avatarId));
  } catch (err) {
    console.error("Enka showcase fetch error:", err.message);
    return new Set();
  }
}

async function getShowcaseCharacters(uid) {
  const cached = showcaseCache.get(uid);
  if (cached && Date.now() - cached.fetchedAt < SHOWCASE_CACHE_TTL_MS) {
    return cached.data;
  }

  const [akashaChars, liveIds] = await Promise.all([
    getAkashaCharacters(uid),
    getLiveShowcaseIds(uid)
  ]);

  const merged = akashaChars.map(c => ({
    name: c.name,
    avatarId: c.avatarId,
    isLive: liveIds.has(c.avatarId)
  }));

  showcaseCache.set(uid, { data: merged, fetchedAt: Date.now() });
  return merged;
}

async function fetchEnkaCard(uid, avatarId) {
  const url = `https://cards.enka.network/u/${uid}/${avatarId}/image?lang=en&substats=true&uid=true`;
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: HEADERS
  });
  return Buffer.from(response.data);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("build")
    .setDescription("Fetch Genshin character build from Enka.Network.")
    .addStringOption(option =>
      option.setName("character").setDescription("Character name").setRequired(true).setAutocomplete(true)
    ),

  async execute(interaction) {
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({ content: "This command can only be used inside the Genshin category.", ephemeral: true });
    }
    if (interaction.channelId !== CHANNELS.BUILD_CHECK) {
      return interaction.reply({ content: `Please use this command in <#${CHANNELS.BUILD_CHECK}>.`, ephemeral: true });
    }

    await interaction.deferReply();

    const characterName = interaction.options.getString("character");
    const targetUid = UIDS.MAIN;

    try {
      const showcase = await getShowcaseCharacters(targetUid);

      if (!showcase || showcase.length === 0) {
        return interaction.editReply(`No showcased characters found for UID \`${targetUid}\`.`);
      }

      let matchedAvatar = showcase.find(
        c => c.name.toLowerCase() === characterName.toLowerCase()
      );

      if (!matchedAvatar) {
        matchedAvatar = showcase.find(
          c => c.name.toLowerCase().includes(characterName.toLowerCase())
        );
      }

      if (!matchedAvatar) {
        const charList = showcase.map(c => c.name).join(", ");
        return interaction.editReply(`**${characterName}** not found in your Akasha history.\nAvailable: ${charList}`);
      }

      if (!matchedAvatar.isLive) {
        const charInfo = await getCharacterInfo(matchedAvatar.avatarId);
        const style = getElementStyle(charInfo?.element);
        const embed = new EmbedBuilder()
          .setTitle(`${style.emoji} ${charInfo?.name || matchedAvatar.name}`)
          .setColor(style.color)
          .setDescription(`**${matchedAvatar.name}** isn't in the current in-game showcase, so no live card is available.\nSwap them into your in-game Character Showcase to get a card here.`);
        return interaction.editReply({ embeds: [embed] });
      }

      try {
        const buffer = await fetchEnkaCard(targetUid, matchedAvatar.avatarId);
        const attachment = new AttachmentBuilder(buffer, { name: "build.png" });
        await interaction.editReply({ files: [attachment] });
      } catch (cardErr) {
        const charInfo = await getCharacterInfo(matchedAvatar.avatarId);
        const style = getElementStyle(charInfo?.element);
        const embed = new EmbedBuilder()
          .setTitle(`${style.emoji} ${charInfo?.name || matchedAvatar.name}`)
          .setColor(style.color)
          .setDescription(`Enka card unavailable.\nUID: \`${targetUid}\``);
        await interaction.editReply({ embeds: [embed] });
      }

    } catch (error) {
      console.error("Build error:", error.message);
      return interaction.editReply(`Failed to fetch data for UID \`${targetUid}\`.`);
    }
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const targetUid = UIDS.MAIN;

    try {
      const showcase = await getShowcaseCharacters(targetUid);

      const filtered = focused
        ? showcase.filter(c => c.name.toLowerCase().includes(focused.toLowerCase()))
        : showcase;

      await interaction.respond(
        filtered.slice(0, 25).map(c => ({
          name: c.isLive ? c.name : `${c.name} (not showcased)`,
          value: c.name
        }))
      );
    } catch (err) {
      console.error("Autocomplete error:", err.message);
      await interaction.respond([]);
    }
  }
};