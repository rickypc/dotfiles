---
name: binary-router
description: >-
  The complete eighteen-row binary route reference owned by repo-search: content-gate detection
  signatures, wrapper-executed decode stages, precise check-then-install package names, extraction
  rules, and per-row traps for every binary, archive, bundle, capture, firmware, website, and
  running-process target.
---

# Binary Router Reference

The binary router is the wrapper-owned continuation of repository discovery: after graph and code
search first and before the textual fallback, the content gate probes located candidates by content,
classifies every binary, and decodes only as the query requires. This reference enumerates all
eighteen route rows with their detection signatures, wrapper stages, check-then-install package
names, and traps. The wrapper records every probe, install, stage, and skip as a machine-readable
receipt; nothing here licenses a caller to bypass it.

## Detection order

| Signature | Kind |
| --- | --- |
| `cf fa ed fe`, `ce fa ed fe`, `fe ed fa cf`, `fe ed fa ce` | `mach-o` |
| `ca fe ba be` or `be ba fe ca` | `fat` - `file(1)` disambiguates Mach-O universals from Java class files |
| `7f 45 4c 46` | `elf` |
| `MZ` at offset 0 | `pe` |
| `00 61 73 6d` | `wasm` |
| `SQLite format 3\0` | `sqlite` |
| `bplist00` | `plist` |
| `c6 1f bc 03` | `hermes` |
| `d4 c3 b2 a1`, `a1 b2 c3 d4`, `0a 0d 0d 0a` | `pcap` |
| `1f 8b` (gzip), `070701`/`070707` (cpio), `27 05 19 56` (uImage) | `firmware` |
| `PK\x03\x04`, `PK\x05\x06`, `PK\x07\x08` | `zip` |
| small little-endian length then `{"files"` in the first 64 bytes | `asar` |
| any NUL byte or invalid UTF-8 in the head, no known magic | `file(1)` mime and human output, keyword-mapped, else `generic-binary` |

Detection is by content, never extension-only. Text files never enter the router; a text file with
`sourceMappingURL=` or lines longer than 500 characters routes as `text-bundle` through the explicit
binary command. An ELF named `libapp.so` is scanned for `f5 f5 dc dc`; the 32 hex chars at magic+20
are the Dart snapshot hash.

## Check-then-install registry

Probe with `command -v <executable>`, install once with
`HOMEBREW_NO_ENV_HINTS=1 brew install <precise-name>`, re-probe once, then record a skipped stage
and fall back within the row. Keg-only formulas resolve their executables through
`brew --prefix <formula>`. Brew is preferred; npm, dotnet, and pip cover the tools brew lacks.

| Routed tool | Probe executable | Installer |
| --- | --- | --- |
| macOS natives | `file`, `lipo`, `otool`, `nm`, `strings`, `codesign`, `xcrun`, `sqlite3`, `plutil`, `assetutil`, `go`, `curl`, `ps`, `pgrep`, `unzip` | none - present on the host |
| Electron archive extractor | `npx` | `npx -y @electron/asar` - no install; brew formula `asar` is a SNES assembler, never a substitute |
| Pretty printer | `prettier` | brew formula `prettier` |
| Android decompiler | `jadx` | brew formula `jadx` |
| Android resource decoder | `apktool` | brew formula `apktool` |
| Analysis framework | `r2` | brew formula `radare2` |
| Headless decompiler | `analyzeHeadless` | brew formula `ghidra`, executable `<prefix>/libexec/support/analyzeHeadless` |
| Firmware signatures | `binwalk` | brew formula `binwalk` |
| Firmware extractor (deep) | `unblob` | `python3 -m pip install unblob` |
| WASM tools | `wasm-objdump`, `wasm2wat`, `wasm-decompile` | brew formula `wabt` |
| Packet analysis | `tshark` | brew formula `wireshark` - the CLI-only build provides tshark |
| GNU-style chain tools | `llvm-readelf`, `llvm-nm`, `llvm-objdump` | brew formula `llvm`, executables under `<prefix>/bin` |
| ELF hardening audit | `checksec` | brew formula `checksec` |
| PE resource tools | `wrestool` | brew formula `icoutils` |
| Android bridge | `adb` | brew formula `android-platform-tools` |
| .NET runtime | `dotnet` | brew cask `dotnet-sdk` |
| .NET decompiler | `ilspycmd` | `dotnet tool install -g ilspycmd`, probed at `$HOME/.dotnet/tools` |
| Rust audit | `cargo audit` | brew formula `cargo-audit` |
| Hermes decompiler | `hermes-dec` | `python3 -m pip install hermes-dec` |
| Runtime hooks | `frida` | `python3 -m pip install frida-tools` - approval-gated |
| Dart AOT lifter | `blutter` | source build only; same-row fallback is the snapshot hash plus strings |

## The eighteen route rows

| Row | Detection | Wrapper stages | Traps and follow-on commands |
| --- | --- | --- | --- |
| 1. Electron archive | asar header | `npx -y @electron/asar extract` into the extraction dir, then the staged fallback searches the tree | Entry point: `jq '{name,version,main}' <x>/package.json`. Native `.node` addons live in `app.asar.unpacked/node_modules`. IPC surface: search the tree for `ipcMain.(handle|on)`, `ipcRenderer.(invoke|send)`, `contextBridge.exposeIn(Main|Isolated)World`, `webPreferences`, `preload`, `nodeIntegration`, `contextIsolation`, `sandbox`, `.node`; app-specific channels hide behind wrappers, so also search quoted `[a-z]+:[a-z0-9:-]+` channel strings. Fuses: `npx -y @electron/fuses read --app <A.app>`. Bundlers hide code in `.webpack/`, `.vite/` - the staged fallback is hidden-file-aware. |
| 2. Web bundle | sourceMappingURL or >500-char lines | `prettier --parser babel` | If the map has `sourcesContent`, dump it: `jq -r '.sources[]'`. For webpack, grep the module ids, then slice. Slice needles with bounded context windows; never read a minified file whole. |
| 3. Hermes bytecode | `c6 1f bc 03` | strings inventory | Decompile with `hermes-dec` or `hbc-decompiler` (pip). A `.jsc` produced by bytenode cannot be decompiled at all: use strings and runtime hooks. |
| 4. Mach-O | mach-o magic | `lipo -info`, `otool -L`, `nm -gU`, `nm -u`, `strings -a -n 6`, `codesign -d --entitlements :-` | Thin first: `lipo -thin arm64 -o <T1> <T>`. Imports (`nm -u`) are the capability map. Load commands: `otool -l \| rg -A3 'LC_(RPATH\|BUILD_VERSION)'`. ObjC classes and methods: `otool -ov`. C++ symbols: `xcrun swift-demangle --compact`. |
| 5. Native code logic | deep stage of rows 4 and 6 | `otool -tV` or `llvm-objdump -d --no-show-raw-insn -C`, then `r2 -q -c 'aaa; afl'` | Dump a disassembly once to a file, then search that file. Find a function by its label; read the call and literal trail, not every instruction. `otool` labels string literals and stubs inline, which is often enough. For real pseudocode: `analyzeHeadless <dir> p -import <T> -deleteProject` plus a decompile script, or `r2 -qc 'aaa; pdc @ sym.X' <T>`. |
| 6. ELF / PE | elf or pe magic | `llvm-readelf -hlSW`, `llvm-readelf -dW` (NEEDED), `llvm-nm --dynamic --defined-only`, `llvm-nm --dynamic --undefined-only`, `strings`, `checksec --file` | PE resources: `wrestool` (brew `icoutils`); richer PE parsing with pefile (pip). GNU objdump spellings map to the llvm suite here. |
| 7. Go | mach-o/elf plus a successful `go version -m` | `go version -m <T>` | One call answers toolchain, module path, dependencies, and build flags. Without Go: `strings -a <T> \| rg -m1 -A200 'Go buildinf'`. Symbols survive stripping: `go tool nm <T> \| rg 'main\.'`. |
| 8. Rust | strings match `/rustc/[0-9a-f]{40}` or crate paths `name-1.2.3/src` | strings markers; deep: `cargo audit bin <T>` | Dependency manifests also ride in `.dep-v0` / `__DATA,.dep-v0` - extract and zlib-inflate. Compiler version from the `/rustc/` hash; crates from versioned source paths. |
| 9. .NET | file(1) says Mono or .Net | `dotnet --version` boundary, `ilspycmd -p -o <extraction-dir> <T>`, staged fallback over the decompiled tree | P/Invoke: search the tree for `DllImport`. NativeAOT and IL2CPP assemblies are native binaries - use rows 4-6. |
| 10. Android APK | zip listing with `classes.dex` or `AndroidManifest.xml` | `unzip -l`, `unzip -o -d <extraction-dir>`, deep: `jadx -d <extraction-dir> --show-bad-code <apk>` | Resources or manifest only: `apktool d --no-src -o <x> <apk>`. `lib/*/libhermes.so` means React Native - route the Hermes bundle through row 3. `lib/*/libflutter.so` means Flutter - route through row 11. |
| 11. Flutter snapshot | ELF `libapp.so` containing `f5 f5 dc dc` | snapshot-hash extraction plus strings | The 32 hex chars at magic+20 are the snapshot hash; map it to a Dart version. Full Dart lifter: `blutter` builds from source and has no package manager - the same-row fallback is the hash plus strings. |
| 12. WASM | `00 61 73 6d` | `wasm-objdump -x`; deep: `wasm2wat` | `wasm-decompile` (all from brew `wabt`) renders a C-like pseudocode form when wat is too low-level. |
| 13. SQLite | `SQLite format 3\0` | copy into the extraction dir, `sqlite3 'file:<copy>?mode=ro' '.schema'`, `.tables` | Copy the `-wal` and `-shm` siblings together with the database file when present: a read-only open needs the wal index, and a WAL database copied alone fails with `unable to open database file`. Sample rows: `SELECT * FROM <table> LIMIT 20`. The read-only URI keeps the original untouched. |
| 14. plist / nib / car | `bplist00` or file(1) Apple binary property list | `plutil -p` | Info.plist holds the bundle id, URL schemes, and privacy strings. Compiled asset catalogs: `assetutil --info Assets.car`. Nibs are keyed archives - plutil prints their structure. |
| 15. pcap / HAR | pcap magic bytes | `tshark -r <C> -q -z conv,tcp`; `tshark -r <C> -T fields -e dns.qry.name -e tls.handshake.extensions_server_name -e http.request.full_uri` | Deduplicate the field output. HAR files are JSON text: `jq -r '.log.entries[].request \| .method+" "+.url'` through the normal text flow. |
| 16. Firmware | gzip, cpio, uImage magic, or unclassified blob | `cp -c` into the extraction dir, `binwalk -e <copy>`, deep: `unblob -e -x <dir> <copy>` | Each extracted binary re-enters the flow through the explicit binary command. Work on a copy; the original stays untouched. |
| 17. Website | explicitly provided URL - never inferred | `curl -fsSL --max-time 30` on the page and up to five script sources | Runtime behavior needs a headless browser with a network log (Playwright `page.on('request')`) or a remote-debugging port; static fetching never proves runtime behavior. |
| 18. Running app | explicitly provided PID or exact process name - never inferred | `ps -p <pid> -o pid,ppid,comm,args`; `log show --last 15m --predicate 'processID == <pid>'`; Android: `adb shell pidof <pkg>` then `adb logcat -d -t 300 --pid <pid>` | Privileged or interactive follow-ons - `lldb -p`, `dtrace`, `fs_usage`, `log stream`, frida hooks - need explicit user approval and are not wrapper stages. |

## Extraction rules

Container rows extract into extraction directories under the operating-system temporary directory,
one directory per target, working on a copy (`cp -c` is instant on APFS). Reuse an existing
extraction for the same target instead of re-extracting. The extracted tree is searched through the
wrapper's staged fallback; never create ephemeral project indexes for extraction directories. A
binary located inside an extracted tree re-enters the flow through the explicit binary command on
that file.

## Speed patterns

- Strings and imports first: on a small binary, `nm -u` plus `strings` plus the export list usually
  answer "what does it do" with no disassembly.
- To find who uses a string, get its address from the disassembly "literal pool for" comments, then
  read the enclosing function label above that line.
- A C++ name in a branch-call target already tells you the protocol; read the call sequence, not
  every instruction.
- For JavaScript, work from the native boundary inward: the native call, its caller class, the IPC
  registration, then the renderer and preload.
- Comparing builds: diff the inventories (symbols, module list, `go version -m`) before diffing any
  code.
- Batch independent probes into one shell call with `;` separators and `echo '--- name'` markers;
  cap every output.
- Static reading is not observed execution. Label evidence as seen (file, offset, symbol, or string)
  or inferred; a fact not found is unknown, not absent.
