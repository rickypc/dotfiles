# Gemma 4 E2B WebGPU runtime bundle

`gemma-4-e2b.js.gz` is the gzip-compressed browser runtime that `scripts/weak-reader.ts` runs on the
local GPU. It is a single minified module that exports `Gemma4Mobile`. The model weights are not
here: the reader downloads only those into the Hugging Face cache.

## Origin

- Source: the Hugging Face Space `webml-community/gemma-4-webgpu-kernels`, file `gemma-4-e2b.js`.
- Revision: `158f16ae0f672943ca304d59c47c8e3a264e399e` (Space last modified 2026-06-17).
- Original size: 551,802 bytes. Original sha256:
  `0234c0e866bfaa9623e938a7cfa7f5740cca22532cc1112dd4e8915b97f78d62`.
- Vendored size: 551,876 bytes (124,708 bytes compressed). Vendored sha256 after decompression:
  `12fe95ea0c606d8aee70337f472289c17feb098f966de6a4c0a9f4da9f63f40a`. The reader refuses to run when
  the decompressed bundle does not match this hash.

## License

This directory carries no license of its own. The file is third-party work, and its license is
whatever the original source states. We make no assumption about it.

- At the revision above, the source Space declares no license. That is the license status of this
  file too, whatever that status means in law. Nobody should read this repository as granting any
  right to the file that the source does not grant.
- Terms can change at the source. If the author adds or changes a license, or restricts use, this
  copy and every work derived from it follow the source's terms, not this repository's.
- Check the source before you use, copy, or redistribute this file, and remove it if the terms do
  not allow your use: <https://huggingface.co/spaces/webml-community/gemma-4-webgpu-kernels>.

The model weights are a separate work with their own license, stated on their model page. The reader
downloads them from there and does not store them in this repository.

## Edits

Two anchored text edits were applied to the original; nothing else changed.

1. `var Us=8192,` became `var Us=globalThis.__weakReaderKvCapacity??8192,`. The reader sets the
   global from the document size before importing, so a long document gets a larger KV cache, up to
   the model limit of 131072 tokens.
2. `o!==this.#u.length&&(this.#c(),o=0);` became
   `o!==this.#u.length&&(this.#o.cache.truncate(o),this.#u=this.#u.slice(0,o));`. A new prompt that
   shares a prefix with the previous one now keeps the cached prefix instead of resetting. With a
   shared document prefix, each question after the first takes about 0.3 s instead of re-reading the
   whole document.

To rebuild the archive, fetch the original, check its sha256 above, apply the two replacements,
check the vendored sha256, and gzip the result.

## Why compressed and not a TypeScript rewrite

The file is 550 KB of minified code with shader sources and generated names. A faithful rewrite
would be a new inference engine, so it is kept byte-for-byte apart from the two edits. Compression
keeps the repository's linters, declaration-order check, and hidden-character sanitizer from
touching third-party minified code. `tests/scripts/weak-reader-vendor.test.ts` pins the hash and the
two edits.
