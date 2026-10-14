/**
 * SEO bits that depend on where the site is deployed.
 *
 *   VITE_SITE_URL=https://alastructs.example npm run build
 *
 * With a site URL the build adds a canonical link, og:url, absolute
 * og:image / twitter:image URLs and JSON-LD to index.html, and writes
 * robots.txt (with a Sitemap line) and sitemap.xml. Without one it still
 * writes robots.txt and points the social images at relative paths, which
 * most crawlers won't follow — so set it for production builds.
 */
const OG_IMAGE = 'og-image.jpg';
const NAME = 'À la Structs';
const DESCRIPTION = 'Run a cozy critter restaurant in your browser: hire animal staff, discover recipes and out-serve rival restaurants across town. A free 3D skin for Structs.';

const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function siteUrl(raw) {
  if (!raw) return null;
  const u = new URL(raw);            // throws on a malformed value: better at build time than in prod
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  return u.href;
}

export function seoTags(site, base = '/') {
  const page = site || null;
  const img = site ? new URL(OG_IMAGE, site).href : base + OG_IMAGE;
  const tags = [
    { tag: 'meta', attrs: { property: 'og:image', content: img } },
    { tag: 'meta', attrs: { name: 'twitter:image', content: img } },
  ];
  if (page) {
    tags.unshift(
      { tag: 'link', attrs: { rel: 'canonical', href: page } },
      { tag: 'meta', attrs: { property: 'og:url', content: page } },
    );
    tags.push({
      tag: 'script', attrs: { type: 'application/ld+json' },
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebSite', '@id': page + '#website', url: page, name: NAME },
          {
            '@type': ['VideoGame', 'WebApplication'],
            '@id': page + '#game',
            name: NAME,
            url: page,
            description: DESCRIPTION,
            image: img,
            genre: ['Simulation', 'Strategy', 'Restaurant management'],
            gamePlatform: 'Web browser',
            applicationCategory: 'GameApplication',
            operatingSystem: 'Any (requires WebGL)',
            playMode: ['SinglePlayer', 'MultiPlayer'],
            isAccessibleForFree: true,
            inLanguage: 'en',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            isBasedOn: { '@type': 'VideoGame', name: 'Structs' },
          },
        ],
      }).replace(/</g, '\\u003c'),
      injectTo: 'head',
    });
  }
  return tags;
}

/** The same tags as a string, for pages built outside Vite. */
export function seoHtml(site, base = '/') {
  return seoTags(site, base).map(({ tag, attrs, children }) => {
    const a = Object.entries(attrs).map(([k, v]) => ` ${k}="${attr(v)}"`).join('');
    return tag === 'script' ? `<script${a}>${children}</script>` : `<${tag}${a}>`;
  }).join('\n');
}

export function robotsTxt(site) {
  return `User-agent: *\nAllow: /\n${site ? `\nSitemap: ${new URL('sitemap.xml', site).href}\n` : ''}`;
}

export function sitemapXml(site) {
  const lastmod = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${attr(site)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
</urlset>
`;
}

export function seoVite(rawSiteUrl) {
  const site = siteUrl(rawSiteUrl);
  let base = '/';
  return {
    name: 'a-la-structs-seo',
    configResolved(cfg) {
      base = cfg.base || '/';
      if (cfg.command === 'build' && !site) cfg.logger.warn('[seo] VITE_SITE_URL is not set: no canonical URL, sitemap or absolute og:image in this build.');
    },
    transformIndexHtml: () => seoTags(site, base),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/robots.txt') { res.setHeader('Content-Type', 'text/plain'); return res.end(robotsTxt(site)); }
        if (req.url === '/sitemap.xml' && site) { res.setHeader('Content-Type', 'application/xml'); return res.end(sitemapXml(site)); }
        next();
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt(site) });
      if (site) this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(site) });
    },
  };
}
