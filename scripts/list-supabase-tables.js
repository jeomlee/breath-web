// scripts/list-supabase-tables.js
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (["node_modules", ".git", "dist", "build"].includes(ent.name)) continue;
      walk(p, out);
    } else {
      if (EXTS.has(path.extname(ent.name))) out.push(p);
    }
  }
  return out;
}

const SRC = path.join(ROOT, "src");
if (!fs.existsSync(SRC)) {
  console.error("❌ src 폴더를 찾을 수 없습니다.");
  process.exit(1);
}

const files = walk(SRC);
const tables = new Map(); // table -> [files]

const re = /supabase\.from\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  let match;
  while ((match = re.exec(content))) {
    const table = match[1];
    if (!tables.has(table)) tables.set(table, []);
    tables.get(table).push(path.relative(ROOT, file));
  }
}

console.log("\n==============================");
console.log("📦 supabase.from() 사용 테이블");
console.log("==============================");

[...tables.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .forEach(([table, refs]) => {
    console.log(`\n▶ ${table}`);
    [...new Set(refs)].forEach(r => {
      console.log(`   - ${r}`);
    });
  });

console.log("\n✅ 스캔 완료\n");
