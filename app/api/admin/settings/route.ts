import { NextRequest, NextResponse } from "next/server";
import { getGoogleSheets, getSpreadsheetId } from "@/lib/googleSheets";
import { isPmAuthConfigured, isPmRequest } from "@/lib/pmAuth";

export const runtime = "nodejs";

function normalize(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
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
      { error: "PM sign-in is required to update cycle settings." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const body: unknown = await request.json();
    const deadlineValue =
      body && typeof body === "object" && "gradingDeadline" in body
        ? body.gradingDeadline
        : undefined;
    if (typeof deadlineValue !== "string" || Number.isNaN(Date.parse(deadlineValue))) {
      return NextResponse.json(
        { error: "Provide a valid grading deadline." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const sheets = await getGoogleSheets();
    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Settings!A:Z",
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const rows = response.data.values ?? [];
    const headers = (rows[0] ?? []).map(normalize);
    const keyIndex = headers.indexOf("settingkey");
    if (keyIndex < 0 || !headers.includes("settingvalue")) {
      return NextResponse.json(
        { error: "Settings must contain setting_key and setting_value columns." },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    const valueIndex = headers.indexOf("settingvalue");
    const updaterIndex = headers.indexOf("updatedby");
    const updatedAtIndex = headers.indexOf("updatedat");
    const keys = new Map<string, number>();
    rows.slice(1).forEach((row, index) => {
      const key = normalize(row[keyIndex]);
      if (key) keys.set(key, index + 2);
    });

    const timestamp = new Date().toISOString();
    const updates: Array<{ range: string; values: string[][] }> = [];
    const writeSetting = (key: string, value: string) => {
      const rowNumber = keys.get(normalize(key));
      if (!rowNumber) {
        throw new Error(`Settings row "${key}" is missing.`);
      }
      const firstColumn = String.fromCharCode(65 + valueIndex);
      const lastColumn = String.fromCharCode(65 + Math.max(valueIndex, updaterIndex, updatedAtIndex));
      const values = Array.from({ length: Math.max(valueIndex, updaterIndex, updatedAtIndex) - valueIndex + 1 }, () => "");
      values[0] = value;
      if (updaterIndex >= valueIndex) values[updaterIndex - valueIndex] = "PM Admin";
      if (updatedAtIndex >= valueIndex) values[updatedAtIndex - valueIndex] = timestamp;
      updates.push({ range: `Settings!${firstColumn}${rowNumber}:${lastColumn}${rowNumber}`, values: [values] });
    };

    writeSetting("grading_deadline", new Date(deadlineValue).toISOString());

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: updates,
      },
    });

    return NextResponse.json(
      { success: true, gradingDeadline: new Date(deadlineValue).toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("PM cycle settings update failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update cycle settings." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
