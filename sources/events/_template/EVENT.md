---
kind: event
name: _template            # MUST match the folder name; kebab-case
description: One-line description of what this system event reacts to.
version: 0.1.0
trigger: file_created      # REQUIRED — must be a value from the app's EVENT.md trigger vocabulary
runtime: wasm              # REQUIRED — execution runtime for the handler
capabilities: []
# filter: "notes/**/*.md"           # optional glob / frontmatter-predicate filter
# handler_ref: path/to/handler.wasm # optional handler reference
---

Event body — describes the event handler's behavior. The app's event-file
validator requires both `trigger` and `runtime`.
