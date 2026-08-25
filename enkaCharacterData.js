// Shared helper: resolves Enka avatarId -> character name/icon/element/weapon.
// Fetches EnkaNetwork's public data dump once and caches it in memory,
// refreshing every 6 hours (character list barely changes, cheap to keep fresh).
const axios = require("axios");

const CHAR_URL = "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/characters.json";
const LOC_URL = "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/loc.json";
const REFRESH_MS = 6 * 60 * 60 * 1000;

let cache = null; // { byId: { [avatarId]: { name, icon, element, weaponType } }, fetchedAt }

async function loadCharacterData() {
  if (cache && Date.now() - cache.fetchedAt < REFRESH_MS) return cache.byId;

  const [charsRes, locRes] = await Promise.all([
    axios.get(CHAR_URL),
    axios.get(LOC_URL)
  ]);

  const chars = charsRes.data;
  const namesEn = locRes.data.en;

  const byId = {};
  for (const [avatarId, info] of Object.entries(chars)) {
    const rarityMap = { QUALITY_ORANGE: 5, QUALITY_PURPLE: 4 };
    byId[avatarId] = {
      name: namesEn[info.NameTextMapHash] || `Character ${avatarId}`,
      icon: `https://enka.network/ui/${info.SideIconName?.replace("_Side", "") || info.SideIconName}.png`,
      element: info.Element || "Unknown",
      weaponType: (info.WeaponType || "").replace("WEAPON_", "").replace(/_/g, " "),
      rarity: rarityMap[info.QualityType] || null
    };
  }

  cache = { byId, fetchedAt: Date.now() };
  return byId;
}

async function getCharacterInfo(avatarId) {
  try {
    const byId = await loadCharacterData();
    return byId[String(avatarId)] || null;
  } catch (err) {
    console.error("EnkaCharacterData fetch error:", err.message);
    return null;
  }
}

// Case-insensitive lookup by (partial) name, for the /character command.
async function findCharacterByName(query) {
  const byId = await loadCharacterData();
  const q = query.toLowerCase().trim();
  const match = Object.entries(byId).find(([, info]) => info.name.toLowerCase() === q)
    || Object.entries(byId).find(([, info]) => info.name.toLowerCase().includes(q));
  return match ? { avatarId: match[0], ...match[1] } : null;
}

module.exports = { getCharacterInfo, findCharacterByName };
