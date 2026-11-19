// Data validation: node tests/validate.js
const PRIV = new RegExp("home" + "ward", "i");
const fs = require("fs"), path = require("path");
const d = p => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", p), "utf8"));
const quiz = d("quiz.json"), terms = d("terms.json");
const bad = [];
const ids = new Set();
quiz.forEach(q => {
  if (ids.has(q.id)) bad.push("dup " + q.id);
  ids.add(q.id);
  if (!Array.isArray(q.options) || q.options.length !== 4 || new Set(q.options).size !== 4) bad.push("options " + q.id);
  if (!(q.correctIndex >= 0 && q.correctIndex < 4)) bad.push("idx " + q.id);
  if (q.verified && !q.sourceRef) bad.push("noref " + q.id);
  if (PRIV.test(JSON.stringify(q))) bad.push("private " + q.id);
});
const tid = new Set();
terms.forEach(t => {
  if (tid.has(t.id)) bad.push("dup " + t.id);
  tid.add(t.id);
  if (t.verified && !t.sourceRef) bad.push("noref " + t.id);
  if (PRIV.test(JSON.stringify(t))) bad.push("private " + t.id);
});
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
if (PRIV.test(html)) bad.push("index.html mentions a private name");
if (/peoplecert|jaron/i.test(html)) bad.push("index.html mentions a personal or marked name");
if (bad.length) { console.error("VALIDATION FAILED", bad); process.exit(1); }
console.log("validation ok: " + quiz.length + " questions, " + terms.length + " terms");
