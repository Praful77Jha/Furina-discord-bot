const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID, UIDS } = require("../../genshinConfig");
const { getCharacterInfo } = require("../../enkaCharacterData");

// In-memory cache of the last showcase fetched per UID, so the select-menu
// handler (in bot.js) can look up the right character without refetching.
const showcaseCache = new Map(); // uid -> { playerInfo, avatarList, fetchedAt }

function calculateCV(equipList) {
  let totalCV = 0;
  if (!equipList) return "0.0";

  const artifacts = equipList.filter(item => item.flat?.itemType === "ITEM_RELIQUARY");

  artifacts.forEach(art => {
    // Substats (rolls) — CRIT Rate counts double, CRIT DMG counts single, standard CV formula.
    const subStats = art.flat?.reliquarySubstats || [];
    subStats.forEach(sub => {
      if (sub.appendPropId === "FIGHT_PROP_CRITICAL") totalCV += sub.statValue * 2;
      if (sub.appendPropId === "FIGHT_PROP_CRITICAL_HURT") totalCV += sub.statValue;
    });

    // Main stat — only matters on Circlet (Goblet/Sands can't roll crit as a main stat),
    // but checking the prop id directly means this works regardless of slot.
    const mainStat = art.flat?.reliquaryMainstat;
    if (mainStat) {
      if (mainStat.mainPropId === "FIGHT_PROP_CRITICAL") totalCV += mainStat.statValue * 2;
      if (mainStat.mainPropId === "FIGHT_PROP_CRITICAL_HURT") totalCV += mainStat.statValue;
    }
  });

  return totalCV.toFixed(1);
}

function buildCharacterEmbed(playerInfo, avatar, charInfo, targetUid) {
  const level = avatar.propMap?.["4001"]?.val || "N/A";
  const cv = calculateCV(avatar.equipList);
  const name = charInfo?.name || `Character ${avatar.avatarId}`;

  const embed = new EmbedBuilder()
    .setTitle(`${playerInfo.nickname}'s Showcase — ${name}`)
    .setColor("#00AE55")
    .setDescription(`**Character:** ${name}${charInfo?.element ? ` (${charInfo.element})` : ""}\n**Level:** ${level}`)
    .addFields(
      { name: "Total Artifact CV", value: `${cv}`, inline: true },
      { name: "World Level", value: `${playerInfo.worldLevel || "N/A"}`, inline: true },
      { name: "UID", value: targetUid, inline: true }
    )
    .setFooter({ text: "Furina Discord Bot • Enka Network API" });

  if (charInfo?.icon) embed.setThumbnail(charInfo.icon);

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("build")
    .setDescription("Fetch Genshin character showcase, CV breakdown, and artifact stats.")
    .addStringOption(option =>
      option
        .setName("account")
        .setDescription("Select account preset")
        .addChoices(
          { name: "NORMIE (MAIN)", value: "main" },
          { name: "NOT_NORMIE (ALT)", value: "alt" }
        )
    )
    .addStringOption(option =>
      option
        .setName("uid")
        .setDescription("Or type custom UID directly")
    ),

  async execute(interaction) {
    if (interaction.channel.parentId !== CATEGORY_ID) {
      return interaction.reply({
        content: "This command can only be used inside the Genshin category.",
        ephemeral: true
      });
    }
    if (interaction.channelId !== CHANNELS.BUILD_CHECK) {
      return interaction.reply({
        content: `Please use this command in <#${CHANNELS.BUILD_CHECK}>.`,
        ephemeral: true
      });
    }

    await interaction.deferReply();

    const accountChoice = interaction.options.getString("account");
    const customUid = interaction.options.getString("uid");

    let targetUid = customUid;
    if (!targetUid) {
      targetUid = accountChoice === "alt" ? UIDS.ALT : UIDS.MAIN;
    }

    try {
      const response = await axios.get(`https://enka.network/api/uid/${targetUid}`);
      const data = response.data;

      if (!data.avatarInfoList || data.avatarInfoList.length === 0) {
        return interaction.editReply(`No showcased characters found for UID \`${targetUid}\`. Check character showcase settings in-game.`);
      }

      const playerInfo = data.playerInfo;
      const avatarList = data.avatarInfoList;

      // Cache so the select-menu handler in bot.js can resolve picks without refetching Enka.
      showcaseCache.set(targetUid, { playerInfo, avatarList, fetchedAt: Date.now() });

      const selectOptions = await Promise.all(avatarList.map(async (avatar, index) => {
        const charInfo = await getCharacterInfo(avatar.avatarId);
        return {
          label: charInfo?.name || `Character ${avatar.avatarId}`,
          description: `Level ${avatar.propMap["4001"]?.val || "N/A"}${charInfo?.element ? ` • ${charInfo.element}` : ""}`,
          value: `${targetUid}_${index}`
        };
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("select_build_character")
        .setPlaceholder("Select a showcased character...")
        .addOptions(selectOptions);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const firstChar = avatarList[0];
      const firstCharInfo = await getCharacterInfo(firstChar.avatarId);
      const embed = buildCharacterEmbed(playerInfo, firstChar, firstCharInfo, targetUid);

      await interaction.editReply({ embeds: [embed], components: [row] });

    } catch (error) {
      console.error(error);
      return interaction.editReply(`Failed to fetch data for UID \`${targetUid}\`. API might be down or UID is invalid.`);
    }
  },

  // Called from bot.js's central interactionCreate handler when a user picks
  // from the select_build_character menu. Keeping this here (rather than a
  // one-off collector) means it works no matter how long the message has been up.
  async handleCharacterSelect(interaction) {
    const [targetUid, indexStr] = interaction.values[0].split("_");
    const index = parseInt(indexStr, 10);

    const cached = showcaseCache.get(targetUid);
    if (!cached) {
      return interaction.reply({
        content: "This showcase has expired — run `/build` again to refresh it.",
        ephemeral: true
      });
    }

    const avatar = cached.avatarList[index];
    if (!avatar) {
      return interaction.reply({ content: "Couldn't find that character in the showcase.", ephemeral: true });
    }

    const charInfo = await getCharacterInfo(avatar.avatarId);
    const embed = buildCharacterEmbed(cached.playerInfo, avatar, charInfo, targetUid);

    await interaction.update({ embeds: [embed] }); // update, not reply — edits the same message in place
  }
};