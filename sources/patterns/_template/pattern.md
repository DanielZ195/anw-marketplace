---
kind: pattern/folder
name: _template            # MUST match the folder name; kebab-case
author: your-handle        # REQUIRED — becomes the "@author/name" id namespace; lowercase/digits/hyphens
description: One-line description of the workflow this folder pattern installs.
version: 0.1.0
category: productivity     # REQUIRED — pattern card category
capabilities: []
# model_min_class: local-small
# depends_on: ["@daniel/some-skill"]
---

Folder-pattern body. The sibling `template/` subtree holds the placeholder
files that are COPIED into a project when the pattern is instantiated
(copy-on-create, no live link back to this bundle).

> v1 note: the app's installer currently writes the manifest payload only; the
> `template/` subtree ships with the bundle sources and will be packaged into
> the payload when the installer grows subtree support. Keep templates small.
