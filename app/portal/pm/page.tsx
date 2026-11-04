"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell, GlassCard, StatusPill } from "@/app/components/ui";

type MetricLine = {
  metric: string;
  count: number | null;
  storedPoints: number | null;
  pointsPerUnit: number | null;
  awardedPoints: number | null;
  approved: boolean;
  issue: string;
  blocksPublication: boolean;
};

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

type ProgressGroup = { department: string; assigned: number; completed: number };
type TeamProgress = {
  name: string;
  leader: string;
  assigned: number;
  completed: number;
  pending: number;
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
  complete: boolean;
  status: string;
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
type Diagnostic = {
  sheetRow: number;
  evaluationId: string;
  memberId: string;
  memberName: string;
  reason: string;
  blocksPublication: boolean;
};
type Dashboard = {
  cycleId: string;
  settings: {
    cycleId: string;
    gradingDeadline: string;
  };
  summary: {
    activeMembers: number;
    assignments: number;
    completedAssignments: number;
    pendingAssignments: number;
    submissions: number;
    submittedEvaluations: number;
    needsReview: number;
    blockingIssues: number;
    scoringWarnings: number;
  };
  departments: ProgressGroup[];
  teams: TeamProgress[];
  assignments: Assignment[];
  evaluations: Evaluation[];
  leaderboard: LeaderboardEntry[];
  leaderboards: { GB: LeaderboardEntry[]; MB: LeaderboardEntry[] };
  diagnostics: Diagnostic[];
  refreshedAt: string;
};

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function asDateTimeLocal(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function percent(completed: number, assigned: number) {
  return assigned ? Math.round((completed / assigned) * 100) : 0;
}

function progressTone(status: string): "success" | "warning" | "muted" {
  if (status === "Submitted" || status === "Evaluated") return "success";
  if (status.includes("review") || status === "Rejected" || status === "Needs review") return "warning";
  return "muted";
}

export default function PmPortalPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [password, setPassword] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [deadline, setDeadline] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [team, setTeam] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [expandedEvaluation, setExpandedEvaluation] = useState("");
  const [boardDepartment, setBoardDepartment] = useState("all");
  const [boardTeam, setBoardTeam] = useState("all");
  const [boardRole, setBoardRole] = useState<"GB" | "MB">("GB");

  const loadDashboard = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/admin/dashboard", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load the dashboard.");
      const data = result as Dashboard;
      setDashboard(data);
      if (showLoading) setDeadline(asDateTimeLocal(data.settings.gradingDeadline));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load the dashboard.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store" });
        const result = await response.json();
        if (!active) return;
        if (response.status === 503) {
          setAuthError(result.error || "PM authentication is not configured.");
          return;
        }
        setAuthenticated(response.ok && result.authenticated === true);
        if (!response.ok) setAuthError(result.error || "Could not verify PM sign-in.");
      } catch {
        if (active) setAuthError("Could not verify PM sign-in. Check your connection and retry.");
      } finally {
        if (active) setAuthLoading(false);
      }
    };
    void checkSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authenticated) void loadDashboard();
  }, [authenticated, loadDashboard]);

  useEffect(() => {
    if (!authenticated) return;
    const timer = window.setInterval(() => void loadDashboard(false), 20_000);
    return () => window.clearInterval(timer);
  }, [authenticated, loadDashboard]);

  const signIn = async () => {
    setAuthSubmitting(true);
    setAuthError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not unlock the PM portal.");
      sessionStorage.setItem("bn-role", "PM");
      setPassword("");
      setAuthenticated(true);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not unlock the PM portal.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const signOut = async () => {
    try {
      const response = await fetch("/api/admin/session", { method: "DELETE" });
      if (!response.ok) throw new Error("The server could not clear the PM session.");
      sessionStorage.removeItem("bn-role");
      setAuthenticated(false);
      setDashboard(null);
      window.location.assign("/evaluate");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not log out. Please try again.");
    }
  };

  const saveDeadline = async () => {
    if (!deadline || Number.isNaN(new Date(deadline).getTime())) {
      setMessage("Choose a valid deadline before saving.");
      return;
    }
    setMessage("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gradingDeadline: new Date(deadline).toISOString() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save the deadline.");
      window.dispatchEvent(new Event("bn-settings-updated"));
      setMessage("Deadline saved to Google Sheets.");
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the deadline.");
    }
  };

  const filteredEvaluations = useMemo(() => {
    const evaluations = dashboard?.evaluations ?? [];
    const query = search.trim().toLowerCase();
    return evaluations.filter((evaluation) => {
      const assignedTeam = dashboard?.assignments.find(
        (assignment) => assignment.subjectId === evaluation.subjectId,
      )?.teamName ?? "";
      const haystack = [
        evaluation.evaluatorName,
        evaluation.evaluatorId,
        evaluation.subjectName,
        evaluation.subjectId,
        evaluation.department,
        evaluation.status,
        assignedTeam,
      ].join(" ").toLowerCase();
      const timestamp = new Date(evaluation.submittedAt).getTime();
      return (!query || haystack.includes(query)) &&
        (department === "all" || evaluation.department === department) &&
        (team === "all" || assignedTeam === team) &&
        (roleFilter === "all" || evaluation.evaluatorRole === roleFilter) &&
        (statusFilter === "all" || evaluation.status.toLowerCase() === statusFilter.toLowerCase()) &&
        (!fromDate || (Number.isFinite(timestamp) && timestamp >= new Date(`${fromDate}T00:00:00`).getTime())) &&
        (!toDate || (Number.isFinite(timestamp) && timestamp <= new Date(`${toDate}T23:59:59`).getTime()));
    }).sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime());
  }, [dashboard, search, department, team, roleFilter, statusFilter, fromDate, toDate]);

  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filteredEvaluations.length / pageSize));
  const pageEvaluations = filteredEvaluations.slice((page - 1) * pageSize, page * pageSize);
  const filteredLeaderboard = (dashboard?.leaderboards[boardRole] ?? []).filter((entry) =>
    (boardDepartment === "all" || entry.department === boardDepartment) &&
    (boardRole === "MB" || boardTeam === "all" || entry.teamName === boardTeam),
  );
  const departments = dashboard?.departments.map((entry) => entry.department) ?? [];
  const teamNames = dashboard?.teams.map((entry) => entry.name) ?? [];

  if (authLoading) {
    return (
      <AppShell small>
        <GlassCard className="pm-auth-card"><p>Checking PM session…</p></GlassCard>
      </AppShell>
    );
  }

  if (!authenticated) {
    return (
      <AppShell
        small
        action={<Link href="/" className="mini-link">Home</Link>}
      >
        <section className="page-header compact-header">
          <div><p className="eyebrow">PM / admin</p><h1>Private command center</h1></div>
          <StatusPill label="Sign-in required" tone="muted" />
        </section>
        <GlassCard className="pm-auth-card">
          <h2>Unlock PM dashboard</h2>
          <p>PM dashboard data is available only through a server-verified session.</p>
          <label htmlFor="pm-dashboard-password">PM password</label>
          <input
            id="pm-dashboard-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void signIn()}
            disabled={authSubmitting || authError.includes("not configured")}
          />
          {authError ? <p className="input-error" role="alert">{authError}</p> : null}
          <button
            type="button"
            className="cta-button primary full"
            disabled={authSubmitting || authError.includes("not configured")}
            onClick={() => void signIn()}
          >
            {authSubmitting ? "Checking…" : "Unlock dashboard"}
          </button>
        </GlassCard>
      </AppShell>
    );
  }

  return (
    <AppShell
      small
      action={
        <button type="button" className="mini-link pm-logout" onClick={() => void signOut()}>
          Log out
        </button>
      }
    >
      <section className="page-header compact-header">
        <div>
          <p className="eyebrow">PM / admin · {dashboard?.cycleId ?? "Current cycle"}</p>
          <h1>Private command center</h1>
          <p className="pm-refresh">
            {dashboard ? `Live data refreshed ${formatDate(dashboard.refreshedAt)}` : "Loading live cycle data"}
          </p>
        </div>
        <div className="pm-header-actions">
          <StatusPill label="Live" tone="success" />
          <button type="button" className="ghost-button" disabled={loading} onClick={() => void loadDashboard()}>
            {loading ? "Refreshing…" : "Refresh now"}
          </button>
        </div>
      </section>

      {loadError ? <p className="system-message pm-error" role="alert">{loadError}</p> : null}

      <section aria-label="Cycle overview" className="pm-stats-grid">
        <GlassCard className="pm-stat"><span>Active MBs &amp; GBs</span><strong>{dashboard?.summary.activeMembers ?? "—"}</strong></GlassCard>
        <GlassCard className="pm-stat"><span>Submitted evaluations</span><strong>{dashboard?.summary.submittedEvaluations ?? "—"}</strong></GlassCard>
        <GlassCard className="pm-stat"><span>Assignments complete</span><strong>{dashboard ? `${dashboard.summary.completedAssignments}/${dashboard.summary.assignments}` : "—"}</strong></GlassCard>
        <GlassCard className="pm-stat"><span>Pending assignments</span><strong>{dashboard?.summary.pendingAssignments ?? "—"}</strong></GlassCard>
        <GlassCard className="pm-stat"><span>Needs scoring review</span><strong>{dashboard?.summary.needsReview ?? "—"}</strong></GlassCard>
      </section>

      {dashboard ? (
        <>
          <section className="pm-dashboard-grid">
            <GlassCard className="pm-dashboard-card">
              <div className="pm-section-heading"><div><p className="eyebrow">Completion</p><h2>Department progress</h2></div></div>
              <div className="pm-progress-list">
                {dashboard.departments.map((entry) => (
                  <div className="pm-progress-item" key={entry.department}>
                    <div className="pm-progress-copy">
                      <strong>{entry.department}</strong>
                      <span>{entry.completed} of {entry.assigned} assignments</span>
                      <span>{percent(entry.completed, entry.assigned)}%</span>
                    </div>
                    <div className="pm-progress-track" role="progressbar" aria-label={`${entry.department} completion`} aria-valuenow={percent(entry.completed, entry.assigned)} aria-valuemin={0} aria-valuemax={100}>
                      <span style={{ width: `${percent(entry.completed, entry.assigned)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="pm-dashboard-card">
              <div className="pm-section-heading"><div><p className="eyebrow">Current assignments</p><h2>Team progress</h2></div></div>
              <div className="pm-team-table-wrap">
                <table className="pm-table pm-team-table">
                  <thead><tr><th>Team</th><th>Leader</th><th>Done</th><th>Pending</th></tr></thead>
                  <tbody>
                    {dashboard.teams.map((entry) => (
                      <tr key={entry.name}>
                        <td>{entry.name}</td><td>{entry.leader}</td>
                        <td>{entry.completed}/{entry.assigned}</td><td>{entry.pending}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </section>

          <GlassCard className="pm-dashboard-card pm-pending-card">
            <div className="pm-section-heading">
              <div><p className="eyebrow">Follow-up</p><h2>Pending assignments <span className="pm-count">{dashboard.summary.pendingAssignments}</span></h2></div>
            </div>
            {dashboard.assignments.every((assignment) => assignment.complete) ? <p className="pm-empty">All assigned evaluations have been received.</p> : (
              <div className="pm-table-wrap">
                <table className="pm-table">
                  <thead><tr><th>Member</th><th>Role</th><th>Department</th><th>Team</th><th>Evaluator</th><th>Status</th></tr></thead>
                  <tbody>
                    {dashboard.assignments.filter((assignment) => !assignment.complete).map((assignment) => (
                      <tr key={`${assignment.evaluatorId}-${assignment.subjectId}`}>
                        <td>{assignment.subjectName}</td><td>{assignment.subjectRole}</td>
                        <td>{assignment.department}</td><td>{assignment.teamName || "—"}</td>
                        <td>{assignment.evaluatorName}</td>
                        <td><StatusPill label={assignment.status} tone={progressTone(assignment.status)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>

          <GlassCard className="pm-dashboard-card">
            <div className="pm-section-heading pm-section-heading-wrap">
              <div><p className="eyebrow">Approved rules only</p><h2>Live {boardRole} leaderboard</h2></div>
              <div className="segmented-control" role="tablist" aria-label="Internal leaderboard role">
                <button type="button" className={boardRole === "GB" ? "active" : ""} onClick={() => setBoardRole("GB")}>GB</button>
                <button type="button" className={boardRole === "MB" ? "active" : ""} onClick={() => setBoardRole("MB")}>MB</button>
              </div>
              <div className="pm-filter-row">
                <label>Department
                  <select value={boardDepartment} onChange={(event) => setBoardDepartment(event.target.value)}>
                    <option value="all">All departments</option>
                    {departments.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                </label>
                {boardRole === "GB" ? (
                  <label>Team
                    <select value={boardTeam} onChange={(event) => setBoardTeam(event.target.value)}>
                      <option value="all">All teams</option>
                      {teamNames.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                    </select>
                  </label>
                ) : null}
              </div>
            </div>
            <p className="pm-disclaimer">
              Recalculated from submitted metric responses using active, approved Score_Rules. Missing mappings, invalid responses, and duplicate evaluations are excluded rather than assigned a fallback score.
            </p>
            <div className="pm-table-wrap">
              <table className="pm-table">
                <thead><tr><th>Rank</th><th>Member</th><th>Department</th><th>Team</th><th>Approved points</th><th>Status</th></tr></thead>
                <tbody>
                  {filteredLeaderboard.map((entry) => (
                    <tr key={entry.memberId}>
                      <td>{entry.rank ?? "—"}</td><td>{entry.name}</td><td>{entry.department}</td>
                      <td>{entry.teamName || "—"}</td>
                      <td>{entry.points === null ? "—" : entry.points.toLocaleString()}</td>
                      <td><StatusPill label={entry.status} tone={progressTone(entry.status)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <GlassCard className="pm-dashboard-card">
            <div className="pm-section-heading pm-section-heading-wrap">
              <div><p className="eyebrow">Audit trail</p><h2>Evaluation submissions <span className="pm-count">{filteredEvaluations.length}</span></h2></div>
              <div className="pm-filter-row">
                <label className="pm-search-label">Search
                  <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Name, ID, department…" />
                </label>
                <label>Department
                  <select value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1); }}>
                    <option value="all">All departments</option>
                    {departments.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                </label>
                <label>Team
                  <select value={team} onChange={(event) => { setTeam(event.target.value); setPage(1); }}>
                    <option value="all">All teams</option>
                    {teamNames.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                </label>
                <label>Evaluator role
                  <select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); }}>
                    <option value="all">All roles</option><option value="VP">VP</option><option value="MB">MB</option>
                  </select>
                </label>
                <label>Status
                  <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
                    <option value="all">All statuses</option><option value="Submitted">Submitted</option><option value="Rejected">Rejected</option>
                  </select>
                </label>
                <label>From<input type="date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setPage(1); }} /></label>
                <label>To<input type="date" value={toDate} onChange={(event) => { setToDate(event.target.value); setPage(1); }} /></label>
              </div>
            </div>
            <div className="pm-table-wrap">
              <table className="pm-table pm-evaluation-table">
                <thead><tr><th>Submitted</th><th>Evaluator</th><th>Member</th><th>Department</th><th>Status</th><th>Recorded total</th><th>Approved total</th><th>Details</th></tr></thead>
                <tbody>
                  {pageEvaluations.map((evaluation) => (
                    <Fragment key={evaluation.id || `${evaluation.evaluatorId}-${evaluation.subjectId}-${evaluation.submittedAt}`}>
                      <tr>
                        <td>{formatDate(evaluation.submittedAt)}</td>
                        <td>{evaluation.evaluatorName}<small>{evaluation.evaluatorRole} · {evaluation.evaluatorId}</small></td>
                        <td>{evaluation.subjectName}<small>{evaluation.subjectRole} · {evaluation.subjectId}</small></td>
                        <td>{evaluation.department}</td>
                        <td><StatusPill label={evaluation.needsReview ? `${evaluation.status} · review` : evaluation.status} tone={progressTone(evaluation.needsReview ? "Needs review" : evaluation.status)} /></td>
                        <td>{evaluation.recordedPoints?.toLocaleString() ?? "—"}</td>
                        <td>{evaluation.approvedPoints?.toLocaleString() ?? "Needs review"}</td>
                        <td><button type="button" className="pm-detail-button" aria-expanded={expandedEvaluation === evaluation.id} onClick={() => setExpandedEvaluation(expandedEvaluation === evaluation.id ? "" : evaluation.id)}> {expandedEvaluation === evaluation.id ? "Hide" : "View"} </button></td>
                      </tr>
                      {expandedEvaluation === evaluation.id ? (
                        <tr>
                          <td className="pm-detail-cell" colSpan={8}>
                            <div className="pm-detail-heading">
                              <span>Updated {formatDate(evaluation.updatedAt)}</span>
                              <span>Cycle {evaluation.cycleId}</span>
                              {evaluation.note ? <span>Note: {evaluation.note}</span> : null}
                            </div>
                            <div className="pm-metric-list">
                              {evaluation.metrics.map((metric, index) => (
                                <div className="pm-metric-detail" key={`${metric.metric}-${index}`}>
                                  <span>{metric.metric}{!metric.approved ? " · not approved or duplicate" : ""}</span>
                                  <span>Count {metric.count ?? "invalid"}</span>
                                  <span>{metric.pointsPerUnit ?? "—"} pts/unit</span>
                                  <strong>{metric.awardedPoints?.toLocaleString() ?? "Not calculated"} pts</strong>
                                  {metric.issue ? <span>{metric.issue}</span> : null}
                                </div>
                              ))}
                              {evaluation.issues.length ? (
                                <p className="pm-disclaimer">{evaluation.issues.join(" ")}</p>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                  {pageEvaluations.length === 0 ? <tr><td colSpan={8} className="pm-empty">No evaluations match these filters.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <div className="pm-pagination">
              <span>Page {page} of {pageCount}</span>
              <div>
                <button type="button" className="ghost-button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
                <button type="button" className="ghost-button" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</button>
              </div>
            </div>
          </GlassCard>

          <section className="pm-dashboard-grid">
            <GlassCard className="pm-dashboard-card">
              <p className="eyebrow">Google Sheets settings</p><h2>Cycle configuration</h2>
              <dl className="pm-settings-list">
                <div><dt>Active cycle</dt><dd>{dashboard.settings.cycleId}</dd></div>
                <div><dt>Grading deadline</dt><dd>{dashboard.settings.gradingDeadline || "Not configured"}</dd></div>
              </dl>
            </GlassCard>
            <GlassCard className="pm-card">
              <h2>Deadline</h2>
              <label htmlFor="deadline-input">Close grading at</label>
              <input id="deadline-input" type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
              <button type="button" className="cta-button primary full" disabled={loading} onClick={() => void saveDeadline()}>Save deadline</button>
            </GlassCard>
          </section>
          <GlassCard className="pm-dashboard-card">
            <div className="pm-section-heading">
              <div>
                <p className="eyebrow">Live scoring checks</p>
                <h2>Records to review <span className="pm-count">{dashboard.diagnostics.length}</span></h2>
              </div>
            </div>
            {dashboard.diagnostics.length === 0 ? (
              <p className="pm-empty">No scoring or member-mapping issues were found.</p>
            ) : (
              <div className="pm-table-wrap">
                <table className="pm-table">
                  <thead><tr><th>Sheet row</th><th>Member</th><th>Evaluation</th><th>Issue</th><th>Leaderboard</th></tr></thead>
                  <tbody>
                    {dashboard.diagnostics.map((diagnostic, index) => (
                      <tr key={`${diagnostic.evaluationId}-${diagnostic.sheetRow}-${index}`}>
                        <td>{diagnostic.sheetRow}</td>
                        <td>{diagnostic.memberName}<small>{diagnostic.memberId || "Missing member ID"}</small></td>
                        <td>{diagnostic.evaluationId || "Missing evaluation ID"}</td>
                        <td>{diagnostic.reason}</td>
                        <td><StatusPill label={diagnostic.blocksPublication ? "Not scored" : "Warning"} tone={diagnostic.blocksPublication ? "warning" : "muted"} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </>
      ) : loading ? <GlassCard className="pm-dashboard-card"><p>Loading cycle data…</p></GlassCard> : null}

      {message ? <div className="system-message" role="status">{message}</div> : null}
    </AppShell>
  );
}
