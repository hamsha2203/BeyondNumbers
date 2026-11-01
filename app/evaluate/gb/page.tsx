"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ClipboardList, LockKeyhole, Search, Users } from "lucide-react";
import { activeMembers, mbAssignments, memberTeams } from "@/lib/members";

export default function EvaluateGBPage() {
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const selected = activeMembers.find((member) => member.id === selectedId);
  const assignedGBs = useMemo(() => {
    if (!selected || selected.role !== "MB") return [];
    const ids = mbAssignments.filter((a) => a.evaluatorId === selected.id).map((a) => a.subjectId);
    return activeMembers.filter((m) => ids.includes(m.id) && m.role === "GB" && m.name.toLowerCase().includes(search.toLowerCase()));
  }, [selected, search]);
  const teamName = memberTeams.find((team) => team.leaderId === selected?.id)?.name;

  return (
    <main className="eval-page">
      <div className="eval-top"><Link href="/evaluate" className="eval-brand"><ArrowLeft size={15} /> BACK TO WORKFLOWS</Link><span className="preview-pill">MB → GB · PREVIEW</span></div>
      <section className="eval-intro eval-intro-small"><span className="tiny-label">WORKFLOW 01 / MEMBER EVALUATION</span><h1>Your team,<br /><em>your impact.</em></h1><p>Select your name to preview the GBs assigned to you.</p></section>
      <section className="eval-panel">
        <label htmlFor="mb-select">Select your name <span>*</span></label>
        <select id="mb-select" value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setSearch(""); }}>
          <option value="">Choose an MB…</option>
          {activeMembers.filter((m) => m.role === "MB").map((m) => <option key={m.id} value={m.id}>{m.name} — {m.department}</option>)}
        </select>
        {selected ? <div className="selected-member"><div className="member-initials">{selected.name.split(" ").map((n) => n[0]).join("")}</div><div><strong>{selected.name}</strong><small>Member · {selected.department}</small></div><span className="assignment-count">{assignedGBs.length} shown</span></div> : <div className="select-hint"><Users size={18} /><span>Your assigned GBs will appear here after you select your name.</span></div>}
      </section>
      {selected && <section className="assigned-section"><div className="assigned-heading"><div><span className="tiny-label">YOUR ASSIGNMENTS</span><h2>GBs to evaluate <span>{assignedGBs.length}</span></h2>{teamName && <p className="team-name">{teamName}</p>}</div><div className="search-field"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a GB…" aria-label="Search assigned GBs" /></div></div>
        {assignedGBs.length ? <div className="assigned-grid">{assignedGBs.map((gb) => <article className="assigned-card" key={gb.id}><div className="assigned-card-top"><div className="member-initials">{gb.name.split(" ").map((n) => n[0]).join("")}</div><span className="status-chip"><span /> Assigned</span></div><h3>{gb.name}</h3><p>{gb.department} · General Body</p><button className="evaluation-open" onClick={() => { window.location.href = `/grade?subject=${gb.id}&evaluator=${selected.id}&role=MB`; }}>Open evaluation <ArrowRight size={15} /></button></article>)}</div> : <div className="empty-assignment"><ClipboardList size={22} /><strong>No matching assignments</strong><p>Try a different search or contact the PM if you think an assignment is missing.</p></div>}
      </section>}
      <div className="security-note"><LockKeyhole size={16} /><span><strong>Secure by design.</strong> This dropdown is a preview only. In production, the server must identify the signed-in MB and return only that account’s assigned GBs.</span></div>
    </main>
  );
}
