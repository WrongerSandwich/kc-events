import type { APIRoute } from "astro";
import { origin } from "../build/origin";
export const GET: APIRoute = () => new Response(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`, { headers: { "Content-Type": "text/plain" } });
