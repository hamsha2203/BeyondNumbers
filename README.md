# Beyond Numbers — AIESEC in Amaravati RnR portal

## Run locally
1. Install Node.js LTS.
2. Extract this ZIP and open the `beyond_numbers` folder in VS Code.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open http://localhost:3000.

## Preview portal flow
- Homepage primary action opens the evaluator login portal; the public dashboard is available separately.
- Select MB, VP, or PM/Admin and enter the demo password.
- MB selects their name and sees assigned GBs from their department.
- VP selects their name and sees assigned MBs from their department.
- Evaluation forms calculate points automatically from the configured metrics and show per-metric subtotals and a total.
- Submit & close saves the evaluation in browser local storage and returns to the home page.
- PM/Admin can configure the deadline and approve publication only after the deadline has passed.
- Public leaderboard remains locked until the deadline has passed and PM approval is recorded. After that it displays sorted GB/MB totals from submissions in this browser.

## Demo passwords (not secure)
- MB: `killbill`
- VP: `ACE`
- PM/Admin: `ATLAS`

## Scoring notes
- oGV: APL 2, NOC 5, APD 20, RE 50.
- oGTa: APL 2, NOC 50, APD 100, RE 250.
- MKT: Opens 1, Content created 5, Campaign runs 20, MOU signed 250.
- BD: In-kind ₹10K–₹20K 50, above ₹20K 100, non-monetary partnerships 30, Market Research 25 per item (interpretation of the supplied screenshot), EwA–ELD 20.
- PM/other role metrics include attendance, secondary roles and XP as shown in the supplied marking scheme.

## Important limitations
This is a functional local preview, not a production deployment. Browser local storage is per-browser and does not synchronize submissions between evaluators or computers. Demo passwords and role selection are client-side and must not be treated as authentication. Before real use, add server-side authentication and role/assignment checks, a shared database, server-enforced deadline, audit logging, duplicate-submission controls, and a validated score aggregation policy. The current leaderboard sums submitted evaluation totals; confirm whether VP ratings and MB achievement metrics should be combined or ranked separately before publishing real results.
