import {
  activeMembers,
  mbAssignments,
  memberTeams,
  members,
  vpAssignments,
} from "@/lib/members";
import {
  calculateMetricScores,
  normalizeMetric,
  readScoreRules,
  type MetricScore,
  type SheetRow,
} from "@/lib/scoreRules";
import { metricsForEvaluation } from "@/lib/scoring";

type MetricLine = MetricScore;

type Evaluation = {
  sheetRow: number;
  id: string;
  cycleId: string;
  evaluatorId: string;
  evaluatorName: string;
  evaluatorRole: string;
  subjectId: string;
  subjectName: string;
  subjectRole: string;
  department: string;
  metrics: MetricLine[];
  recordedPoints: number | null;
  approvedPoints: number | null;
  note: string;
  status: string;
  submittedAt: string;
  updatedAt: string;
  needsReview: boolean;
  issues: string[];
  blocksPublication: boolean;
};

type Assignment = {
  evaluatorId: string;
  evaluatorName: string;
  evaluatorRole: string;
  subjectId: string;
  subjectName: string;
  subjectRole: string;
  department: string;
  teamName: string;
};

type LeaderboardEntry = {
  memberId: string;
  role: "GB" | "MB";
  name: string;
  department: string;
  teamName: string;
  points: number | null;
  rank: number | null;
  status: string;
  needsReview: boolean;
};

export type DashboardDiagnostic = {
  sheetRow: number;
  evaluationId: string;
  memberId: string;
  memberName: string;
  reason: string;
  blocksPublication: boolean;
};

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cell(row: SheetRow, headers: string[], ...names: string[]) {
  for (const name of names) {
    const index = headers.indexOf(normalizeHeader(name));
    if (index >= 0) {
      const value = row[index];
      return value === null || value === undefined ? "" : String(value);
    }
  }
  return "";
}

function readSettings(rows: SheetRow[]) {
  const values: Record<string, string> = {};
  for (const row of rows.slice(1)) {
    if (row[0]) values[normalizeHeader(String(row[0]))] = String(row[1] ?? "");
  }
  return {
    cycleId: values.activecycleid || values.activecycle || process.env.BN_ACTIVE_CYCLE_ID || "2026_RNR",
    gradingDeadline: values.gradingdeadline || values.deadline || "",
    publicationApproved: ["true", "yes"].includes((values.publicationapproved || "").toLowerCase()),
    publicDashboardEnabled: ["true", "yes"].includes((values.publicdashboardenabled || "").toLowerCase()),
    publicationPublishedAt: values.publicationpublishedat || "",
  };
}

export function buildAdminDashboard(evaluationRows: SheetRow[], ruleRows: SheetRow[], settingRows: SheetRow[]) {
  const rules = readScoreRules(ruleRows);
  const settings = readSettings(settingRows);
  const evaluationHeaders = (evaluationRows[0] ?? []).map((value) => normalizeHeader(String(value ?? "")));
  const activeById = new Map(activeMembers.map((member) => [member.id, member]));
  const assignments: Assignment[] = [
    ...vpAssignments.map((assignment) => ({ ...assignment, teamName: "" })),
    ...mbAssignments,
  ].flatMap((assignment) => {
    const evaluator = activeById.get(assignment.evaluatorId);
    const subject = activeById.get(assignment.subjectId);
    if (!evaluator || !subject) return [];
    return [{
      evaluatorId: evaluator.id,
      evaluatorName: evaluator.name,
      evaluatorRole: evaluator.role,
      subjectId: subject.id,
      subjectName: subject.name,
      subjectRole: subject.role,
      department: subject.department,
      teamName: assignment.teamName ?? "",
    }];
  });

  const assignmentByKey = new Map(
    assignments.map((assignment) => [
      `${assignment.evaluatorId}:${assignment.subjectId}`,
      assignment,
    ]),
  );
  const assignmentBySubject = new Map<string, Assignment[]>();
  for (const assignment of assignments) {
    const records = assignmentBySubject.get(assignment.subjectId) ?? [];
    records.push(assignment);
    assignmentBySubject.set(assignment.subjectId, records);
  }
  const diagnostics: DashboardDiagnostic[] = [];

  const evaluations: Evaluation[] = evaluationRows.slice(1).map((row, index) => {
    const evaluatorId = cell(row, evaluationHeaders, "evaluator_id");
    const subjectId = cell(row, evaluationHeaders, "evaluated_member_id", "subject_id");
    const evaluator = members.find((member) => member.id === evaluatorId);
    const subject = members.find((member) => member.id === subjectId);
    const department = cell(row, evaluationHeaders, "department") || subject?.department || "";
    const parsed = calculateMetricScores(
      cell(row, evaluationHeaders, "metric_counts_json", "metric_inputs_json", "metrics_json", "metric_json", "metrics"),
      department,
      rules,
    );
    const recordedValue = cell(row, evaluationHeaders, "calculated_points", "total_points", "total", "points");
    const id = cell(row, evaluationHeaders, "evaluation_id", "id");
    const status = cell(row, evaluationHeaders, "status") || "Unknown";
    const issues = [...parsed.issues];
    let blocksPublication = parsed.blocksPublication;
    let hasMissingMetrics = false;
    if (status.toLowerCase() === "submitted") {
      if (!subject || !activeById.has(subjectId) || !["GB", "MB"].includes(subject.role)) {
        issues.push(`Evaluated member ID "${subjectId || "(missing)"}" does not resolve to an active GB or MB.`);
        blocksPublication = true;
      }
      if (!evaluator) {
        issues.push(`Evaluator ID "${evaluatorId || "(missing)"}" does not resolve to a configured member.`);
        blocksPublication = true;
      }
      if (subject && department.toLowerCase() !== subject.department.toLowerCase()) {
        issues.push(`Department "${department}" does not match member ${subject.id}'s configured department "${subject.department}".`);
        blocksPublication = true;
      }
      if (subject && activeById.has(subjectId) && ["GB", "MB"].includes(subject.role)) {
        const submittedMetrics = new Set(parsed.metrics.map((metric) => normalizeMetric(metric.metric)));
        const missingMetrics = metricsForEvaluation(subject)
          .filter((metric) => !submittedMetrics.has(normalizeMetric(metric.label)))
          .map((metric) => metric.label);
        const missingLegacyPmMetrics = subject.department === "PM"
          ? missingMetrics.filter((metric) =>
              ["PM Initiatives", "O2Os", "Engagement"].includes(metric),
            )
          : [];
        const requiredMissingMetrics = missingMetrics.filter(
          (metric) => !missingLegacyPmMetrics.includes(metric),
        );
        for (const metric of missingLegacyPmMetrics) {
          issues.push(`No ${metric} count was recorded in this historical evaluation; no points were awarded.`);
        }
        if (requiredMissingMetrics.length) {
          issues.push(`Missing responses for applicable metrics: ${requiredMissingMetrics.join(", ")}.`);
          hasMissingMetrics = true;
        }
      }
      if (!assignmentByKey.has(`${evaluatorId}:${subjectId}`)) {
        issues.push(`Evaluator ${evaluatorId || "(missing)"} is not assigned to member ${subjectId || "(missing)"}.`);
        blocksPublication = true;
      }
    }

    return {
      sheetRow: index + 2,
      id,
      cycleId: cell(row, evaluationHeaders, "cycle_id"),
      evaluatorId,
      evaluatorName: cell(row, evaluationHeaders, "evaluator_name") || evaluator?.name || "Unknown evaluator",
      evaluatorRole: evaluator?.role ?? "Unknown",
      subjectId,
      subjectName: cell(row, evaluationHeaders, "evaluated_member_name", "subject_name") || subject?.name || "Unknown member",
      subjectRole: subject?.role ?? "Unknown",
      department,
      metrics: parsed.metrics,
      recordedPoints: recordedValue && Number.isFinite(Number(recordedValue)) ? Number(recordedValue) : null,
      approvedPoints: blocksPublication || hasMissingMetrics ? null : parsed.approvedPoints,
      note: cell(row, evaluationHeaders, "comments", "note", "comment"),
      status,
      submittedAt: cell(row, evaluationHeaders, "submitted_at", "created_at"),
      updatedAt: cell(row, evaluationHeaders, "updated_at"),
      needsReview: issues.length > 0,
      issues,
      blocksPublication,
    };
  }).filter((evaluation) => evaluation.cycleId === settings.cycleId);

  const evaluationByAssignment = new Map<string, Evaluation[]>();
  for (const assignment of assignments) {
    const key = `${assignment.evaluatorId}:${assignment.subjectId}`;
    evaluationByAssignment.set(key, []);
  }
  const evaluationsBySubject = new Map<string, Evaluation[]>();
  for (const evaluation of evaluations) {
    const key = `${evaluation.evaluatorId}:${evaluation.subjectId}`;
    evaluationByAssignment.get(key)?.push(evaluation);
    if (evaluation.subjectId && evaluation.status.toLowerCase() === "submitted") {
      const subjectEvaluations = evaluationsBySubject.get(evaluation.subjectId) ?? [];
      subjectEvaluations.push(evaluation);
      evaluationsBySubject.set(evaluation.subjectId, subjectEvaluations);
    }
    if (evaluation.status.toLowerCase() === "submitted") {
      for (const reason of evaluation.issues) {
        diagnostics.push({
          sheetRow: evaluation.sheetRow,
          evaluationId: evaluation.id,
          memberId: evaluation.subjectId,
          memberName: evaluation.subjectName,
          reason,
          blocksPublication: evaluation.blocksPublication &&
            (reason.includes("unapproved") ? false : true),
        });
      }
      if (
        evaluation.recordedPoints !== null &&
        evaluation.approvedPoints !== null &&
        evaluation.recordedPoints !== evaluation.approvedPoints
      ) {
        const reason = `Stored total ${evaluation.recordedPoints} differs from the recalculated approved total ${evaluation.approvedPoints}.`;
        evaluation.issues.push(reason);
        evaluation.needsReview = true;
        diagnostics.push({
          sheetRow: evaluation.sheetRow,
          evaluationId: evaluation.id,
          memberId: evaluation.subjectId,
          memberName: evaluation.subjectName,
          reason,
          blocksPublication: false,
        });
      }
    }
  }

  for (const [memberId, records] of evaluationsBySubject) {
    if (records.length > 1) {
      const reason = `Member ${memberId} has ${records.length} submitted evaluations in cycle ${settings.cycleId}; duplicate scores were excluded.`;
      for (const evaluation of records) {
        evaluation.issues.push(reason);
        evaluation.needsReview = true;
        evaluation.blocksPublication = true;
      }
      diagnostics.push({
        sheetRow: records[0].sheetRow,
        evaluationId: records.map((evaluation) => evaluation.id).filter(Boolean).join(", "),
        memberId,
        memberName: records[0].subjectName,
        reason,
        blocksPublication: true,
      });
    }
  }

  const assignmentProgress = assignments.map((assignment) => {
    const records = evaluationByAssignment.get(`${assignment.evaluatorId}:${assignment.subjectId}`) ?? [];
    const submitted = records.filter((evaluation) => evaluation.status.toLowerCase() === "submitted");
    return {
      ...assignment,
      complete: submitted.length === 1,
      status: submitted.length > 1 ? "Duplicate · review" : submitted.length === 1 ? "Submitted" :
        records.some((evaluation) => evaluation.status.toLowerCase() === "rejected") ? "Rejected" : "Pending",
    };
  });

  const groups = new Map<string, { department: string; assigned: number; completed: number }>();
  for (const assignment of assignmentProgress) {
    const group = groups.get(assignment.department) ?? {
      department: assignment.department,
      assigned: 0,
      completed: 0,
    };
    group.assigned += 1;
    if (assignment.complete) group.completed += 1;
    groups.set(assignment.department, group);
  }

  const teamProgress = memberTeams.map((team) => {
    const records = assignmentProgress.filter((assignment) => assignment.teamName === team.name);
    return {
      name: team.name,
      leader: activeById.get(team.leaderId)?.name ?? "Unknown leader",
      assigned: records.length,
      completed: records.filter((record) => record.complete).length,
      pending: records.filter((record) => !record.complete).length,
    };
  });

  const buildLeaderboard = (role: "GB" | "MB"): LeaderboardEntry[] => {
    const leaderboard = activeMembers.filter((member) => member.role === role).map((member): LeaderboardEntry => {
    const required = assignmentBySubject.get(member.id) ?? [];
    const assignment = required.length === 1 ? required[0] : undefined;
    const submittedForSubject = (evaluationsBySubject.get(member.id) ?? [])
      .filter((evaluation) => evaluation.status.toLowerCase() === "submitted");
    const submitted = assignment
      ? submittedForSubject.filter((evaluation) => evaluation.evaluatorId === assignment.evaluatorId)
      : [];
    if (!assignment || submittedForSubject.length !== 1 || submitted.length !== 1) {
      return {
        memberId: member.id,
      role,
      name: member.name,
      department: member.department,
      teamName: assignment?.teamName ?? "",
      points: null,
      rank: null,
      status: submittedForSubject.length > 1
        ? "Duplicate · review"
        : submittedForSubject.length > 0
          ? "Unassigned · review"
          : "Pending",
      needsReview: submittedForSubject.length > 0 || !assignment,
    };
    }
    const evaluation = submitted[0];
    return {
    memberId: member.id,
    role,
    name: member.name,
    department: member.department,
    teamName: assignment.teamName,
    points: evaluation.blocksPublication ? null : evaluation.approvedPoints,
    rank: null,
    status: evaluation.blocksPublication
      ? "Needs review"
      : evaluation.needsReview ? "Needs review" : "Evaluated",
    needsReview: evaluation.needsReview,
    };
    }).sort((left, right) => {
    if (left.points === null) return right.points === null ? left.name.localeCompare(right.name) : 1;
    if (right.points === null) return -1;
    return right.points - left.points || left.name.localeCompare(right.name);
    });

    let currentRank = 0;
    let previousPoints: number | null = null;
    let evaluatedCount = 0;
    for (const row of leaderboard) {
    if (row.points === null) continue;
    evaluatedCount += 1;
    if (row.points !== previousPoints) currentRank = evaluatedCount;
    row.rank = currentRank;
    previousPoints = row.points;
    }
    return leaderboard;
  };
  const leaderboards = {
    GB: buildLeaderboard("GB"),
    MB: buildLeaderboard("MB"),
  };

  return {
    cycleId: settings.cycleId,
    settings,
    summary: {
      activeMembers: activeMembers.filter((member) => member.role === "GB" || member.role === "MB").length,
      assignments: assignmentProgress.length,
      completedAssignments: assignmentProgress.filter((assignment) => assignment.complete).length,
      pendingAssignments: assignmentProgress.filter((assignment) => !assignment.complete).length,
      submissions: evaluations.length,
      submittedEvaluations: evaluations.filter((evaluation) => evaluation.status.toLowerCase() === "submitted").length,
      needsReview: evaluations.filter((evaluation) => evaluation.needsReview && evaluation.status.toLowerCase() === "submitted").length,
      publishBlockers: diagnostics.filter((diagnostic) => diagnostic.blocksPublication).length,
      publishWarnings: diagnostics.filter((diagnostic) => !diagnostic.blocksPublication).length,
    },
    departments: [...groups.values()].sort((left, right) => left.department.localeCompare(right.department)),
    teams: teamProgress,
    assignments: assignmentProgress,
    evaluations,
    leaderboard: leaderboards.GB,
    leaderboards,
    diagnostics,
    refreshedAt: new Date().toISOString(),
  };
}
