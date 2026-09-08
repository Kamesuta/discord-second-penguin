// セカンドペンギンBOT 超簡易版
// Cloudflare Workers (無料プラン) + Durable Object (SQLite) + Discord User-Installable App
import { DurableObject } from "cloudflare:workers";
import { verifyKey } from "discord-interactions";

const API = "https://discord.com/api/v10";
const EPHEMERAL = 1 << 6;
const ALARM_MARGIN_MS = 30_000; // token(15分)切れ前に確実に alarm を発火させる余裕

// ---- パネル ----------------------------------------------------------------
// 設定は custom_id に埋め込む: penguin:{threshold}:{waitFull 0|1}:{minutes}
const customId = (cfg) => `penguin:${cfg.threshold}:${cfg.waitFull ? 1 : 0}:${cfg.minutes}`;
const parseCfg = (id) => {
  const [, t, w, m] = id.split(":");
  return { threshold: +t, waitFull: w === "1", minutes: +m };
};
const panel = (text, cfg) => ({
  content: text,
  components: [{ type: 1, components: [{ type: 2, style: 1, label: "VC入る", emoji: { name: "🐧" }, custom_id: customId(cfg) }] }],
});
const idleText = (cfg) => `🐧 VC入りたい人はボタンを押してね（${cfg.threshold}人集まったら通知するよ）`;
const openText = (cfg, deadline) =>
  `🐧だれかがVC募集しているよ！（${cfg.threshold}人集まったら通知するよ）（残り時間 <t:${Math.floor(deadline / 1000)}:R>）`;
const mentions = (members) => members.map((m) => `<@${m.id}>`).join(" ");

// ---- Discord API (interaction token のみ、Bot token 不要) ---------------------
async function discord(env, path, method, body) {
  try {
    const res = await fetch(`${API}/webhooks/${env.DISCORD_APP_ID}/${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.warn(`discord ${method} -> ${res.status}: ${await res.text()}`);
    return res.ok;
  } catch (e) {
    console.warn(`discord ${method} failed: ${e}`);
    return false;
  }
}
// 本人だけに見える followUp。既定では誰にも ping しない（表示のみ）
const followUp = (env, token, content, allowed_mentions = { parse: [] }) =>
  discord(env, token, "POST", { content, flags: EPHEMERAL, allowed_mentions });
// type 7 (UPDATE_MESSAGE) で応答した interaction の @original = パネル
const editPanel = (env, token, cfg) => discord(env, `${token}/messages/@original`, "PATCH", panel(idleText(cfg), cfg));

// 成立/流会を各メンバーに「自分の token」で ephemeral 通知（メンバー一覧は押した人にしか見えない）
async function notifyAll(env, session, ok) {
  const { members, cfg } = session;
  const list = `メンバー: ${mentions(members)}`;
  await Promise.all(
    members.map((m) =>
      ok
        ? followUp(env, m.token, `🐧${members.length}人集まりました！VC来て来て！\n${list}`, { users: [m.id] }) // 本人だけ ping
        : followUp(env, m.token, `💤 流会 (${members.length}/${cfg.threshold})　また押してね\n${list}`),
    ),
  );
}

async function afterJoin(env, r, token) {
  // 初回応答(type 7)が Discord に届く前に followUp が着くと失敗するので少し待つ
  await new Promise((resolve) => setTimeout(resolve, 500));
  const { members, cfg } = r.session;
  const count = `(${members.length}/${cfg.threshold})`;
  if (r.status === "dup") return followUp(env, token, `もう登録済みだよ ${count}`);
  await followUp(env, token, `🐧 登録したよ ${count}\nメンバー: ${mentions(members)}`);
  if (r.status === "resolved") await notifyAll(env, r.session, true);
}

// ---- Worker ------------------------------------------------------------------
const json = (obj) => new Response(JSON.stringify(obj), { headers: { "Content-Type": "application/json" } });

export default {
  async fetch(req, env, ctx) {
    if (req.method !== "POST") return new Response("🐧 second penguin is alive");

    const sig = req.headers.get("X-Signature-Ed25519");
    const ts = req.headers.get("X-Signature-Timestamp");
    const body = await req.text();
    if (!sig || !ts || !(await verifyKey(body, sig, ts, env.DISCORD_PUBLIC_KEY))) {
      return new Response("bad request signature", { status: 401 });
    }

    const i = JSON.parse(body);
    if (i.type === 1) return json({ type: 1 }); // PING

    if (i.type === 2) { // /penguin
      const opt = (name, def) => i.data.options?.find((o) => o.name === name)?.value ?? def;
      const cfg = { threshold: opt("threshold", 3), waitFull: opt("wait_full", false), minutes: opt("minutes", 10) };
      return json({ type: 4, data: panel(idleText(cfg), cfg) });
    }

    if (i.type === 3 && i.data.custom_id?.startsWith("penguin:")) { // ボタン押下
      const cfg = parseCfg(i.data.custom_id);
      const userId = (i.member?.user ?? i.user).id;
      const r = await env.PENGUIN.getByName(i.message.id).join(userId, i.token, cfg);
      ctx.waitUntil(afterJoin(env, r, i.token));
      const text = r.status === "resolved" ? idleText(cfg) : openText(cfg, r.session.deadline);
      return json({ type: 7, data: panel(text, cfg) }); // UPDATE_MESSAGE: パネルを書き換え（編集者は表示されない = 匿名）
    }

    return new Response("unknown interaction", { status: 400 });
  },
};

// ---- Durable Object (パネル message.id ごとに 1 つ) ---------------------------
export class PenguinSession extends DurableObject {
  async join(userId, token, cfg) {
    const storage = this.ctx.storage;
    let session = await storage.get("session");
    if (!session) {
      session = { deadline: Date.now() + cfg.minutes * 60_000, members: [], cfg };
      await storage.setAlarm(Math.max(session.deadline - ALARM_MARGIN_MS, Date.now() + 1000));
    }
    if (session.members.some((m) => m.id === userId)) return { status: "dup", session };

    session.members.push({ id: userId, token });
    if (!session.cfg.waitFull && session.members.length >= session.cfg.threshold) {
      await storage.deleteAll();
      await storage.deleteAlarm();
      return { status: "resolved", session };
    }
    await storage.put("session", session);
    return { status: "joined", session };
  }

  async alarm() {
    const storage = this.ctx.storage;
    const session = await storage.get("session");
    await storage.deleteAll(); // 先に消して、リトライ時の二重通知を防ぐ
    if (!session) return;
    await notifyAll(this.env, session, session.members.length >= session.cfg.threshold);
    await editPanel(this.env, session.members.at(-1).token, session.cfg); // パネルを idle に戻す
  }
}
