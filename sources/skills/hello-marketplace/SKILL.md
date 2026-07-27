---
kind: skill
name: hello-marketplace
author: daniel
description: Verify a marketplace install end-to-end by greeting the workspace and reporting which bundle version is running.
version: 0.1.0
capabilities:
  - file-read
long_description: >-
  A minimal working skill used to prove the registry → install → dispatch
  pipeline. Installing it and invoking it confirms the app can fetch this
  registry, validate the bundle, materialize a runnable SKILL.md, and route a
  request to it.
---

When invoked, do the following:

1. Greet the user and state that you were installed from the `@daniel/hello-marketplace`
   bundle, version 0.1.0.
2. Report the name of the workspace root folder you are running in.
3. Confirm the install pipeline worked by listing which capabilities you were
   granted (this skill declares only `file-read`).

Keep the whole response under five lines.
