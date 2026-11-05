import { NextResponse } from "next/server";
import { getGoogleSheets, getSpreadsheetId } from "@/lib/googleSheets";
import {
  activeMembers,
  mbAssignments,
  vpAssignments,
} from "@/lib/members";
import { metricsForEvaluation } from "@/lib/scoring";
import { calculateMetricScores, readScoreRules, resolveScoreRule } from "@/lib/scoreRules";

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

    const sheets = await getGoogleSheets();
    const spreadsheetId = getSpreadsheetId();
    const configResponse = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: ["Score_Rules!A:Z", "Settings!A:B"],
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const [scoreRuleValues, settingsValues] = configResponse.data.valueRanges ?? [];
    const scoreRules = readScoreRules(scoreRuleValues?.values ?? []);
    const settingsRows = settingsValues?.values ?? [];
    const settingsHeaders = (settingsRows[0] ?? []).map((value) =>
      String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""),
    );
    const settingKeyIndex = settingsHeaders.indexOf("settingkey");
    const settingValueIndex = settingsHeaders.indexOf("settingvalue");
    if (settingKeyIndex < 0 || settingValueIndex < 0) {
      throw new Error("Settings must contain setting_key and setting_value columns.");
    }
    const deadlineValue = settingsRows.slice(1).find(
      (row) => String(row[settingKeyIndex] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") === "gradingdeadline",
    )?.[settingValueIndex];
    if (deadlineValue) {
      const deadlineTime = Date.parse(String(deadlineValue));
      if (!Number.isFinite(deadlineTime)) {
        return NextResponse.json(
          { error: "The grading deadline in Google Sheets is invalid. Ask the PM to correct it." },
          { status: 503 },
        );
      }
      if (deadlineTime <= Date.now()) {
        return NextResponse.json(
          { error: "The grading deadline has passed. Please contact the PM." },
          { status: 403 },
        );
      }
    }

    const metrics = metricsForEvaluation(subject);
    const normalizedCounts: { metric: string; count: number; points: number }[] = [];

    for (const item of counts) {
      const metric = typeof item?.metric === "string"
        ? metrics.find((entry) => entry.label === item.metric)
        : undefined;
      const maxValue = metric?.inputType === "amount" ? 1000000000 : 100000;
      if (
        !item ||
        typeof item.metric !== "string" ||
        !Number.isSafeInteger(item.count) ||
        item.count < 0 ||
        item.count > maxValue ||
        (metric?.inputType === "yes_no" && item.count !== 0 && item.count !== 1)
      ) {
        return NextResponse.json(
          { error: "Invalid metric response." },
          { status: 400 }
        );
      }

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

      const { rule, ambiguous } = resolveScoreRule(
        scoreRules,
        subject.department,
        metric.label,
      );
      if (ambiguous) {
        return NextResponse.json(
          { error: `Multiple scoring rules match ${metric.label}. Ask the PM to resolve the rules before submitting.` },
          { status: 409 }
        );
      }
      if (!rule || !rule.active || !rule.approved || rule.pointsPerUnit === null) {
        return NextResponse.json(
          { error: `No active, approved scoring rule is configured for ${metric.label}.` },
          { status: 409 }
        );
      }

      normalizedCounts.push({
        metric: metric.label,
        count: item.count,
        points: rule.pointsPerUnit,
      });
    }

    const missingMetrics = metrics.filter(
      (metric) => !normalizedCounts.some((entry) => entry.metric === metric.label),
    );
    if (missingMetrics.length) {
      return NextResponse.json(
        { error: `Missing metric responses: ${missingMetrics.map((metric) => metric.label).join(", ")}.` },
        { status: 400 }
      );
    }

    const calculation = calculateMetricScores(
      JSON.stringify(normalizedCounts),
      subject.department,
      scoreRules,
    );
    if (calculation.blocksPublication || calculation.approvedPoints === null) {
      return NextResponse.json(
        { error: `Could not calculate this evaluation: ${calculation.issues.join(" ")}` },
        { status: 409 }
      );
    }
    const total = calculation.approvedPoints;

    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Evaluations!A:N",
    });

    const rows = existing.data.values ?? [];
    const cycleId = process.env.BN_ACTIVE_CYCLE_ID || "2026_RNR";
    const matches = rows
      .slice(1)
      .map((row, index) => ({ row, sheetRow: index + 2 }))
      .filter(
        ({ row }) =>
          row[1] === cycleId &&
          row[2] === evaluatorId &&
          row[4] === subjectId
      );

    if (matches.length > 1) {
      return NextResponse.json(
        { error: "Multiple active-cycle evaluations exist; ask the PM to resolve them before resubmitting." },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const existingEvaluation = matches[0];
    const evaluationId = existingEvaluation?.row[0] || crypto.randomUUID();
    const createdAt = existingEvaluation?.row[12] || now;
    const values = [[
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
      createdAt,
      now,
    ]];

    if (existingEvaluation) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Evaluations!A${existingEvaluation.sheetRow}:N${existingEvaluation.sheetRow}`,
        valueInputOption: "RAW",
        requestBody: { values },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Evaluations!A:N",
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values },
      });
    }

    return NextResponse.json({
      success: true,
      evaluationId,
      total,
      replaced: Boolean(existingEvaluation),
    });
  } catch (error) {
    console.error("Evaluation submission failed:", error);

    return NextResponse.json(
      { error: "Could not save the evaluation. Please try again." },
      { status: 500 }
    );
  }
}
