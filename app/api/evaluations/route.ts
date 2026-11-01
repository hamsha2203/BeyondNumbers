import { NextResponse } from "next/server";
import { getGoogleSheets, getSpreadsheetId } from "@/lib/googleSheets";
import {
  activeMembers,
  mbAssignments,
  vpAssignments,
} from "@/lib/members";
import { metricsForEvaluation } from "@/lib/scoring";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { evaluatorId, evaluatorRole, subjectId, counts, note } = body;

    if (
      typeof evaluatorId !== "string" ||
      typeof subjectId !== "string" ||
      !["VP", "MB"].includes(evaluatorRole) ||
      !Array.isArray(counts) ||
      typeof note !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid evaluation data." },
        { status: 400 }
      );
    }

    if (note.length > 3000 || counts.length > 20) {
      return NextResponse.json(
        { error: "Evaluation data exceeds allowed limits." },
        { status: 400 }
      );
    }

    const evaluator = activeMembers.find(
      (member) =>
        member.id === evaluatorId && member.role === evaluatorRole
    );

    const subject = activeMembers.find(
      (member) => member.id === subjectId
    );

    if (!evaluator || !subject) {
      return NextResponse.json(
        { error: "Evaluator or evaluated member not found." },
        { status: 400 }
      );
    }

    const assignments =
      evaluatorRole === "VP" ? vpAssignments : mbAssignments;

    const isAssigned = assignments.some(
      (assignment) =>
        assignment.evaluatorId === evaluatorId &&
        assignment.subjectId === subjectId
    );

    const expectedSubjectRole = evaluatorRole === "VP" ? "MB" : "GB";

    if (
      !isAssigned ||
      subject.role !== expectedSubjectRole ||
      subject.department !== evaluator.department
    ) {
      return NextResponse.json(
        { error: "This evaluator is not assigned to this member." },
        { status: 403 }
      );
    }

    const metrics = metricsForEvaluation(subject);
    const normalizedCounts: { metric: string; count: number; points: number }[] = [];

    for (const item of counts) {
      if (
        !item ||
        typeof item.metric !== "string" ||
        !Number.isSafeInteger(item.count) ||
        item.count < 0 ||
        item.count > 100000
      ) {
        return NextResponse.json(
          { error: "Invalid metric count." },
          { status: 400 }
        );
      }

      const metric = metrics.find((entry) => entry.label === item.metric);

      if (!metric) {
        return NextResponse.json(
          { error: `Unknown metric: ${item.metric}` },
          { status: 400 }
        );
      }

      if (normalizedCounts.some((entry) => entry.metric === metric.label)) {
        return NextResponse.json(
          { error: "Duplicate metric supplied." },
          { status: 400 }
        );
      }

      normalizedCounts.push({
        metric: metric.label,
        count: item.count,
        points: metric.points,
      });
    }

    const total = normalizedCounts.reduce(
      (sum, item) => sum + item.count * item.points,
      0
    );

    const sheets = await getGoogleSheets();
    const spreadsheetId = getSpreadsheetId();

    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Evaluations!A:N",
    });

    const rows = existing.data.values ?? [];

    // Columns: C = evaluator ID, E = evaluated member ID,
    // following the header row in the Evaluations tab.
    const duplicate = rows.slice(1).some(
      (row) =>
        row[2] === evaluatorId &&
        row[4] === subjectId &&
        row[11] !== "Rejected"
    );

    if (duplicate) {
      return NextResponse.json(
        { error: "An evaluation already exists for this evaluator and member." },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const evaluationId = crypto.randomUUID();
    const cycleId = process.env.BN_ACTIVE_CYCLE_ID || "2026_RNR";

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Evaluations!A:N",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[
          evaluationId,
          cycleId,
          evaluator.id,
          evaluator.name,
          subject.id,
          subject.name,
          subject.department,
          JSON.stringify(normalizedCounts),
          total,
          "",
          note,
          "Submitted",
          now,
          now,
        ]],
      },
    });

    return NextResponse.json({
      success: true,
      evaluationId,
      total,
    });
  } catch (error) {
    console.error("Evaluation submission failed:", error);

    return NextResponse.json(
      { error: "Could not save the evaluation. Please try again." },
      { status: 500 }
    );
  }
}
