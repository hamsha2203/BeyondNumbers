"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell, GlassCard, StatusPill } from "@/app/components/ui";

export default function PmPortalPage() {
  const [deadline, setDeadline] = useState("");
  const [message, setMessage] = useState("");
  const [published, setPublished] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("bn-role") !== "PM") {
      window.location.href = "/evaluate";
      return;
    }

    setDeadline(window.localStorage.getItem("bn-deadline") || "");
    setPublished(window.localStorage.getItem("bn-published") === "yes");
  }, []);

  const saveDeadline = () => {
    if (!deadline || Number.isNaN(new Date(deadline).getTime())) {
      setMessage("Choose a valid deadline before saving.");
      return;
    }
    window.localStorage.setItem("bn-deadline", deadline);
    window.localStorage.removeItem("bn-published");
    setPublished(false);
    setMessage("Deadline saved. Publication reset until the cycle closes.");
  };

  const publish = () => {
    if (!deadline || new Date(deadline).getTime() > Date.now()) {
      setMessage("Publication is locked until the configured deadline passes.");
      return;
    }

    window.localStorage.setItem("bn-published", "yes");
    setPublished(true);
    setMessage("Publication approved. The public dashboard is now live.");
  };

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
          <p className="eyebrow">PM / admin</p>
          <h1>Private command center</h1>
        </div>
        <StatusPill label={published ? "Published" : "Draft"} tone={published ? "success" : "muted"} />
      </section>

      <div className="pm-grid">
        <GlassCard className="pm-card">
          <h2>Deadline</h2>
          <label htmlFor="deadline-input">Close grading at</label>
          <input
            id="deadline-input"
            type="datetime-local"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
          />
          <button type="button" className="cta-button primary full" onClick={saveDeadline}>
            Save deadline
          </button>
        </GlassCard>

        <GlassCard className="pm-card">
          <h2>Publication</h2>
          <p>
            {published ? "The leaderboard is already approved." : "Publication stays locked until the deadline passes."}
          </p>
          <button type="button" className="cta-button primary full" onClick={publish}>
            Approve &amp; publish
          </button>
        </GlassCard>
      </div>

      {message ? <div className="system-message">{message}</div> : null}
    </AppShell>
  );
}
