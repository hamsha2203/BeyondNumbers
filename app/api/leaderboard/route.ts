import { NextResponse } from "next/server";
import { members } from "@/lib/members";
import { getGoogleSheets, getSpreadsheetId } from "@/lib/googleSheets";

export const runtime = "nodejs";

type PublicEntry = {
  memberId: string;
  name: string;
  role: "GB" | "MB";
  department: string;
  points: number;
  rank: number;
};

function normalize(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cell(row: unknown[], headers: string[], name: string) {
  const index = headers.indexOf(normalize(name));
  return index < 0 ? "" : String(row[index] ?? "");
}

function rankEntries(entries: PublicEntry[]) {
  const sorted = [...entries].sort(
    (left, right) => right.points - left.points || left.name.localeCompare(right.name),
  );
  let rank = 0;
  let previousPoints: number | null = null;
  sorted.forEach((entry, index) => {
    if (entry.points !== previousPoints) rank = index + 1;
    entry.rank = rank;
    previousPoints = entry.points;
  });
  return sorted;
}

export async function GET() {
  try {
    const sheets = await getGoogleSheets();
    const spreadsheetId = getSpreadsheetId();
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: ["Leaderboard!A:Z", "Settings!A:Z"],
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const [leaderboardData, settingData] = response.data.valueRanges ?? [];
    const leaderboardRows = leaderboardData?.values ?? [];
    const settingRows = settingData?.values ?? [];
    const settings = new Map(
      settingRows.slice(1).map((row) => [normalize(row[0]), String(row[1] ?? "")]),
    );
    const gradingDeadline = settings.get("gradingdeadline") ?? "";
    const enabled = ["true", "yes"].includes((settings.get("publicdashboardenabled") ?? "").toLowerCase());
    const approved = ["true", "yes"].includes((settings.get("publicationapproved") ?? "").toLowerCase());
    if (!enabled || !approved) {
      return NextResponse.json(
        { published: false, gradingDeadline, publishedAt: "", rows: { GB: [], MB: [] } },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const headers = (leaderboardRows[0] ?? []).map(normalize);
    const required = ["cycle_id", "member_id", "role", "approved_points", "publication_status", "published_at"];
    const missing = required.filter((name) => !headers.includes(normalize(name)));
    if (missing.length) {
      throw new Error(`Leaderboard is missing required columns: ${missing.join(", ")}.`);
    }

    const cycleId =
      settings.get("activecycleid") ||
      settings.get("activecycle") ||
      process.env.BN_ACTIVE_CYCLE_ID ||
      "2026_RNR";
    const candidates = leaderboardRows.slice(1).filter(
      (row) =>
        cell(row, headers, "cycle_id") === cycleId &&
        cell(row, headers, "publication_status").toLowerCase() === "published",
    );
    const publicationTimes = candidates
      .map((row) => cell(row, headers, "published_at"))
      .filter((value) => value && Number.isFinite(Date.parse(value)))
      .sort((left, right) => Date.parse(right) - Date.parse(left));
    const publishedAt = publicationTimes[0] ?? "";
    if (!publishedAt || !Number.isFinite(Date.parse(publishedAt))) {
      return NextResponse.json(
        { published: false, gradingDeadline, publishedAt: "", rows: { GB: [], MB: [] } },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const memberById = new Map(members.map((member) => [member.id, member]));
    const entries = candidates
      .filter((row) => cell(row, headers, "published_at") === publishedAt)
      .map((row): PublicEntry => {
        const memberId = cell(row, headers, "member_id");
        const role = cell(row, headers, "role");
        const member = memberById.get(memberId);
        const name = cell(row, headers, "member_name") || member?.name || "";
        const department = cell(row, headers, "department") || member?.department || "";
        const pointsText = cell(row, headers, "approved_points");
        const points = Number(pointsText);
        if (
          !member ||
          member.role !== role ||
          (role !== "GB" && role !== "MB") ||
          !pointsText ||
          !Number.isSafeInteger(points) ||
          points < 0 ||
          !name ||
          !department
        ) {
          throw new Error(`Published leaderboard contains an invalid entry for member ID "${memberId}".`);
        }
        return {
          memberId,
          name,
          role,
          department,
          points,
          rank: 0,
        };
      });

    const duplicateIds = new Set<string>();
    const seenIds = new Set<string>();
    for (const entry of entries) {
      const key = `${entry.role}:${entry.memberId}`;
      if (seenIds.has(key)) duplicateIds.add(key);
      seenIds.add(key);
    }
    if (duplicateIds.size) {
      throw new Error(`Published snapshot contains duplicate member entries: ${[...duplicateIds].join(", ")}.`);
    }

    const gb = rankEntries(entries.filter((entry) => entry.role === "GB"));
    const mb = rankEntries(entries.filter((entry) => entry.role === "MB"));
    return NextResponse.json(
      { published: true, gradingDeadline, publishedAt, rows: { GB: gb, MB: mb } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Public leaderboard load failed:", error);
    return NextResponse.json(
      { error: "Could not load the published leaderboard." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
