// GetStigma 정적 사이트 빌드
// Supabase brand_geo_content → dist/ HTML
// 사용: node scripts/build.mjs
//       node scripts/build.mjs --dry-run

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const DIST = join(ROOT, "dist");
const DRY = process.argv.includes("--dry-run");

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) { console.error("❌ Supabase 환경변수 없음"); process.exit(1); }

const SITE_URL = "https://get-stigma.com";
const BRAND_NAME = "GetStigma";

// ── Supabase ─────────────────────────────────────────────────────
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

async function fetchContent() {
  const { data: brand } = await sb
    .from("brand_geo_brands")
    .select("id")
    .eq("name", BRAND_NAME)
    .single();
  if (!brand) throw new Error("GetStigma 브랜드 없음 — generate-getstigma.mjs 먼저 실행");

  const { data, error } = await sb
    .from("brand_geo_content")
    .select("id,title,slug,body_md,created_at,geo_score")
    .eq("brand_id", brand.id)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

// ── 마크다운 → HTML (경량, 의존성 없음) ─────────────────────────
function mdToHtml(md) {
  return md
    // 비교표
    .replace(/^\|(.+)\|$/gm, (line) => {
      const cells = line.split("|").slice(1, -1).map(c => c.trim());
      const tag = cells.some(c => c.match(/^[-: ]+$/)) ? null : cells;
      if (!tag) return "";
      return `<tr>${tag.map(c => `<td>${c}</td>`).join("")}</tr>`;
    })
    .replace(/(<tr>.*<\/tr>\n?)+/g, m => `<table>${m}</table>`)
    // 헤딩
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // 강조
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // blockquote
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    // 번호 리스트
    .replace(/((?:^\d+\. .+\n?)+)/gm, m =>
      `<ol>${m.replace(/^\d+\. (.+)$/gm, "<li>$1</li>")}</ol>`)
    // 불릿
    .replace(/((?:^- .+\n?)+)/gm, m =>
      `<ul>${m.replace(/^- (.+)$/gm, "<li>$1</li>")}</ul>`)
    // 단락
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("<h") && !l.startsWith("<ol") && !l.startsWith("<ul") && !l.startsWith("<table") && !l.startsWith("<blockquote"))
    .map(l => `<p>${l}</p>`)
    .join("\n")
    + "\n";
}

// ── excerpt 추출 ─────────────────────────────────────────────────
function excerpt(md, len = 120) {
  return md.replace(/[#>*|`\[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, len) + "…";
}

// ── 날짜 포맷 ────────────────────────────────────────────────────
function fmt(iso) {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

// ── 템플릿 로드 ──────────────────────────────────────────────────
function loadTemplate(name) {
  try {
    return readFileSync(join(ROOT, "templates", name), "utf-8");
  } catch {
    return null;
  }
}

// ── Article JSON-LD ──────────────────────────────────────────────
function articleJsonLd(article) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        "name": BRAND_NAME,
        "url": SITE_URL,
        "description": "편견 없는 스킨케어·라이프스타일 블로그",
      },
      {
        "@type": "Article",
        "@id": `${SITE_URL}/article/${article.slug}/#article`,
        "headline": article.title,
        "description": excerpt(article.body_md || "", 160),
        "datePublished": article.created_at,
        "dateModified": article.created_at,
        "url": `${SITE_URL}/article/${article.slug}/`,
        "publisher": { "@id": `${SITE_URL}/#organization` },
        "mainEntityOfPage": { "@type": "WebPage", "@id": `${SITE_URL}/article/${article.slug}/` },
        "inLanguage": "ko",
      },
    ],
  });
}

// ── 빌드 ─────────────────────────────────────────────────────────
async function build() {
  console.log(`\n🔨 GetStigma 빌드${DRY ? " (DRY RUN)" : ""}\n`);

  const articles = await fetchContent();
  console.log(`콘텐츠 ${articles.length}개 로드\n`);

  if (DRY) {
    articles.slice(0, 3).forEach(a => console.log(`  [preview] ${a.title} → /article/${a.slug}/`));
    console.log("  ...");
    return;
  }

  mkdirSync(DIST, { recursive: true });
  mkdirSync(join(DIST, "article"), { recursive: true });

  // public/ 파일 복사
  for (const f of readdirSync(join(ROOT, "public"))) {
    copyFileSync(join(ROOT, "public", f), join(DIST, f));
  }

  const indexTpl = loadTemplate("index.html");
  const articleTpl = loadTemplate("article.html");

  // ── 아티클 페이지 생성 ────────────────────────────────────────
  const cards = [];
  for (const a of articles) {
    const bodyHtml = mdToHtml(a.body_md || "");
    const desc = excerpt(a.body_md || "", 160);
    const url = `${SITE_URL}/article/${a.slug}/`;
    const jsonLd = articleJsonLd(a);

    let html;
    if (articleTpl) {
      html = articleTpl
        .replace(/\{\{TITLE\}\}/g, a.title)
        .replace(/\{\{DESCRIPTION\}\}/g, desc)
        .replace(/\{\{BODY\}\}/g, bodyHtml)
        .replace(/\{\{DATE\}\}/g, fmt(a.created_at))
        .replace(/\{\{URL\}\}/g, url)
        .replace(/\{\{SLUG\}\}/g, a.slug)
        .replace(/\{\{JSON_LD\}\}/g, jsonLd);
    } else {
      // 템플릿 없을 때 기본 HTML
      html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${a.title} — GetStigma</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${a.title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="article">
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<main>
<h1>${a.title}</h1>
<time datetime="${a.created_at}">${fmt(a.created_at)}</time>
${bodyHtml}
</main>
</body>
</html>`;
    }

    mkdirSync(join(DIST, "article", a.slug), { recursive: true });
    writeFileSync(join(DIST, "article", a.slug, "index.html"), html);

    cards.push({ title: a.title, slug: a.slug, desc: excerpt(a.body_md || ""), date: fmt(a.created_at) });
    console.log(`  ✅ /article/${a.slug}/`);
  }

  // ── 인덱스 페이지 생성 ────────────────────────────────────────
  const cardsHtml = cards.map(c => `
<article class="card">
  <a href="/article/${c.slug}/">
    <h2>${c.title}</h2>
    <p>${c.desc}</p>
    <time>${c.date}</time>
  </a>
</article>`).join("\n");

  const websiteJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        "name": BRAND_NAME,
        "url": SITE_URL,
        "description": "편견 없는 스킨케어·라이프스타일 블로그",
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        "name": BRAND_NAME,
        "url": SITE_URL,
        "publisher": { "@id": `${SITE_URL}/#organization` },
        "inLanguage": "ko",
      },
    ],
  });

  let indexHtml;
  if (indexTpl) {
    indexHtml = indexTpl
      .replace(/\{\{CARDS\}\}/g, cardsHtml)
      .replace(/\{\{JSON_LD\}\}/g, websiteJsonLd)
      .replace(/\{\{ARTICLE_COUNT\}\}/g, String(articles.length));
  } else {
    indexHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GetStigma — 편견 없는 스킨케어 블로그</title>
<meta name="description" content="편견 없는 스킨케어·라이프스타일 블로그. 루틴, 성분, 조언 중심.">
<link rel="canonical" href="${SITE_URL}/">
<meta property="og:title" content="GetStigma">
<meta property="og:url" content="${SITE_URL}/">
<script type="application/ld+json">${websiteJsonLd}</script>
</head>
<body>
<main>
<h1>GetStigma</h1>
<p>편견 없는 스킨케어·라이프스타일 블로그</p>
${cardsHtml}
</main>
</body>
</html>`;
  }

  writeFileSync(join(DIST, "index.html"), indexHtml);
  console.log(`  ✅ /index.html`);

  // ── sitemap.xml 생성 ─────────────────────────────────────────
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${articles.map(a => `  <url>
    <loc>${SITE_URL}/article/${a.slug}/</loc>
    <lastmod>${a.created_at.slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join("\n")}
</urlset>`;

  writeFileSync(join(DIST, "sitemap.xml"), sitemap);
  console.log(`  ✅ /sitemap.xml (${articles.length}개 URL)`);

  console.log(`\n완료: dist/ → Cloudflare Pages 배포 준비`);
}

build().catch(e => { console.error(e); process.exit(1); });
