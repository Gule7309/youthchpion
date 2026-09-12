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

## Must verify before the live demo

- Deploy the current local build to AWS.
- Run one end-to-end Bedrock verification and confirm at least one exact passage is approved.
- Generate exactly three distinct policy options from the approved evidence.
- Check the evidence, source, cleaning, and formula dialogs in the deployed browser.
- Trigger a post-deploy live refresh and confirm `/ready` is healthy.

## Honest data limitations

- Taiwan industry AI adoption is narrative context rather than an occupation-level quantitative input.
- The public-opinion survey is a versioned 2024 source, not a live social-listening feed.
- TaiwanJobs provides the current API window (up to 1,000 records), not a complete multi-year vacancy history.
- PDF-only, paywalled, blocked, or text-poor pages are reported as evidence gaps; the Agent does not fabricate a passage.
- News articles are not accepted as authoritative evidence. An expert interview is eligible only when the original trusted academic, government, international-organization, or research-institution page is available.

## Intentionally out of scope for this demo

- Maps, document exports, universal policy topics, and user-uploaded datasets.
- A separate AgentCore runtime and five independently deployed tool Lambdas. For demo reliability, the same bounded workflow runs in the existing API Lambda while preserving PR #1's contracts and gates.
