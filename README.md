# Furina Discord Bot

> Personal bot for my own Discord server — not meant for public/general use. Genshin config, sheet IDs, and payment info below are specific to my setup.

A multi-purpose Discord bot built with **discord.js v14** that combines Genshin Impact utilities with a Google Sheets-backed task/payment tracker. Runs as a single Node process with a lightweight HTTP server for uptime pings (currently hosted on Wispbyte).

## Features

### 🎮 Genshin Impact (`commands/genshin/`)
Restricted to a dedicated Discord category (`CATEGORY_ID` in `genshinConfig.js`):

- **`/build`** — Fetch a player's live in-game showcase via Enka.Network, pick a character from a select menu, and see calculated Crit Value (CV) for their equipped artifacts.
- **`/character <name>`** — Look up detailed info for any Genshin character (name resolved against Enka's public character/localization dumps).
- **`/codes`** — Fetch currently active redeem codes and filter out ones already claimed (in-memory tracking per UID — resets on bot restart).
- **`/banner`** — Show current and upcoming banners.
- **`/reminders`** — Talent/weapon domain rotation lookup by day of week.
- **Background automation** (`services/genshinAutomator.js`) — polls for new redeem codes every 30 minutes and posts a daily reset reminder, both to configured channels.

### 📊 Sheet Tracking (`commands/tracking/`)
Two independently configured Google Sheets ("Captain" and "Celebi"), each bound to its own Discord channel:

- **`/log`** — Log a new task/link with auto-detected type and amount (Twitter, LinkedIn, Medium, YouTube, Reddit).
- **`/check`** — Check whether a link already exists in the sheet.
- **`/edit`**, **`/delete`**, **`/undo`** — Modify or roll back rows (Manage Guild permission required); every mutation is written to a hidden `_History` tab for undo support.
- **`/paid`** / **`/unpaid`** — Mark rows paid/unpaid.
- **`/stats`**, **`/allstats`** — Per-sheet and combined stats, converting USD→INR using a live `GOOGLEFINANCE` rate pulled from the sheet.
- **`/dakshina`** — Post payment QR codes (GPay, BHIM, Paytm, Samsung Wallet).
- **`/sadashiv`** — Admin-only maintenance actions.

Commands are auto-loaded from `commands/<folder>/*.js` — anything folder isn't `genshin` is treated as a Sheet command and blocked from running inside the Genshin category (`bot.js`).

## Tech Stack

- [discord.js](https://discord.js.org/) v14
- [googleapis](https://www.npmjs.com/package/googleapis) (Sheets API v4, service account auth)
- `axios` — used by the Genshin commands/automator/Enka helper, but **not currently listed in `package.json`** — run `npm install axios` after cloning or add it to dependencies.
- Native Node `http` server for a health-check endpoint (`/`), used by the host's uptime monitor.

## Project Structure

```
.
├── bot.js                     # Entry point: command loader, interaction router, HTTP keepalive server
├── genshinConfig.js            # Genshin category/channel IDs and tracked UIDs
├── enkaCharacterData.js        # Enka avatarId -> character name/icon/element cache
├── setAvatar.js                # One-off script to set the bot's avatar
├── commands/
│   ├── genshin/                 # build, character, code, banner, reminders
│   └── tracking/                 # log, check, edit, delete, undo, paid, unpaid, stats, allstats, dakshina, sadashiv
├── services/
│   └── genshinAutomator.js     # Polling jobs: new codes, daily reset reminder
├── utils/
│   └── googleSheets.js         # Sheets auth, multi-sheet config, history/undo helpers
└── assets/                     # Bot avatar image, payment QR codes
```

## Local Setup (for me, redeploying/reinstalling)

1. **Install deps**
   ```bash
   npm install
   npm install axios   # not yet in package.json — required at runtime
   ```

2. **`.env` file** needs:
   ```
   DISCORD_TOKEN=...
   PORT=3000
   GOOGLE_CREDENTIALS_JSON={"type":"service_account", ...}   # or drop credentials.json in root
   SPREADSHEET_ID=...            # Captain sheet
   CAPTAIN_CHANNEL_ID=...
   CELEBI_SPREADSHEET_ID=...
   CELEBI_CHANNEL_ID=...
   ```

3. `genshinConfig.js` already has my server's category/channel IDs and Genshin UIDs baked in — only touch this if the server structure changes.

4. **Run**
   ```bash
   npm start
   ```
   Slash commands re-register automatically on login.

## Notes / Known Limitations

- Redeem-code "already claimed" tracking is in-memory only and resets on every restart — move it to a sheet/JSON file if persistence matters.
- The Genshin-category restriction blocks Sheet commands from *executing* inside the Genshin category, but Discord's command picker will still list them there (per-channel command visibility isn't supported without separate guild scopes).
- No test suite is configured (`npm test` is a placeholder).
