---
name: md-compress
description: Losslessly distill durable Markdown while preserving protected Markdown tokens and a verified backup.
---

# Markdown Compression

Use only for durable Markdown that will be loaded again. Refuse sensitive paths,
non-Markdown files, and raw private configuration. Guard before any prose edit,
compress only in the current agent session, validate every code fence, URL, and
inline-code token, then remove the verified backup. Never call a provider API
or model subprocess.

Do not compress a temporary AIDLC intent unless the user explicitly asks to
retain it. `knowledge-base` invokes this after it writes a durable concept.
