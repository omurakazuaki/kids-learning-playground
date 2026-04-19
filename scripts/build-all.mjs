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

// Group by age → category
const grouped = {};
for (const { age, category, name, title } of slides) {
  (grouped[age] ??= {})[category] ??= [];
  grouped[age][category].push({ name, title, href: `/${REPO_NAME}/${age}/${category}/${name}/` });
}

const CATEGORY_META = {
  math:      { label: '算数',  icon: '🔢', color: '#FF6B6B', bg: '#fff0f0' },
  japanese:  { label: '国語',  icon: '📖', color: '#4ECDC4', bg: '#f0fffe' },
  english:   { label: '英語',  icon: '🌍', color: '#45B7D1', bg: '#f0f8ff' },
  reasoning: { label: '推論',  icon: '🧩', color: '#96CEB4', bg: '#f0fff4' },
};

function categoryCard(cat, items) {
  const { label, icon, color, bg } = CATEGORY_META[cat] ?? { label: cat, icon: '📚', color: '#888', bg: '#f8f8f8' };
  const links = items.map(({ title, href }) =>
    `<a href="${href}" class="slide-link" style="background:${color}">${title}</a>`
  ).join('');
  return `
    <div class="category-card" style="border-color:${color};background:${bg}">
      <h3 style="color:${color}">${icon} ${label}</h3>
      <div class="links">${links}</div>
    </div>`;
}

function ageSection(age, categories) {
  const cards = Object.entries(categories).map(([cat, items]) => categoryCard(cat, items)).join('');
  return `
  <section class="age-section">
    <h2>🎒 <span class="age-label">${age}さい 向け</span></h2>
    <div class="categories">${cards}</div>
  </section>`;
}

const sections = Object.entries(grouped).map(([age, cats]) => ageSection(age, cats)).join('');

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
    .categories {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
    }
    .category-card {
      border: 2px solid;
      border-radius: 14px;
      padding: 1rem;
    }
    .category-card h3 {
      font-size: 1.05rem;
      margin-bottom: 0.75rem;
    }
    .links { display: flex; flex-direction: column; gap: 0.5rem; }
    .slide-link {
      display: block;
      color: #fff;
      text-decoration: none;
      padding: 0.6rem 0.9rem;
      border-radius: 9px;
      font-size: 0.9rem;
      font-weight: 700;
      line-height: 1.3;
      box-shadow: 0 2px 6px rgba(0,0,0,0.18);
      transition: transform 0.12s, box-shadow 0.12s;
    }
    .slide-link:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 14px rgba(0,0,0,0.28);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎓 Kids Learning Playground</h1>
    ${sections}
  </div>
</body>
</html>`;

mkdirSync(DIST_DIR, { recursive: true });
writeFileSync(join(DIST_DIR, 'index.html'), html, 'utf-8');
console.log('\nGenerated dist/index.html');
