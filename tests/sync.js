// Two-device progress sync test: node tests/sync.js
// Two separate browser contexts (phone, computer) share one stubbed GitHub contents API.
const { chromium } = require("playwright-core");
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const mime = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };
const srv = http.createServer((q, r) => {
  let p = q.url.split("?")[0];
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.statusCode = 404; return r.end(); }
  r.setHeader("content-type", mime[path.extname(f)] || "text/plain");
  r.end(fs.readFileSync(f));
});
(async () => {
  await new Promise(r => srv.listen(0, r));
  const url = "http://localhost:" + srv.address().port + "/";
  let b;
  for (const ch of ["msedge", "chrome"]) { try { b = await chromium.launch({ channel: ch }); break; } catch (e) {} }
  if (!b) throw new Error("no browser found");
  // stubbed remote
  const remote = { content: null, sha: null, n: 0, puts: 0 };
  const handler = async route => {
    const req = route.request();
    const u = req.url();
    if (!u.endsWith("/contents/progress.json")) {
      if (u.endsWith("/contents/lessons.json")) return route.fulfill({ status: 404, body: "{}" });
      return route.fulfill({ status: 404, body: "{}" });
    }
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (req.method() === "GET") {
      if (!remote.content) return route.fulfill({ status: 404, headers: cors, body: "{}" });
      return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ sha: remote.sha, content: remote.content, encoding: "base64" }) });
    }
    if (req.method() === "PUT") {
      const body = JSON.parse(req.postData());
      if (remote.content && body.sha !== remote.sha) return route.fulfill({ status: 409, headers: cors, body: "{}" });
      if (!remote.content && body.sha) return route.fulfill({ status: 422, headers: cors, body: "{}" });
      remote.content = body.content; remote.sha = "sha" + (++remote.n); remote.puts++;
      return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ content: { sha: remote.sha } }) });
    }
    route.fulfill({ status: 405, body: "{}" });
  };
  let n = 0;
  const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); n++; console.log("ok", m); };
  async function device() {
    const ctx = await b.newContext({ viewport: { width: 375, height: 740 } });
    await ctx.route("https://api.github.com/**", handler);
    const pg = await ctx.newPage();
    const errs = [];
    pg.on("pageerror", e => errs.push(String(e)));
    await pg.goto(url);
    await pg.evaluate(() => localStorage.setItem("focus.sync", JSON.stringify({ repo: "o/r", token: "t", last: 0 })));
    await pg.reload();
    return { ctx, pg, errs, tab: t => pg.click('nav button[data-v="' + t + '"]'), state: () => pg.evaluate(() => JSON.parse(localStorage.getItem("focus.v2"))) };
  }
  async function syncNow(d) {
    await d.pg.click("[data-a=syncnow]");
    await d.pg.waitForTimeout(150);
    await d.pg.evaluate(() => new Promise(r => { const t = setInterval(() => { if (!window.pbusy) { clearInterval(t); r(); } }, 50); }));
  }
  const phone = await device();
  const pc = await device();

  // phone: log a work event, save a term, then sync now
  await phone.tab("work");
  await phone.pg.fill("#wwhat", "Event from the phone"); await phone.pg.fill("#wlab", "Incident");
  await phone.pg.selectOption("#wst", "Operate"); await phone.pg.selectOption("#wpr", "Focus on value");
  await phone.pg.fill("#wim", "Do X");
  await phone.pg.click("[data-a=wsave]");
  await phone.tab("cards");
  await phone.pg.click("[data-a=openterm] >> nth=0");
  await phone.pg.selectOption("#trung", "3");
  await phone.pg.fill("#tpw", "Phone words");
  await phone.pg.click("[data-a=tsave]");
  await phone.tab("learn");
  await syncNow(phone);
  await phone.pg.waitForSelector("text=/Progress (synced|up to date)/");
  ok(remote.puts >= 1 && !!remote.content, "phone pushed progress to the shared store");

  // pc: open, pull
  await pc.pg.reload();
  await pc.pg.waitForTimeout(1500);
  let st = await pc.state();
  ok(st.log.workApps.some(w => w.what === "Event from the phone"), "pc received the phone's work event");
  ok(st.terms[0].rung === 3 && st.terms[0].plainWords === "Phone words", "pc received the phone's term update");

  // pc: its own entry, then sync; phone pulls and holds both
  await pc.tab("work");
  await pc.pg.fill("#wwhat", "Event from the pc"); await pc.pg.fill("#wlab", "Change");
  await pc.pg.selectOption("#wst", "Operate"); await pc.pg.selectOption("#wpr", "Focus on value");
  await pc.pg.fill("#wim", "Do Y");
  await pc.pg.click("[data-a=wsave]");
  await pc.tab("learn");
  await syncNow(pc);
  await pc.pg.waitForSelector("text=/Progress (synced|up to date)/");
  await phone.tab("learn");
  await syncNow(phone);
  await phone.pg.waitForSelector("text=/Progress (synced|up to date)/");
  await phone.pg.waitForTimeout(800);
  st = await phone.state();
  const labels = st.log.workApps.map(w => w.what).sort();
  ok(labels.length === 2 && labels[0] === "Event from the pc" && labels[1] === "Event from the phone", "phone merged both devices' events, nothing lost");

  // both devices edit at once: both survive
  await phone.tab("work");
  await phone.pg.fill("#wwhat", "Phone offline edit"); await phone.pg.fill("#wlab", "Event");
  await phone.pg.selectOption("#wst", "Operate"); await phone.pg.selectOption("#wpr", "Focus on value");
  await phone.pg.fill("#wim", "Z");
  await phone.pg.click("[data-a=wsave]");
  await pc.tab("work");
  await pc.pg.fill("#wwhat", "Pc offline edit"); await pc.pg.fill("#wlab", "Problem");
  await pc.pg.selectOption("#wst", "Operate"); await pc.pg.selectOption("#wpr", "Focus on value");
  await pc.pg.fill("#wim", "W");
  await pc.pg.click("[data-a=wsave]");
  await pc.tab("learn"); await syncNow(pc); await pc.pg.waitForSelector("text=/Progress (synced|up to date)/");
  await phone.tab("learn"); await syncNow(phone); await phone.pg.waitForSelector("text=/Progress (synced|up to date)/");
  await syncNow(pc); await pc.pg.waitForTimeout(2500);
  const a = (await phone.state()).log.workApps.length, c = (await pc.state()).log.workApps.length;
  ok(a === 4 && c === 4, "concurrent edits on both devices merged to the same four events");
  // zero-setup path: copy progress from one device, merge on the other, nothing lost
  const solo1 = await b.newContext({ viewport: { width: 375, height: 740 } }), solo2 = await b.newContext({ viewport: { width: 375, height: 740 } });
  const d1 = await solo1.newPage(), d2 = await solo2.newPage();
  await d1.goto(url); await d2.goto(url);
  const logWork = async (pg, what) => {
    await pg.click('nav button[data-v="work"]');
    await pg.fill("#wwhat", what); await pg.fill("#wlab", "Incident");
    await pg.selectOption("#wst", "Operate"); await pg.selectOption("#wpr", "Focus on value"); await pg.fill("#wim", "x");
    await pg.click("[data-a=wsave]");
  };
  await logWork(d1, "Only on device one"); await logWork(d2, "Only on device two");
  await d1.click('nav button[data-v="export"]');
  const code = await d1.inputValue("#bk");
  await d2.click('nav button[data-v="export"]');
  await d2.fill("#imp", code); await d2.click("[data-a=import]");
  const w2 = (await d2.evaluate(() => JSON.parse(localStorage.getItem("focus.v2")))).log.workApps.map(w => w.what).sort();
  ok(w2.length === 2 && w2[0] === "Only on device one" && w2[1] === "Only on device two", "copy and merge combines both devices without losing either");
  ok(phone.errs.length === 0 && pc.errs.length === 0, "no page errors on either device");
  console.log("ALL PASSED (" + n + " checks)");
  await b.close(); srv.close();
})().catch(e => { console.error(String((e && e.stack) || e).split("\n").filter(l => /sync\.js|Error/.test(l)).join("\n")); process.exit(1); });
