# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

子ども向け学習プラットフォーム。算数・国語・英語・推論問題などのコンテンツを、LLMが Slidev のスライドとして構築する。

## Commands

```bash
pnpm install       # Install dependencies
pnpm dev           # Start local Slidev dev server (hot reload)
pnpm build         # Build static site
pnpm export        # Export slides to PDF
pnpm preview       # Start remote sharing mode
```

Use `pnpm` — not `npm`. The project is configured for pnpm.

## Architecture

All learning content lives in `slides.md` (Slidev format). Slidev renders Markdown + Vue components as a web-based slide deck.

**Key Slidev conventions for this project:**
- Slides are separated by `---`
- Frontmatter at the top controls theme, title, transitions (`theme: default`, `transition: slide-left`, `mdc: true`)
- MDC (Markdown Components) is enabled — Vue components can be embedded inline
- Each subject area (算数, 国語, 英語, 推論) should be a logical section within `slides.md`

**Language policy:**
- Generate all learning content in Japanese
- **漢字にはすべてルビ（ふりがな）を振ること。** HTML の `<ruby>` タグを使用する（例: `<ruby>算数<rt>さんすう</rt></ruby>`）
- Future multilingual support is planned — avoid hard-coding language-specific assumptions into layout or component logic

**When generating new learning content:**
- Generate slides as valid Slidev Markdown and append or insert into `slides.md`
- Use interactive Vue components for exercises where appropriate (Slidev supports `<script setup>` in slides)
- Keep content age-appropriate and visually engaging (large fonts, colors, minimal text per slide)
