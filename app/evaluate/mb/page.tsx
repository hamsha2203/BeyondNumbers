"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ClipboardList, LockKeyhole, Search, Users } from "lucide-react";
import { members, vpAssignments } from "@/lib/members";

export default function EvaluateMBPage() {
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const selected = members.find((member) => member.id === selectedId);
  const assignedMBs = useMemo(() => {
    if (!selected || selected.role !== "VP") return [];
    const ids = vpAssignments.filter((a) => a.evaluatorId === selected.id).map((a) => a.subjectId);
    return members.filter((m) => ids.includes(m.id) && m.role === "MB" && m.name.toLowerCase().includes(search.toLowerCase()));
  }, [selected, search]);

  return (
    <main className="eval-page">
      <div className="eval-top"><Link href="/evaluate" className="eval-brand"><ArrowLeft size={15} /> BACK TO WORKFLOWS</Link><span className="preview-pill">VP → MB · PREVIEW</span></div>
      <section className="eval-intro eval-intro-small"><span className="tiny-label">WORKFLOW 02 / VP EVALUATION</span><h1>Lead with purpose.<br /><em>Recognize impact.</em></h1><p>Select your name to preview the MBs assigned to you.</p></section>
      <section className="eval-panel">
        <label htmlFor="vp-select">Select your name <span>*</span></label>
        <select id="vp-select" value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setSearch(""); }}>
          <option value="">Choose a VP…</option>
          {members.filter((m) => m.role === "VP").map((m) => <option key={m.id} value={m.id}>{m.name} — {m.department}</option>)}
        </select>
        {selected ? <div className="selected-member"><div className="member-initials">{selected.name.split(" ").map((n) => n[0]).join("")}</div><div><strong>{selected.name}</strong><small>Vice President · {selected.department}</small></div><span className="assignment-count">{assignedMBs.length} shown</span></div> : <div className="select-hint"><Users size={18} /><span>Your assigned MBs will appear here after you select your name.</span></div>}
      </section>
      {selected && <section className="assigned-section"><div className="assigned-heading"><div><span className="tiny-label">YOUR ASSIGNMENTS</span><h2>MBs to evaluate <span>{assignedMBs.length}</span></h2></div><div className="search-field"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find an MB…" aria-label="Search assigned MBs" /></div></div>
        {assignedMBs.length ? <div className="assigned-grid">{assignedMBs.map((mb) => <article className="assigned-card" key={mb.id}><div className="assigned-card-top"><div className="member-initials">{mb.name.split(" ").map((n) => n[0]).join("")}</div><span className="status-chip"><span /> Assigned</span></div><h3>{mb.name}</h3><p>{mb.department} · Management Body</p><button className="evaluation-open" onClick={() => { window.location.href = `/grade?subject=${mb.id}&evaluator=${selected.id}&role=VP`; }}>Open evaluation <ArrowRight size={15} /></button></article>)}</div> : <div className="empty-assignment"><ClipboardList size={22} /><strong>No matching assignments</strong><p>Try a different search or contact the PM if you think an assignment is missing.</p></div>}
      </section>}
      <div className="security-note"><LockKeyhole size={16} /><span><strong>Secure by design.</strong> This dropdown is a preview only. In production, the server must identify the signed-in VP and return only that account’s assigned MBs.</span></div>
    </main>
  );
}
