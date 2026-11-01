"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell, GlassCard, StatusPill } from "@/app/components/ui";
import { activeMembers, vpAssignments } from "@/lib/members";

export default function VpPortalPage() {
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("bn-role") !== "VP") {
      window.location.href = "/evaluate";
      return;
    }
    setReady(true);
  }, []);

  const selected = activeMembers.find((member) => member.id === selectedId);
  const assignedMBs = useMemo(() => {
    if (!selected || selected.role !== "VP") return [];

    const ids = vpAssignments
      .filter((assignment) => assignment.evaluatorId === selected.id)
      .map((assignment) => assignment.subjectId);

    return activeMembers.filter(
      (member) =>
        ids.includes(member.id) &&
        member.role === "MB" &&
        member.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, selected]);

  if (!ready) return null;

  return (
    <AppShell
      small
      action={
        <Link href="/" className="mini-link">
          Home
        </Link>
      }
    >
      <section className="page-header compact-header">
        <div>
          <p className="eyebrow">VP portal</p>
          <h1>Assigned MBs</h1>
        </div>
        <StatusPill label="Role locked" tone="muted" />
      </section>

      <GlassCard className="portal-card">
        <label htmlFor="vp-select">Select your name</label>
        <select id="vp-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">Choose a VP…</option>
          {activeMembers
            .filter((member) => member.role === "VP")
            .map((member) => (
              <option value={member.id} key={member.id}>
                {member.name} — {member.department}
              </option>
            ))}
        </select>

        {selected ? (
          <div className="selected-member-box">
            <span className="avatar">{selected.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
            <div>
              <strong>{selected.name}</strong>
              <small>{selected.department}</small>
            </div>
            <StatusPill label={`${assignedMBs.length} shown`} tone="default" />
          </div>
        ) : (
          <div className="empty-inline">Select a VP to view their assigned MBs.</div>
        )}
      </GlassCard>

      {selected && (
        <section className="list-panel">
          <div className="list-header">
            <div>
              <p className="eyebrow">Assignments</p>
              <h2>MBs to evaluate</h2>
            </div>
            <div className="search-box">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search MBs" />
            </div>
          </div>

          {assignedMBs.length > 0 ? (
            <div className="assignment-grid">
              {assignedMBs.map((member) => (
                <GlassCard key={member.id} className="assignment-card">
                  <div className="assignment-top">
                    <span className="avatar small">{member.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
                    <StatusPill label="Assigned" tone="success" />
                  </div>
                  <h3>{member.name}</h3>
                  <p>
                    {member.department} · Management Body
                  </p>
                  <a href={`/grade?subject=${member.id}&evaluator=${selected.id}&role=VP`} className="cta-button primary full">
                    Open evaluation
                  </a>
                </GlassCard>
              ))}
            </div>
          ) : (
            <GlassCard className="empty-panel">
              No MB assignments match the current selection.
            </GlassCard>
          )}
        </section>
      )}
    </AppShell>
  );
}
