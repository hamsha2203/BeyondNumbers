"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";

export function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass-card ${className}`.trim()}>{children}</div>;
}

export function StatusPill({ label, tone = "default" }: { label: string; tone?: "default" | "success" | "warning" | "muted" }) {
  return <span className={`status-pill status-pill-${tone}`}>{label}</span>;
}

export function CountdownChip() {
  const [text, setText] = useState("Deadline pending");

  useEffect(() => {
    const update = () => {
      const raw = window.localStorage.getItem("bn-deadline");
      if (!raw) {
        setText("Deadline pending");
        return;
      }

      const timeLeft = new Date(raw).getTime() - Date.now();
      if (timeLeft <= 0) {
        setText("Deadline closed");
        return;
      }

      const days = Math.floor(timeLeft / 86400000);
      const hours = Math.floor((timeLeft % 86400000) / 3600000);
      const minutes = Math.floor((timeLeft % 3600000) / 60000);
      const seconds = Math.floor((timeLeft % 60000) / 1000);
      setText(`${days}d ${hours}h ${minutes}m ${seconds}s`);
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <span className="countdown-chip">{text}</span>;
}

export function AppShell({
  children,
  action,
  small,
}: {
  children: ReactNode;
  action?: ReactNode;
  small?: boolean;
}) {
  return (
    <div className="app-shell">
      <div className="background-web" aria-hidden="true" />
      <header className="topbar">
        <Link href="/" className="brand-block" aria-label="Back to home">
          <span className="brand-mark">B</span>
          <span>
            BEYOND <strong>NUMBERS</strong>
            <small>AIESEC IN AMARAVATI</small>
          </span>
        </Link>

        <div className="topbar-actions">
          <CountdownChip />
          {action ?? (
            <Link href="/" className="mini-link">
              Home
            </Link>
          )}
        </div>
      </header>

      <main className={`page-shell ${small ? "page-shell-small" : ""}`}>{children}</main>
    </div>
  );
}
