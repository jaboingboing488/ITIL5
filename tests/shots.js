// Takes iPhone-sized screenshots of the main screens: node tests/shots.js <outdir>
const { chromium } = require("playwright-core");
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const out = process.argv[2] || ".";
const mime = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const srv = http.createServer((q, r) => { let p = q.url.split("?")[0]; if (p.endsWith("/")) p += "index.html"; const f = path.join(root, p); if (!fs.existsSync(f)) { r.statusCode = 404; return r.end(); } r.setHeader("content-type", mime[path.extname(f)] || "text/plain"); r.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => srv.listen(0, r));
  let b; for (const ch of ["msedge", "chrome"]) { try { b = await chromium.launch({ channel: ch }); break; } catch (e) {} }
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  await pg.goto("http://localhost:" + srv.address().port + "/");
  const tab = t => pg.click('nav button[data-v="' + t + '"]');
  const shot = async n => { await pg.waitForTimeout(250); await pg.screenshot({ path: path.join(out, n + ".png") }); };
  await shot("1-today");
  await pg.click("[data-a=guidehide]"); await shot("2-today-after");
  await tab("learn"); await shot("3-learn");
  await pg.click("[data-a=openlesson] >> nth=0"); await shot("4-lesson");
  await tab("quiz"); await shot("5-quiz");
  await pg.click("[data-a=qstart][data-v=baseline]"); await pg.click("[data-a=qpick] >> nth=0"); await shot("6-question");
  await tab("cards"); await pg.click("[data-a=openterm] >> nth=0"); await shot("7-term");
  await tab("work"); await shot("8-work");
  await tab("session"); await shot("9-session");
  await b.close(); srv.close();
})();
