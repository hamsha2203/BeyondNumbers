"use client";

import { useEffect, useMemo, useState } from "react";
import { activeMembers } from "@/lib/members";
import { AppShell, GlassCard, StatusPill } from "@/app/components/ui";

type Row = { name: string; department: string; points: number };
type Evaluation = { subjectId: string; total: number };

export default function DashboardPage() {
  const [role, setRole] = useState<"GB" | "MB">("GB");
  const [rows, setRows] = useState<Row[]>([]);
  const [ready, setReady] = useState(false);
  const [published, setPublished] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const deadline = window.localStorage.getItem("bn-deadline");
      const isPublished = window.localStorage.getItem("bn-published") === "yes";
      const deadlinePassed = !!deadline && new Date(deadline).getTime() <= Date.now();
      setPublished(isPublished);
      setReady(deadlinePassed && isPublished);

      if (!deadlinePassed || !isPublished) {
        setRows([]);
        return;
      }

      const evaluations: Evaluation[] = JSON.parse(window.localStorage.getItem("bn-evaluations") || "[]");
      const eligible = activeMembers.filter((member) => member.role === role);
      const nextRows = eligible
        .map((member) => ({
          name: member.name,
          department: member.department,
          points: evaluations
            .filter((evaluation) => evaluation.subjectId === member.id)
            .reduce((sum, evaluation) => sum + evaluation.total, 0),
        }))
        .sort((a, b) => b.points - a.points);

      setRows(nextRows);
    };

    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [role]);

  const header = useMemo(() => (role === "GB" ? "GB rankings" : "MB rankings"), [role]);

  return (
    <AppShell small>
      <section className="page-header">
        <div>
          <p className="eyebrow">Public leaderboard</p>
          <h1>Approved results</h1>
        </div>
        <StatusPill label={ready ? "Published" : "Locked"} tone={ready ? "success" : "muted"} />
      </section>

      {!ready ? (
        <GlassCard className="locked-panel">
          <h2>Rankings are still locked</h2>
          <p>
            {published
              ? "The deadline is still active. The leaderboard will be released only after the cycle closes."
              : "The grading deadline must pass and the PM must explicitly approve publication before rankings are shown."}
          </p>
        </GlassCard>
      ) : (
        <GlassCard className="leaderboard-panel">
          <div className="segmented-control" role="tablist" aria-label="Leaderboard tabs">
            <button type="button" className={role === "GB" ? "active" : ""} onClick={() => setRole("GB")}>
              GB
            </button>
            <button type="button" className={role === "MB" ? "active" : ""} onClick={() => setRole("MB")}>
              MB
            </button>
          </div>

          <div className="leaderboard-table">
            <div className="leaderboard-row leaderboard-row-header">
              <span>Rank</span>
              <span>Name</span>
              <span>Department</span>
              <span>Points</span>
            </div>

            {rows.length === 0 ? (
              <div className="empty-state">No published entries are available for this category.</div>
            ) : (
              rows.map((row, index) => (
                <div className="leaderboard-row" key={`${row.name}-${row.department}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span>{row.name}</span>
                  <span>{row.department}</span>
                  <strong>{row.points.toLocaleString("en-IN")}</strong>
                </div>
              ))
            )}
          </div>

          <p className="panel-note">{header} · Only the PM-approved snapshot is displayed.</p>
        </GlassCard>
      )}
    </AppShell>
  );
}
