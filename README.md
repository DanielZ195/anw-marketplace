# anw-marketplace

The registry behind the ANW marketplace. This repo **is** the marketplace
backend: the app's `registryUrl` points at this repo's `registry.json`, and
every bundle payload is fetched from this repo's raw URLs. Pushing to `main`
is publishing — there is no separate sync or mirror.

Bundle kinds supported (matching the app's v1 installer): **skills**, **hooks**,
**system events**, and **folder-pattern templates**. Flows are excluded from v1
by the app's locked FLOWS-FREE ruling.

## Layout

```
registry.json                  GENERATED — the index the app fetches
bundles/<author>/<name>/<v>.json  GENERATED — immutable versioned payloads
known-bad.json                 AUTHORED — the kill list (see below)
sources/                       AUTHORED — the only place you edit
  skills/<name>/SKILL.md
  hooks/<name>/HOOK.md
  events/<name>/EVENT.md
  patterns/<name>/pattern.md (+ template/ subtree)
scripts/build-registry.mjs     sources → bundles/ + registry.json (validates)
```

Folders starting with `_` under `sources/` (e.g. `_template/`) are skipped by
the build — copy one to start a new bundle.

## Publishing a bundle

1. Copy the kind's `_template/` folder to `sources/<kind>/<bundle-name>/` and
   fill in the frontmatter + body. The folder name is the bundle name, and the
   required `author` frontmatter field is the id namespace, so the published id
   becomes `@<author>/<bundle-name>`.
2. Push to `main` (or open a PR — CI verifies the generated output on PRs).
3. The `build-registry` workflow validates the bundle, writes the versioned
   payload under `bundles/`, regenerates `registry.json`, and commits both.

To build locally instead: `npm install && npm run build`, commit the output.

### Versioning is immutable

`bundles/**` payloads are append-only. Changing a bundle's content without
bumping `version` in its frontmatter fails the build — bump the version and a
new payload file is written alongside the old one. This is what makes the
app's pin-by-default install semantics real: a pinned installed version keeps
resolving to byte-identical content forever.

### Frontmatter → manifest

The build derives each payload from the authored frontmatter and validates it
against the same contracts the app's installer enforces (manifest schema +
per-kind required fields). Required everywhere: `name` (= folder name),
`author`, `description`, `version` (semver). Kind-specific requirements: hooks need
`trigger`; events need `trigger` + `runtime`; patterns need `category`.
Capability tokens are the closed set `file-read`, `file-write`,
`network-egress`, `executes-code`, `paid-apis`. Defaults applied when
omitted: `model_min_class: local-small`, `min_substrate_version: 0.1.0`,
`tested_vendors: {}`.

## Consuming the registry (app side)

This repo is public, and this registry is the app's **default** — a stock
`anw serve` browses it with no configuration and no credentials:

```
https://raw.githubusercontent.com/DanielZ195/anw-marketplace/main/registry.json
```

`ANW_REGISTRY_URL` overrides that default. Set it to another `registry.json`
URL to run your own registry, or to an **empty value** to disable the
marketplace entirely — the app then contacts nothing and says so in the panel.

Private registries are still supported: set `ANW_REGISTRY_TOKEN` to a
fine-grained PAT with read-only Contents permission on the registry repo. The
app attaches it only to requests for the registry's own host, never to bundle
URLs on other hosts, and it stays server-side (same pattern as the LLM
provider keys). This public registry needs no token.

## The kill list

`known-bad.json` is the takedown channel. The app fetches it alongside the
registry and force-disables any installed bundle listed there, so a bundle
found to be harmful stops loading in workspaces that already installed it.

```json
{ "entries": [{ "hookId": "@author/bundle-name" }] }
```

It ships empty. Entries are added by hand — this is a safety switch, not
generated output — and removing an entry re-enables the bundle on the next
fetch. Fetching it fails open: an unreachable list never blocks a workspace
from starting.
