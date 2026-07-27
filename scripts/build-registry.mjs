#!/usr/bin/env node
/**
 * build-registry.mjs — derive the published registry from sources/.
 *
 * Reads every authored bundle under sources/<kind-dir>/<name>/, validates it
 * against the same contracts the app's installer enforces
 * (lib/platform/marketplace-manifest.ts + the per-kind frontmatter validators),
 * then writes:
 *
 *   bundles/<author>/<name>/<version>.json   — immutable versioned payloads
 *   registry.json                            — the index the app's registryUrl fetches
 *
 * Immutability rule: a payload file that already exists is NEVER rewritten.
 * Changing a bundle's content requires bumping `version` in its frontmatter;
 * a content change without a bump fails the build.
 *
 * Usage:
 *   node scripts/build-registry.mjs           # build
 *   node scripts/build-registry.mjs --check   # verify committed output is current (CI PR gate)
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

// ---------------------------------------------------------------------------
// Publishing constants
// ---------------------------------------------------------------------------

const REPO_RAW_BASE = 'https://raw.githubusercontent.com/DanielZ195/anw-marketplace/main';

// Every bundle declares its own author, which becomes both its id namespace
// (`@<author>/<name>`) and its payload directory. It is required rather than
// defaulted: a default would silently publish a contributor's bundle under
// somebody else's name.
const AUTHOR_RE = /^[a-z0-9][a-z0-9-]*$/;

// Closed sets — MUST match lib/platform/marketplace-manifest.ts in the app.
const CAPABILITY_TOKENS = new Set([
  'file-read',
  'file-write',
  'network-egress',
  'executes-code',
  'paid-apis',
]);
const MODEL_MIN_CLASSES = new Set(['local-small', 'local-medium', 'local-large', 'cloud-frontier']);
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\w.-]+))?(?:\+([\w.-]+))?$/;

// kind → { sources dir, authored entry file, extra required frontmatter }
// Entry-file names mirror the app's authored conventions (SKILL.md / EVENT.md /
// pattern.md); hooks are a flat `_hooks/<name>.md` in the app, kept as
// <name>/HOOK.md here so every source bundle is a folder that can carry assets.
const KINDS = {
  skill: { dir: 'skills', entry: 'SKILL.md', extraRequired: [] },
  hook: { dir: 'hooks', entry: 'HOOK.md', extraRequired: ['trigger'] },
  event: { dir: 'events', entry: 'EVENT.md', extraRequired: ['trigger', 'runtime'] },
  'pattern/folder': { dir: 'patterns', entry: 'pattern.md', extraRequired: ['category'] },
};

// Defaults applied when the authored frontmatter omits a manifest-required field.
const DEFAULTS = {
  min_substrate_version: '0.1.0',
  model_min_class: 'local-small', // least restrictive — every model class passes the gate
  tested_vendors: {},
  capabilities: [],
};

// ---------------------------------------------------------------------------
// Parse an authored entry file: YAML frontmatter + markdown body
// ---------------------------------------------------------------------------

function parseEntryFile(path) {
  const raw = readFileSync(path, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${path}: missing YAML frontmatter block`);
  const frontmatter = yaml.load(m[1]);
  if (frontmatter === null || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    throw new Error(`${path}: frontmatter must be a YAML mapping`);
  }
  return { frontmatter, body: m[2].trim() };
}

// ---------------------------------------------------------------------------
// Build + validate one bundle manifest from an authored source
// ---------------------------------------------------------------------------

function buildManifest(kind, name, fm, body, srcPath) {
  const errors = [];
  const req = (field, ok) => {
    if (!ok) errors.push(`missing or invalid required field "${field}"`);
  };

  if (fm.kind !== undefined && fm.kind !== kind) {
    errors.push(`frontmatter kind "${fm.kind}" does not match source directory kind "${kind}"`);
  }
  if (fm.name !== undefined && fm.name !== name) {
    errors.push(`frontmatter name "${fm.name}" does not match folder name "${name}"`);
  }

  const author = fm.author;
  if (typeof author !== 'string' || !AUTHOR_RE.test(author)) {
    errors.push(
      'missing or invalid required field "author" ' +
        '(lowercase letters, digits and hyphens; it becomes the "@author/name" id namespace)',
    );
  }

  const manifest = {
    id: `@${author}/${name}`,
    kind,
    name,
    version: fm.version,
    description: fm.description,
    min_substrate_version: fm.min_substrate_version ?? DEFAULTS.min_substrate_version,
    model_min_class: fm.model_min_class ?? DEFAULTS.model_min_class,
    capabilities: fm.capabilities ?? DEFAULTS.capabilities,
    tested_vendors: fm.tested_vendors ?? DEFAULTS.tested_vendors,
    author,
  };

  req('version', typeof manifest.version === 'string' && SEMVER_RE.test(manifest.version));
  req('description', typeof manifest.description === 'string' && manifest.description.length > 0);
  req('min_substrate_version', SEMVER_RE.test(manifest.min_substrate_version));
  if (!MODEL_MIN_CLASSES.has(manifest.model_min_class)) {
    errors.push(`model_min_class must be one of: ${[...MODEL_MIN_CLASSES].join(', ')}`);
  }
  if (!Array.isArray(manifest.capabilities)) {
    errors.push('capabilities must be an array');
  } else {
    for (const cap of manifest.capabilities) {
      if (!CAPABILITY_TOKENS.has(cap)) {
        errors.push(`invalid capability token "${cap}" (allowed: ${[...CAPABILITY_TOKENS].join(', ')})`);
      }
    }
  }
  if (typeof manifest.tested_vendors !== 'object' || manifest.tested_vendors === null) {
    errors.push('tested_vendors must be an object of vendor → version-descriptor strings');
  }

  // Optional manifest fields, passed through when present
  for (const opt of ['long_description', 'depends_on', 'open_source_url', 'ai_authored']) {
    if (fm[opt] !== undefined) manifest[opt] = fm[opt];
  }
  if (fm.depends_on !== undefined && !Array.isArray(fm.depends_on)) {
    errors.push('depends_on must be an array of bundle ids');
  }

  // Kind-specific required frontmatter (the installer re-validates through the
  // app's per-kind validators, so these must ride along in the payload).
  for (const field of KINDS[kind].extraRequired) {
    req(field, typeof fm[field] === 'string' && fm[field].length > 0);
    if (fm[field] !== undefined) manifest[field] = fm[field];
  }
  // Optional kind-specific fields worth carrying through
  for (const opt of ['filter', 'handler_ref', 'model', 'input', 'output']) {
    if (fm[opt] !== undefined) manifest[opt] = fm[opt];
  }

  if (body.length > 0) manifest.body = body;

  if (errors.length > 0) {
    throw new Error(`${srcPath}:\n  - ${errors.join('\n  - ')}`);
  }
  return manifest;
}

// ---------------------------------------------------------------------------
// Scan sources/
// ---------------------------------------------------------------------------

function scanSources() {
  const manifests = [];
  for (const [kind, { dir, entry }] of Object.entries(KINDS)) {
    const kindDir = join(ROOT, 'sources', dir);
    if (!existsSync(kindDir)) continue;
    for (const name of readdirSync(kindDir).sort()) {
      if (name.startsWith('_') || name.startsWith('.')) continue; // templates, dotfiles
      const entryPath = join(kindDir, name, entry);
      if (!existsSync(entryPath)) {
        throw new Error(`sources/${dir}/${name}/ has no ${entry} — every bundle folder needs one`);
      }
      const { frontmatter, body } = parseEntryFile(entryPath);
      manifests.push(buildManifest(kind, name, frontmatter, body, entryPath));
    }
  }
  return manifests;
}

// ---------------------------------------------------------------------------
// Emit bundles/ (immutable) + registry.json
// ---------------------------------------------------------------------------

function payloadRelPath(manifest) {
  return join('bundles', manifest.author, manifest.name, `${manifest.version}.json`);
}

function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

function main() {
  const manifests = scanSources();
  const problems = [];
  const writes = [];

  for (const manifest of manifests) {
    const rel = payloadRelPath(manifest);
    const abs = join(ROOT, rel);
    const content = JSON.stringify(manifest, null, 2) + '\n';
    if (existsSync(abs)) {
      const existing = readFileSync(abs, 'utf8');
      if (sha256(existing) !== sha256(content)) {
        problems.push(
          `${rel}: content changed but version ${manifest.version} is already published — bump "version" in the source frontmatter`,
        );
      }
    } else {
      writes.push({ abs, rel, content });
    }
  }

  const registry = { bundles: {} };
  for (const manifest of manifests) {
    registry.bundles[manifest.id] = {
      id: manifest.id,
      version: manifest.version,
      description: manifest.description,
      payload_url: `${REPO_RAW_BASE}/${payloadRelPath(manifest).split('\\').join('/')}`,
    };
  }
  const registryContent = JSON.stringify(registry, null, 2) + '\n';
  const registryPath = join(ROOT, 'registry.json');

  if (problems.length > 0) {
    console.error('Build failed:\n' + problems.map((p) => `  - ${p}`).join('\n'));
    process.exit(1);
  }

  if (CHECK) {
    const stale = [];
    if (writes.length > 0) stale.push(...writes.map((w) => w.rel));
    if (!existsSync(registryPath) || readFileSync(registryPath, 'utf8') !== registryContent) {
      stale.push('registry.json');
    }
    if (stale.length > 0) {
      console.error(
        'Committed output is stale — run `npm run build` and commit:\n' +
          stale.map((s) => `  - ${s}`).join('\n'),
      );
      process.exit(1);
    }
    console.log(`check ok — ${manifests.length} bundle(s), registry.json current`);
    return;
  }

  for (const { abs, rel, content } of writes) {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    console.log(`wrote ${rel}`);
  }
  writeFileSync(registryPath, registryContent);
  console.log(`wrote registry.json (${manifests.length} bundle(s))`);
}

main();
