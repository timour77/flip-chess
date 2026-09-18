# Cburnett chess piece set — attribution and license

## What this is

The 12 piece sprites embedded in `src/ui/pieces.ts` (`wK`, `wQ`, `wR`, `wB`,
`wN`, `wP`, `bK`, `bQ`, `bR`, `bB`, `bN`, `bP`) are the **Cburnett** chess
piece set, the same artwork lichess.org uses for its default board theme.

- **Author:** Colin M.L. Burnett
- **Originally published:** Wikimedia Commons, as a set of SVG chess piece
  symbols (search "Cburnett chess pieces" on Wikimedia Commons for the
  originals and their history).
- **This copy taken from:** [lichess-org/lila](https://github.com/lichess-org/lila),
  `public/piece/cburnett/*.svg`. That copy is redistributed as part of the
  lila repository, whose own `COPYING.md` lists the bundled Cburnett pieces
  under GPLv2+ (matching lila's own license). That is lila's choice as a
  downstream redistributor, not a restriction the original author imposed —
  see below.

## Multi-license situation

Colin M.L. Burnett released this piece set under **multiple licenses at the
author's option** — a downstream user may pick whichever one applies to
their use:

- GNU Free Documentation License (GFDL)
- BSD License (3-clause / "New BSD")
- Creative Commons Attribution-ShareAlike 3.0 (CC-BY-SA-3.0)
- GNU General Public License (GPL)

Any one of these, on its own, is a valid basis for reuse; a downstream
project does not need to satisfy all four at once.

## License election for this project

**flip-chess is MIT-licensed.** Of the options above, we elect to use the
artwork under the **BSD-3-Clause** license, because:

- It is a **permissive** license, compatible with distributing the rest of
  this project under MIT.
- The **GPL** option is copyleft and would obligate this whole project (or
  at least the combined work) to be GPL-licensed — that is not compatible
  with keeping flip-chess MIT, so it is deliberately not the option used
  here.
- The **GFDL** is meant for documentation, not software/images embedded in
  an application, and carries invariant-section/attribution mechanics that
  don't fit a source file.
- **CC-BY-SA-3.0** is share-alike (copyleft-like) and would impose
  attribution/share-alike terms on downstream users of this repository
  beyond what BSD-3-Clause requires.

BSD-3-Clause requires only that the copyright notice, this list of
conditions and the disclaimer be reproduced — which this file does.

## License text (BSD 3-Clause "New" License)

```
Copyright (c) Colin M.L. Burnett

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

## Where the artwork lives in this repo

The SVG markup is embedded as static string literals in
`src/ui/pieces.ts` (see the header comment there), one constant per
piece+color, rendered by setting `innerHTML` on a namespaced `<svg>`
element built with `document.createElementNS`.
