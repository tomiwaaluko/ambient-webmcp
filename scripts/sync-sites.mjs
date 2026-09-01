/**
 * Copy shared modules into each site's `vendor/` directory.
 *
 * Why this exists: the four Vercel projects each have their own root directory
 * (`sites/host`, `sites/acme-booking`, ...). A deployment cannot read a file
 * outside its own root, so `src/shared/*.js` is unreachable from a site at
 * build time. Copying is the fix.
 *
 * This is a file copy, not a build step — no bundling, no transpiling, no
 * minifying, no dependency graph. The bytes that land in `vendor/` are the
 * bytes in `src/`. That distinction is the one hard constraint this script
 * lives under (see CONVENTIONS.md, hard constraint 1).
 *
 * Usage:  node scripts/sync-sites.mjs [--check]
 *   --check  exit 1 if any vendored copy is missing or stale, and write
 *            nothing. For use before a deploy.
 */

import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED_DIR = join(REPO_ROOT, 'src', 'shared');
const SITES_DIR = join(REPO_ROOT, 'sites');

/** Sites that receive a copy of `src/shared`. */
const SITES = ['host', 'acme-booking', 'northwind-checkout', 'zenith-support'];

const BANNER = [
  '// GENERATED FILE - DO NOT EDIT.',
  '// Copied verbatim from src/shared/ by scripts/sync-sites.mjs.',
  '// Edit the source in src/shared/ and re-run: node scripts/sync-sites.mjs',
  ''
].join('\n');

/**
 * @returns {Promise<string[]>} names of the `.js` files in `src/shared`
 */
async function sharedFiles() {
  if (!existsSync(SHARED_DIR)) return [];
  const entries = await readdir(SHARED_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith('.js')).map((e) => e.name);
}

async function main() {
  const check = process.argv.includes('--check');
  const files = await sharedFiles();

  if (files.length === 0) {
    console.error('sync-sites: no .js files found in src/shared/ - nothing to copy.');
    process.exit(1);
  }

  const stale = [];
  let written = 0;

  for (const site of SITES) {
    const siteDir = join(SITES_DIR, site);
    if (!existsSync(siteDir)) {
      console.error(`sync-sites: missing site directory ${relative(REPO_ROOT, siteDir)}`);
      process.exit(1);
    }
    const vendorDir = join(siteDir, 'vendor');

    // Drop vendored files whose source no longer exists, so a deleted shared
    // module cannot linger on a deployed origin.
    if (existsSync(vendorDir)) {
      for (const entry of await readdir(vendorDir)) {
        if (entry.endsWith('.js') && !files.includes(entry)) {
          if (check) stale.push(`${relative(REPO_ROOT, join(vendorDir, entry))} (orphaned)`);
          else await rm(join(vendorDir, entry));
        }
      }
    }

    for (const name of files) {
      const source = await readFile(join(SHARED_DIR, name), 'utf8');
      const target = join(vendorDir, name);
      const desired = BANNER + source;
      const current = existsSync(target) ? await readFile(target, 'utf8') : null;

      if (current === desired) continue;

      if (check) {
        stale.push(`${relative(REPO_ROOT, target)} (${current === null ? 'missing' : 'stale'})`);
        continue;
      }

      await mkdir(vendorDir, { recursive: true });
      await writeFile(target, desired, 'utf8');
      written += 1;
      console.log(`sync-sites: wrote ${relative(REPO_ROOT, target)}`);
    }
  }

  if (check) {
    if (stale.length > 0) {
      console.error('sync-sites --check: vendored copies are out of date:');
      for (const item of stale) console.error(`  ${item}`);
      console.error('Run: node scripts/sync-sites.mjs');
      process.exit(1);
    }
    console.log(`sync-sites --check: all ${files.length * SITES.length} vendored copies are current.`);
    return;
  }

  console.log(
    written === 0
      ? 'sync-sites: already up to date.'
      : `sync-sites: ${written} file(s) written across ${SITES.length} sites.`
  );
}

await main();
