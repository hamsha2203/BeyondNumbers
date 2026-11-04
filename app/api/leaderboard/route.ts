import { NextResponse } from "next/server";
import { buildAdminDashboard } from "@/lib/adminDashboard";
import { getGoogleSheets, getSpreadsheetId } from "@/lib/googleSheets";

export const runtime = "nodejs";

export async function GET() {
  try {
    const sheets = await getGoogleSheets();
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: getSpreadsheetId(),
      ranges: ["Evaluations!A:N", "Score_Rules!A:Z", "Settings!A:Z"],
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const [evaluationValues, ruleValues, settingValues] = response.data.valueRanges ?? [];
    const dashboard = buildAdminDashboard(
      evaluationValues?.values ?? [],
      ruleValues?.values ?? [],
      settingValues?.values ?? [],
    );
    const eligibleEntries = (role: "GB" | "MB") =>
      dashboard.leaderboards[role]
        .flatMap((entry) => {
          if (entry.points === null) return [];
          return [{
            memberId: entry.memberId,
            name: entry.name,
            role: entry.role,
            department: entry.department,
            points: entry.points,
            rank: entry.rank ?? 0,
          }];
        });

    return NextResponse.json(
      {
        live: true,
        cycleId: dashboard.cycleId,
        gradingDeadline: dashboard.settings.gradingDeadline,
        refreshedAt: dashboard.refreshedAt,
        rows: { GB: eligibleEntries("GB"), MB: eligibleEntries("MB") },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Live leaderboard load failed:", error);
    return NextResponse.json(
      { error: "Could not load the live leaderboard." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
