import { fetchAllArticles, renderIndex } from "./_shared.js";

export async function onRequest(context) {
  try {
    const { articles } = await fetchAllArticles(context.env);
    const html = renderIndex(articles);
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
