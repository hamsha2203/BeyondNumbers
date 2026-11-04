"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell, GlassCard } from "@/app/components/ui";

const roleLabels = {
  VP: "Vice President",
  MB: "Member Body",
  PM: "PM / Admin",
} as const;

export default function EvaluateHomePage() {
  const [role, setRole] = useState<"VP" | "MB" | "PM" | "">("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const enterPortal = async () => {
    if (!role) {
      setError("Choose a role to continue.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      if (role === "PM") {
        const response = await fetch("/api/admin/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Could not unlock the PM portal.");
        }
      } else {
        const expected = role === "VP" ? "ACE" : "killbill";
        if (password !== expected) {
          throw new Error("That password does not match this portal.");
        }
      }

      sessionStorage.setItem("bn-role", role);
      const destination = role === "VP" ? "/portal/vp" : role === "MB" ? "/portal/mb" : "/portal/pm";
      window.location.assign(destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock this portal.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      action={
        <Link href="/" className="mini-link">
          Back to Home
        </Link>
      }
    >
      <section className="portal-shell">
        <div className="stepper" aria-label="Authentication steps">
          <span className={role ? "active" : ""}>1. Choose role</span>
          <span className={role ? "active" : ""}>2. Unlock portal</span>
        </div>

        {!role ? (
          <div className="role-grid">
            {(["VP", "MB", "PM"] as const).map((entry) => (
              <GlassCard key={entry} className="role-card">
                <div className="role-label">{entry === "PM" ? "Private command center" : entry === "VP" ? "Department leadership" : "General membership"}</div>
                <h2>{entry === "PM" ? "PM / Admin" : entry}</h2>
                <p>
                  {entry === "VP"
                    ? "View and grade the MBs assigned to your department."
                    : entry === "MB"
                      ? "Review the GBs assigned to your department."
                      : "Manage the cycle, track progress, and approve publication."}
                </p>
                <button
                  type="button"
                  className="cta-button primary full"
                  onClick={() => {
                    setRole(entry);
                    setPassword("");
                    setError("");
                  }}
                >
                  Continue as {entry}
                </button>
              </GlassCard>
            ))}
          </div>
        ) : (
          <GlassCard className="auth-card">
            <div className="card-badge">{roleLabels[role]} access</div>
            <h2>{role} portal</h2>
            <label htmlFor="portal-password">Password</label>
            <input
              id="portal-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void enterPortal()}
              placeholder="Enter portal password"
            />
            {error ? <p className="input-error">{error}</p> : null}
            <div className="auth-actions">
              <button type="button" className="ghost-button" onClick={() => setRole("")}>
                Back
              </button>
              <button
                type="button"
                className="cta-button primary"
                disabled={submitting}
                onClick={() => void enterPortal()}
              >
                {submitting ? "Checking..." : "Unlock portal"}
              </button>
            </div>
          </GlassCard>
        )}
      </section>
    </AppShell>
  );
}