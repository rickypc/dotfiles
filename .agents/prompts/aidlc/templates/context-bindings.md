# Private practice-record bindings

Use only existing validated KB concepts. Pass their relative concept paths to
the resolver in this exact order:

```text
shared/organization/<concept>.md
shared/team/<concept>.md
<cbm-index>/project/<concept>.md
```

Use `-` for an absent layer. Do not create a placeholder fact; collect and
validate the practice through knowledge-base first.
