# Development checkpoints

## Plan checkpoint — 2026-09-12

Status: PASS

Goal:

- Deliver the MVP defined in `docs/DEVELOPMENT_SPEC.md`: a fixed youth AI employment dashboard with real source refresh, scheduled updates, cleaning provenance, live evidence retrieval, and three Bedrock-generated policy options.

Material assumptions:

- The repository is intentionally empty except for the specification.
- The frontend teammate will work against the documented HTTP contract; this implementation must include usable fixtures and error states.
- AWS credentials are supplied only at runtime and are never committed.
- A source can be versioned or unchanged and still be real; the UI must distinguish it from a live response and from a fixture.
- Local development may use filesystem snapshot storage while production uses private S3 through the same storage contract.

Out of scope:

- Authentication, notebooks, canvas interactions, uploads, maps, exports, forums, vector databases, multi-agent orchestration, and multi-policy support.

Boundaries:

- Backend owns external adapters, cleaning, indicators, evidence retrieval, policy validation, and API contracts.
- Frontend owns presentation and polling, but performs no policy metric calculations.
- Infrastructure owns the private snapshot store and scheduled ingestion entry point.

Acceptance criteria:

- A manual refresh creates a new run ID and performs real HTTP queries.
- Source status and freshness are visible and never misrepresent fixtures as live data.
- Cleaning output includes row counts, removals, join coverage, unmatched values, and before/after examples.
- Evidence results retain real URLs, retrieval times, and research metadata.
- Policy generation returns exactly three options and rejects unknown evidence IDs or unsupported numbers.
- Applicable unit, contract, type, build, live smoke, and manual happy-path checks pass.

Verification commands planned:

```text
backend Python: pytest, ruff check
frontend: npm run check
live sources: pytest -m live
application: FastAPI TestClient contract smoke
UI: production build plus browser happy path
```

Primary risk:

- External data schemas and services can change or time out. Each source is isolated behind an adapter, and a new analysis is published only after schema and quality gates pass.

## Implementation checkpoint

Status: PASS — 2026-09-12

- Implemented four isolated source adapters for DGBAS, ILO, TaiwanJobs, and 104 official research content.
- Implemented immutable raw and normalized snapshots, SHA-256 provenance, source freshness, and a publish-after-quality-gates pipeline.
- Implemented the youth employment × AI exposure matrix, separately labeled public-opinion context, cleaning audit, tiered authority evidence, and a three-option Bedrock policy contract.
- Implemented the fixed responsive dashboard and explicit loading, empty, stale, partial, and error states without production KPI fixtures.
- Implemented one Lambda entry point for HTTP requests and scheduled refreshes, private S3 storage, and a daily EventBridge rule.

## Test checkpoint

Status: PASS — 2026-09-12

- Backend: `ruff check .` passed.
- Backend: `9 passed, 4 deselected`; the two warnings are dependency deprecations in FastAPI/Starlette test utilities.
- Live source smoke: `4 passed, 9 deselected` against the real external endpoints.
- Frontend: TypeScript, production Vite build, and Vitest passed (`1 passed`); npm reported 0 vulnerabilities.
- Cloud run `run_c86f6a17d5d7` succeeded with DGBAS 7→7, ILO 426→9, TaiwanJobs 1000→999, and 104 5→3 rows.
- Browser: deployed UI loaded the same run, selected occupation code 4, rendered three non-fixture Nova Lite policy options, and reported 0 console errors/warnings.

## Review checkpoint

Status: PASS — 2026-09-12

Issues found and corrected before release:

- DGBAS serves a certificate chain that failed in the Linux Lambda trust store. TLS compatibility mode is scoped only to this public workbook endpoint, followed by strict workbook schema validation and an explicit source message.
- A scheduled async refresh previously closed the Lambda event loop and caused the next warm Mangum request to return 500. The handler now installs and retains a Lambda-local event loop.
- Static frontend lookup initially assumed only the repository layout. It now resolves both the packaged Lambda path and local repository path.
- Older cached evidence could omit `authority_tier`; the UI now renders a defensive B-tier default while current contracts persist the tier.
- Verified the deployed DOM contains one evidence section, one policy section, and exactly three policy cards. A full-page capture can visually repeat sticky regions during browser stitching, but no duplicate DOM render exists.

## Release checkpoint

Status: PASS — 2026-09-12

- CloudFormation stack `youthchpion-demo`: `UPDATE_COMPLETE` in `us-west-2`.
- Public dashboard endpoint: <https://trzx7426g1.execute-api.us-west-2.amazonaws.com>.
- `/ready` is true after a successful cloud refresh; Bedrock model is `amazon.nova-lite-v1:0` and the verified response has `is_fixture=false` with exactly three options.
- Snapshot bucket is private, has all four S3 public-access blocks enabled, and has versioning enabled.
- EventBridge rule `youthchpion-demo-YouthChampionFunctionDailyRefresh-MLHwcfv2dczF` is enabled with `rate(1 day)`.
- The successful run persisted four raw source snapshots, four normalized snapshots, the published dashboard, run record, latest pointer, and generated policy options.

## Production hotfix — source transparency and policy contract — 2026-09-12

### Plan checkpoint

Status: PASS

- Goal: prevent intermittent Bedrock contract drift from surfacing as an immediate 503, and make every source card explain its human-readable origin, machine endpoint, transformations, and freshness status.
- Scope: policy generation retry/validation, source snapshot metadata, source/cleaning UI, focused backend/frontend tests, AWS redeploy.
- Non-goals: changing the indicator formula, age range, evidence ranking, visual redesign, or adopting the later draft requirements wholesale.
- Acceptance: an invalid first model response is corrected on a rate-limited retry; persistent invalid output still fails closed; supported source percentages remain allowed while invented percentages are rejected; clicking a source expands readable provenance instead of navigating directly to JSON/XML; LIVE and UNCHANGED are defined in the UI.
- Verification: backend lint/tests, frontend type/build/tests, real cloud refresh, repeated Bedrock generation, deployed browser check, secret scan, clean Git state.

### Implementation checkpoint

Status: PASS

- Source snapshots now carry a dataset name, human-readable official reference URL, raw machine endpoint, and ordered processing steps.
- Source cards expand in place and no longer navigate to raw JSON/XML on the primary click; raw data remains available through an explicitly labeled secondary link.
- The cleaning panel now explains publish-after-validation, duplicates, missing titles, transform version, and per-source transformations.
- Policy generation now makes up to three contract attempts, reapplies the Bedrock interval before every request, feeds the previous validation error into the next request, extracts the first valid JSON object, and still fails closed after the final invalid response.
- Percentage validation now allows only values derived from the selected occupation signal and rejects unsupported percentages; KPI targets must remain `pilot-defined`.

### Test checkpoint

Status: PASS

- Backend `ruff check .`: passed.
- Backend tests: `11 passed, 4 deselected`; two dependency deprecation warnings remain.
- Frontend TypeScript/Vite build: passed; frontend tests: `2 passed`.
- Cloud refresh `run_21b9b2c78d4b`: `SUCCEEDED`; all four sources returned HTTP 200 and published provenance metadata.
- Three consecutive production Bedrock requests: all succeeded with exactly three options and `is_fixture=false`.
- Deployed browser policy flow: succeeded; console had 0 errors and 0 warnings.

### Review checkpoint

Status: PASS

- Verified `UNCHANGED` is assigned only after a successful fresh download whose SHA-256 matches the previous published source; it is not a cached response.
- Verified a source card expands to show official dataset title, all processing steps, HTTP 200, checksum, official reference, and separately labeled raw endpoint.
- Verified the policy endpoint continues rejecting unknown evidence IDs, invented percentages, invalid KPI targets, duplicate option titles, and non-three-option responses.
- Kept the later teammate requirement drafts intact and limited this hotfix to the reported production behavior.

### Release checkpoint

Status: PASS

- Existing CloudFormation stack `youthchpion-demo` updated successfully in `us-west-2`.
- Deployed dashboard published run `run_21b9b2c78d4b` and the source-transparency UI.
- Production browser generated three policy cards after the hotfix without the prior 503.
- Final diff check and staged secret scan passed before commit; generated build artifacts remain ignored.

## Data-depth correction — 20–24 focus and processing ledger — 2026-09-12

### Plan checkpoint

Status: PASS

- Goal: make the demo technically defensible to a data reviewer by focusing the indicator on 20–24-year-olds and replacing misleading cross-source aggregate row counts with per-source, unit-aware processing records.
- Scope: DGBAS age-band output, indicator denominator, source provenance metadata, dashboard source and cleaning presentation, tests, AWS redeploy.
- Non-goals: claiming causal AI displacement, inventing an industry-adoption value, replacing the source adapters, or adopting unverified draft formulas.
- Acceptance: the primary metric and occupation shares use 20–24 only; 25–29 remains explicit context; every source states the fields used, policy rationale, limitation, and correctly named input/output units; no primary UI link opens a raw download/API endpoint.
- Verification: parser and pipeline assertions, frontend content tests, lint/build/test, real refresh, deployed browser source-details check, policy regression check.

### Implementation checkpoint

Status: PASS

- DGBAS column O (20–24) is now the only primary employment cohort and denominator; column Q (25–29) remains a separately named comparison field.
- Source snapshots now declare fields used, why the source is needed, limitations, and unit-aware input/output labels. The dashboard links only to readable official source pages, while machine payloads stay in the private snapshot store.
- The cleaning UI no longer displays or the API emits a cross-source raw/normalized sum. It presents one processing record per source plus comparable job-quality counts and crosswalk coverage.
- The 104 snapshot hash now covers both the search response and all three parsed article payloads; `5 → 3` is explicitly described as content selection, not dirty-row removal.
- The semantic change is recorded as transform version `2026-09-12.2`.

### Test checkpoint

Status: PASS

- Backend `ruff check .`: passed; backend tests: `11 passed, 4 deselected` with two existing dependency deprecation warnings.
- Frontend TypeScript/Vite build and Vitest: passed; `2 passed`.
- Production refresh `run_1679245a9dd4`: `SUCCEEDED`; DGBAS, ILO, TaiwanJobs, and 104 each returned HTTP 200 from a fresh request and were correctly classified `UNCHANGED` by content hash.
- Published primary cohort: 644,000 employed people aged 20–24; comparison cohort: 1,266,000 aged 25–29.
- Production job audit: 1,000 API jobs → 998 valid jobs; 0 duplicates, 1 expired job, 1 missing title, 92.6% entry-level occupation-crosswalk coverage.

### Review checkpoint

Status: PASS

- Verified the employment share and exposure load use only the 20–24 cohort; 25–29 is never hidden inside the primary denominator.
- Verified the four source links resolve to readable DGBAS, ILO, TaiwanJobs, and 104 pages and no dashboard link targets XLSX, XML, or WordPress JSON endpoints.
- Verified each displayed source count is generated by that refresh run and keeps its observation unit visible. No claim is made that ILO aggregation or 104 article selection equals row cleaning.
- The defensible current index is employment concentration × ILO exposure, with live AI entry-job opportunity shown as a separate prioritization signal. Industry AI-adoption data is not yet available at the same occupation grain, so the product does not claim a completed `A × B × C × D` causal or skills-gap score.

### Release checkpoint

Status: PASS

- CloudFormation stack `youthchpion-demo` is `UPDATE_COMPLETE` in `us-west-2`; public readiness is true.
- Deployed dashboard: <https://trzx7426g1.execute-api.us-west-2.amazonaws.com>.
- Final Bedrock regression on `run_1679245a9dd4`: `amazon.nova-lite-v1:0`, `is_fixture=false`, exactly three distinct policy options.
- Deployed browser shows the 20–24 metric, source-specific processing ledger and transform `2026-09-12.2`; console has 0 errors and 0 warnings.
