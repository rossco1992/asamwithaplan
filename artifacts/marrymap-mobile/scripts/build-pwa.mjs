#!/usr/bin/env node
/**
 * Builds the app for the web as an installable PWA, served from a sub-path
 * (default /app/) next to the API on the same site, so it calls /api on its
 * own origin and needs no API domain.
 *
 *   node scripts/build-pwa.mjs [outputDir]
 *
 * Needs EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, or VITE_CLERK_PUBLISHABLE_KEY,
 * which the Netlify beta site already has.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] ?? path.join(projectRoot, 'dist-pwa'));
const basePath = `/${(process.env.PWA_BASE_PATH ?? 'app').replace(/^\/+|\/+$/g, '')}`;

const APP_NAME = 'A Sam with a Plan';
const SHORT_NAME = 'Sam';
const BACKGROUND = '#faf9f5';
const THEME = '#faf9f5';

const publishableKey =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) {
  console.error('build-pwa: set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY or VITE_CLERK_PUBLISHABLE_KEY.');
  process.exit(1);
}

const env = {
  ...process.env,
  CI: '1',
  EXPO_NO_TELEMETRY: '1',
  EXPO_WEB_BASE_URL: basePath,
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
};
// Same origin as the API: no domain means requests go to /api on this site.
delete env.EXPO_PUBLIC_DOMAIN;

rmSync(outDir, { recursive: true, force: true });
mkdirSync(path.dirname(outDir), { recursive: true });

console.log(`build-pwa: exporting the web app to ${outDir}, served at ${basePath}/`);
const result = spawnSync('pnpm', ['exec', 'expo', 'export', '--platform', 'web', '--output-dir', outDir], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
});
if (result.status !== 0) process.exit(result.status ?? 1);

// The manifest makes "Add to Home Screen" open the app full screen, with its own name and icon.
const manifest = {
  name: APP_NAME,
  short_name: SHORT_NAME,
  description: 'Plan your wedding together, one milestone at a time.',
  start_url: `${basePath}/`,
  scope: `${basePath}/`,
  display: 'standalone',
  orientation: 'portrait',
  background_color: BACKGROUND,
  theme_color: THEME,
  icons: [
    { src: `${basePath}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${basePath}/icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
  ],
};
writeFileSync(path.join(outDir, 'manifest.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);

for (const icon of ['icon-180.png', 'icon-192.png', 'icon-512.png']) {
  if (!existsSync(path.join(outDir, 'icons', icon))) {
    console.error(`build-pwa: public/icons/${icon} was not copied into the export.`);
    process.exit(1);
  }
}

const indexPath = path.join(outDir, 'index.html');
let html = readFileSync(indexPath, 'utf8');
const head = [
  `<meta name="theme-color" content="${THEME}" />`,
  `<meta name="description" content="${manifest.description}" />`,
  `<link rel="manifest" href="${basePath}/manifest.webmanifest" />`,
  `<link rel="apple-touch-icon" href="${basePath}/icons/icon-180.png" />`,
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  `<meta name="apple-mobile-web-app-title" content="${SHORT_NAME}" />`,
  '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
].join('\n    ');

html = html
  .replace(/<title>[^<]*<\/title>/, `<title>${APP_NAME}</title>`)
  // viewport-fit=cover lets the app use the full screen around the notch;
  // the safe-area code then keeps content clear of it.
  .replace(
    /<meta name="viewport"[^>]*>/,
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
  )
  .replace('</head>', `    ${head}\n  </head>`);
if (!html.includes('rel="manifest"') || !html.includes('viewport-fit=cover')) {
  console.error('build-pwa: could not add the PWA tags to index.html.');
  process.exit(1);
}
writeFileSync(indexPath, html);
console.log('build-pwa: done.');
