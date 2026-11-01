import Link from "next/link";
import { AppShell, GlassCard } from "@/app/components/ui";

export default function HomePage() {
  return (
    <AppShell>
      <section className="home-hero">
        <p className="eyebrow">AIESEC in Amaravati — Rewards &amp; Recognition</p>
        <h1>Beyond Numbers</h1>
        <div className="home-grid">
          <GlassCard className="home-card">
            <div className="card-badge">Portal access</div>
            <h2>Evaluator Login</h2>
            <p>Choose a role, verify the demo password, and continue to the relevant evaluation workspace.</p>
            <Link href="/evaluate" className="cta-button primary">
              Open evaluator portal
            </Link>
          </GlassCard>

          <GlassCard className="home-card">
            <div className="card-badge">Public view</div>
            <h2>Public Dashboard</h2>
            <p>See the approved leaderboard only after the deadline closes and the PM has explicitly published it.</p>
            <Link href="/dashboard" className="cta-button secondary">
              View dashboard
            </Link>
          </GlassCard>
        </div>
      </section>
    </AppShell>
  );
}
