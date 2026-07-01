// /sitemap.xml — Supabase에서 발행 글을 실시간으로 읽어 동적 생성.
// robots.txt가 이 URL을 가리키므로 반드시 200으로 응답해야 색인이 진행된다.
import { fetchAllArticles, SITE_URL } from "./_shared.js";

export async function onRequest(context) {
  try {
    const { articles } = await fetchAllArticles(context.env);

    const urls = [
      `  <url><loc>${SITE_URL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      ...articles.map((a) => {
        const lastmod = (a.created_at || "").slice(0, 10);
        return `  <url><loc>${SITE_URL}/article/${a.slug}/</loc>${
          lastmod ? `<lastmod>${lastmod}</lastmod>` : ""
        }<changefreq>monthly</changefreq><priority>0.8</priority></url>`;
      }),
    ].join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (e) {
    return new Response(`<!-- sitemap error: ${e.message} -->`, {
      status: 500,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }
}
