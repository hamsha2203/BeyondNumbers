import { NextRequest, NextResponse } from "next/server";
import { buildAdminDashboard } from "@/lib/adminDashboard";
import { getGoogleSheets, getSpreadsheetId } from "@/lib/googleSheets";
import { isPmAuthConfigured, isPmRequest } from "@/lib/pmAuth";

export const runtime = "nodejs";

function normalize(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function columnName(index: number) {
  let value = index + 1;
  let column = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    value = Math.floor((value - 1) / 26);
  }
  return column;
}

function settingValues(headers: string[], key: string, value: string, timestamp: string) {
  const row = Array.from({ length: headers.length }, () => "");
  const set = (name: string, content: string) => {
    const index = headers.indexOf(normalize(name));
    if (index >= 0) row[index] = content;
  };
  set("setting_key", key);
  set("setting_value", value);
  set("updated_by", "PM Admin");
  set("updated_at", timestamp);
  if (key === "publication_published_at") set("notes", "Latest published leaderboard snapshot");
  return row;
}

async function updatePublicationSettings(
  sheets: Awaited<ReturnType<typeof getGoogleSheets>>,
  spreadsheetId: string,
  settingRows: unknown[][],
  publishedAt: string,
) {
  const rawHeaders = (settingRows[0] ?? []).map((value) => String(value ?? ""));
  const headers = rawHeaders.map(normalize);
  const keyIndex = headers.indexOf("settingkey");
  const valueIndex = headers.indexOf("settingvalue");
  if (keyIndex < 0 || valueIndex < 0) {
    throw new Error("Settings must contain setting_key and setting_value columns.");
  }

  const desired = [
    ["publication_approved", "TRUE"],
    ["public_dashboard_enabled", "TRUE"],
    ["publication_published_at", publishedAt],
  ] as const;
  const updates: Array<{ range: string; values: string[][] }> = [];
  const newRows: string[][] = [];

  for (const [key, value] of desired) {
    const rowIndex = settingRows.findIndex(
      (row, index) => index > 0 && normalize(row[keyIndex]) === normalize(key),
    );
    if (rowIndex < 0) {
      newRows.push(settingValues(rawHeaders, key, value, publishedAt));
      continue;
    }

    const rowNumber = rowIndex + 1;
    for (const field of ["setting_value", "updated_by", "updated_at"]) {
      const fieldIndex = headers.indexOf(normalize(field));
      if (fieldIndex < 0) {
        if (field === "setting_value") throw new Error("Settings must contain a setting_value column.");
        continue;
      }
      const fieldValue = field === "setting_value" ? value : field === "updated_by" ? "PM Admin" : publishedAt;
      const column = columnName(fieldIndex);
      updates.push({
        range: `Settings!${column}${rowNumber}`,
        values: [[fieldValue]],
      });
    }
  }

  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "RAW", data: updates },
    });
  }
  if (newRows.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `Settings!A:${columnName(Math.max(0, rawHeaders.length - 1))}`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: newRows },
    });
  }
}

export async function POST(request: NextRequest) {
  if (!isPmAuthConfigured()) {
    return NextResponse.json(
      { error: "PM authentication is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!isPmRequest(request)) {
    return NextResponse.json(
      { error: "PM sign-in is required to publish results." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const sheets = await getGoogleSheets();
    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: ["Evaluations!A:N", "Score_Rules!A:Z", "Settings!A:Z", "Leaderboard!A:Z"],
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const [evaluationValues, ruleValues, settingValues, leaderboardValues] = response.data.valueRanges ?? [];
    const evaluationRows = evaluationValues?.values ?? [];
    const ruleRows = ruleValues?.values ?? [];
    const settingRows = settingValues?.values ?? [];
    const leaderboardRows = leaderboardValues?.values ?? [];
    const dashboard = buildAdminDashboard(evaluationRows, ruleRows, settingRows);
    for (const diagnostic of dashboard.diagnostics) {
      console.warn("Leaderboard publication validation issue:", diagnostic);
    }

    const blockers = dashboard.diagnostics.filter((diagnostic) => diagnostic.blocksPublication);
    if (blockers.length) {
      return NextResponse.json(
        {
          error: `${blockers.length} submitted record(s) need attention before publication.`,
          diagnostics: blockers,
        },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    }

    const publishedEntries = [
      ...dashboard.leaderboards.GB.filter((entry) => entry.points !== null),
      ...dashboard.leaderboards.MB.filter((entry) => entry.points !== null),
    ].flatMap((entry) => entry.points === null ? [] : [{ ...entry, points: entry.points }]);
    if (publishedEntries.length === 0) {
      return NextResponse.json(
        { error: "There are no valid submitted scores to publish." },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    }

    const headers = (leaderboardRows[0] ?? []).map((value) => String(value ?? ""));
    const normalizedHeaders = headers.map(normalize);
    const requiredColumns = [
      "cycle_id",
      "member_id",
      "member_name",
      "role",
      "department",
      "approved_points",
      "publication_status",
      "published_at",
    ];
    const missingColumns = requiredColumns.filter((column) => !normalizedHeaders.includes(normalize(column)));
    if (missingColumns.length) {
      return NextResponse.json(
        { error: `Leaderboard is missing required columns: ${missingColumns.join(", ")}.` },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    const priorPublishedTimes = leaderboardRows.slice(1).flatMap((row) => {
      const rowHeaders = normalizedHeaders;
      const cycleIndex = rowHeaders.indexOf("cycleid");
      const statusIndex = rowHeaders.indexOf("publicationstatus");
      const timeIndex = rowHeaders.indexOf("publishedat");
      if (
        String(row[cycleIndex] ?? "") !== dashboard.cycleId ||
        String(row[statusIndex] ?? "").toLowerCase() !== "published"
      ) return [];
      const time = Date.parse(String(row[timeIndex] ?? ""));
      return Number.isFinite(time) ? [time] : [];
    });
    const latestPriorTime = Math.max(0, ...priorPublishedTimes);
    const publishedAt = new Date(Math.max(Date.now(), latestPriorTime + 1)).toISOString();
    const snapshot = publishedEntries.map((entry) => {
      const row: unknown[] = Array.from({ length: headers.length }, () => "");
      const values: Record<string, string | number> = {
        cycle_id: dashboard.cycleId,
        member_id: entry.memberId,
        member_name: entry.name,
        role: entry.role,
        department: entry.department,
        approved_points: entry.points,
        publication_status: "Published",
        published_at: publishedAt,
      };
      for (const [key, value] of Object.entries(values)) {
        const index = normalizedHeaders.indexOf(normalize(key));
        if (index >= 0) row[index] = value;
      }
      return row;
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `Leaderboard!A:${columnName(Math.max(0, headers.length - 1))}`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: snapshot },
    });
    await updatePublicationSettings(sheets, spreadsheetId, settingRows, publishedAt);

    return NextResponse.json(
      {
        success: true,
        publishedAt,
        publishedEntries: publishedEntries.length,
        diagnostics: dashboard.diagnostics.filter((diagnostic) => !diagnostic.blocksPublication),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Leaderboard publication failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not publish the leaderboard." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
