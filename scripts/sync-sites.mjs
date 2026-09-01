/**
 * Copy shared modules into each site's `vendor/` directory.
 *
 * Why this exists: the four Vercel projects each have their own root directory
 * (`sites/host`, `sites/acme-booking`, ...). A deployment cannot read a file
 * outside its own root, so `src/shared/*.js` is unreachable from a site at
 * build time. Copying is the fix.
 *
 * Widget modules (`src/widget/*.js`) are copied into each widget site's
 * `vendor/` only — not the host. The third-party origin trial token must be
 * served from the vendor origin that embeds the widget.
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
const WIDGET_DIR = join(REPO_ROOT, 'src', 'widget');
const SITES_DIR = join(REPO_ROOT, 'sites');

/** Sites that receive a copy of `src/shared`. */
const SITES = ['host', 'acme-booking', 'northwind-checkout', 'zenith-support'];

/** Widget vendor sites that receive a copy of `src/widget/*.js`. Host excluded. */
const WIDGET_SITES = ['acme-booking', 'northwind-checkout', 'zenith-support'];

/**
 * Shared modules that must not be copied into widget `vendor/` directories.
 * `patterns.js` is the injection/credential detector — shipping it to widget
 * origins hands a hostile vendor the expressions to tune around.
 * The host may receive it (screening/redaction). Widget helper/attest/origin-trial
 * vendoring is unchanged.
 */
const HOST_ONLY_SHARED = new Set(['patterns.js']);

/**
 * @param {string} site
 * @param {string[]} shared
 * @returns {string[]}
 */
function sharedForSite(site, shared) {
  if (site === 'host') return shared;
  return shared.filter((name) => !HOST_ONLY_SHARED.has(name));
}

const SHARED_BANNER = [
  '// GENERATED FILE - DO NOT EDIT.',
  '// Copied verbatim from src/shared/ by scripts/sync-sites.mjs.',
  '// Edit the source in src/shared/ and re-run: node scripts/sync-sites.mjs',
  ''
].join('\n');

const WIDGET_BANNER = [
  '// GENERATED FILE - DO NOT EDIT.',
  '// Copied verbatim from src/widget/ by scripts/sync-sites.mjs.',
  '// Edit the source in src/widget/ and re-run: node scripts/sync-sites.mjs',
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

/**
 * @returns {Promise<string[]>} names of the `.js` files in `src/widget`
 */
async function widgetFiles() {
  if (!existsSync(WIDGET_DIR)) return [];
  const entries = await readdir(WIDGET_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith('.js')).map((e) => e.name);
}

/**
 * @param {object} opts
 * @param {boolean} opts.check
 * @param {string[]} opts.stale
 * @param {{ written: number }} opts.stats
 * @param {string} opts.sourcePath
 * @param {string} opts.targetPath
 * @param {string} opts.banner
 */
async function syncOneFile({ check, stale, stats, sourcePath, targetPath, banner }) {
  const source = await readFile(sourcePath, 'utf8');
  const desired = banner + source;
  const current = existsSync(targetPath) ? await readFile(targetPath, 'utf8') : null;

  if (current === desired) return;

  if (check) {
    stale.push(`${relative(REPO_ROOT, targetPath)} (${current === null ? 'missing' : 'stale'})`);
    return;
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, desired, 'utf8');
  stats.written += 1;
  console.log(`sync-sites: wrote ${relative(REPO_ROOT, targetPath)}`);
}

async function main() {
  const check = process.argv.includes('--check');
  const shared = await sharedFiles();
  const widget = await widgetFiles();

  if (shared.length === 0) {
    console.error('sync-sites: no .js files found in src/shared/ - nothing to copy.');
    process.exit(1);
  }

  const stale = [];
  const stats = { written: 0 };

  for (const site of SITES) {
    const siteDir = join(SITES_DIR, site);
    if (!existsSync(siteDir)) {
      console.error(`sync-sites: missing site directory ${relative(REPO_ROOT, siteDir)}`);
      process.exit(1);
    }
    const vendorDir = join(siteDir, 'vendor');
    const sharedNames = sharedForSite(site, shared);
    const allowedVendorFiles = new Set([
      ...sharedNames,
      ...(WIDGET_SITES.includes(site) ? widget : [])
    ]);

    // Drop vendored files whose source no longer exists, so a deleted module
    // cannot linger on a deployed origin.
    if (existsSync(vendorDir)) {
      for (const entry of await readdir(vendorDir)) {
        if (entry.endsWith('.js') && !allowedVendorFiles.has(entry)) {
          if (check) stale.push(`${relative(REPO_ROOT, join(vendorDir, entry))} (orphaned)`);
          else await rm(join(vendorDir, entry));
        }
      }
    }

    for (const name of sharedNames) {
      await syncOneFile({
        check,
        stale,
        stats,
        sourcePath: join(SHARED_DIR, name),
        targetPath: join(vendorDir, name),
        banner: SHARED_BANNER
      });
    }
  }

  for (const site of WIDGET_SITES) {
    const siteDir = join(SITES_DIR, site);
    if (!existsSync(siteDir)) {
      console.error(`sync-sites: missing site directory ${relative(REPO_ROOT, siteDir)}`);
      process.exit(1);
    }
    const vendorDir = join(siteDir, 'vendor');

    for (const name of widget) {
      await syncOneFile({
        check,
        stale,
        stats,
        sourcePath: join(WIDGET_DIR, name),
        targetPath: join(vendorDir, name),
        banner: WIDGET_BANNER
      });
    }
  }

  if (check) {
    if (stale.length > 0) {
      console.error('sync-sites --check: vendored copies are out of date:');
      for (const item of stale) console.error(`  ${item}`);
      console.error('Run: node scripts/sync-sites.mjs');
      process.exit(1);
    }
    const sharedCount = SITES.reduce((n, site) => n + sharedForSite(site, shared).length, 0);
    const widgetCount = widget.length * WIDGET_SITES.length;
    console.log(
      `sync-sites --check: all ${sharedCount + widgetCount} vendored copies are current.`
    );
    return;
  }

  console.log(
    stats.written === 0
      ? 'sync-sites: already up to date.'
      : `sync-sites: ${stats.written} file(s) written.`
  );
}

await main();
