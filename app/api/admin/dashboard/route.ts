import { NextRequest, NextResponse } from "next/server";
import { buildAdminDashboard } from "@/lib/adminDashboard";
import { getGoogleSheets, getSpreadsheetId } from "@/lib/googleSheets";
import { isPmAuthConfigured, isPmRequest } from "@/lib/pmAuth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isPmAuthConfigured()) {
    return NextResponse.json(
      { error: "PM authentication is not configured. Set PM_ADMIN_PASSWORD and a 32+ character AUTH_SECRET." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!isPmRequest(request)) {
    return NextResponse.json(
      { error: "PM sign-in is required to view dashboard data." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const sheets = await getGoogleSheets();
    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: ["Evaluations!A:N", "Score_Rules!A:Z", "Settings!A:Z"],
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const [evaluationValues, ruleValues, settingValues] = response.data.valueRanges ?? [];
    const data = buildAdminDashboard(
      evaluationValues?.values ?? [],
      ruleValues?.values ?? [],
      settingValues?.values ?? [],
    );
    for (const diagnostic of data.diagnostics) {
      console.warn("PM scoring validation issue:", diagnostic);
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    console.error("PM dashboard data load failed:", error);
    return NextResponse.json(
      { error: "Could not load the PM dashboard from Google Sheets. Check the server configuration and sheet access." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
