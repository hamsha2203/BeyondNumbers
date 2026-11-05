import type { Member } from "@/lib/members";

export type Metric = {
  label: string;
  points: number;
  inputType?: "count" | "amount" | "leads" | "yes_no";
};

const COMMON_MEMBERSHIP_METRICS: Metric[] = [
  { label: "Attend LC Events", points: 20 },
  { label: "Department Meeting Attendance", points: 15 },
  { label: "Team Meeting Attendance", points: 10 },
  { label: "Conference", points: 100 },
  { label: "Apply for OC/CC Roles", points: 25 },
  { label: "Accepted for OC/CC Roles", points: 50 },
  { label: "XP APD", points: 500 },
  { label: "XP RE", points: 1000 },
  { label: "Non-monetary Partnership (CC/OC)", points: 50 },
  { label: "Monetary Partnership (CC/OC)", points: 80, inputType: "amount" },
  { label: "Market Research (OC/CC)", points: 25, inputType: "leads" },
  { label: "LEC Contribution", points: 60, inputType: "yes_no" },
];

const DEPARTMENT_METRICS: Record<string, Metric[]> = {
  oGV: [
    { label: "APL", points: 2 },
    { label: "NOC", points: 5 },
    { label: "APD", points: 20 },
    { label: "RE", points: 50 },
  ],
  oGTa: [
    { label: "APL", points: 2 },
    { label: "NOC", points: 50 },
    { label: "APD", points: 100 },
    { label: "RE", points: 250 },
  ],
  MKT: [
    { label: "Opens", points: 1 },
    { label: "Content created", points: 5 },
    { label: "Campaign runs", points: 20 },
    { label: "MOU signed", points: 250 },
  ],
  BD: [
    { label: "In-kind partnerships ₹10K–₹20K", points: 50 },
    { label: "In-kind partnerships above ₹20K", points: 100 },
    { label: "Non-monetary partnerships", points: 30 },
  ],
  PM: [
    { label: "PM Initiatives", points: 5 },
    { label: "O2Os", points: 5 },
    { label: "Engagement", points: 5 },
  ],
};

export function metricsForEvaluation(subject: Member): Metric[] {
  const departmentMetrics = DEPARTMENT_METRICS[subject.department] ?? [];
  return subject.role === "MB" || subject.role === "GB"
    ? [...COMMON_MEMBERSHIP_METRICS, ...departmentMetrics]
    : departmentMetrics;
}

export function calculateMetricPoints(metric: Metric, value: number) {
  if (metric.inputType === "leads") {
    return Math.floor(value / 50) * metric.points;
  }
  if (metric.inputType === "yes_no") {
    return value === 1 ? metric.points : 0;
  }
  if (metric.inputType === "amount") {
    if (value < 2000) return 0;
    if (value < 6000) return 20;
    if (value <= 10000) return 80;
    return 80 + Math.ceil((value - 10000) / 5000) * 80;
  }
  return value * metric.points;
}

export function metricScoringDescription(metric: Metric) {
  if (metric.inputType === "amount") return "Enter total INR amount; points use the tiers";
  if (metric.inputType === "leads") return "25 pts per complete 50 leads";
  if (metric.inputType === "yes_no") return "60 pts for Yes";
  return `${metric.points.toLocaleString("en-IN")} pts each`;
}
