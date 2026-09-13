# Data model repair plan

Status: checkpoints 1 and 2 are implemented locally. Checkpoint 3 code and automated checks are
in progress; AWS deployment still requires a fresh short-lived credential and a final browser
acceptance run.

## Goal

Turn the current experimental occupation ranking into an auditable early-warning model that
does not publish a complete score when a required input is stale, missing, or statistically
unusable.

## Assumptions

- The primary measured cohort remains 20–24 until a reviewed 18–35 estimation method exists.
- Occupation is the MVP unit of analysis. Industry values must not be copied to occupations
  without an explicit, versioned crosswalk.
- The current teammate dashboard layout and evidence-agent work are preserved.
- Missing and insufficient-coverage values are represented as null, never as zero.

## Out of scope for this repair

- Claiming that AI causes unemployment.
- Publishing a calibrated probability of job loss.
- Full AgentCore plus five-tool-Lambda deployment.
- Nationwide real-time public-opinion monitoring.
- Estimating an unpublished youth × industry × occupation cube without a separately reviewed
  method.

## Checkpoint 1 — source and contract safety

- Discover the latest DGBAS annual-report Table 47 from its official release page.
- Parse and publish the workbook data period; fail closed on an unexpected period or schema.
- Fix the 104 source-id mismatch.
- Rename the current output to an experimental transformation signal and withhold a complete
  score when independent H or mapped C is unavailable.
- Add exact snapshot lineage to each occupation signal.

Acceptance evidence:

- A fixture proves the latest-table link is selected rather than a hard-coded workbook URL.
- A fixture proves a stale or mismatched workbook period cannot be published.
- Pipeline tests prove missing C/H do not become zero and do not produce a complete Risk score.

## Checkpoint 2 — indicator semantics

- Preserve both `youth_share_within_occupation` and `occupation_share_of_youth`.
- Aggregate ILO exposure without copying the single highest detailed occupation label to the
  whole major group; expose count and distribution statistics.
- Build H from an independent official historical vacancy series. Keep raw year-over-year and
  three-year values; label the clipped score experimental.
- Rebuild TaiwanJobs ingestion around official occupation codes, stratified requests, tri-state
  entry-level classification, split AI skill taxonomy, deduplication, and numerator-specific
  coverage.

Acceptance evidence:

- Unit tests cover aggregation, true zero, unknown, low sample, duplicate records, and unmapped
  AI-positive records.
- D is only reported when the configured denominator and coverage gates pass.
- H does not read or derive from D.

## Checkpoint 3 — release quality

- Add the current public-opinion survey as a fetched, versioned adapter.
- Add data-quality readiness checks for period, coverage, required dimensions, and snapshot age.
- Align the OpenSpec, API labels, and frontend explanations with the implemented model version.
- Run the complete backend tests and lint, frontend tests/type checks/build, then a real-source
  refresh and manual browser flow before deployment.

Release commands:

```powershell
cd backend
uv run pytest -q
uv run ruff check .
cd ../frontend
npm run check
```

Production deployment is allowed only after the local checkpoints pass and fresh temporary AWS
credentials are provided through the process environment.
