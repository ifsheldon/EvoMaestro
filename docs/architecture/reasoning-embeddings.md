# Reasoning embeddings

Reasoning embeddings represent a program's recorded strategy description and optional LLM thought for similarity analysis, clustering, Merge recommendations, and review prioritization.
They do not establish that the recorded reasoning is correct.
Code embeddings remain a separate representation, selected through the existing Code/Reasoning control.

## Eligibility policy

`ShinkaEvolve/shinka/reasoning.py` is the shared, provider-independent policy for generation, database boundaries, and maintenance commands.
It evaluates `metadata.patch_description` and `metadata.llm_result.thought` independently.
Missing values, non-string values, whitespace-only text, and punctuation-only text are absent.

The following complete phrases are placeholders after case folding, whitespace normalization, and removal of enclosing quotes or terminal sentence punctuation:

```text
none
null
n/a
na
undefined
unknown
no description
no reasoning
initial program
initial program setup
initial program setup (fallback)
```

Matching uses complete phrases, so “None of the previous approaches handles congestion” remains eligible.
Short substantive descriptions and multilingual text remain eligible; there is no minimum length.
Eligible fields retain their original trimmed text, are joined by a blank line, and are limited to 10,000 characters after filtering.
When neither field is eligible, extraction returns `None` and generation makes no embedding request.
A placeholder description combined with a valid thought uses the thought alone for new embeddings.
Cleanup retains existing vectors for these mixed records without regenerating their original inputs.

A usable vector is a nonempty numeric array containing only finite values with a finite, nonzero norm.
Booleans, zero vectors, nonnumeric values, and malformed arrays are rejected.
Cosine comparisons require equal dimensions and return no value when comparison is unavailable.

## Generation and persistence

Normal proposals, Suggest, Merge, and initialization use the same extraction and provider-result validation.
Ordinary file-based initialization descriptions are placeholders and receive no reasoning embedding.
Explicit initialization metadata containing an actual strategy description or eligible thought can receive one.
Unusable provider responses retain any reported API cost while storing no vector.

The existing database and REST fields represent absence as follows:

| Field | Absent value |
|---|---|
| `reasoning_embedding` | `[]` |
| `reasoning_embedding_pca_2d` | `[]` |
| `reasoning_embedding_cluster_id` | `null` |

`Program` construction, serialization, database writes, and thread-safe readers normalize reasoning fields.
Direct SQL island copies, island spawning, and migrations also clear derivatives when their underlying reasoning is invalid.
Metadata updates normalize reasoning fields in the same transaction, so a metadata change cannot leave a placeholder paired with an old vector.
The read-only browsing API filters invalid legacy data in memory without changing its source database or journal mode.
Interactive status, command history, bans, review settings, and WebSocket polling also use read-only connections; absent control tables remain absent when browsing completed runs.

## Similarity and historical review metrics

Synchronous and asynchronous novelty comparisons skip unusable stored reasoning vectors and incompatible dimensions.
Review prioritization stores `null` reasoning distance if the current vector is missing or no compatible earlier vector exists.
“Earlier” means a lower generation, or the same generation with an earlier timestamp.
Programs sharing both values are peers; their SQL row order does not make one a predecessor of another.
The distance is the minimum valid cosine distance to earlier programs, in the range 0–2.
Historical review-priority assignments, their reasons, and score/code cache components are independent of a reasoning-cache refresh.

## Local PCA and clustering

`shinka/reasoning_features.py` supplies the computation used by runtime refreshes and both maintenance commands.
It orders vectors by program ID, applies StandardScaler followed by two-dimensional PCA with the full SVD solver, and clusters the full vectors using a four-component Gaussian mixture with full covariance and seed `42`.
The GMM input is the original full-dimensional vectors, not the projected coordinates.
Excluded programs lose their old reasoning coordinates and cluster assignments.
With fewer than four distinct usable vectors, derived fields remain absent; one-dimensional vectors also cannot receive two-dimensional PCA.
Mixed vector dimensions and failed or nonfinite computations produce an error.
Reasoning refreshes run independently of code-embedding availability and embedding-provider credentials.

## Offline audit and release-copy repair

Run from `ShinkaEvolve/` with the workspace environment available:

```sh
uv run --locked --all-packages python -m shinka.tools.compat.repair_reasoning_embeddings SOURCE --dry-run
uv run --locked --all-packages python -m shinka.tools.compat.repair_reasoning_embeddings SOURCE --output DESTINATION
```

Both modes audit the source through a read-only SQLite connection and print a JSON report to stdout.
The dry-run performs no schema migration, backup, journal-mode change, or embedding-client construction.
The input must already use the canonical review-prioritization schema with one cache row per program.
Malformed or unclassifiable metadata and incompatible vector dimensions abort the operation.

Repair requires a new destination distinct from the source and refuses to overwrite an existing file.
It uses SQLite's backup API to include committed WAL data in a consistent snapshot, repairs a temporary destination, and publishes only after validation succeeds.
It clears invalid vectors, rebuilds affected reasoning projections and clusters, and recalculates every historical reasoning comparison while updating only cache values that changed.
Eligible text missing a vector remains unfilled.
No embedding API is called.

Validation checks SQLite integrity and foreign keys, source database/WAL hashes, unchanged retained vector payloads, and a schema-and-data digest covering every field outside the three reasoning fields and the reasoning cache component.
A final audit must propose no further repair before the copy is published.
Reports include affected IDs, reason codes, dimensions, counts, SHA-256 hashes, algorithm settings, NumPy/scikit-learn versions, and validation results.
They contain no raw thoughts or credentials.

### Missing review-metric rows

Schema migration can leave `review_priority_metrics` empty in historical runs.
Before the reasoning audit, fill those rows from the existing scores and embeddings using the metrics-only backfill:

```sh
uv run --locked --all-packages python -m shinka.tools.compat.backfill_review_priorities DATABASE --metrics-only --dry-run
uv run --locked --all-packages python -m shinka.tools.compat.backfill_review_priorities DATABASE --metrics-only
```

This computes score change, code dissimilarity, and reasoning dissimilarity for every program without requesting embeddings or changing program fields.
All historical priority levels and their display data remain unchanged, including `none` and custom assignments.
Both code and reasoning history exclude programs with the same generation and timestamp.
The CLI creates a consistent SQLite backup before writing, and updates the cache in one transaction; `--metrics-only` and `--force` are mutually exclusive.
For release preparation, work on SQLite snapshots created with the backup API in an external artifact directory so backups and audit reports stay outside source commits.
After backfilling, run the reasoning audit and compare every unrelated table and program field before publishing repaired snapshots.
Mock dataset preparation uses this same metrics-only path for initial nodes.

### API backfill

`uv run --locked --all-packages python -m shinka.tools.compat.backfill_reasoning_embeddings DATABASE --dry-run` previews a separate, API-based workflow.
Its dry-run is read-only and constructs no embedding client.
An actual backfill creates a SQLite backup that includes WAL data, validates existing vectors before skipping them, removes invalid placeholder vectors, and requests embeddings only for eligible text.
Provider-returned vectors are validated, reported costs survive invalid responses, and the shared local routines refresh reasoning derivatives and cached distances.
This workflow can incur API costs and is not used for the cleanup-only release copies.

## Frontend behavior

`evomaestro-interface/src/utils/embeddingAccessors.ts` centralizes structural vector validation.
Availability and default selection count only usable vectors.
Reasoning PCA coordinates and clusters require a usable underlying vector; stale coordinates cannot make a missing embedding visible.
Similarity analysis excludes missing vectors, keeps labels aligned with the displayed population, and shows a localized incompatible-dimensions message instead of calculating misleading values.
Tree chords skip invalid comparisons, while island chords retain root anchors when their distances come from valid island-best vectors.

Merge keeps candidates without comparable vectors eligible.
Their measured `cosineDistance` is `null`, and their diversity input remains the existing neutral `0.5` before population normalization.
When no comparable embeddings exist, ranking uses quality alone.
English and Simplified Chinese messages share the same behavior.

## Release cleanup dataset contract

The source databases are preserved; repaired copies and audit reports are staged outside the repository under `../release-artifacts/reasoning-cleanup/` for later package assembly.
The subsequent release selection is MOP, GraphMOP, `mock-demo`, and `mock-guide`, as documented in the [dataset guide](../../datasets/README.md).
The mock snapshots and complete MOP/GraphMOP project directories are bundled under `datasets/`.
MOP includes two historical runs; its database schema migration preserves the recorded vectors.
On 2026-09-18, both bundled MOP runs received a metrics-only backfill: the 58-program and 56-program runs now have 58 and 56 cache rows respectively, with 50 retained reasoning vectors and 49 non-null reasoning distances each.
All program fields and unrelated tables remain unchanged, including the runs' historical priority counts of 20 high/6 moderate/32 none and 17 high/3 moderate/36 none.
The canonical reasoning audits are clean, a second backfill produces identical cache values, and score/code/reasoning settings each recalculate every node on disposable test copies.
SQLite integrity, foreign keys, and immutable reads of the checkpointed main files pass; the GraphMOP and mock database hashes remain unchanged.
Consistent original backups and the conservation/settings audit are stored outside the repository under `../release-artifacts/mop-review-cache-2026-09-18-lx6b0fav/`.
The prepared cleanup snapshots described below remain in the external release-artifact directory; the original run artifacts moved into `datasets/` are not replacements for that audit evidence.
OXC remains an internal reasoning-cleanup validation artifact.

| Dataset | Programs | Original vectors | Removed | Retained | Eligible text left unfilled | Non-null reasoning metrics | Historical priorities |
|---|---:|---:|---:|---:|---:|---:|---:|
| OXC | 204 | 164 | 6 | 158 | 40 | 157 | 7 score-based |
| GraphMOP | 56 | 50 | 0 | 50 | 0 | 49 | 0 |

OXC's six removals are five initialization placeholders and one `none` description without a valid thought.
Its two mixed description/thought records and GraphMOP's three mixed records retain their existing vector payloads.
OXC rebuilds reasoning features for 158 retained vectors; GraphMOP already has consistent features and needs no logical repair.
Only six OXC reasoning-cache values are expected to change, although all comparisons are recalculated.
The largest retained OXC pairwise cosine distance is approximately `0.779815`, leaving no pairs above `0.82`.

## Validation

Focused Python tests cover text extraction, provider stubs and billed invalid responses, normal/Suggest/Merge/initialization paths, thread-safe reads, island copying and migration, metadata updates, novelty and historical comparisons, and provider-free projections.
Offline repair tests cover read-only audits, WAL snapshots, destination protection, unrelated-data equality, missing-vector preservation, failure without partial output, and idempotence.
Network connections are blocked in the new Python regression tests.
Bun tests cover malformed vectors, stale coordinates, dimensions, tree chords, and Merge fallback/ranking.
Real-data verification and browser evidence are recorded in the external cleanup report.
Remaining publication checks are tracked in the [release checklist](../maintenance/release-checklist.md).
