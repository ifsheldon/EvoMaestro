# Documentation maintenance

These rules apply to `docs/` in addition to the [repository instructions](../AGENTS.md).

## Organization

- Keep only the indexes and this file at the top level.
- Use `guides/` for operational workflows, `architecture/` for implementation contracts, `benchmarks/` for task definitions, and `maintenance/` for active checklists and unresolved decisions.
- Use `archive/` for completed plans that retain useful design or validation history.
- Keep third-party papers, extracted text, PDFs, and their assets together under `reference-papers/`.
- Use descriptive lowercase kebab-case filenames for new first-party documents.
- Update both [English](README.md) and [Chinese](README.zh-CN.md) indexes when adding, moving, or retiring a document.

## Sources of truth

- Inspect current code and configuration before describing behavior; treat archived plans and past test results as historical evidence.
- Keep installation instructions in the root READMEs, dataset inventory in the dataset READMEs, and component development instructions beside their code.
- Link to those sources instead of copying long instructions or maintaining competing status lists.
- Update matching architecture and workflow docs in the same change set as behavior changes.
- Update existing English and Simplified Chinese counterparts together, including localized sections inside a shared document.
- When a benchmark contract changes, synchronize its evaluator documentation and any distributed task PDF.
- Preserve third-party wording, attribution, notices, and relative asset paths; keep project commentary outside the source material.

## Plans and evidence

- Keep operational requirements and validation guidance in the matching maintained guide; do not recreate the retired source-release plan or deferred TODO document.
- Before deleting a plan, move unique active decisions to the appropriate maintained document.
- Mark archived plans with their completion date, current replacement links, and any superseded instructions.
- Label test evidence by date and scope; evidence for an older package must not certify newer bundled data.
- Keep audit reports, checksums, database backups, and private study material outside source commits.
- Preserve the approved bundled dataset snapshots and reference papers; do not remove them as housekeeping.

## Commands and prose

- State the working directory before command blocks and distinguish repository-relative paths from document-relative links.
- Use `uv sync --locked --all-packages` and `uv run --locked --all-packages` for workspace Python workflows.
- Use the root Bun workspace and shared lockfile, with `bun install --frozen-lockfile` from the repository root.
- Keep each Markdown prose sentence on one physical line; do not add manual wrapping within sentences.
- Use relative Markdown links for repository files and descriptive link labels.
- Never add real credentials, private participant information, or machine-specific active paths to examples.

## Verification

- After a move or rename, search the entire repository for old paths and update active links, text references, scripts, and generated documentation as applicable.
- Check local link targets and heading anchors, including links from documents outside `docs/`.
- Verify that unchanged paper assets and benchmark definitions remain intact during organizational edits.
- Run `git diff --check` and review the complete diff before finishing.
- For documentation-only changes, validate the affected links and documented commands as needed; run code checks when code or behavior also changes.
