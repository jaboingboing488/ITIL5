// End-to-end test: node tests/run.js  (needs Edge or Chrome; uses playwright-core)
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
  const ctx = await b.newContext({ viewport: { width: 375, height: 740 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  pg.on("pageerror", e => errs.push(String(e)));
  let n = 0;
  const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); n++; console.log("ok", m); };
  const tab = t => pg.click('nav button[data-v="' + t + '"]');
  const state = () => pg.evaluate(() => JSON.parse(localStorage.getItem("focus.v2")));
  await pg.goto(url);
  for (const t of ["today", "session", "quiz", "cards", "work", "export"]) {
    await tab(t);
    ok(await pg.locator("#app h1").count() > 0, "tab " + t);
  }
  const small = await pg.evaluate(() => [...document.querySelectorAll("button")].filter(b => b.offsetParent && b.getBoundingClientRect().height < 43).length);
  ok(small === 0, "buttons are at least 44px tall");
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= 376), "fits 375px width");
  // baseline
  await tab("quiz");
  await pg.click("[data-a=qstart][data-v=baseline]");
  for (let i = 0; i < 20; i++) { await pg.click("[data-a=qpick] >> nth=0"); await pg.click("[data-a=qnext]"); }
  ok(await pg.locator("text=Baseline result").count() === 1, "baseline finished");
  await pg.click("[data-a=qdone]");
  ok((await state()).log.baseline.total === 20, "baseline stored for M0 criteria");
  // module quiz
  await pg.selectOption("#qm", "M1");
  await pg.click("[data-a=qstart][data-v=module]");
  let cnt = 0;
  while (await pg.locator("[data-a=qpick]").count() > 0 && cnt < 40) { await pg.click("[data-a=qpick] >> nth=1"); await pg.click("[data-a=qnext]"); cnt++; }
  ok(cnt >= 15, "module quiz finished (" + cnt + " items)");
  await pg.click("[data-a=qdone]");
  // feynman
  await tab("cards");
  await pg.click("[data-a=openterm] >> nth=0");
  await pg.click("[data-a=fstart]");
  await pg.click("[data-a=fnext]");
  await pg.fill("#fex", "It is a thing. Short."); await pg.click("[data-a=fnext]");
  await pg.fill("#fgap", "none"); await pg.click("[data-a=fnext]");
  await pg.fill("#fsim", "Short plain version."); await pg.fill("#fana", "like a map"); await pg.fill("#fexm", "my own example"); await pg.click("[data-a=fnext]");
  await pg.click("[data-a=fpass]");
  let st = await state();
  ok(st.terms[0].rung >= 3 && st.log.feynman.length === 1 && st.terms[0].nextReview, "feynman pass saved and review scheduled");
  // review
  await pg.evaluate(() => { const s = JSON.parse(localStorage.getItem("focus.v2")); s.terms.forEach(t => { t.nextReview = "2099-01-01"; }); s.terms[0].nextReview = "2000-01-01"; s.terms[1].nextReview = "2000-01-01"; localStorage.setItem("focus.v2", JSON.stringify(s)); });
  await pg.reload();
  await tab("cards");
  await pg.click("[data-a=startrev]");
  await pg.click("[data-a=revshow]"); await pg.click("[data-a=revyes]");
  await pg.click("[data-a=revshow]"); await pg.click("[data-a=revno]");
  ok(await pg.locator("text=Reviewed").count() === 1, "review finished");
  await pg.click("[data-a=revdone]");
  st = await state();
  ok(st.terms[1].box === 1 && st.log.errors.length > 0 && st.log.reviews.length === 2, "miss resets box to 1 and writes an error");
  // work application
  await tab("work");
  await pg.fill("#wwhat", "Plain event"); await pg.fill("#wlab", "Incident");
  await pg.selectOption("#wst", "Operate"); await pg.selectOption("#wpr", "Focus on value");
  await pg.check(".wdim >> nth=0"); await pg.fill("#wim", "Do X");
  await pg.click("[data-a=wsave]");
  ok((await state()).log.workApps.length === 1, "work application saved");
  // simulation
  await tab("quiz");
  await pg.click("[data-a=qstart][data-v=sim]");
  await pg.click("[data-a=qpick] >> nth=0"); await pg.click("[data-a=qflag]");
  await pg.reload(); await tab("quiz");
  ok(await pg.locator("#qclk").count() === 1 && await pg.locator("text=1 flagged").count() === 1, "simulation survives a reload with its flag");
  await pg.click("[data-a=qnext]"); await pg.click("[data-a=qback]");
  await pg.click("[data-a=qjump][data-v=\"5\"]");
  ok(await pg.locator("text=6 / 40").count() === 1, "jump to a question");
  for (let i = 0; i < 40; i++) { await pg.click("[data-a=qjump][data-v=\"" + i + "\"]"); await pg.click("[data-a=qpick] >> nth=0"); }
  await pg.click("[data-a=qfinish]");
  ok(await pg.locator("text=Simulation result").count() === 1, "simulation finished");
  await pg.fill("#gsrc", "Source A"); await pg.click("[data-a=gateadd]");
  ok((await state()).log.gate.length === 1, "gate entry saved");
  // session
  await tab("session");
  await pg.click("[data-a=sstart]"); await pg.click("[data-a=smore]"); await pg.fill("#win", "a win"); await pg.click("[data-a=sfin]");
  ok((await state()).log.sessions.length === 1, "session logged");
  // export, import, persistence
  await tab("export");
  const md = await pg.inputValue("#ex");
  ok(md.includes("Work Applications") && md.includes("Plain event"), "markdown export");
  const bk = await pg.inputValue("#bk");
  await pg.evaluate(() => localStorage.clear());
  await pg.reload();
  await tab("export");
  await pg.fill("#imp", bk); await pg.click("[data-a=import]");
  st = await state();
  ok(st.log.workApps.length === 1 && st.log.sims.length === 1, "import restored state");
  await pg.reload();
  st = await state();
  ok(st.log.gate.length === 1, "state persists after reload");
  // v1 migration
  await pg.evaluate(() => { localStorage.clear(); localStorage.setItem("focus.v1", JSON.stringify({ gate: [{ date: "2026-01-01", score: 30, src: "x" }], err: [{ q: "a", a: "b", date: "2026-01-01" }], sessions: [] })); });
  await pg.reload();
  await tab("quiz");
  ok(await pg.locator("text=30/40").count() > 0, "v1 data migrated (gate entry shown)");
  await pg.waitForTimeout(800);
  ok(await pg.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), "service worker registered");
  ok((await (await fetch(url + "manifest.webmanifest")).json()).short_name === "Focus", "manifest short_name");
  ok(errs.length === 0, "no console errors " + JSON.stringify(errs));
  await b.close(); srv.close();
  console.log("ALL PASSED (" + n + " checks)");
})().catch(e => { console.error(e.message); process.exit(1); });
