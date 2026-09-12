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
