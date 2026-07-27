---
kind: skill
name: _template            # MUST match the folder name; kebab-case
author: your-handle        # REQUIRED — becomes the "@author/name" id namespace; lowercase/digits/hyphens
description: One-line agent-facing description (what the skill does and when to use it).
version: 0.1.0             # semver; bump on EVERY content change — published payloads are immutable
capabilities: []           # closed set: file-read, file-write, network-egress, executes-code, paid-apis
# --- optional ---
# long_description: Extended human-facing description shown on the marketplace card.
# model_min_class: local-small     # local-small | local-medium | local-large | cloud-frontier
# min_substrate_version: 0.1.0
# tested_vendors: { anthropic: ">=claude-sonnet-4" }
# depends_on: ["@daniel/other-bundle"]
# model: preferred-model-id
---

The markdown body is the skill's instruction text. It becomes the installed
`_skills/<name>/SKILL.md` body verbatim — write it as instructions to the agent.
