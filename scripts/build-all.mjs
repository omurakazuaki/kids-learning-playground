import { execSync } from 'child_process';
import { readdirSync, mkdirSync, writeFileSync, statSync, readFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DOCS_DIR = join(ROOT, 'docs');
const DIST_DIR = join(ROOT, 'dist');
const REPO_NAME = 'kids-learning-playground';

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

const slides = findSlides(DOCS_DIR);
console.log(`Found ${slides.length} slides`);

for (const { age, category, name, file } of slides) {
  const outDir = join(DIST_DIR, age, category, name);
  const base = `/${REPO_NAME}/${age}/${category}/${name}/`;
  console.log(`\nBuilding: ${file}`);
  mkdirSync(outDir, { recursive: true });
  execSync(`pnpm exec slidev build "${file}" --out "${outDir}" --base "${base}"`, {
    stdio: 'inherit',
    cwd: ROOT,
  });
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
