---
kind: hook
name: _template            # MUST match the folder name; kebab-case
description: One-line description of what this hook intercepts and why.
version: 0.1.0
trigger: before_tool_use   # REQUIRED — one of the app's locked trigger events:
                           # before_tool_use, after_tool_use, before_file_edit,
                           # before_delete, before_paid_action, before_share_send,
                           # before_task_status_change, after_task_status_change,
                           # session_start, session_end, ...
capabilities: []
# handler_ref: path/to/handler.wasm   # optional until Wasm execution lands
---

Hook body — describes the hook's behavior. Installed as the bundle payload;
the app parses the frontmatter through its hook-file validator (`trigger` is
the required field).
