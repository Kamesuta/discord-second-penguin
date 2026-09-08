// スラッシュコマンド登録（1回だけ実行）
//   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... npm run register
//   (DISCORD_CLIENT_ID / DISCORD_TOKEN でも可)
const DISCORD_APP_ID = process.env.DISCORD_APP_ID ?? process.env.DISCORD_CLIENT_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN;
if (!DISCORD_APP_ID || !DISCORD_BOT_TOKEN) {
  console.error("DISCORD_APP_ID と DISCORD_BOT_TOKEN を環境変数で指定してください");
  process.exit(1);
}

const commands = [
  {
    name: "penguin",
    description: "VC待ち合わせパネルを置く",
    integration_types: [1], // USER_INSTALL
    contexts: [0, 2], // GUILD, PRIVATE_CHANNEL
    options: [
      { type: 4, name: "threshold", description: "何人集まったら通知するか（既定3）", min_value: 2, max_value: 10 },
      { type: 5, name: "wait_full", description: "人数が集まっても締切まで待つ（既定: 集まったら即通知）" },
      { type: 4, name: "minutes", description: "締切までの分数（既定10, 最大15）", min_value: 1, max_value: 15 },
    ],
  },
];

const res = await fetch(`https://discord.com/api/v10/applications/${DISCORD_APP_ID}/commands`, {
  method: "PUT",
  headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands),
});
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);
