# EvoMaestro project page

The publication website for **EvoMaestro: Toward Interpretable and Steerable LLM-Driven Program Evolution**, UIST 2026.
It is a separate Next.js application in the repository’s Bun workspace, alongside `evomaestro-interface`.

The page presents the paper, authors, interface and framework figures, research video, study context, source code, and a copyable BibTeX citation.
It uses a light layout with violet accents, Geist text, and Instrument Serif display typography, with responsive layouts and reduced-motion support.

## Install dependencies

Run from the repository root:

```sh
bun install --frozen-lockfile
```

The root `package.json` owns the Bun version and trusted dependency scripts, and the root `bun.lock` is the only JavaScript lockfile.
Shared packages are hoisted into the root `node_modules/`; Bun may keep incompatible versions in this directory’s `node_modules/`.
Keep application dependencies in `project-page/package.json`; run `bun add <package>` from this directory to update the shared lockfile.

## Develop

From the repository root:

```sh
bun run --cwd project-page dev --port 3001
```

Open [localhost:3001](http://localhost:3001).
Port 3001 leaves port 3000 available for the EvoMaestro interface.
Edit `app/page.tsx` for page content and `app/layout.tsx` for layout and metadata.

## Content and architecture

| File | Purpose |
| --- | --- |
| `lib/publication.ts` | Author order, affiliations, publication links, video URLs, and BibTeX |
| `app/page.tsx` | Server-rendered publication content and section structure |
| `app/layout.tsx` | Fonts, page metadata, and scholarly citation metadata |
| `app/base.css`, `app/responsive.css` | Visual design and responsive/reduced-motion rules |
| `components/paper-figure.tsx` | Responsive figures with a full-resolution dialog viewer |
| `components/video-player.tsx` | Click-to-load YouTube player |
| `components/citation.tsx` | Clipboard interaction with success and failure feedback |
| `app/icon.svg` | EvoMaestro favicon |

The video, figure viewer, and clipboard controls use client state.
“View full figure” opens a large overlay in the current window and loads the original image on demand.
The native modal dialog keeps keyboard focus inside the viewer and restores focus to the figure button when closed; use its close button, Escape, or the backdrop to dismiss it.
The underlying page stays in place and cannot scroll while the viewer is open.
The footer contains the EvoMaestro home link; the dedicated Reference section provides the copyable citation.
The video sits directly below the paper, source-code, and online-demo buttons in the hero section, before the interface figure.
It uses the supplied [YouTube presentation](https://youtu.be/zKSLpQSU0iY) and loads a privacy-enhanced `youtube-nocookie.com` iframe after activation.
The navigation’s Video link targets this single player; there is no separate “Watch video” button or lower video section.
The page needs no EvoMaestro backend, database, authentication, or API credentials.
The Online demo button opens [evomaestro-demo.reify.ing](https://evomaestro-demo.reify.ing) in a new tab; its destination is defined in `lib/publication.ts`.
Author names are plain text with affiliation markers; the page’s author metadata records their names.

### Paper figures and source material

The publication details and research summaries follow `main.tex`, the abstract, formative study, system demonstration, and evaluation sections in the sibling `evolvis-paper` authoring directory.
The descriptions distinguish the eight-person formative study, twelve-person controlled user study, and seven-day demonstration with a domain-expert co-author.
The Research section presents all six design requirements from the findings in `sections/4-formative-study.tex`, retaining their titles and grouping DR1–DR4 under information overload and DR5–DR6 under lack of human-in-the-loop interaction.
Keep their concise descriptions synchronized with the paper’s requirements; they describe formative-study findings, separately from the controlled study’s evaluation results.
The user-study result describes reported understanding and workload, not improvements in final program quality.
Both figures reproduce their full paper captions, with LaTeX notation rendered as readable web text.
Figure 1’s caption comes from `main.tex`; Figure 2’s caption comes from `sections/5-system-design.tex`, and its “§3” reference points to the paper’s Background section.
The Framework section first introduces the standard four-stage loop from `sections/3-background.tex`, then explains EvoMaestro’s additions using Figure 2’s numbered stages and surrounding components.
Keep Ban, Suggest/Merge, reasoning-based comparison, expert review prioritization, pacing, and Maestro Agent descriptions synchronized with “Steerable Program Evolution” in `sections/5-system-design.tex`.
The accompanying pacing description names the released Start, Step, Pause, and Continue controls; the paper's historical mode terminology is not presented as a current interface setting.
Stage ⑤ is EvoMaestro’s addition in both figure rows; review flags guide attention without changing scores, rejecting candidates, or determining parent selection.
The three-step introduction expands the interface description using the same A1–A8, B1–B4, and C1–C2 labels as the figure.
Keep these component descriptions synchronized with the “EvoMaestro Interface” subsection of `sections/5-system-design.tex` when the paper or figure changes.

| Web asset | Authoring source | Dimensions | Size |
| --- | --- | --- | --- |
| `public/figures/interface.webp` | `evolvis-paper/figures/Interface.pdf` | 3200 × 1381 | 379 KiB |
| `public/figures/framework.webp` | `evolvis-paper/figures/framework.pdf` | 2600 × 992 | 171 KiB |

These are faithful raster exports of the paper diagrams, rendered with Poppler and encoded as WebP at quality 92.
The authoring PDFs remain unchanged; a clone of this repository only needs the bundled web assets.
When updating a figure, export the complete page at the same width, replace its WebP asset, and synchronize its dimensions, alt text, and caption in `app/page.tsx`.
The Next.js and Vercel starter logos, unused template SVGs, starter favicon, and starter page content have been removed.

## Validate and build

The page uses Biome for application and configuration files, including its React and Next.js rules, and TypeScript 7 for type checking.
Generated output and static files in `public/` are excluded from Biome.
Run `bun run format` to apply formatting changes.

From this directory:

```sh
bun run lint
bunx --no-install tsc --noEmit
bun run build
bun run start --port 3001
```

The application uses `next/font` for Geist, Geist Mono, and Instrument Serif; a build may need network access to retrieve the font files.

The [Docker deployment](../docker/README.md) builds with `EVOMAESTRO_STANDALONE=1` to trace runtime dependencies from the Bun workspace root and package a standalone server.
It serves the project page on container port 13001 alongside the mock demo and recorded-run viewers.
Ordinary local builds retain their existing configuration.

Before publishing, check the layout at desktop and phone widths, open both figure overlays and check close-button, Escape, backdrop, and focus-restoration behavior, play the video, copy the citation, and verify the publication links.
The paper links currently open the [ResearchGate publication](https://www.researchgate.net/publication/414382819_EvoMaestro_Toward_Interpretable_and_Steerable_LLM-Driven_Program_Evolution) while the assigned DOI awaits activation.
The DOI remains in the BibTeX citation and scholarly metadata; update `paperUrl` in `lib/publication.ts` when the ACM destination is ready.
