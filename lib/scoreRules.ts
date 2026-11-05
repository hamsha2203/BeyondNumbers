export type SheetRow = unknown[];

export type ScoreRule = {
  department: string;
  metric: string;
  metricId: string;
  pointsPerUnit: number | null;
  unit: string;
  scoringType: string;
  scoringConfig: string;
  approved: boolean;
  active: boolean;
};

export type MetricScore = {
  metric: string;
  count: number | null;
  storedPoints: number | null;
  pointsPerUnit: number | null;
  awardedPoints: number | null;
  approved: boolean;
  issue: string;
  blocksPublication: boolean;
};

export type ScoreCalculation = {
  metrics: MetricScore[];
  approvedPoints: number | null;
  issues: string[];
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

export function normalizeMetric(metric: string) {
  const normalized = normalizeHeader(metric);
  const aliases: Record<string, string> = {
    attendlcevents: "lceventsattendance",
    lceventattendance: "lceventsattendance",
    attendlcevent: "lceventsattendance",
    departmentmeetingattendance: "departmentmeetingattendance",
    teammeetingattendance: "teammeetingattendance",
    conference: "conferenceattendance",
    attendconference: "conferenceattendance",
    applyforoccc: "appliedforocccroles",
    applyforocccrole: "appliedforocccroles",
    applyforocccroles: "appliedforocccroles",
    appliedforoccc: "appliedforocccroles",
    appliedforocccrole: "appliedforocccroles",
    acceptedforoccc: "acceptedforocccroles",
    acceptedforocccrole: "acceptedforocccroles",
    marketresearchitem: "marketresearch",
    marketresearchitems: "marketresearch",
    inkindpartnership10k20k: "inkindpartnership10k20k",
    inkindpartnerships10k20k: "inkindpartnership10k20k",
    inkindpartnershipabove20k: "inkindpartnershipabove20k",
    inkindpartnershipsabovetwenty: "inkindpartnershipabove20k",
    inkindpartnershipsabove20k: "inkindpartnershipabove20k",
    nonmonetarypartnerships: "nonmonetarypartnership",
  };
  return aliases[normalized] ?? normalized;
}

function isTrue(value: string) {
  return ["true", "yes", "1", "approved", "active"].includes(value.trim().toLowerCase());
}

function isFalse(value: string) {
  return ["false", "no", "0", "inactive", "disabled", "unapproved", "rejected"].includes(value.trim().toLowerCase());
}

export function readScoreRules(rows: SheetRow[]): ScoreRule[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((value) => normalizeHeader(String(value ?? "")));
  return rows.slice(1).flatMap((row) => {
    const pointsValue = cell(row, headers, "points_per_unit", "points_per_count", "points");
    const status = cell(row, headers, "status", "approval_status");
    const approvedValue = cell(row, headers, "approved", "is_approved");
    const activeValue = cell(row, headers, "active", "is_active");
    const points = pointsValue.trim() ? Number(pointsValue) : Number.NaN;
    const metricId = cell(row, headers, "metric_id");
    const metric = cell(row, headers, "metric", "metric_name", "metric_label") || metricId;
    const department = cell(row, headers, "department", "dept");
    if (!department || !metric) return [];

    const approved = approvedValue
      ? isTrue(approvedValue)
      : status.trim().toLowerCase() === "approved";
    const active = activeValue
      ? !isFalse(activeValue)
      : status.trim()
        ? status.trim().toLowerCase() !== "inactive"
        : approved;

    return [{
      department,
      metric,
      metricId,
      pointsPerUnit: Number.isFinite(points) ? points : null,
      unit: cell(row, headers, "unit"),
      scoringType: cell(row, headers, "scoring_type") || "per_count",
      scoringConfig: cell(row, headers, "scoring_config"),
      approved,
      active,
    }];
  });
}

export function resolveScoreRule(
  rules: ScoreRule[],
  department: string,
  metric: string,
  metricId = "",
) {
  const matches = (rule: ScoreRule) =>
    normalizeMetric(rule.metric) === normalizeMetric(metric) ||
    Boolean(
      rule.metricId &&
      normalizeMetric(rule.metricId) === normalizeMetric(metricId || metric),
    );
  const specific = rules.filter(
    (rule) => rule.department.toLowerCase() === department.toLowerCase() && matches(rule),
  );
  const common = rules.filter(
    (rule) => rule.department.toLowerCase() === "all" && matches(rule),
  );
  const candidates = specific.length ? specific : common;
  return {
    rule: candidates.length === 1 ? candidates[0] : null,
    ambiguous: candidates.length > 1,
  };
}

function countValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 && value <= 1000000000 ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const count = Number(value.trim());
    return Number.isSafeInteger(count) && count <= 1000000000 ? count : null;
  }
  return null;
}

function calculateAward(count: number, rule: ScoreRule) {
  if (rule.pointsPerUnit === null) {
    return { points: null, issue: `Approved scoring rule for "${rule.metric}" has no numeric points_per_unit value.` };
  }
  if (rule.scoringType === "per_count") {
    if (count > 100000) {
      return { points: null, issue: `Count for "${rule.metric}" exceeds the supported range.` };
    }
    return { points: count * rule.pointsPerUnit, issue: "" };
  }
  let config: Record<string, unknown> = {};
  try {
    config = rule.scoringConfig ? JSON.parse(rule.scoringConfig) as Record<string, unknown> : {};
  } catch {
    return { points: null, issue: `Scoring configuration for "${rule.metric}" is invalid JSON.` };
  }
  if (rule.scoringType === "per_block") {
    const blockSize = config.blockSize;
    if (!Number.isSafeInteger(blockSize) || Number(blockSize) <= 0 || count > 100000) {
      return { points: null, issue: `Scoring configuration or lead count for "${rule.metric}" is invalid.` };
    }
    return { points: Math.floor(count / Number(blockSize)) * rule.pointsPerUnit, issue: "" };
  }
  if (rule.scoringType === "yes_no") {
    if (count !== 0 && count !== 1) {
      return { points: null, issue: `Response for "${rule.metric}" must be Yes or No.` };
    }
    return { points: count * rule.pointsPerUnit, issue: "" };
  }
  if (rule.scoringType === "tiered_amount") {
    const tiers = config.tiers;
    const incrementAfter = config.incrementAfter;
    if (!Array.isArray(tiers)) {
      return { points: null, issue: `Scoring configuration for "${rule.metric}" has no valid amount tiers.` };
    }
    const tier = tiers.find((candidate) => {
      if (!candidate || typeof candidate !== "object") return false;
      const range = candidate as Record<string, unknown>;
      return Number.isSafeInteger(range.min) && Number.isSafeInteger(range.max) &&
        Number.isSafeInteger(range.points) && count >= Number(range.min) && count <= Number(range.max);
    }) as Record<string, unknown> | undefined;
    if (tier) return { points: Number(tier.points), issue: "" };
    if (incrementAfter && typeof incrementAfter === "object") {
      const increment = incrementAfter as Record<string, unknown>;
      const startAmount = increment.startAmount;
      const stepAmount = increment.stepAmount;
      const pointsPerStep = increment.pointsPerStep;
      const basePoints = increment.basePoints;
      if (
        Number.isSafeInteger(startAmount) &&
        Number.isSafeInteger(stepAmount) &&
        Number(stepAmount) > 0 &&
        Number.isSafeInteger(pointsPerStep) &&
        Number.isSafeInteger(basePoints) &&
        count > Number(startAmount)
      ) {
        const steps = Math.ceil((count - Number(startAmount)) / Number(stepAmount));
        return { points: Number(basePoints) + steps * Number(pointsPerStep), issue: "" };
      }
    }
    return { points: 0, issue: "" };
  }
  return { points: null, issue: `Scoring type "${rule.scoringType}" for "${rule.metric}" is unsupported.` };
}

export function calculateMetricScores(
  response: unknown,
  department: string,
  rules: ScoreRule[],
): ScoreCalculation {
  let items: unknown;
  try {
    items = typeof response === "string" ? JSON.parse(response) : response;
  } catch {
    return {
      metrics: [],
      approvedPoints: null,
      issues: ["Metric responses contain invalid JSON."],
      blocksPublication: true,
    };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return {
      metrics: [],
      approvedPoints: null,
      issues: ["No valid metric responses were supplied."],
      blocksPublication: true,
    };
  }

  let blocksPublication = false;
  const seen = new Set<string>();
  const metrics = items.map((item): MetricScore => {
    if (!item || typeof item !== "object") {
      blocksPublication = true;
      return {
        metric: "Invalid metric entry",
        count: null,
        storedPoints: null,
        pointsPerUnit: null,
        awardedPoints: null,
        approved: false,
        issue: "Metric response is not an object.",
        blocksPublication: true,
      };
    }

    const record = item as Record<string, unknown>;
    const metric = typeof record.metric === "string" ? record.metric.trim() : "";
    const rawMetricId = record.metric_id ?? record.metricId;
    const metricId = typeof rawMetricId === "string" ? rawMetricId.trim() : "";
    const label = metric || metricId || "Unknown metric";

    if (!metric && !metricId) {
      blocksPublication = true;
      return {
        metric: label,
        count: null,
        storedPoints: null,
        pointsPerUnit: null,
        awardedPoints: null,
        approved: false,
        issue: "Metric ID or name is missing.",
        blocksPublication: true,
      };
    }

    const count = countValue(record.count ?? record.value ?? record.response);
    if (count === null) {
      blocksPublication = true;
      return {
        metric: label,
        count: null,
        storedPoints: Number.isFinite(record.points) ? Number(record.points) : null,
        pointsPerUnit: null,
        awardedPoints: null,
        approved: false,
        issue: `Response for "${label}" is not a supported non-negative count.`,
        blocksPublication: true,
      };
    }

    const { rule, ambiguous } = resolveScoreRule(rules, department, metric, metricId);

    if (ambiguous) {
      blocksPublication = true;
      return {
        metric: label,
        count,
        storedPoints: Number.isFinite(record.points) ? Number(record.points) : null,
        pointsPerUnit: null,
        awardedPoints: null,
        approved: false,
        issue: `Multiple scoring rules match "${label}".`,
        blocksPublication: true,
      };
    }

    const identity = rule
      ? `${normalizeHeader(rule.department)}:${normalizeMetric(rule.metricId || rule.metric)}`
      : `${normalizeHeader(department)}:${normalizeMetric(metricId || metric)}`;
    if (seen.has(identity)) {
      blocksPublication = true;
      return {
        metric: label,
        count,
        storedPoints: Number.isFinite(record.points) ? Number(record.points) : null,
        pointsPerUnit: rule?.pointsPerUnit ?? null,
        awardedPoints: null,
        approved: false,
        issue: `Duplicate response for metric "${label}" was not counted.`,
        blocksPublication: true,
      };
    }
    seen.add(identity);

    if (!rule) {
      blocksPublication = true;
      return {
        metric: label,
        count,
        storedPoints: Number.isFinite(record.points) ? Number(record.points) : null,
        pointsPerUnit: null,
        awardedPoints: null,
        approved: false,
        issue: `No scoring rule matches "${label}" for department "${department}".`,
        blocksPublication: true,
      };
    }

    if (!rule.active || !rule.approved) {
      const issue = `Scoring rule for "${label}" is inactive or unapproved; points were excluded.`;
      return {
        metric: label,
        count,
        storedPoints: Number.isFinite(record.points) ? Number(record.points) : null,
        pointsPerUnit: rule.pointsPerUnit,
        awardedPoints: 0,
        approved: false,
        issue,
        blocksPublication: false,
      };
    }
    const award = calculateAward(count, rule);
    if (award.points === null) {
      blocksPublication = true;
      return {
        metric: label,
        count,
        storedPoints: Number.isFinite(record.points) ? Number(record.points) : null,
        pointsPerUnit: null,
        awardedPoints: null,
        approved: false,
        issue: award.issue,
        blocksPublication: true,
      };
    }

    const awardedPoints = award.points;
    if (!Number.isSafeInteger(awardedPoints)) {
      blocksPublication = true;
      return {
        metric: label,
        count,
        storedPoints: Number.isFinite(record.points) ? Number(record.points) : null,
        pointsPerUnit: rule.pointsPerUnit,
        awardedPoints: null,
        approved: false,
        issue: `Calculated points for "${label}" exceed the supported range.`,
        blocksPublication: true,
      };
    }

    return {
      metric: label,
      count,
      storedPoints: Number.isFinite(record.points) ? Number(record.points) : null,
      pointsPerUnit: rule.pointsPerUnit,
      awardedPoints,
      approved: true,
      issue: "",
      blocksPublication: false,
    };
  });

  const issues = metrics.flatMap((metric) => metric.issue ? [metric.issue] : []);
  const approvedPoints = blocksPublication
    ? null
    : metrics.reduce((total, metric) => total + (metric.awardedPoints ?? 0), 0);

  return { metrics, approvedPoints, issues, blocksPublication };
}
