#!/usr/bin/env node
/**
 * Runs in the Netlify build, before functions are bundled. Writes this
 * deploy's own addresses (its preview address included) into
 * deploy-origins.ts, so the API accepts sign-ins from pages on the same
 * deploy. Netlify sets these variables in every build.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const origins = [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL]
  .filter(Boolean)
  .flatMap((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? [url.origin] : [];
    } catch {
      return [];
    }
  });
const unique = [...new Set(origins)];

const target = path.join(path.dirname(fileURLToPath(import.meta.url)), 'deploy-origins.ts');
writeFileSync(
  target,
  `// Written by write-deploy-origins.mjs during the Netlify build.\nexport const deployOrigins: string[] = ${JSON.stringify(unique)};\n`,
);
console.log(`write-deploy-origins: ${unique.length ? unique.join(', ') : 'none (not a Netlify build)'}`);
