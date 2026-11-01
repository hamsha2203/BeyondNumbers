"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell, GlassCard, StatusPill } from "@/app/components/ui";
import { activeMembers } from "@/lib/members";
import { INACTIVE_PM_METRICS, metricsForEvaluation } from "@/lib/scoring";

export default function GradePage() {
  const [subjectId, setSubjectId] = useState("");
  const [evaluatorId, setEvaluatorId] = useState("");
  const [role, setRole] = useState("");
  const [counts, setCounts] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [closed, setClosed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deadlineText, setDeadlineText] = useState("No deadline configured");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSubjectId(params.get("subject") || "");
    setEvaluatorId(params.get("evaluator") || "");
    setRole(params.get("role") || "");

    const refresh = () => {
      const raw = window.localStorage.getItem("bn-deadline");
      if (!raw) {
        setDeadlineText("No deadline configured");
        setClosed(false);
        return;
      }

      const ms = new Date(raw).getTime() - Date.now();
      if (ms <= 0) {
        setDeadlineText("Grading window closed");
        setClosed(true);
        return;
      }

      setClosed(false);
      const days = Math.floor(ms / 86400000);
      const hours = Math.floor((ms % 86400000) / 3600000);
      const minutes = Math.floor((ms % 3600000) / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      setDeadlineText(`${days}d ${hours}h ${minutes}m ${seconds}s remaining`);
    };

    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const subject = activeMembers.find((member) => member.id === subjectId);
  const evaluator = activeMembers.find((member) => member.id === evaluatorId);
  const list = useMemo(() => (subject ? metricsForEvaluation(subject) : []), [subject]);
  const total = list.reduce((sum, metric, index) => sum + (counts[index] || 0) * metric.points, 0);

  const submit = async () => {
    if (closed) {
      setError("The grading deadline has passed. Please contact the PM.");
      return;
    }
    if (!subject || !evaluator) {
      setError("Missing evaluator or achiever. Return to the portal and choose again.");
      return;
    }

    if (submitting) return;

    const metricCounts = list.map((metric, index) => ({
      metric: metric.label,
      count: counts[index] || 0,
    }));

    if (
      !window.confirm(
        `Submit evaluation for ${subject.name}? Total: ${total} points. This replaces any previous submission for this member in the active cycle.`
      )
    ) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/evaluations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          evaluatorId: evaluator.id,
          evaluatorRole: role,
          subjectId: subject.id,
          counts: metricCounts,
          note,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not submit evaluation.");
      }

      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      small
      action={
        <Link href="/evaluate" className="mini-link">
          Back to roles
        </Link>
      }
    >
      <section className="page-header compact-header">
        <div>
          <p className="eyebrow">Evaluation form</p>
          <h1>{done ? "Evaluation submitted" : "Recognize the impact"}</h1>
        </div>
        <StatusPill label={closed ? "Closed" : "Open"} tone={closed ? "warning" : "success"} />
      </section>

      <div className="live-total-bar">
        <span>{subject ? subject.name : "Selected member"}</span>
        <strong>{total.toLocaleString("en-IN")} pts</strong>
      </div>

      {done ? (
        <GlassCard className="success-panel">
          <h2>Submission saved</h2>
          <p>Your evaluation has been saved successfully.</p>
          <Link href="/" className="cta-button primary">
            Finish &amp; return home
          </Link>
        </GlassCard>
      ) : (
        subject && (
          <GlassCard className="form-card">
            <div className="member-summary">
              <span className="avatar">{subject.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
              <div>
                <strong>{subject.name}</strong>
                <small>
                  {subject.role} · {subject.department} · evaluator {evaluator?.name || "not selected"}
                </small>
              </div>
            </div>

            <div className="metric-list">
              {list.map((metric, index) => (
                <div className="metric-row" key={metric.label}>
                  <label>
                    {metric.label}
                    <small>{metric.points} pts each</small>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100000"
                    step="1"
                    value={counts[index] ?? 0}
                    disabled={closed}
                    aria-label={`${metric.label} count`}
                    onChange={(event) =>
                      setCounts((previous) => {
                        const next = [...previous];
                        next[index] = Math.min(
                          100000,
                          Math.max(0, Math.floor(Number(event.target.value) || 0))
                        );
                        return next;
                      })
                    }
                  />
                  <strong>{((counts[index] || 0) * metric.points).toLocaleString("en-IN")} pts</strong>
                </div>
              ))}
            </div>

            {subject.role === "MB" && subject.department === "PM" && (
              <div className="inactive-metrics" aria-label="PM metrics awaiting approval">
                <p>Additional PM metrics · scoring pending approval</p>
                {INACTIVE_PM_METRICS.map((metric) => (
                  <div className="inactive-metric-row" key={metric}>
                    <span>{metric}</span>
                    <StatusPill label="Inactive" tone="muted" />
                    <small>Count-based scoring; point value not approved</small>
                  </div>
                ))}
              </div>
            )}

            <div className="note-block">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                value={note}
                disabled={closed}
                rows={3}
                placeholder="Add any supporting context or evidence."
                onChange={(event) => setNote(event.target.value)}
              />
            </div>

            <div className="submit-row">
              <div>
                <small>Calculated total</small>
                <h3>
                  {total.toLocaleString("en-IN")} <span>pts</span>
                </h3>
              </div>
              <button
                type="button"
                className="cta-button primary"
                disabled={closed || submitting}
                onClick={submit}
              >
                {closed
                  ? "Grading closed"
                  : submitting
                    ? "Submitting..."
                    : "Submit & close"}
              </button>
            </div>

            {deadlineText ? <p className="panel-note">Grading timer · {deadlineText}</p> : null}
            {error ? <p className="input-error">{error}</p> : null}
          </GlassCard>
        )
      )}
    </AppShell>
  );
}
