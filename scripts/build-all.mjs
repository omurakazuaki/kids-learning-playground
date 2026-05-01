import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { readdirSync, mkdirSync, writeFileSync, statSync, readFileSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DOCS_DIR = join(ROOT, 'docs');
const DIST_DIR = join(ROOT, 'dist');
const REPO_NAME = 'kids-learning-playground';

// 環境変数で挙動を切り替え可能。
//   BUILD_CONCURRENCY: 並列ビルド数 (default 2)
//   BUILD_FORCE=1:     ハッシュキャッシュを無視して全件リビルド
const CONCURRENCY = Math.max(1, Number(process.env.BUILD_CONCURRENCY) || 2);
const FORCE = process.env.BUILD_FORCE === '1';

// このスクリプト自体や依存が変わったら全件再ビルドさせるための種。
// ビルド出力を変えるロジックを書き換えたら手動でインクリメントする。
const BUILD_VERSION = 1;

function buildInputsHash() {
  const lockPath = join(ROOT, 'pnpm-lock.yaml');
  const lock = existsSync(lockPath) ? readFileSync(lockPath, 'utf-8') : '';
  return createHash('sha256')
    .update(`v${BUILD_VERSION}|`)
    .update(lock)
    .digest('hex')
    .slice(0, 16);
}

const INPUTS_HASH = buildInputsHash();

function deckHash(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  return createHash('sha256')
    .update(INPUTS_HASH).update('|')
    .update(content)
    .digest('hex')
    .slice(0, 16);
}

function extractTitle(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const match = content.match(/^title:\s*(.+)$/m);
  return match ? match[1].trim() : basename(filePath, '.md');
}

function findSlides(dir) {
  const slides = [];
  for (const age of readdirSync(dir).sort((a, b) => Number(a) - Number(b))) {
    const agePath = join(dir, age);
    if (!statSync(agePath).isDirectory() || isNaN(age)) continue;
    for (const category of readdirSync(agePath).sort()) {
      const catPath = join(agePath, category);
      if (!statSync(catPath).isDirectory()) continue;
      for (const file of readdirSync(catPath).sort()) {
        if (!file.endsWith('.md') || file.includes('_baseline')) continue;
        const filePath = join(catPath, file);
        slides.push({
          age,
          category,
          name: basename(file, '.md'),
          title: extractTitle(filePath),
          file: filePath,
        });
      }
    }
  }
  return slides;
}

function hashFilePath(slide) {
  return join(DIST_DIR, slide.age, slide.category, slide.name, '.build-hash');
}

function isCached(slide, hash) {
  if (FORCE) return false;
  const hp = hashFilePath(slide);
  if (!existsSync(hp)) return false;
  return readFileSync(hp, 'utf-8').trim() === hash;
}

function runSlidev(slide) {
  const outDir = join(DIST_DIR, slide.age, slide.category, slide.name);
  const base = `/${REPO_NAME}/${slide.age}/${slide.category}/${slide.name}/`;
  mkdirSync(outDir, { recursive: true });
  return new Promise((resolve, reject) => {
    const args = ['exec', 'slidev', 'build', slide.file, '--out', outDir, '--base', base];
    const child = spawn('pnpm', args, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let buf = '';
    child.stdout.on('data', d => { buf += d; });
    child.stderr.on('data', d => { buf += d; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(buf);
      else reject(Object.assign(new Error(`slidev build exited with ${code}`), { output: buf }));
    });
  });
}

async function buildPool(items, concurrency) {
  const queue = items.slice();
  const total = queue.length;
  let done = 0;
  let failed = 0;
  const errors = [];
  async function worker() {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) return;
      const idx = ++done;
      const start = Date.now();
      const label = `${job.age}/${job.category}/${job.name}`;
      console.log(`[${idx}/${total}] → ${label}`);
      try {
        await runSlidev(job);
        const sec = ((Date.now() - start) / 1000).toFixed(1);
        writeFileSync(hashFilePath(job), job._hash, 'utf-8');
        console.log(`[${idx}/${total}] ✓ ${label} (${sec}s)`);
      } catch (e) {
        failed++;
        const sec = ((Date.now() - start) / 1000).toFixed(1);
        console.error(`[${idx}/${total}] ✗ ${label} (${sec}s)`);
        if (e.output) console.error(e.output);
        errors.push({ slide: job, error: e });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  return { failed, errors };
}

const slides = findSlides(DOCS_DIR);
console.log(`Found ${slides.length} slides`);

for (const s of slides) s._hash = deckHash(s.file);
const toBuild = slides.filter(s => !isCached(s, s._hash));
const cached = slides.length - toBuild.length;

console.log(`Cached: ${cached} / To build: ${toBuild.length} (concurrency=${CONCURRENCY}${FORCE ? ', force' : ''})`);

if (toBuild.length > 0) {
  const { failed } = await buildPool(toBuild, CONCURRENCY);
  if (failed > 0) {
    console.error(`\n${failed} build(s) failed.`);
    process.exit(1);
  }
}

// Group by age (flat — category shown via card color)
const grouped = {};
for (const { age, category, name, title } of slides) {
  (grouped[age] ??= []).push({
    category,
    name,
    title,
    href: `/${REPO_NAME}/${age}/${category}/${name}/`,
  });
}

const CATEGORY_META = {
  math:      { label: '算数',  icon: '🔢', color: '#FF6B6B' },
  japanese:  { label: '国語',  icon: '📖', color: '#4ECDC4' },
  english:   { label: '英語',  icon: '🌍', color: '#45B7D1' },
  reasoning: { label: '推論',  icon: '🧩', color: '#96CEB4' },
};
const FALLBACK_META = { label: 'その他', icon: '📚', color: '#888' };

function metaOf(cat) {
  return CATEGORY_META[cat] ?? FALLBACK_META;
}

function slideCard({ category, title, href }) {
  const { label, icon, color } = metaOf(category);
  return `<a href="${href}" class="slide-card" style="background:${color}" aria-label="${label}: ${title}">
      <span class="slide-icon" aria-hidden="true">${icon}</span>
      <span class="slide-title">${title}</span>
    </a>`;
}

function ageSection(age, items) {
  const cards = items.map(slideCard).join('');
  return `
  <section class="age-section">
    <h2>🎒 <span class="age-label">${age}さい 向け</span></h2>
    <div class="slide-grid">${cards}</div>
  </section>`;
}

const legend = Object.entries(CATEGORY_META).map(([, { label, icon, color }]) =>
  `<span class="legend-item"><span class="legend-swatch" style="background:${color}"></span>${icon} ${label}</span>`
).join('');

const sections = Object.entries(grouped).map(([age, items]) => ageSection(age, items)).join('');

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kids Learning Playground</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 2rem 1rem 4rem;
    }
    h1 {
      text-align: center;
      color: #fff;
      font-size: clamp(1.8rem, 5vw, 3rem);
      margin-bottom: 2.5rem;
      text-shadow: 2px 3px 6px rgba(0,0,0,0.35);
      letter-spacing: 0.05em;
    }
    .container { max-width: 960px; margin: 0 auto; }
    .legend {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.75rem 1.25rem;
      margin-bottom: 2rem;
      padding: 0.75rem 1rem;
      background: rgba(255,255,255,0.92);
      border-radius: 999px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      font-size: 0.95rem;
      font-weight: 700;
      color: #444;
    }
    .legend-item { display: inline-flex; align-items: center; gap: 0.4rem; }
    .legend-swatch {
      width: 0.9rem;
      height: 0.9rem;
      border-radius: 50%;
      display: inline-block;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,0.1);
    }
    .age-section {
      background: #fff;
      border-radius: 20px;
      padding: 1.5rem 1.5rem 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    }
    .age-section h2 {
      font-size: 1.6rem;
      color: #444;
      margin-bottom: 1.25rem;
      padding-bottom: 0.6rem;
      border-bottom: 3px solid #eee;
    }
    .age-label { font-size: 1.4rem; }
    .slide-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 0.85rem;
    }
    .slide-card {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      color: #fff;
      text-decoration: none;
      padding: 0.85rem 1rem;
      border-radius: 12px;
      font-size: 0.95rem;
      font-weight: 700;
      line-height: 1.3;
      min-height: 64px;
      box-shadow: 0 3px 8px rgba(0,0,0,0.18);
      transition: transform 0.12s, box-shadow 0.12s;
    }
    .slide-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0,0,0,0.28);
    }
    .slide-icon { font-size: 1.4rem; flex-shrink: 0; }
    .slide-title { flex: 1; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎓 Kids Learning Playground</h1>
    <div class="legend" aria-label="カテゴリ凡例">${legend}</div>
    ${sections}
  </div>
</body>
</html>`;

mkdirSync(DIST_DIR, { recursive: true });
writeFileSync(join(DIST_DIR, 'index.html'), html, 'utf-8');
console.log('\nGenerated dist/index.html');
