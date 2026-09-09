const axios = require("axios");

const UID = process.argv[2]; // pass your UID as an argument

if (!UID) {
  console.error("Usage: node akasha-check.js <your_uid>");
  process.exit(1);
}

(async () => {
  try {
    const res = await axios.get(`https://akasha.cv/api/getCalculationsForUser/${UID}`, {
      headers: { "User-Agent": "FurinaDiscordBot/1.0" },
      timeout: 15000
    });

    const data = res.data.data || res.data; // handle either {data:[...]} or [...]
    console.log(`Got ${data.length} character entries.\n`);
    console.log("First entry (full shape):");
    console.log(JSON.stringify(data[0], null, 2));

    console.log("\nAll character names found:");
    console.log(data.map(c => c.name).join(", "));
  } catch (err) {
    console.error("Request failed:", err.response?.status, err.response?.data || err.message);
  }
})();
