"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell, GlassCard, StatusPill } from "@/app/components/ui";
import { Search, Sparkles, Trophy, Users } from "lucide-react";

type Row = { memberId: string; name: string; department: string; points: number; rank: number };
type LiveLeaderboard = {
  live: boolean;
  refreshedAt: string;
  cycleId: string;
  rows: { GB: Row[]; MB: Row[] };
};

const EMPTY_ROWS: Row[] = [];

export default function DashboardPage() {
  const [role, setRole] = useState<"GB" | "MB">("GB");
  const [leaderboard, setLeaderboard] = useState<LiveLeaderboard | null>(null);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [sortMode, setSortMode] = useState<"rank" | "name">("rank");

  const refreshLeaderboard = useCallback(async (isMounted: () => boolean = () => true) => {
    if (isMounted()) setRefreshing(true);
    try {
      const response = await fetch("/api/leaderboard", { cache: "no-store" });
      const result: LiveLeaderboard & { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load live results.");
      if (isMounted()) {
        setLeaderboard(result);
        setLoadError("");
      }
    } catch (error: unknown) {
      if (isMounted()) {
        setLoadError(error instanceof Error ? error.message : "Could not load live results.");
      }
    } finally {
      if (isMounted()) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      await refreshLeaderboard(() => active);
      if (active) timer = setTimeout(() => void refresh(), 20_000);
    };
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [refreshLeaderboard]);

  const header = useMemo(() => (role === "GB" ? "GB rankings" : "MB rankings"), [role]);
  const ready = leaderboard?.live === true;
  const sourceRows = leaderboard?.rows[role] ?? EMPTY_ROWS;
  const departments = useMemo(
    () => [...new Set(sourceRows.map((row) => row.department))].sort((a, b) => a.localeCompare(b)),
    [sourceRows],
  );
  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const filtered = sourceRows.filter((row) =>
      (department === "all" || row.department === department) &&
      (!query || row.name.toLocaleLowerCase().includes(query) || row.department.toLocaleLowerCase().includes(query)),
    );
    return sortMode === "name"
      ? [...filtered].sort((a, b) => a.name.localeCompare(b.name))
      : filtered;
  }, [sourceRows, search, department, sortMode]);
  const podium = sortMode === "rank" && department === "all" && !search.trim() ? rows.slice(0, 3) : [];
  const totalPoints = rows.reduce((total, row) => total + row.points, 0);

  return (
    <AppShell small>
      <section className="page-header">
        <div>
          <p className="eyebrow">Beyond Numbers · Results 2026</p>
          <h1>Hall of achievers</h1>
          <p className="leaderboard-intro">Every point tells a story. Celebrate the people making it happen.</p>
        </div>
        <StatusPill label={ready ? "Live results" : "Connecting"} tone={ready ? "success" : "muted"} />
      </section>

      {!ready ? (
        <GlassCard className="locked-panel">
          <h2>Loading live results</h2>
          <p>
          {loadError || "Fetching the latest submitted evaluations."}
          </p>
        </GlassCard>
      ) : (
        <GlassCard className="leaderboard-panel">
          <div className="leaderboard-heading">
          <div>
            <p className="eyebrow"><Sparkles size={14} /> Live standings · {leaderboard.cycleId}</p>
            <h2>{header}</h2>
          </div>
          <div className="leaderboard-total">
            <span>Current points</span>
            <strong>{totalPoints.toLocaleString("en-IN")}</strong>
          </div>
          </div>
          <div className="leaderboard-live-status">
            <span>Updates automatically every 20 seconds</span>
            <span>{refreshing ? "Refreshing…" : `Updated ${new Date(leaderboard.refreshedAt).toLocaleTimeString()}`}</span>
            <button type="button" className="leaderboard-sort" disabled={refreshing} onClick={() => void refreshLeaderboard()}>
              Refresh now
            </button>
          </div>
          {loadError ? <p className="system-message pm-error" role="status">{loadError} Showing the last loaded results.</p> : null}

          <div className="leaderboard-toolbar">
          <div className="segmented-control leaderboard-tabs" role="tablist" aria-label="Leaderboard categories">
            <button type="button" role="tab" aria-selected={role === "GB"} className={role === "GB" ? "active" : ""} onClick={() => setRole("GB")}>
              GB <span>{leaderboard.rows.GB.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={role === "MB"} className={role === "MB" ? "active" : ""} onClick={() => setRole("MB")}>
              MB <span>{leaderboard.rows.MB.length}</span>
            </button>
          </div>
          <div className="leaderboard-filters">
            <label className="leaderboard-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a member"
                aria-label="Search leaderboard"
              />
            </label>
            <label className="leaderboard-department">
              <span className="sr-only">Filter by department</span>
              <select value={department} onChange={(event) => setDepartment(event.target.value)}>
                <option value="all">All departments</option>
                {departments.map((entry) => <option value={entry} key={entry}>{entry}</option>)}
              </select>
            </label>
            <button
              type="button"
              className="leaderboard-sort"
              onClick={() => setSortMode((current) => current === "rank" ? "name" : "rank")}
              aria-label={sortMode === "rank" ? "Sort by member name" : "Sort by rank"}
            >
              {sortMode === "rank" ? "Sort: rank" : "Sort: name"}
            </button>
          </div>
          </div>

          {podium.length > 0 ? (
          <section className="leaderboard-podium" aria-label="Top three">
            {[podium[1], podium[0], podium[2]].filter(Boolean).map((row, index) => {
              const place = row.rank;
              return (
                <article className={`podium-card podium-place-${place}`} key={row.memberId}>
                  <span className="podium-medal"><Trophy size={place === 1 ? 21 : 17} /></span>
                  <span className="podium-place">{place === 1 ? "CHAMPION" : `${place}${place === 2 ? "ND" : "RD"} PLACE`}</span>
                  <span className="podium-avatar">{row.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
                  <strong className="podium-name">{row.name}</strong>
                  <span className="podium-department">{row.department}</span>
                  <strong className="podium-score">{row.points.toLocaleString("en-IN")} <small>pts</small></strong>
                  <span className="sr-only">Podium position {index + 1}</span>
                </article>
              );
            })}
          </section>
          ) : null}

          <div className="leaderboard-list-heading">
          <div><Users size={16} /><span>Rankings</span></div>
          <span>{rows.length} {rows.length === 1 ? "member" : "members"}</span>
          </div>

          <div className="leaderboard-table">
          <div className="leaderboard-row leaderboard-row-header">
            <span>Place</span>
            <span>Member</span>
            <span>Department</span>
            <span>Score</span>
          </div>

          {rows.length === 0 ? (
            <div className="empty-state">{sourceRows.length ? "No members match these filters." : "No valid submitted evaluations are available for this category yet."}</div>
          ) : (
            rows.map((row) => (
              <div className={`leaderboard-row ${row.rank <= 3 ? `leaderboard-top-row rank-${row.rank}` : ""}`} key={row.memberId}>
                <span className="leaderboard-rank">{String(row.rank).padStart(2, "0")}</span>
                <span className="leaderboard-member">
                  <span className="leaderboard-avatar">{row.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
                  <strong>{row.name}</strong>
                </span>
                <span><span className="department-tag">{row.department}</span></span>
                <strong className="leaderboard-score">{row.points.toLocaleString("en-IN")} <small>pts</small></strong>
              </div>
            ))
          )}
          </div>

          <p className="panel-note leaderboard-footnote">Scores are recalculated from valid submitted responses. New evaluations appear automatically.</p>
        </GlassCard>
      )}
    </AppShell>
  );
}
