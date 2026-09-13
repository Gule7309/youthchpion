# Demo readiness and honest gaps

Updated: 2026-09-13

## Implemented

- The teammate's fixed dashboard is the production UI. Runtime data no longer comes from `verifiedSnapshot.ts`.
- All six ingestion sources are fetched through the backend and retain retrieval status, timestamps, row counts, cleaning steps, and content hashes.
- The official employment source is narrowed to ages 20–24 before it is joined to occupation-level ILO exposure and TaiwanJobs demand signals.
- A is the 20–24 share inside an occupation and P is that occupation's share of all 20–24 employment. The only published composite is `100 × sqrt(A × B)`, clearly labelled experimental structural exposure. H is independently calculated from official 2024→2025 vacancy demand; D is displayed separately and passes sample/mapping gates. Complete Risk is null while C and calibration are missing.
- Taiwan industry AI adoption (C) is shown as context only. It is not treated as an occupation-level numeric factor until a defensible mapping exists.
- Section 04's Agent endpoint performs live OpenAlex and Crossref searches for the selected occupation; this is not only a browser-side pre-search.
- The evidence Agent fetches original HTML pages, extracts real paragraphs, asks Bedrock to select only from those paragraphs, and runs PR #1's source and publication gates.
- Each approved claim is classified as direct Taiwan context, transferable international evidence, or background only. A local TaiwanJobs employer survey is paired with DGBAS, MOL vacancy, TaiwanJobs, and MODA context; international effects are never relabelled as proven Taiwan effects.
- If no Taiwan intervention-effect study passes the gate, the policy contract requires every option to include a Taiwan pilot or validation step and publishes that limitation as a warning.
- Section 05 remains locked until verified evidence is available. The policy API also enforces this on the server and sends Bedrock the approved claim and exact excerpt rather than an unverified index summary.
- Scheduled refresh infrastructure is present in the AWS template.

## Previously verified on the deployed AWS demo

- Deployed the current Lambda bundle to stack `youthchpion-demo` in `us-west-2`; `/health` and `/ready` are healthy.
- The deployment listed here predates the current repair and must not be used to claim the repaired model is deployed. Its historical cloud refresh used the earlier four-source and 1,000-row TaiwanJobs implementation.
- The Agent searched eight candidates, including three LIVE index results, and approved one exact ILO passage (`HTML block 4`).
- The Agent returned `PARTIAL` because the OECD and one LIVE DOI landing page returned HTTP errors; neither was published as evidence.
- Nova Lite generated exactly three distinct policy options with `is_fixture=false`, using only the approved evidence ID.
- The deployed browser displayed all five sections and three policy cards with zero console errors or warnings.

## Recheck after the teammate's next frontend update

- Preserve the API calls and truth states when applying visual changes; do not restore `verifiedSnapshot.ts` as runtime data.
- Re-run the section 04 → section 05 browser flow and inspect source, cleaning, formula, and limitation dialogs.
- Re-run production build and frontend tests.

## Honest data limitations

- Taiwan industry AI adoption is narrative context rather than an occupation-level quantitative input; C and complete Risk remain null.
- Public opinion is now discovered and downloaded from the latest MODA survey catalog (2025: 35.0% in table 8-4, 34.9% in table 8-2 due to table rounding). It is a periodically published survey, not live social listening.
- TaiwanJobs is queried across 22 official two-digit job-code strata and deduplicated. It is still a current public-employment-service window, not a complete multi-year or whole-market vacancy census.
- ILO B is currently an unweighted detailed-occupation proxy within each major group. Taiwan detailed-employment weights are not yet available, so it must not be called a job-loss probability.
- The TaiwanJobs-to-dashboard crosswalk is a versioned expert rule over official TaiwanJobs categories, not an official ISCO correspondence; semantic review remains necessary.
- PDF-only, paywalled, blocked, or text-poor pages are reported as evidence gaps; the Agent does not fabricate a passage.
- News articles are not accepted as authoritative evidence. An expert interview is eligible only when the original trusted academic, government, international-organization, or research-institution page is available.

## Intentionally out of scope for this demo

- Maps, document exports, universal policy topics, and user-uploaded datasets.
- A separate AgentCore runtime and five independently deployed tool Lambdas. For demo reliability, the same bounded workflow runs in the existing API Lambda while preserving PR #1's contracts and gates.
