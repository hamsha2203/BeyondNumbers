# Beyond Numbers — AIESEC in Amaravati RnR portal

## Run locally
1. Install Node.js LTS.
2. Extract this ZIP and open the `beyond_numbers` folder in VS Code.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open http://localhost:3000.

## Portal flow
- Evaluators submit MB and GB evaluations to the existing `Evaluations` tab in Google Sheets.
- Evaluation IDs and metric responses are retained; the server calculates awarded points from active, approved `Score_Rules`.
- PM/Admin signs in to the server-verified PM dashboard to review live submissions and calculated GB/MB rankings.
- The PM can save the grading deadline to `Settings`; this does not control whether submitted scores are visible.
- The public dashboard recalculates scores from current valid submissions and approved rules in Google Sheets. It refreshes automatically every 20 seconds; no publication step or snapshot is required.
- Existing `Leaderboard` snapshots are preserved for history, but the live public dashboard does not read or write that tab.

## Demo passwords (not secure)
- MB: `killbill`
- VP: `ACE`
- PM/Admin: `ATLAS`

## Scoring notes
Approved, active multipliers are read from `Score_Rules`. Common `ALL` rules apply alongside department-specific rules. XP APD (500 points/count), XP RE (1,000 points/count), non-monetary CC/OC partnerships (50 per partnership), market research (25 per complete 50-lead block), and LEC contribution (60 for Yes) are common GB/MB metrics. Monetary CC/OC partnership amounts use the configured rupee tiers: below ₹2,000 earns 0, ₹2,000–₹5,999 earns 20, ₹6,000–₹10,000 earns 80, and each additional ₹5,000 band above ₹10,000 adds 80 points. PM Initiatives, O2Os, and Engagement are scored at 5 points per count. Unknown, invalid, duplicate, inactive, or unapproved metric responses are reported in the PM dashboard and are never silently awarded points. Historical evaluations without newly added metrics remain eligible at their existing calculated score; missing counts are not backfilled and earn no points until recorded in a resubmission.

## Important configuration
- Configure `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_PRIVATE_KEY` on the server. Never expose these as `NEXT_PUBLIC_` variables.
- Configure `PM_ADMIN_PASSWORD` and a high-entropy `AUTH_SECRET` for PM access.
- The current member IDs and evaluator assignments are defined in `lib/members.ts`; keep those stable IDs aligned with evaluation records.
- `PM Initiatives`, `O2Os`, and `Engagement` are each worth 5 points per count in `Score_Rules`; historical evaluations without those responses are not backfilled.
