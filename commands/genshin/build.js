const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const { CHANNELS, CATEGORY_ID, UIDS } = require("../../genshinConfig");
const { getCharacterInfo, findCharacterByName } = require("../../enkaCharacterData");
const { getElementStyle } = require("../../elementStyle");
const { createCanvas, loadImage, roundRect } = require("../../canvasRenderer");

const HEADERS = { "User-Agent": "FurinaDiscordBot/1.0" };
// Akasha's API blocks most script clients (403) but answers Node/axios
// with this header combo - verified live. Static list below is fallback.
const AKASHA_HEADERS = {
  "User-Agent": "akasha-py",
  "Accept": "application/json",
  "Referer": "https://akasha.cv/"
};
// Fallback history (from the user's Akasha profile) for when Akasha's API
// is unreachable - it answers Node but can 403 datacenter IPs.
// Live status always comes from Enka.
const AKASHA_HISTORY = [
  "Skirk", "Yelan", "Arlecchino", "Furina", "Hu Tao", "Kachina",
  "Flins", "Mualani", "Kamisato Ayato", "Xiao", "Columbina",
  "Wanderer", "Xiangling", "Kamisato Ayaka", "Faruzan",
  "Kaedehara Kazuha", "Baizhu", "Citlali", "Xingqiu", "Bennett"
];

// Cache of the merged Akasha+Enka character list per UID, so autocomplete
// doesn't have to hit both APIs on every keystroke. Short TTL so showcase
// swaps show up fast; /build itself always fetches fresh (see execute).
const SHOWCASE_CACHE_TTL_MS = 60 * 1000;
const showcaseCache = new Map(); // uid -> { data: [{ name, avatarId, isLive }], fetchedAt, refreshing }

// Live Akasha history first, static profile list as fallback.
// IDs are Numbers so they match Enka's avatarId type in the live-set check.
async function getAkashaCharacters(uid) {
  try {
    const response = await axios.get(`https://akasha.cv/api/getCalculationsForUser/${uid}`, {
      headers: AKASHA_HEADERS,
      timeout: 8000
    });
    const raw = response.data.data || response.data;

    // Dedupe by characterId - Akasha can have multiple calc entries per character
    const byId = new Map();
    for (const entry of raw) {
      if (!byId.has(entry.characterId)) {
        byId.set(entry.characterId, { name: entry.name, avatarId: Number(entry.characterId) });
      }
    }
    if (byId.size > 0) return [...byId.values()];
  } catch (err) {
    console.error("Akasha live fetch failed, using static history:", err.response?.status || err.message);
  }

  const out = [];
  for (const name of AKASHA_HISTORY) {
    try {
      const found = await findCharacterByName(name);
      out.push({ name: found ? found.name : name, avatarId: found ? Number(found.avatarId) : null });
    } catch (err) {
      out.push({ name, avatarId: null });
    }
  }
  return out;
}

// Just the avatarIds currently in the live in-game showcase
async function getLiveShowcaseIds(uid) {
  try {
    const response = await axios.get(`https://enka.network/api/uid/${uid}`, { headers: HEADERS, timeout: 8000 });
    const avatarList = response.data.avatarInfoList || [];
    return { ids: new Set(avatarList.map(a => a.avatarId)), avatars: avatarList };
  } catch (err) {
    console.error("Enka showcase fetch error:", err.message);
    return { ids: new Set(), avatars: [] };
  }
}

async function fetchAndMerge(uid) {
  const [akashaChars, live] = await Promise.all([
    getAkashaCharacters(uid),
    getLiveShowcaseIds(uid)
  ]);

  // Match by name (case-insensitive) so local-data ID quirks for new
  // characters can never mark a live character as not showcased.
  const liveByName = new Map();
  for (const a of live.avatars) {
    const info = await getCharacterInfo(a.avatarId);
    if (info?.name) liveByName.set(info.name.toLowerCase(), a.avatarId);
  }

  if (akashaChars) {
    // Full history (live Akasha or static fallback), tagged with live status
    const merged = akashaChars.map(c => {
      const liveId = liveByName.get(c.name.toLowerCase());
      return liveId !== undefined
        ? { name: c.name, avatarId: liveId, isLive: true }
        : { name: c.name, avatarId: c.avatarId, isLive: false };
    });
    // Safety net: live characters missing from history (new showcase while
    // Akasha is unreachable) still get listed so their cards always work.
    const known = new Set(merged.map(c => c.name.toLowerCase()));
    for (const [lname, avid] of liveByName) {
      if (!known.has(lname)) {
        const info = await getCharacterInfo(avid);
        merged.push({ name: info?.name || lname, avatarId: avid, isLive: true });
      }
    }
    return merged;
  }

  // Akasha failed (e.g. 403) - degrade to just the live Enka showcase so autocomplete
  // still works, resolving names via the local character data map.
  return Promise.all(live.avatars.map(async (a) => {
    const info = await getCharacterInfo(a.avatarId);
    return { name: info?.name || "Unknown", avatarId: a.avatarId, isLive: true };
  }));
}

// Stale-while-revalidate: serve cached data instantly (even if stale) and refresh
// in the background, so autocomplete never blocks on a slow/failing API call and
// risks missing Discord's 3s response window. Only blocks on a true cold start.
async function getShowcaseCharacters(uid) {
  const cached = showcaseCache.get(uid);

  if (cached) {
    if (Date.now() - cached.fetchedAt > SHOWCASE_CACHE_TTL_MS && !cached.refreshing) {
      cached.refreshing = true;
      fetchAndMerge(uid)
        .then(data => showcaseCache.set(uid, { data, fetchedAt: Date.now(), refreshing: false }))
        .catch(err => {
          console.error("Background showcase refresh failed:", err.message);
          cached.refreshing = false;
        });
    }
    return cached.data;
  }

  // Cold start - nothing cached yet, have to wait for the real fetch
  const data = await fetchAndMerge(uid);
  showcaseCache.set(uid, { data, fetchedAt: Date.now(), refreshing: false });
  return data;
}

// Top Akasha percentiles for a character (best 3 calculations - a character
// like Furina can hold several). Empty when Akasha is unreachable (403 on
// most hosts) - the card still works without it.
async function getAkashaRanks(uid, avatarId, name) {
  try {
    const response = await axios.get(`https://akasha.cv/api/getCalculationsForUser/${uid}`, {
      headers: AKASHA_HEADERS,
      timeout: 8000
    });
    const raw = response.data.data || response.data;
    const lname = String(name || "").toLowerCase();
    const found = [];
    for (const entry of raw) {
      const idMatch = avatarId != null && Number(entry.characterId) === Number(avatarId);
      const nameMatch = entry.name && String(entry.name).toLowerCase() === lname;
      if (!idMatch && !nameMatch) continue;
      const calcs = Object.values(entry.calculations || {});
      const feat = calcs.find(c => c.priority === 1) || calcs[0];
      if (!feat || !feat.outOf) continue;
      found.push({
        pct: Math.ceil((feat.ranking / feat.outOf) * 100),
        short: feat.short || "",
        variant: (feat.variant && feat.variant.displayName) || "",
        ranking: feat.ranking,
        outOf: feat.outOf
      });
    }
    found.sort((a, b) => a.pct - b.pct);
    return found.slice(0, 3);
  } catch (err) {
    return [];
  }
}

// Draws rank pills onto the top-left of the Enka card. Text only, no emoji
// (host canvas has no emoji font).
async function overlayRanks(cardBuffer, ranks) {
  const img = await loadImage(cardBuffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, img.width, img.height);
  const pad = Math.max(24, Math.round(img.width * 0.02));
  ctx.font = `bold ${Math.max(22, Math.round(img.width * 0.018))}px sans-serif`;
  ctx.textAlign = "left";
  let y = pad + 10;
  for (const r of ranks.slice(0, 2)) {
    const text = `TOP ${r.pct}%  ${[r.short, r.variant].filter(Boolean).join("  ·  ")}`;
    const w = ctx.measureText(text).width + 44;
    const h = Math.max(44, Math.round(img.height * 0.045));
    roundRect(ctx, pad, y, w, h, 10);
    ctx.fillStyle = "rgba(5, 8, 14, 0.72)";
    ctx.fill();
    ctx.fillStyle = "#FFD700";
    ctx.fillText(text, pad + 22, y + h / 2 + 8);
    y += h + 12;
  }
  return canvas.toBuffer("image/png");
}

async function fetchEnkaCard(uid, avatarId, retries = 1) {
  const url = `https://cards.enka.network/u/${uid}/${avatarId}/image?lang=en&substats=true&uid=true`;
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 45000,
      headers: HEADERS
    });
    return Buffer.from(response.data);
  } catch (err) {
    const status = err.response?.status;
    if (retries > 0 && (!status || status >= 500 || status === 429)) {
      await new Promise(r => setTimeout(r, 3000));
      return fetchEnkaCard(uid, avatarId, retries - 1);
    }
    throw err;
  }
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
      // Always fresh - never serve a stale showcase on an explicit /build.
      const showcase = await fetchAndMerge(targetUid);
      showcaseCache.set(targetUid, { data: showcase, fetchedAt: Date.now(), refreshing: false });

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

      // Always attempt the card first - Enka sometimes still serves a
      // recently removed character from cache. Rank pills drawn onto the
      // card when Akasha answers (best-effort).
      if (matchedAvatar.avatarId) {
        const [cardRes, ranks] = await Promise.all([
          fetchEnkaCard(targetUid, matchedAvatar.avatarId).then(
            v => ({ ok: true, value: v }),
            e => ({ ok: false, error: e })
          ),
          getAkashaRanks(targetUid, matchedAvatar.avatarId, matchedAvatar.name)
        ]);
        if (cardRes.ok) {
          let finalBuffer = cardRes.value;
          if (ranks.length > 0) {
            try {
              finalBuffer = await overlayRanks(cardRes.value, ranks);
            } catch (overlayErr) {
              console.error("Rank overlay failed:", overlayErr.message);
            }
          }
          const attachment = new AttachmentBuilder(finalBuffer, { name: "build.png" });
          await interaction.editReply({ files: [attachment] });
          return;
        }
        console.error("Card fetch failed:", cardRes.error.message);
      }

      const charInfo = await getCharacterInfo(matchedAvatar.avatarId);
      const style = getElementStyle(charInfo?.element);
      const embed = new EmbedBuilder()
        .setTitle(`${style.emoji} ${charInfo?.name || matchedAvatar.name}`)
        .setColor(style.color)
        .setDescription(`**${matchedAvatar.name}** has no card available right now - they aren't in the current in-game showcase.\nSwap them into your in-game Character Showcase to get a card here.`);
      await interaction.editReply({ embeds: [embed] });

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

      // Live showcase only - removed characters have no card to show
      const liveOnly = showcase.filter(c => c.isLive);
      const filtered = focused
        ? liveOnly.filter(c => c.name.toLowerCase().includes(focused.toLowerCase()))
        : liveOnly;

      await interaction.respond(
        filtered.slice(0, 25).map(c => ({
          name: c.name,
          value: c.name
        }))
      );
    } catch (err) {
      console.error("Autocomplete error:", err.message);
      await interaction.respond([]);
    }
  }
};