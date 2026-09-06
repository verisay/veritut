import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
  const origin = url.origin.replace(/^http:\/\/(?!localhost)/, 'https://');
  const body = `User-agent: *\nAllow: /\nDisallow: /panel\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
