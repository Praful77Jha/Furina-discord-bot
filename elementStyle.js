// Shared element -> Discord embed color + emoji mapping.
// Colors picked to roughly match each element's in-game UI color.
const ELEMENT_STYLE = {
  Fire:    { color: 0xEF7938, emoji: "🔥", label: "Pyro" },
  Water:   { color: 0x30A8EF, emoji: "💧", label: "Hydro" },
  Wind:    { color: 0x5CD7A6, emoji: "🌪️", label: "Anemo" },
  Electric:{ color: 0xC186E3, emoji: "⚡", label: "Electro" },
  Grass:   { color: 0x9BD52D, emoji: "🌿", label: "Dendro" },
  Ice:     { color: 0x7FD1E3, emoji: "❄️", label: "Cryo" },
  Rock:    { color: 0xE8B93F, emoji: "🪨", label: "Geo" },
  Unknown: { color: 0x99AAB5, emoji: "❔", label: "Unknown" }
};

function getElementStyle(elementRaw) {
  return ELEMENT_STYLE[elementRaw] || ELEMENT_STYLE.Unknown;
}

module.exports = { getElementStyle };
