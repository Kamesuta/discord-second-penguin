# 🐧 discord-second-penguin

VCに「入りたいけど一人目は嫌」な人が**匿名で**意思表明だけしておき、規定人数に達したら参加者全員に通知して同時入室を促す Discord BOT の超簡易版。

- Cloudflare Workers **無料プラン**（Durable Object の alarm で締切管理）
- Discord **User-Installable App**（サーバーに BOT を入れる必要なし、実行時 Bot token 不要）
- `src/index.js` 1 ファイル

## 動き

1. `/penguin` でチャンネルにパネル（「🐧 VC入る」ボタン）を置く。パネルは常設。
2. 誰かがボタンを押すとパネルが「🐧だれかがVC募集しているよ！（N人集まったら通知するよ）（残り時間 …）」に変わる。**誰が押したかは公開されない**。
3. 押した本人にだけ「登録したよ (n/N)」と現在のメンバーが ephemeral で見える。
4. N人集まったら**即座に**（`wait_full:true` なら締切時に）全員に「🐧N人集まりました！VC来て来て！」を ephemeral で通知（本人 ping 付き）。
5. 締切までに集まらなければ各自に「流会」を ephemeral で通知。パネルは元に戻り、また押せば再募集。

オプション:

| オプション | 既定 | 説明 |
|---|---|---|
| `threshold` | 3 | 何人集まったら通知するか (2〜10) |
| `wait_full` | false | 人数が集まっても締切まで待つ |
| `minutes` | 10 | 締切までの分数 (1〜15) |

## セットアップ

1. [Discord Developer Portal](https://discord.com/developers/applications) でアプリを作成
   - **Installation** → Installation Contexts で **User Install** を有効化、Install Link は Discord Provided Link、Default Install Settings の scope は `applications.commands`
   - **General Information** の Application ID と Public Key を控える
2. `wrangler.jsonc` の `DISCORD_APP_ID` を書き換え
3. デプロイ
   ```sh
   npm install
   npx wrangler login
   npx wrangler secret put DISCORD_PUBLIC_KEY   # Public Key を貼り付け
   npm run deploy
   ```
4. Developer Portal の **General Information → Interactions Endpoint URL** にデプロイされた Worker の URL を設定して保存（Discord が PING で検証する）
5. スラッシュコマンドを登録（1回だけ。Bot → Token を使う）
   ```sh
   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... npm run register
   ```
6. Installation の Install Link を開いて自分のアカウントに追加 → 任意のサーバーで `/penguin`

## ローカル開発

```sh
echo 'DISCORD_PUBLIC_KEY=...' > .dev.vars
npm run dev
```

## 実機で確認したいこと

- 他ユーザーのボタン押下（type 7 UPDATE_MESSAGE）によるパネル更新が、アプリ未インストールのサーバーでも通るか
- ephemeral followUp 内の `<@本人>` メンションで通知が鳴るか（鳴らない場合は成立通知だけ非 ephemeral にする）
- user-installed かつ未インストールサーバーでは followUp が 1 interaction あたり 5 本まで。本実装は token あたり最大 2 本
