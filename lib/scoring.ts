import type { Member } from "@/lib/members";

export type Metric = {
  label: string;
  points: number;
};

const COMMON_MEMBERSHIP_METRICS: Metric[] = [
  { label: "Attend LC Events", points: 20 },
  { label: "Department Meeting Attendance", points: 15 },
  { label: "Team Meeting Attendance", points: 10 },
  { label: "Conference", points: 100 },
  { label: "Apply for OC/CC Roles", points: 25 },
  { label: "Accepted for OC/CC Roles", points: 50 },
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
    { label: "XP APD", points: 500 },
    { label: "XP RE", points: 1000 },
  ],
};

export function metricsForEvaluation(subject: Member): Metric[] {
  const departmentMetrics = DEPARTMENT_METRICS[subject.department] ?? [];
  return subject.role === "MB" || subject.role === "GB"
    ? [...COMMON_MEMBERSHIP_METRICS, ...departmentMetrics]
    : departmentMetrics;
}
