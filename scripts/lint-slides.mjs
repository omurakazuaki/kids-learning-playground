#!/usr/bin/env node
// docs/**/*.md のスライドファイルを検証する軽量 linter。
// slidev build より圧倒的に速いので、保存・push の前に実行する。
import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DOCS_DIR = join(ROOT, 'docs');

const errors = [];
const warnings = [];

function record(bucket, file, line, msg) {
  bucket.push(`${relative(ROOT, file)}:${line}: ${msg}`);
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (entry.endsWith('.md')) yield full;
  }
}

function lineOf(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

// `<` と次の `>` の間にもう一つ `<` が出てきたら、閉じ `>` 漏れ。
// 例: `</rt</ruby>` → `</rt` の `>` が抜けている。
function checkTagWellFormedness(text, file) {
  let pos = 0;
  while (pos < text.length) {
    const lt = text.indexOf('<', pos);
    if (lt === -1) break;
    const next = text[lt + 1];
    // タグの開始でなければスキップ（例: `1 < 2`）
    if (!next || !/[a-zA-Z/!]/.test(next)) {
      pos = lt + 1;
      continue;
    }
    const gt = text.indexOf('>', lt + 1);
    const lt2 = text.indexOf('<', lt + 1);
    if (gt === -1) {
      record(errors, file, lineOf(text, lt), `閉じ '>' が見つからないタグがあります`);
      break;
    }
    if (lt2 !== -1 && lt2 < gt) {
      const snippet = text.slice(lt, lt2 + 1).replace(/\n/g, ' ').slice(0, 40);
      record(
        errors,
        file,
        lineOf(text, lt),
        `不正なタグ: \`${snippet}…\`（閉じ '>' より先に '<' が出現 — タグ閉じ漏れ）`
      );
      pos = lt2;
    } else {
      pos = gt + 1;
    }
  }
}

// 開閉タグの数が一致しているか
function checkTagBalance(text, file, name) {
  const open = (text.match(new RegExp(`<${name}(?=[\\s>])`, 'g')) || []).length;
  const close = (text.match(new RegExp(`</${name}>`, 'g')) || []).length;
  if (open !== close) {
    record(errors, file, 0, `<${name}>(${open}) と </${name}>(${close}) の数が一致しません`);
  }
}

// <ruby> ブロックの中に <rt> が含まれているか
function checkRubyStructure(text, file) {
  const re = /<ruby>([\s\S]*?)<\/ruby>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!/<rt>[\s\S]*?<\/rt>/.test(m[1])) {
      record(errors, file, lineOf(text, m.index), `<ruby> ブロックに <rt>...</rt> が含まれていません`);
    }
  }
}

function checkFrontmatter(text, file) {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') {
    record(errors, file, 1, 'ファイル先頭に frontmatter (---) がありません');
    return;
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) {
    record(errors, file, 1, 'frontmatter の閉じ (---) が見つかりません');
    return;
  }
  const fm = lines.slice(1, end).join('\n');
  for (const key of ['theme', 'title', 'mdc']) {
    if (!new RegExp(`^${key}:`, 'm').test(fm)) {
      record(warnings, file, 1, `frontmatter に推奨キー '${key}' がありません`);
    }
  }
}

// インライン HTML 要素はブランク行をまたいで開閉できない。
// Markdown はブランク行で段落を区切るので、開きタグ側の段落で閉じタグが見つからず
// Vue compiler が "Element is missing end tag" を出す。
const INLINE_TAGS = [
  'i', 'em', 'b', 'strong', 'u', 's', 'small', 'sub', 'sup',
  'mark', 'q', 'cite', 'a', 'code', 'ruby', 'rt', 'rp', 'span',
];

function checkInlineSpansBlankLine(text, file) {
  const lines = text.split('\n');
  for (const tag of INLINE_TAGS) {
    const re = new RegExp(`<(/?)${tag}(?=[\\s/>])`, 'gi');
    const tokens = [];
    lines.forEach((line, i) => {
      let m;
      while ((m = re.exec(line)) !== null) {
        tokens.push({ kind: m[1] === '/' ? 'close' : 'open', line: i });
      }
    });
    const stack = [];
    for (const t of tokens) {
      if (t.kind === 'open') {
        stack.push(t);
      } else {
        const op = stack.pop();
        if (!op || op.line === t.line) continue;
        for (let i = op.line + 1; i < t.line; i++) {
          if (lines[i].trim() === '') {
            record(
              errors,
              file,
              op.line + 1,
              `<${tag}> がブランク行をまたいで </${tag}> につながっています（Markdown の段落分割で Vue が end tag 不在と判断）`
            );
            break;
          }
        }
      }
    }
  }
}

function checkFile(file) {
  const text = readFileSync(file, 'utf-8');
  checkFrontmatter(text, file);
  checkTagWellFormedness(text, file);
  checkRubyStructure(text, file);
  checkInlineSpansBlankLine(text, file);
  for (const tag of ['ruby', 'rt', 'div', 'span']) {
    checkTagBalance(text, file, tag);
  }
}

let count = 0;
for (const file of walk(DOCS_DIR)) {
  checkFile(file);
  count++;
}

if (warnings.length) {
  console.warn(`\n⚠️  ${warnings.length} 件の警告:`);
  for (const w of warnings) console.warn('  ' + w);
}

if (errors.length) {
  console.error(`\n❌ ${errors.length} 件のエラーが見つかりました（${count} ファイル中）:\n`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

console.log(`✅ Slide lint OK (${count} ファイル)`);
