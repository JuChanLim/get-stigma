// GetStigma 정적 사이트 빌드
// Supabase brand_geo_content → dist/ HTML (GRAND 1a 에디토리얼 디자인)
// 사용: node scripts/build.mjs
//       node scripts/build.mjs --dry-run

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
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

const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

// ── 유틸 ─────────────────────────────────────────────────────────
function readTemplate(name) {
  const p = join(ROOT, "templates", name);
  return existsSync(p) ? readFileSync(p, "utf-8") : null;
}

function excerpt(md, len = 120) {
  return md.replace(/[#>*|`\[\]~_]/g, "").replace(/\s+/g, " ").trim().slice(0, len) + "…";
}

function readTime(md) {
  const words = md.replace(/[#>*|`\[\]~_\-]/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function fmtShort(iso) {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function navDate() {
  return new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function categoryLabel(contentType) {
  const map = { B_explainer: "가이드", C_single: "팁", R1_aggregate: "리뷰", R2_compare: "비교", R3_qa: "Q&A", A_roundup: "추천" };
  return map[contentType] || "가이드";
}

// ── 마크다운 → HTML ───────────────────────────────────────────────
function mdToHtml(md) {
  let html = md;

  // 표 처리 (줄 단위)
  const tableRegex = /((?:^\|.+\|\s*\n?)+)/gm;
  html = html.replace(tableRegex, (block) => {
    const lines = block.trim().split("\n").filter(l => l.trim());
    if (lines.length < 2) return block;
    const rows = lines
      .filter(l => !/^\|[-: |]+\|/.test(l))
      .map((line, i) => {
        const cells = line.split("|").slice(1, -1).map(c => c.trim());
        const tag = i === 0 ? "th" : "td";
        return `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
      });
    return `<table>${rows.join("")}</table>\n`;
  });

  // 헤딩
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // blockquote
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");

  // 번호 리스트
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (m) =>
    `<ol>${m.replace(/^\d+\. (.+)$/gm, "<li>$1</li>")}</ol>\n`);

  // 불릿
  html = html.replace(/((?:^[-*] .+\n?)+)/gm, (m) =>
    `<ul>${m.replace(/^[-*] (.+)$/gm, "<li>$1</li>")}</ul>\n`);

  // 인라인
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/`(.+?)`/g, "<code>$1</code>");

  // 단락: 블록 태그가 아닌 줄만
  const blockTags = /^<(h[1-6]|ol|ul|li|table|tr|th|td|blockquote|pre|div)/;
  html = html
    .split(/\n{2,}/)
    .map(chunk => {
      chunk = chunk.trim();
      if (!chunk) return "";
      if (blockTags.test(chunk)) return chunk;
      return `<p>${chunk.replace(/\n/g, " ")}</p>`;
    })
    .filter(Boolean)
    .join("\n");

  return html;
}

// ── Supabase ─────────────────────────────────────────────────────
async function fetchContent() {
  const { data: brand } = await sb
    .from("brand_geo_brands").select("id").eq("name", BRAND_NAME).single();
  if (!brand) throw new Error("GetStigma 브랜드 없음 — generate-getstigma.mjs 먼저 실행");

  const { data, error } = await sb
    .from("brand_geo_content")
    .select("id,title,slug,body_md,created_at,geo_score,topic_id")
    .eq("brand_id", brand.id)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  // content_type 조인
  const topicIds = [...new Set((data || []).map(a => a.topic_id).filter(Boolean))];
  let typeMap = {};
  if (topicIds.length) {
    const { data: topics } = await sb
      .from("brand_geo_topics").select("id,content_type").in("id", topicIds);
    typeMap = Object.fromEntries((topics || []).map(t => [t.id, t.content_type]));
  }

  return (data || []).map(a => ({ ...a, content_type: typeMap[a.topic_id] || "B_explainer" }));
}

// ── JSON-LD ───────────────────────────────────────────────────────
function siteJsonLd() {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${SITE_URL}/#organization`, "name": BRAND_NAME, "url": SITE_URL },
      { "@type": "WebSite", "@id": `${SITE_URL}/#website`, "name": BRAND_NAME, "url": SITE_URL, "publisher": { "@id": `${SITE_URL}/#organization` }, "inLanguage": "ko" },
    ],
  });
}

function articleJsonLd(a) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${SITE_URL}/#organization`, "name": BRAND_NAME, "url": SITE_URL },
      {
        "@type": "Article",
        "@id": `${SITE_URL}/article/${a.slug}/#article`,
        "headline": a.title,
        "description": excerpt(a.body_md || "", 160),
        "datePublished": a.created_at,
        "dateModified": a.created_at,
        "url": `${SITE_URL}/article/${a.slug}/`,
        "publisher": { "@id": `${SITE_URL}/#organization` },
        "mainEntityOfPage": { "@type": "WebPage", "@id": `${SITE_URL}/article/${a.slug}/` },
        "inLanguage": "ko",
      },
    ],
  });
}

// ── 인덱스 HTML 조각 생성 ─────────────────────────────────────────
function featuredHtml(a) {
  const url = `/article/${a.slug}/`;
  const cat = categoryLabel(a.content_type);
  return `
<div class="featured">
  <div class="iph featured-img"><span style="font-size:10px;color:#ccc;font-family:monospace;letter-spacing:.1em">대표 이미지</span></div>
  <span class="featured-cat">${cat}</span>
  <a href="${url}"><div class="featured-title">${a.title}</div></a>
  <div class="featured-excerpt">${excerpt(a.body_md || "", 100)}</div>
  <span class="featured-meta">${fmtDate(a.created_at)} · ${readTime(a.body_md || "")}분 읽기</span>
</div>`;
}

function sideArticleHtml(a) {
  const url = `/article/${a.slug}/`;
  const cat = categoryLabel(a.content_type);
  return `
<a href="${url}" class="side-item">
  <div class="iph side-img"><span style="font-size:8px;color:#ccc;font-family:monospace">이미지</span></div>
  <span class="side-cat">${cat}</span>
  <div class="side-title">${a.title}</div>
  <span class="side-meta">${fmtDate(a.created_at)} · ${readTime(a.body_md || "")}분</span>
</a>`;
}

function recentItemHtml(a, isFirst, isLast) {
  const url = `/article/${a.slug}/`;
  const cat = categoryLabel(a.content_type);
  const pl = isFirst ? "48px" : "24px";
  return `
<a href="${url}" class="recent-item" style="padding-left:${pl}${isLast ? ";border-right:none" : ""}">
  <span class="recent-cat">${cat}</span>
  <div class="recent-title">${a.title}</div>
  <span class="recent-meta">${fmtShort(a.created_at)}</span>
</a>`;
}

// ── 아티클 사이드바 ───────────────────────────────────────────────
function nextArticleHtml(a) {
  if (!a) return "";
  return `
<div class="sidebar-label">다음 글</div>
<a href="/article/${a.slug}/" class="sidebar-title">${a.title}</a>
<div class="sidebar-meta">${fmtDate(a.created_at)}</div>
<div class="sidebar-divider"></div>`;
}

function prevArticleHtml(a) {
  if (!a) return "";
  return `
<div class="sidebar-label">이전 글</div>
<a href="/article/${a.slug}/" class="sidebar-title">${a.title}</a>
<div class="sidebar-meta">${fmtDate(a.created_at)}</div>`;
}

// ── 빌드 ─────────────────────────────────────────────────────────
async function build() {
  console.log(`\n🔨 GetStigma 빌드${DRY ? " (DRY RUN)" : ""}\n`);

  const articles = await fetchContent();
  console.log(`콘텐츠 ${articles.length}개 로드\n`);

  if (DRY) {
    articles.slice(0, 5).forEach(a => console.log(`  [${a.content_type}] ${a.title}`));
    return;
  }

  mkdirSync(DIST, { recursive: true });
  mkdirSync(join(DIST, "article"), { recursive: true });

  // public/ 복사
  for (const f of readdirSync(join(ROOT, "public"))) {
    copyFileSync(join(ROOT, "public", f), join(DIST, f));
  }

  const indexTpl = readTemplate("index.html");
  const articleTpl = readTemplate("article.html");
  const nd = navDate();

  // ── 아티클 페이지 ─────────────────────────────────────────────
  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    const next = articles[i - 1] || null;  // 최신 = 다음
    const prev = articles[i + 1] || null;
    const bodyHtml = mdToHtml(a.body_md || "");
    const desc = excerpt(a.body_md || "", 160);
    const url = `${SITE_URL}/article/${a.slug}/`;

    let html;
    if (articleTpl) {
      html = articleTpl
        .replace(/\{\{TITLE\}\}/g, a.title)
        .replace(/\{\{DESCRIPTION\}\}/g, desc)
        .replace(/\{\{URL\}\}/g, url)
        .replace(/\{\{JSON_LD\}\}/g, articleJsonLd(a))
        .replace(/\{\{NAV_DATE\}\}/g, nd)
        .replace(/\{\{CATEGORY\}\}/g, categoryLabel(a.content_type))
        .replace(/\{\{DATE\}\}/g, fmtDate(a.created_at))
        .replace(/\{\{READ_TIME\}\}/g, String(readTime(a.body_md || "")))
        .replace(/\{\{BODY\}\}/g, bodyHtml)
        .replace(/\{\{NEXT_ARTICLE\}\}/g, nextArticleHtml(next))
        .replace(/\{\{PREV_ARTICLE\}\}/g, prevArticleHtml(prev))
        .replace(/\{\{SLUG\}\}/g, a.slug);
    } else {
      html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>${a.title} — GetStigma</title></head><body><a href="/">← 목록</a><h1>${a.title}</h1>${bodyHtml}</body></html>`;
    }

    mkdirSync(join(DIST, "article", a.slug), { recursive: true });
    writeFileSync(join(DIST, "article", a.slug, "index.html"), html);
    console.log(`  ✅ /article/${a.slug}/`);
  }

  // ── 인덱스 페이지 ─────────────────────────────────────────────
  const featured = articles[0];
  const sideArticles = articles.slice(1, 4);
  const recentArticles = articles.slice(4, 8);

  let indexHtml;
  if (indexTpl && featured) {
    const recentHtml = recentArticles
      .map((a, i) => recentItemHtml(a, i === 0, i === recentArticles.length - 1))
      .join("");

    indexHtml = indexTpl
      .replace(/\{\{JSON_LD\}\}/g, siteJsonLd())
      .replace(/\{\{NAV_DATE\}\}/g, nd)
      .replace(/\{\{FEATURED\}\}/g, featuredHtml(featured))
      .replace(/\{\{SIDE_ARTICLES\}\}/g, sideArticles.map(sideArticleHtml).join(""))
      .replace(/\{\{RECENT_ARTICLES\}\}/g, recentHtml);
  } else {
    const cards = articles.map(a =>
      `<article><a href="/article/${a.slug}/"><h2>${a.title}</h2><p>${excerpt(a.body_md || "")}</p><time>${fmtDate(a.created_at)}</time></a></article>`
    ).join("\n");
    indexHtml = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>GetStigma</title></head><body><h1>GetStigma</h1>${cards}</body></html>`;
  }

  writeFileSync(join(DIST, "index.html"), indexHtml);
  console.log(`  ✅ /index.html`);

  // ── sitemap.xml ───────────────────────────────────────────────
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
${articles.map(a => `  <url><loc>${SITE_URL}/article/${a.slug}/</loc><lastmod>${a.created_at.slice(0, 10)}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`).join("\n")}
</urlset>`;

  writeFileSync(join(DIST, "sitemap.xml"), sitemap);
  console.log(`  ✅ /sitemap.xml (${articles.length}개 URL)`);
  console.log(`\n완료: dist/ → Cloudflare Pages 배포 준비`);
}

build().catch(e => { console.error(e); process.exit(1); });
