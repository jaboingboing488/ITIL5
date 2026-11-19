// Dumps the text of every screen so the wording can be audited: node tests/dump.js > out.txt
const { chromium } = require("playwright-core");
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const mime = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const srv = http.createServer((q, r) => { let p = q.url.split("?")[0]; if (p.endsWith("/")) p += "index.html"; const f = path.join(root, p); if (!fs.existsSync(f)) { r.statusCode = 404; return r.end(); } r.setHeader("content-type", mime[path.extname(f)] || "text/plain"); r.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => srv.listen(0, r));
  let b; for (const ch of ["msedge", "chrome"]) { try { b = await chromium.launch({ channel: ch }); break; } catch (e) {} }
  const pg = await (await b.newContext({ viewport: { width: 375, height: 740 } })).newPage();
  await pg.goto("http://localhost:" + srv.address().port + "/");
  const show = async name => { console.log("\n######## " + name + " ########"); console.log((await pg.locator("#app").innerText()).replace(/\n\n+/g, "\n")); };
  const tab = t => pg.click('nav button[data-v="' + t + '"]');
  await show("TODAY (fresh)");
  // open every details on today
  for (const d of await pg.locator("#app details").all()) { try { await d.locator("summary").click(); } catch (e) {} }
  await show("TODAY (expanded)");
  await tab("learn"); await show("LEARN list");
  await pg.click("[data-a=openlesson] >> nth=0"); await show("LESSON view (first lesson)");
  await tab("session"); await show("SESSION idle");
  await pg.click("[data-a=sstart]"); await show("SESSION running");
  await pg.click("[data-a=sfin]");
  await tab("quiz"); await show("QUIZ menu");
  await pg.click("[data-a=qstart][data-v=baseline]"); await show("QUIZ question");
  await pg.click("[data-a=qpick] >> nth=0"); await show("QUIZ after answer");
  await tab("cards"); await show("CARDS list");
  await pg.click("[data-a=startrev]"); await show("REVIEW card");
  await pg.click("[data-a=revshow]"); await show("REVIEW revealed");
  await tab("cards");
  await pg.click("[data-a=openterm] >> nth=0"); await show("TERM page");
  await pg.click("[data-a=fstart]"); await show("FEYNMAN step 1");
  await tab("work"); await show("WORK");
  await tab("export"); await show("EXPORT");
  await b.close(); srv.close();
})();
