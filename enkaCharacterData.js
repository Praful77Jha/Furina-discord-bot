const axios = require("axios");

const CHAR_URL = "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/characters.json";
const LOC_URL = "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/loc.json";
const REFRESH_MS = 6 * 60 * 60 * 1000;

let cache = null;

const NEW_CHARACTERS = {
  "10000125": { name: "Columbina", element: "Hydro", weaponType: "CATALYST" },
  "10000126": { name: "Iansan", element: "Pyro", weaponType: "CLAYMORE" },
  "10000127": { name: "Skirk", element: "Cryo", weaponType: "SWORD" },
  "10000128": { name: "Dainsleif", element: "Physical", weaponType: "SWORD" },
  "10000129": { name: "Capitano", element: "Cryo", weaponType: "SWORD" },
  "10000130": { name: "Lauma", element: "Dendro", weaponType: "CATALYST" },
  "10000131": { name: "Durin", element: "Cryo", weaponType: "CLAYMORE" },
  "10000132": { name: "Varka", element: "Cryo", weaponType: "CLAYMORE" },
};

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
    const baseName = (info.SideIconName || "").replace("_Side", "").replace("UI_AvatarIcon_", "");
    const faceIcon = baseName ? `https://enka.network/ui/UI_AvatarIcon_${baseName}.png` : null;
    const splashArt = baseName ? `https://enka.network/ui/UI_Gacha_AvatarImg_${baseName}.png` : null;

    byId[avatarId] = {
      name: namesEn[info.NameTextMapHash] || `Character ${avatarId}`,
      icon: faceIcon,
      splashArt,
      element: info.Element || "Unknown",
      weaponType: (info.WeaponType || "").replace("WEAPON_", "").replace(/_/g, " "),
      rarity: rarityMap[info.QualityType] || null
    };
  }

  for (const [id, data] of Object.entries(NEW_CHARACTERS)) {
    if (!byId[id]) {
      const baseName = id;
      byId[id] = {
        name: data.name,
        icon: `https://enka.network/ui/UI_AvatarIcon_${baseName}.png`,
        splashArt: `https://enka.network/ui/UI_Gacha_AvatarImg_${baseName}.png`,
        element: data.element,
        weaponType: data.weaponType,
        rarity: 5
      };
    }
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

async function findCharacterByName(query) {
  const byId = await loadCharacterData();
  const q = query.toLowerCase().trim();

  for (const [avatarId, info] of Object.entries(byId)) {
    if (info.name.toLowerCase() === q || info.name.toLowerCase().includes(q)) {
      return { avatarId, ...info };
    }
  }
  return null;
}

async function getAllCharacters() {
  const byId = await loadCharacterData();
  return byId;
}

module.exports = { getCharacterInfo, findCharacterByName, getAllCharacters };
