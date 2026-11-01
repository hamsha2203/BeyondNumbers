"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell, GlassCard, StatusPill } from "@/app/components/ui";
import { members, mbAssignments } from "@/lib/members";

export default function MbPortalPage() {
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("bn-role") !== "MB") {
      window.location.href = "/evaluate";
      return;
    }
    setReady(true);
  }, []);

  const selected = members.find((member) => member.id === selectedId);
  const assignedGBs = useMemo(() => {
    if (!selected || selected.role !== "MB") return [];

    const ids = mbAssignments
      .filter((assignment) => assignment.evaluatorId === selected.id)
      .map((assignment) => assignment.subjectId);

    return members.filter(
      (member) =>
        ids.includes(member.id) &&
        member.role === "GB" &&
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
          <p className="eyebrow">MB portal</p>
          <h1>Assigned GBs</h1>
        </div>
        <StatusPill label="Role locked" tone="muted" />
      </section>

      <GlassCard className="portal-card">
        <label htmlFor="mb-select">Select your name</label>
        <select id="mb-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">Choose an MB…</option>
          {members
            .filter((member) => member.role === "MB")
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
            <StatusPill label={`${assignedGBs.length} shown`} tone="default" />
          </div>
        ) : (
          <div className="empty-inline">Select an MB to view their assigned GBs.</div>
        )}
      </GlassCard>

      {selected && (
        <section className="list-panel">
          <div className="list-header">
            <div>
              <p className="eyebrow">Assignments</p>
              <h2>GBs to evaluate</h2>
            </div>
            <div className="search-box">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search GBs" />
            </div>
          </div>

          {assignedGBs.length > 0 ? (
            <div className="assignment-grid">
              {assignedGBs.map((member) => (
                <GlassCard key={member.id} className="assignment-card">
                  <div className="assignment-top">
                    <span className="avatar small">{member.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
                    <StatusPill label="Assigned" tone="success" />
                  </div>
                  <h3>{member.name}</h3>
                  <p>
                    {member.department} · General Body
                  </p>
                  <a href={`/grade?subject=${member.id}&evaluator=${selected.id}&role=MB`} className="cta-button primary full">
                    Open evaluation
                  </a>
                </GlassCard>
              ))}
            </div>
          ) : (
            <GlassCard className="empty-panel">
              No GB assignments match the current selection.
            </GlassCard>
          )}
        </section>
      )}
    </AppShell>
  );
}
