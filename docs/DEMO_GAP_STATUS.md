# Demo readiness and honest gaps

Updated: 2026-09-12

## Implemented

- The teammate's fixed dashboard is the production UI. Runtime data no longer comes from `verifiedSnapshot.ts`.
- All four ingestion sources are fetched through the backend and retain retrieval status, timestamps, row counts, cleaning steps, and content hashes.
- The official employment source is narrowed to ages 20–24 before it is joined to occupation-level ILO exposure and TaiwanJobs demand signals.
- The transformation priority score is calculated as `100 × ∛(A × B × H)`, where A is youth employment concentration, B is structural AI exposure, D is the observed share of AI-related entry opportunities, and H is `1 − D`.
- Taiwan industry AI adoption (C) is shown as context only. It is not treated as an occupation-level numeric factor until a defensible mapping exists.
- Section 04's Agent endpoint performs live OpenAlex and Crossref searches for the selected occupation; this is not only a browser-side pre-search.
- The evidence Agent fetches original HTML pages, extracts real paragraphs, asks Bedrock to select only from those paragraphs, and runs PR #1's source and publication gates.
- Section 05 remains locked until verified evidence is available. The policy API also enforces this on the server and sends Bedrock the approved claim and exact excerpt rather than an unverified index summary.
- Scheduled refresh infrastructure is present in the AWS template.

## Verified on the deployed AWS demo

- Deployed the current Lambda bundle to stack `youthchpion-demo` in `us-west-2`; `/health` and `/ready` are healthy.
- Cloud refresh `run_b1e4c2c65fe4` succeeded: DGBAS 7→7, ILO 426→9, TaiwanJobs 1,000→998, and 104 5→3.
- The Agent searched eight candidates, including three LIVE index results, and approved one exact ILO passage (`HTML block 4`).
- The Agent returned `PARTIAL` because the OECD and one LIVE DOI landing page returned HTTP errors; neither was published as evidence.
- Nova Lite generated exactly three distinct policy options with `is_fixture=false`, using only the approved evidence ID.
- The deployed browser displayed all five sections and three policy cards with zero console errors or warnings.

## Recheck after the teammate's next frontend update

- Preserve the API calls and truth states when applying visual changes; do not restore `verifiedSnapshot.ts` as runtime data.
- Re-run the section 04 → section 05 browser flow and inspect source, cleaning, formula, and limitation dialogs.
- Re-run production build and frontend tests.

## Honest data limitations

- Taiwan industry AI adoption is narrative context rather than an occupation-level quantitative input.
- The public-opinion survey is a versioned 2024 source, not a live social-listening feed.
- TaiwanJobs provides the current API window (up to 1,000 records), not a complete multi-year vacancy history.
- PDF-only, paywalled, blocked, or text-poor pages are reported as evidence gaps; the Agent does not fabricate a passage.
- News articles are not accepted as authoritative evidence. An expert interview is eligible only when the original trusted academic, government, international-organization, or research-institution page is available.

## Intentionally out of scope for this demo

- Maps, document exports, universal policy topics, and user-uploaded datasets.
- A separate AgentCore runtime and five independently deployed tool Lambdas. For demo reliability, the same bounded workflow runs in the existing API Lambda while preserving PR #1's contracts and gates.
