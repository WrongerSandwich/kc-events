import type { APIRoute } from "astro";
import { origin } from "../build/origin";
import { events } from "../generated/events";

export const GET: APIRoute = () => {
  const paths = ["/", "/explore", "/about", ...events.map((e) => `/e/${e.id}`)];
  const urls = paths.map((p) => `  <url><loc>${new URL(p, origin).href}</loc></url>`).join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
