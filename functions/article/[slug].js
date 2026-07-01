import { fetchAllArticles, fetchArticleBySlug, renderArticle } from "../_shared.js";

export async function onRequest(context) {
  const { slug } = context.params;
  try {
    const { brandId, articles } = await fetchAllArticles(context.env);
    if (!brandId) return new Response("Not found", { status: 404 });

    const idx = articles.findIndex(a => a.slug === slug);
    if (idx === -1) {
      const a = await fetchArticleBySlug(context.env, brandId, slug);
      if (!a) return new Response("Not found", { status: 404 });
      const html = renderArticle(a, null, null);
      return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }

    const a = articles[idx];
    const next = articles[idx - 1] || null;
    const prev = articles[idx + 1] || null;
    const html = renderArticle(a, next, prev);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html;charset=UTF-8",
        "Cache-Control": "public, max-age=60, s-maxage=300",
      },
    });
  } catch (e) {
    return new Response(`<h1>오류</h1><pre>${e.message}</pre>`, {
      status: 500,
      headers: { "Content-Type": "text/html;charset=UTF-8" },
    });
  }
}
