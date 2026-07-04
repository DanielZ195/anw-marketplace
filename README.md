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

1. Copy the kind's `_template/` folder to `sources/<kind>/<your-name>/` and
   fill in the frontmatter + body. The folder name is the bundle name; the
   published id becomes `@daniel/<name>`.
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
`description`, `version` (semver). Kind-specific requirements: hooks need
`trigger`; events need `trigger` + `runtime`; patterns need `category`.
Capability tokens are the closed set `file-read`, `file-write`,
`network-egress`, `executes-code`, `paid-apis`. Defaults applied when
omitted: `model_min_class: local-small`, `min_substrate_version: 0.1.0`,
`tested_vendors: {}`.

## Consuming the registry (app side)

Point the app at:

```
https://raw.githubusercontent.com/DanielZ195/anw-marketplace/main/registry.json
```

**While this repo is private**, raw URLs require authentication. Create a
fine-grained PAT scoped to this single repo with read-only Contents
permission, and have the app's injected fetch send it:

```js
fetch(url, { headers: { Authorization: `token ${process.env.ANW_REGISTRY_TOKEN}` } })
```

The token lives server-side only (same pattern as the LLM provider keys).
When the repo goes public, drop the token — the URLs do not change.
