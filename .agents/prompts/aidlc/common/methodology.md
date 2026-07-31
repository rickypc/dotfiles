# Methodology boundary

The intent is temporary and private. Persistent facts belong only in the KB
after observed evidence and validation. Application code belongs in the target
workspace. Never create per-stage artifact folders, native plugins, hooks,
MCP servers, git operations, or user configuration changes.

After the terminal knowledge-distillation stage has verified the KB concept and
its indexes, retire the temporary intent through the AIDLC retire command with
the private KB root and each captured concept path.
