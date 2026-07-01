// GetStigma — 공유 유틸리티 + Supabase REST + 렌더러
// Cloudflare Pages Functions에서 사용 (SDK 없음, fetch 직접)

export const SITE_URL = "https://get-stigma.com";
export const BRAND_NAME = "GetStigma";

// ── 유틸 ─────────────────────────────────────────────────────────

export function excerpt(md, len = 120) {
  return md.replace(/[#>*|`\[\]~_]/g, "").replace(/\s+/g, " ").trim().slice(0, len) + "…";
}

export function readTime(md) {
  const words = md.replace(/[#>*|`\[\]~_\-]/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

export function fmtShort(iso) {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function navDate() {
  return new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

export function categoryLabel(ct) {
  return { B_explainer: "가이드", C_single: "팁", R1_aggregate: "리뷰", R2_compare: "비교", R3_qa: "Q&A", A_roundup: "추천" }[ct] || "가이드";
}

// ── 마크다운 → HTML ───────────────────────────────────────────────

export function mdToHtml(md) {
  let html = md;

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

  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, m =>
    `<ol>${m.replace(/^\d+\. (.+)$/gm, "<li>$1</li>")}</ol>\n`);
  html = html.replace(/((?:^[-*] .+\n?)+)/gm, m =>
    `<ul>${m.replace(/^[-*] (.+)$/gm, "<li>$1</li>")}</ul>\n`);
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/`(.+?)`/g, "<code>$1</code>");

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

// ── JSON-LD ───────────────────────────────────────────────────────

export function siteJsonLd() {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${SITE_URL}/#organization`, "name": BRAND_NAME, "url": SITE_URL },
      { "@type": "WebSite", "@id": `${SITE_URL}/#website`, "name": BRAND_NAME, "url": SITE_URL, "publisher": { "@id": `${SITE_URL}/#organization` }, "inLanguage": "ko" },
    ],
  });
}

export function articleJsonLd(a) {
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

// ── HTML 조각 ────────────────────────────────────────────────────

export function featuredHtml(a) {
  const cat = categoryLabel(a.content_type);
  return `
<div class="featured">
  <div class="iph featured-img"><span style="font-size:10px;color:#ccc;font-family:monospace;letter-spacing:.1em">대표 이미지</span></div>
  <span class="featured-cat">${cat}</span>
  <a href="/article/${a.slug}/"><div class="featured-title">${a.title}</div></a>
  <div class="featured-excerpt">${excerpt(a.body_md || "", 100)}</div>
  <span class="featured-meta">${fmtDate(a.created_at)} · ${readTime(a.body_md || "")}분 읽기</span>
</div>`;
}

export function sideArticleHtml(a) {
  const cat = categoryLabel(a.content_type);
  return `
<a href="/article/${a.slug}/" class="side-item">
  <div class="iph side-img"><span style="font-size:8px;color:#ccc;font-family:monospace">이미지</span></div>
  <span class="side-cat">${cat}</span>
  <div class="side-title">${a.title}</div>
  <span class="side-meta">${fmtDate(a.created_at)} · ${readTime(a.body_md || "")}분</span>
</a>`;
}

export function recentItemHtml(a, isFirst, isLast) {
  const cat = categoryLabel(a.content_type);
  const pl = isFirst ? "48px" : "24px";
  return `
<a href="/article/${a.slug}/" class="recent-item" style="padding-left:${pl}${isLast ? ";border-right:none" : ""}">
  <span class="recent-cat">${cat}</span>
  <div class="recent-title">${a.title}</div>
  <span class="recent-meta">${fmtShort(a.created_at)}</span>
</a>`;
}

export function nextArticleHtml(a) {
  if (!a) return "";
  return `
<div class="sidebar-label">다음 글</div>
<a href="/article/${a.slug}/" class="sidebar-title">${a.title}</a>
<div class="sidebar-meta">${fmtDate(a.created_at)}</div>
<div class="sidebar-divider"></div>`;
}

export function prevArticleHtml(a) {
  if (!a) return "";
  return `
<div class="sidebar-label">이전 글</div>
<a href="/article/${a.slug}/" class="sidebar-title">${a.title}</a>
<div class="sidebar-meta">${fmtDate(a.created_at)}</div>`;
}

// ── Supabase REST ─────────────────────────────────────────────────

async function sbGet(env, path) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${path}`);
  return res.json();
}

export async function fetchAllArticles(env) {
  const brands = await sbGet(env, "brand_geo_brands?name=eq.GetStigma&select=id&limit=1");
  if (!brands?.length) return { brandId: null, articles: [] };
  const brandId = brands[0].id;

  const content = await sbGet(
    env,
    `brand_geo_content?brand_id=eq.${brandId}&status=eq.published&select=id,title,slug,body_md,created_at,topic_id&order=created_at.desc`
  );
  if (!content?.length) return { brandId, articles: [] };

  const topicIds = [...new Set(content.map(a => a.topic_id).filter(Boolean))];
  let typeMap = {};
  if (topicIds.length) {
    const topics = await sbGet(env, `brand_geo_topics?id=in.(${topicIds.join(",")})&select=id,content_type`);
    typeMap = Object.fromEntries((topics || []).map(t => [t.id, t.content_type]));
  }

  return {
    brandId,
    articles: content.map(a => ({ ...a, content_type: typeMap[a.topic_id] || "B_explainer" })),
  };
}

export async function fetchArticleBySlug(env, brandId, slug) {
  const data = await sbGet(
    env,
    `brand_geo_content?brand_id=eq.${brandId}&slug=eq.${slug}&status=eq.published&select=id,title,slug,body_md,created_at,topic_id&limit=1`
  );
  if (!data?.length) return null;
  const a = data[0];

  let contentType = "B_explainer";
  if (a.topic_id) {
    const topics = await sbGet(env, `brand_geo_topics?id=eq.${a.topic_id}&select=content_type&limit=1`);
    contentType = topics?.[0]?.content_type || "B_explainer";
  }
  return { ...a, content_type: contentType };
}

// ── 렌더러 ────────────────────────────────────────────────────────

export function renderIndex(articles) {
  const nd = navDate();
  const featured = articles[0];
  const sideArticles = articles.slice(1, 4);
  const recentArticles = articles.slice(4, 8);

  const featuredBlock = featured ? featuredHtml(featured) : "<p style='padding:48px;color:#aaa'>콘텐츠 준비 중입니다.</p>";
  const sideBlock = sideArticles.map(sideArticleHtml).join("");
  const recentBlock = recentArticles.map((a, i) => recentItemHtml(a, i === 0, i === recentArticles.length - 1)).join("");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GetStigma — 편견 없는 스킨케어 블로그</title>
<meta name="description" content="편견 없는 스킨케어·라이프스타일 블로그. 루틴, 성분, 조언 중심.">
<link rel="canonical" href="https://get-stigma.com/">
<meta property="og:title" content="GetStigma">
<meta property="og:description" content="편견 없는 스킨케어·라이프스타일 블로그. 루틴, 성분, 조언 중심.">
<meta property="og:url" content="https://get-stigma.com/">
<meta property="og:type" content="website">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&display=swap" rel="stylesheet">
<script type="application/ld+json">${siteJsonLd()}</script>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #fafaf8; font-family: system-ui, -apple-system, sans-serif; color: #111; }
a { color: inherit; text-decoration: none; }
.iph { background: repeating-linear-gradient(-45deg, #f0f0f0 0, #f0f0f0 2px, #f7f7f7 2px, #f7f7f7 14px); display: flex; align-items: center; justify-content: center; }
nav { border-bottom: 2.5px solid #111; background: #fff; }
.nav-top { display: flex; justify-content: space-between; align-items: center; padding: 14px 48px; border-bottom: 1px solid #e8e8e8; }
.nav-archive { font-size: 10px; color: #aaa; letter-spacing: 0.15em; font-variant-caps: small-caps; }
.nav-logo { font-family: 'Playfair Display', Georgia, serif; font-size: 28px; font-weight: 900; color: #111; letter-spacing: -0.02em; }
.nav-date { font-size: 10px; color: #aaa; letter-spacing: 0.06em; }
.nav-cats { display: flex; align-items: center; padding: 0 48px; }
.nav-cat { font-size: 11px; font-weight: 700; color: #666; padding: 10px 20px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2.5px; letter-spacing: 0.04em; transition: color .15s; }
.nav-cat:first-child { padding-left: 0; }
.nav-cat.active, .nav-cat:hover { color: #111; border-bottom-color: #111; }
.main-grid { display: grid; grid-template-columns: 1fr 1px 296px; border-bottom: 1px solid #e8e8e8; background: #fff; }
.featured { padding: 40px 48px; }
.featured-img { height: 240px; margin-bottom: 26px; border-radius: 2px; }
.featured-cat { font-size: 10px; color: #b8222a; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; display: block; margin-bottom: 10px; }
.featured-title { font-family: 'Playfair Display', Georgia, serif; font-size: 36px; font-weight: 900; color: #111; line-height: 1.1; letter-spacing: -0.01em; margin-bottom: 16px; cursor: pointer; transition: color .15s; }
.featured-title:hover { color: #b8222a; }
.featured-excerpt { font-size: 14px; color: #555; line-height: 1.8; margin-bottom: 18px; max-width: 500px; }
.featured-meta { font-size: 11px; color: #aaa; letter-spacing: 0.04em; }
.grid-divider { background: #e8e8e8; }
.side-list { display: flex; flex-direction: column; }
.side-item { padding: 24px 28px; border-bottom: 1px solid #e8e8e8; cursor: pointer; flex: 1; transition: background .15s; }
.side-item:last-child { border-bottom: none; }
.side-item:hover { background: #fafaf8; }
.side-img { height: 90px; margin-bottom: 12px; border-radius: 2px; }
.side-cat { font-size: 9px; color: #b8222a; font-weight: 700; letter-spacing: 0.12em; display: block; margin-bottom: 6px; text-transform: uppercase; }
.side-title { font-family: 'Playfair Display', serif; font-size: 15px; font-weight: 700; color: #111; line-height: 1.3; margin-bottom: 5px; }
.side-meta { font-size: 10px; color: #bbb; }
.recent-grid { display: grid; grid-template-columns: repeat(4, 1fr); border-bottom: 1px solid #e8e8e8; background: #fff; }
.recent-item { padding: 20px 24px; border-right: 1px solid #e8e8e8; cursor: pointer; transition: background .15s; }
.recent-item:first-child { padding-left: 48px; }
.recent-item:last-child { border-right: none; }
.recent-item:hover { background: #fafaf8; }
.recent-cat { font-size: 9px; color: #bbb; display: block; margin-bottom: 4px; letter-spacing: 0.08em; }
.recent-title { font-family: 'Playfair Display', serif; font-size: 13px; font-weight: 700; color: #111; line-height: 1.3; margin-bottom: 5px; }
.recent-meta { font-size: 10px; color: #bbb; }
footer { display: grid; grid-template-columns: 1fr 1fr 1fr; padding: 32px 48px; border-top: 2px solid #111; background: #fff; }
.footer-brand { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 900; color: #111; margin-bottom: 8px; }
.footer-desc { font-size: 11px; color: #bbb; line-height: 1.6; }
.footer-nav { display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center; }
.footer-nav a { font-size: 11px; color: #666; font-variant-caps: small-caps; letter-spacing: 0.08em; transition: color .15s; }
.footer-nav a:hover { color: #111; }
.footer-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; justify-content: center; }
.footer-copy { font-size: 10px; color: #ccc; margin-top: 4px; }
</style>
</head>
<body>
<nav>
  <div class="nav-top">
    <span class="nav-archive">아카이브</span>
    <a href="/" class="nav-logo">GetStigma</a>
    <span class="nav-date">${nd}</span>
  </div>
  <div class="nav-cats">
    <a href="/" class="nav-cat active">전체</a>
    <a href="/?cat=guide" class="nav-cat">가이드</a>
    <a href="/?cat=ingredient" class="nav-cat">성분</a>
    <a href="/?cat=routine" class="nav-cat">루틴</a>
    <a href="/?cat=tip" class="nav-cat">팁</a>
  </div>
</nav>
<main>
  <div class="main-grid">
    ${featuredBlock}
    <div class="grid-divider"></div>
    <div class="side-list">${sideBlock}</div>
  </div>
  <div class="recent-grid">${recentBlock}</div>
</main>
<footer>
  <div>
    <div class="footer-brand">GetStigma</div>
    <div class="footer-desc">편견 없는 스킨케어·<br>라이프스타일 블로그</div>
  </div>
  <nav class="footer-nav">
    <a href="/?cat=guide">가이드</a>
    <a href="/?cat=ingredient">성분</a>
    <a href="/?cat=routine">루틴</a>
  </nav>
  <div class="footer-right">
    <span class="footer-copy">© 2026 GetStigma</span>
  </div>
</footer>
</body>
</html>`;
}

export function renderArticle(a, next, prev) {
  const nd = navDate();
  const bodyHtml = mdToHtml(a.body_md || "");
  const desc = excerpt(a.body_md || "", 160);
  const url = `${SITE_URL}/article/${a.slug}/`;
  const cat = categoryLabel(a.content_type);

  return `<!DOCTYPE html>
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
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&display=swap" rel="stylesheet">
<script type="application/ld+json">${articleJsonLd(a)}</script>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #fafaf8; font-family: system-ui, -apple-system, sans-serif; color: #111; }
a { color: inherit; text-decoration: none; }
nav.top-nav { border-bottom: 2.5px solid #111; background: #fff; }
.nav-top { display: flex; justify-content: space-between; align-items: center; padding: 14px 48px; border-bottom: 1px solid #e8e8e8; }
.nav-archive { font-size: 10px; color: #aaa; letter-spacing: 0.15em; font-variant-caps: small-caps; }
.nav-logo { font-family: 'Playfair Display', Georgia, serif; font-size: 28px; font-weight: 900; color: #111; letter-spacing: -0.02em; }
.nav-date { font-size: 10px; color: #aaa; letter-spacing: 0.06em; }
.nav-cats { display: flex; align-items: center; padding: 0 48px; }
.nav-cat { font-size: 11px; font-weight: 700; color: #666; padding: 10px 20px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2.5px; letter-spacing: 0.04em; transition: color .15s; }
.nav-cat:first-child { padding-left: 0; }
.nav-cat:hover { color: #111; border-bottom-color: #111; }
.article-wrap { display: grid; grid-template-columns: 1fr 260px; border-bottom: 1px solid #e8e8e8; background: #fff; min-height: 600px; }
.article-main { padding: 44px 48px; border-right: 1px solid #e8e8e8; }
.back-link { font-size: 11px; color: #aaa; display: inline-block; margin-bottom: 36px; transition: color .15s; }
.back-link:hover { color: #111; }
.article-cat { font-size: 10px; color: #b8222a; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; display: block; margin-bottom: 12px; }
.article-title { font-family: 'Playfair Display', serif; font-size: 44px; font-weight: 900; color: #111; line-height: 1.05; margin-bottom: 18px; letter-spacing: -0.02em; }
.article-meta { display: flex; align-items: center; gap: 16px; font-size: 11px; color: #aaa; margin-bottom: 32px; }
.meta-dot { width: 3px; height: 3px; background: #ddd; border-radius: 50%; display: inline-block; }
.article-rule { height: 1.5px; background: #111; margin-bottom: 32px; }
.article-body { font-size: 16px; color: #333; line-height: 1.95; font-family: Georgia, serif; max-width: 580px; }
.article-body h2 { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: #111; margin: 36px 0 14px; line-height: 1.2; }
.article-body h3 { font-size: 17px; font-weight: 700; color: #111; margin: 28px 0 10px; }
.article-body p { margin-bottom: 20px; }
.article-body strong { color: #111; }
.article-body blockquote { border-left: 3px solid #b8222a; padding: 12px 20px; margin: 24px 0; color: #555; font-style: italic; background: #fafaf8; }
.article-body table { width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 14px; }
.article-body th, .article-body td { border: 1px solid #e8e8e8; padding: 10px 14px; text-align: left; }
.article-body th { background: #f5f5f5; font-weight: 700; font-family: system-ui, sans-serif; font-size: 12px; letter-spacing: 0.04em; }
.article-body ol, .article-body ul { margin: 0 0 20px 20px; }
.article-body li { margin-bottom: 8px; line-height: 1.8; }
.article-sidebar { padding: 44px 28px; }
.sidebar-label { font-size: 9px; font-weight: 700; color: #ccc; letter-spacing: 0.16em; text-transform: uppercase; margin-bottom: 14px; }
.sidebar-title { font-family: 'Playfair Display', serif; font-size: 14px; font-weight: 700; color: #111; line-height: 1.3; margin-bottom: 5px; display: block; transition: color .15s; }
.sidebar-title:hover { color: #b8222a; }
.sidebar-meta { font-size: 10px; color: #bbb; margin-bottom: 24px; }
.sidebar-divider { height: 1px; background: #ebebeb; margin-bottom: 24px; }
footer { display: grid; grid-template-columns: 1fr 1fr 1fr; padding: 32px 48px; border-top: 2px solid #111; background: #fff; }
.footer-brand { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 900; color: #111; margin-bottom: 8px; }
.footer-desc { font-size: 11px; color: #bbb; line-height: 1.6; }
.footer-nav { display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center; }
.footer-nav a { font-size: 11px; color: #666; font-variant-caps: small-caps; letter-spacing: 0.08em; transition: color .15s; }
.footer-nav a:hover { color: #111; }
.footer-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; justify-content: center; }
.footer-copy { font-size: 10px; color: #ccc; margin-top: 4px; }
</style>
</head>
<body>
<nav class="top-nav">
  <div class="nav-top">
    <span class="nav-archive">아카이브</span>
    <a href="/" class="nav-logo">GetStigma</a>
    <span class="nav-date">${nd}</span>
  </div>
  <div class="nav-cats">
    <a href="/" class="nav-cat">전체</a>
    <a href="/?cat=guide" class="nav-cat">가이드</a>
    <a href="/?cat=ingredient" class="nav-cat">성분</a>
    <a href="/?cat=routine" class="nav-cat">루틴</a>
    <a href="/?cat=tip" class="nav-cat">팁</a>
  </div>
</nav>
<main>
  <div class="article-wrap">
    <article class="article-main">
      <a href="/" class="back-link">← 목록으로</a>
      <span class="article-cat">${cat}</span>
      <h1 class="article-title">${a.title}</h1>
      <div class="article-meta">
        <span>${fmtDate(a.created_at)}</span>
        <span class="meta-dot"></span>
        <span>${readTime(a.body_md || "")}분 읽기</span>
      </div>
      <div class="article-rule"></div>
      <div class="article-body">${bodyHtml}</div>
    </article>
    <aside class="article-sidebar">
      ${nextArticleHtml(next)}
      ${prevArticleHtml(prev)}
    </aside>
  </div>
</main>
<footer>
  <div>
    <div class="footer-brand">GetStigma</div>
    <div class="footer-desc">편견 없는 스킨케어·<br>라이프스타일 블로그</div>
  </div>
  <nav class="footer-nav">
    <a href="/?cat=guide">가이드</a>
    <a href="/?cat=ingredient">성분</a>
    <a href="/?cat=routine">루틴</a>
  </nav>
  <div class="footer-right">
    <span class="footer-copy">© 2026 GetStigma</span>
  </div>
</footer>
</body>
</html>`;
}
