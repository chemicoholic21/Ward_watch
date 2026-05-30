'use client';

import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface GhostOffice {
  office_id: string;
  department: string;
  ward_name: string;
  zone: string;
  ghost_score: number;
  alert_level: 'critical' | 'high' | 'medium' | 'low';
  complaint_stats: { total: number; open: number; overdue: number };
}

interface ScamReport {
  report_id: string;
  content: string;
  spoofed_department: string;
  risk_level: 'critical' | 'high' | 'medium' | 'low';
  trust_score: number;
  victim_reports: number;
  related_outage: { is_correlated: boolean };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiny icon set — minimal, 1.25px stroke, no flourishes.
// ─────────────────────────────────────────────────────────────────────────────
const Icon = {
  Dot: () => <span className="inline-block w-1 h-1 rounded-full bg-current align-middle" />,
  ArrowRight: ({ className = 'w-3 h-3' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  ArrowUp: ({ className = 'w-3 h-3' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  ),
  ArrowDown: ({ className = 'w-3 h-3' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  ),
  Search: ({ className = 'w-4 h-4' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  ),
  Spark: ({ className = 'w-3 h-3' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6z" />
    </svg>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [ghostOffices, setGhostOffices] = useState<GhostOffice[]>([]);
  const [scamReports, setScamReports] = useState<ScamReport[]>([]);
  const [analyzeInput, setAnalyzeInput] = useState('');
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const stats = { complaints: 5247, ghostCount: 2, scamCount: 3, avgDays: 8.3 };

  useEffect(() => {
    (async () => {
      try {
        const [g, s] = await Promise.all([
          fetch(`${API_URL}/api/ghost-offices?limit=10`).catch(() => null),
          fetch(`${API_URL}/api/trustlens/reports?limit=5`).catch(() => null),
        ]);
        if (g?.ok) {
          const data = await g.json();
          if (data.data?.length) setGhostOffices(data.data);
        }
        if (s?.ok) {
          const data = await s.json();
          if (data.data?.length) setScamReports(data.data);
        }
      } catch {}
      setIsLoading(false);
    })();
  }, []);

  async function analyzeMessage() {
    if (!analyzeInput.trim()) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${API_URL}/api/trustlens/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: analyzeInput }),
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysisResult(data.data);
      }
    } catch {}
    setIsAnalyzing(false);
  }

  // ── Fallback demo data so the UI is never empty ──────────────────────────
  const demoGhosts: GhostOffice[] = [
    { office_id: '1', department: 'BBMP', ward_name: 'Mahadevapura', zone: 'East', ghost_score: 92.4, alert_level: 'critical', complaint_stats: { total: 187, open: 142, overdue: 89 } },
    { office_id: '2', department: 'BWSSB', ward_name: 'HSR Layout', zone: 'South', ghost_score: 87.1, alert_level: 'critical', complaint_stats: { total: 156, open: 118, overdue: 72 } },
    { office_id: '3', department: 'BESCOM', ward_name: 'Whitefield', zone: 'East', ghost_score: 79.8, alert_level: 'high', complaint_stats: { total: 134, open: 98, overdue: 56 } },
    { office_id: '4', department: 'BBMP', ward_name: 'Koramangala', zone: 'South', ghost_score: 72.3, alert_level: 'high', complaint_stats: { total: 98, open: 67, overdue: 41 } },
    { office_id: '5', department: 'BWSSB', ward_name: 'Indiranagar', zone: 'East', ghost_score: 65.9, alert_level: 'medium', complaint_stats: { total: 76, open: 45, overdue: 28 } },
  ];
  const demoScams: ScamReport[] = [
    { report_id: '1', content: 'BESCOM Alert: Power disconnection in 2 hours. Pay Rs. 1500 at bit.ly/bescom-pay', spoofed_department: 'BESCOM', risk_level: 'critical', trust_score: 8, victim_reports: 23, related_outage: { is_correlated: true } },
    { report_id: '2', content: 'BWSSB: Water connection will be cut. Clear dues via UPI: 9876543210@paytm', spoofed_department: 'BWSSB', risk_level: 'critical', trust_score: 12, victim_reports: 15, related_outage: { is_correlated: false } },
    { report_id: '3', content: 'BBMP Property Tax: 50% penalty waiver if paid today. Contact 9988776655', spoofed_department: 'BBMP', risk_level: 'high', trust_score: 25, victim_reports: 8, related_outage: { is_correlated: false } },
  ];
  const displayGhosts = ghostOffices.length > 0 ? ghostOffices : demoGhosts;
  const displayScams = scamReports.length > 0 ? scamReports : demoScams;

  // ── Loading state — quiet, centered, no spinner clutter ───────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center animate-pulse-soft">
          <div className="display text-5xl text-fg mb-3">GhostOffice</div>
          <div className="label">Loading</div>
        </div>
      </div>
    );
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg text-fg">
      <Header />
      <Nav active={activeTab} onChange={setActiveTab} criticalCount={displayGhosts.filter(g => g.alert_level === 'critical').length} scamCount={displayScams.length} />

      <main className="mx-auto max-w-6xl px-6 sm:px-10 py-12 sm:py-16 animate-fade-in">
        {/* ── Hero stats ──────────────────────────────────────────────────── */}
        <section className="mb-16 sm:mb-20">
          <p className="label mb-2">Bengaluru · Last 30 days</p>
          <h1 className="display text-display sm:text-display-lg text-fg mb-12 max-w-3xl">
            Civic accountability,
            <br />
            <span className="text-fg-muted">in real numbers.</span>
          </h1>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line">
            <Stat label="Total complaints"  value={stats.complaints.toLocaleString()} delta="+12.5%"    trend="up"   />
            <Stat label="Ghost offices"     value={displayGhosts.filter(g => g.alert_level === 'critical').length} delta="critical" trend="alert" />
            <Stat label="Active scam alerts" value={displayScams.length}              delta="threats"  trend="alert" />
            <Stat label="Avg resolution"    value={`${stats.avgDays}d`}              delta="-15%"     trend="down" />
          </div>
        </section>

        {/* ── Ghost office leaderboard ───────────────────────────────────── */}
        <Section title="Ghost office leaderboard" subtitle="Offices ranked by composite unresponsiveness score" right={<a href="#" className="text-fg-muted hover:text-fg text-sm transition-colors inline-flex items-center gap-1.5">View all <Icon.ArrowRight /></a>}>
          <div className="border-y border-line">
            {displayGhosts.slice(0, 5).map((office, idx) => (
              <OfficeRow key={office.office_id} rank={idx + 1} office={office} />
            ))}
          </div>
        </Section>

        {/* ── TrustLens ──────────────────────────────────────────────────── */}
        <Section title="TrustLens" subtitle="Paste a suspicious message to classify it">
          <div className="grid lg:grid-cols-5 gap-10">
            <div className="lg:col-span-3">
              <textarea
                value={analyzeInput}
                onChange={e => setAnalyzeInput(e.target.value)}
                placeholder="e.g. URGENT: BESCOM bill overdue, pay Rs. 500 via UPI to avoid disconnection…"
                rows={5}
                className="w-full bg-bg-input border border-line rounded-lg px-4 py-3 text-fg placeholder:text-fg-subtle text-sm resize-none focus:outline-none focus:border-line-strong transition-colors"
              />
              <button
                onClick={analyzeMessage}
                disabled={isAnalyzing || !analyzeInput.trim()}
                className="mt-4 px-5 h-10 rounded-lg bg-fg text-bg text-sm font-medium hover:bg-fg/90 disabled:bg-fg-subtle disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
              >
                {isAnalyzing ? 'Analyzing…' : <>Analyze <Icon.ArrowRight /></>}
              </button>

              {analysisResult && (
                <div className="mt-6 p-6 rounded-lg bg-bg-elevated border border-line animate-fade-in">
                  <div className="flex items-baseline justify-between mb-4">
                    <RiskBadge level={analysisResult.risk_level} />
                    <div className="text-right">
                      <div className="display text-3xl tabular">{analysisResult.trust_score}</div>
                      <div className="label text-[10px]">Trust score · /100</div>
                    </div>
                  </div>
                  <p className="text-sm text-fg-muted leading-relaxed">{analysisResult.explanation}</p>
                </div>
              )}
            </div>

            <div className="lg:col-span-2 lg:border-l lg:border-line lg:pl-10">
              <p className="label mb-4">Recent threats</p>
              <div className="space-y-5">
                {displayScams.slice(0, 3).map(scam => (
                  <ScamCard key={scam.report_id} scam={scam} />
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ── Civic health ───────────────────────────────────────────────── */}
        <Section title="Civic health" subtitle="Zone-level grades across complaint resolution metrics">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-line">
            {[
              { zone: 'East',    grade: 'C', score: 45.2, complaints: 1250, ghosts: 4 },
              { zone: 'West',    grade: 'B', score: 62.8, complaints: 980,  ghosts: 2 },
              { zone: 'North',   grade: 'D', score: 38.5, complaints: 1450, ghosts: 5 },
              { zone: 'South',   grade: 'B', score: 71.3, complaints: 850,  ghosts: 1 },
              { zone: 'Central', grade: 'C', score: 55.9, complaints: 720,  ghosts: 0 },
            ].map(z => (
              <ZoneCard key={z.zone} {...z} />
            ))}
          </div>
        </Section>

        {/* ── Agents ─────────────────────────────────────────────────────── */}
        <Section title="Intelligence agents" subtitle="Specialised tools for civic investigation">
          <div className="grid sm:grid-cols-2 gap-px bg-line">
            {[
              { name: 'Ghost Hunter',      desc: 'Detects unresponsive offices via complaint pattern analysis',  status: 'Active' },
              { name: 'Scam Detector',     desc: 'Classifies suspected fraud and impersonation messages',         status: 'Active' },
              { name: 'Escalation Tracer', desc: 'Maps complaint journeys to identify bottleneck departments',    status: 'Idle' },
              { name: 'RTI Drafter',       desc: 'Generates RTI applications with cited evidence',                status: 'Idle' },
            ].map(a => <AgentCard key={a.name} {...a} />)}
          </div>
        </Section>
      </main>

      <Footer />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-bg/80 border-b border-line">
      <div className="mx-auto max-w-6xl px-6 sm:px-10 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="display text-lg text-fg">GhostOffice</div>
          <span className="text-fg-subtle text-xs">·</span>
          <span className="text-fg-muted text-xs">Civic Intelligence</span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-fg-muted">
          <Icon.Search />
          <input
            type="text"
            placeholder="Search complaints, wards, departments…"
            className="bg-transparent text-sm placeholder:text-fg-subtle focus:outline-none w-72"
          />
          <kbd className="text-[10px] text-fg-subtle border border-line px-1.5 rounded ml-2">⌘K</kbd>
        </div>
      </div>
    </header>
  );
}

function Nav({
  active,
  onChange,
  criticalCount,
  scamCount,
}: {
  active: string;
  onChange: (v: string) => void;
  criticalCount: number;
  scamCount: number;
}) {
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'ghost-offices', label: 'Ghost offices', count: criticalCount },
    { id: 'trustlens', label: 'TrustLens', count: scamCount },
    { id: 'complaints', label: 'Complaints' },
    { id: 'agents', label: 'Agents' },
  ];
  return (
    <nav className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 sm:px-10 flex gap-8 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`relative py-4 text-sm whitespace-nowrap transition-colors ${
              active === t.id ? 'text-fg' : 'text-fg-muted hover:text-fg'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="text-[10px] tabular text-fg-subtle">{t.count}</span>
              )}
            </span>
            {active === t.id && (
              <span className="absolute inset-x-0 -bottom-px h-px bg-fg" />
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}

function Stat({ label, value, delta, trend }: { label: string; value: string | number; delta?: string; trend?: 'up' | 'down' | 'alert' }) {
  const trendColor =
    trend === 'up' ? 'text-ok' : trend === 'down' ? 'text-ok' : trend === 'alert' ? 'text-critical' : 'text-fg-muted';
  const TrendIcon = trend === 'up' ? Icon.ArrowUp : trend === 'down' ? Icon.ArrowDown : null;

  return (
    <div className="bg-bg p-6 sm:p-8">
      <div className="label mb-3">{label}</div>
      <div className="display text-display-sm sm:text-display tabular text-fg">{value}</div>
      {delta && (
        <div className={`mt-3 text-xs inline-flex items-center gap-1 ${trendColor}`}>
          {TrendIcon && <TrendIcon />}
          <span className="tabular">{delta}</span>
        </div>
      )}
    </div>
  );
}

function Section({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-16 sm:mb-20">
      <div className="flex items-end justify-between mb-6 sm:mb-8">
        <div>
          <h2 className="text-xl sm:text-2xl font-medium text-fg tracking-tight">{title}</h2>
          {subtitle && <p className="text-sm text-fg-muted mt-1">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function OfficeRow({ rank, office }: { rank: number; office: GhostOffice }) {
  return (
    <div className="flex items-center gap-6 py-5 border-b border-line last:border-b-0 hover:bg-bg-elevated transition-colors group cursor-pointer">
      <div className="w-8 text-right tabular text-fg-subtle text-sm">{String(rank).padStart(2, '0')}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3">
          <span className="text-fg font-medium text-sm">{office.department}</span>
          <span className="text-fg-muted text-xs">{office.ward_name}</span>
          <span className="text-fg-subtle text-xs">·</span>
          <span className="text-fg-subtle text-xs">{office.zone}</span>
        </div>
        <div className="text-xs text-fg-subtle mt-1 tabular">
          {office.complaint_stats.open} open · {office.complaint_stats.overdue} overdue · {office.complaint_stats.total} total
        </div>
      </div>

      <div className="flex items-center gap-4">
        <ScoreBar value={office.ghost_score} />
        <div className="display text-2xl tabular w-16 text-right">{office.ghost_score.toFixed(1)}</div>
        <Icon.ArrowRight className="w-4 h-4 text-fg-subtle group-hover:text-fg transition-colors" />
      </div>
    </div>
  );
}

function ScoreBar({ value }: { value: number }) {
  const color = value >= 80 ? 'bg-critical' : value >= 60 ? 'bg-warn' : 'bg-fg-muted';
  return (
    <div className="w-24 h-1 rounded-full bg-bg-raised overflow-hidden hidden sm:block">
      <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
    </div>
  );
}

function RiskBadge({ level }: { level: 'critical' | 'high' | 'medium' | 'low' }) {
  const color = {
    critical: 'text-critical',
    high: 'text-warn',
    medium: 'text-warn',
    low: 'text-ok',
  }[level];
  return (
    <div className={`inline-flex items-center gap-2 ${color}`}>
      <Icon.Dot />
      <span className="text-xs font-medium uppercase tracking-widest">{level} risk</span>
    </div>
  );
}

function ScamCard({ scam }: { scam: ScamReport }) {
  return (
    <div className="border-b border-line pb-5 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between mb-2">
        <RiskBadge level={scam.risk_level} />
        {scam.related_outage.is_correlated && (
          <span className="text-[10px] text-warn inline-flex items-center gap-1 uppercase tracking-widest">
            <Icon.Spark /> Outage
          </span>
        )}
      </div>
      <p className="text-sm text-fg leading-relaxed line-clamp-2 mb-2">{scam.content}</p>
      <div className="flex items-center gap-3 text-xs text-fg-subtle tabular">
        <span>{scam.spoofed_department}</span>
        <span>·</span>
        <span>{scam.victim_reports} reports</span>
      </div>
    </div>
  );
}

function ZoneCard({ zone, grade, score, complaints, ghosts }: { zone: string; grade: string; score: number; complaints: number; ghosts: number }) {
  return (
    <div className="bg-bg p-6 hover:bg-bg-elevated transition-colors cursor-pointer">
      <div className="flex items-baseline justify-between mb-6">
        <div className="display text-3xl tabular text-fg">{grade}</div>
        <div className="label">{zone}</div>
      </div>
      <div className="text-sm text-fg-muted tabular">
        <div className="flex justify-between mb-1">
          <span>Score</span>
          <span className="text-fg">{score.toFixed(1)}</span>
        </div>
        <div className="flex justify-between mb-1">
          <span>Complaints</span>
          <span className="text-fg">{complaints.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span>Ghost offices</span>
          <span className={ghosts > 0 ? 'text-critical' : 'text-ok'}>{ghosts}</span>
        </div>
      </div>
    </div>
  );
}

function AgentCard({ name, desc, status }: { name: string; desc: string; status: string }) {
  const isActive = status === 'Active';
  return (
    <div className="bg-bg p-8 hover:bg-bg-elevated transition-colors cursor-pointer group">
      <div className="flex items-start justify-between mb-4">
        <div className="text-fg font-medium">{name}</div>
        <div className={`inline-flex items-center gap-2 text-[10px] uppercase tracking-widest ${isActive ? 'text-ok' : 'text-fg-subtle'}`}>
          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse-soft" />}
          {status}
        </div>
      </div>
      <p className="text-sm text-fg-muted leading-relaxed mb-6 max-w-md">{desc}</p>
      <div className="text-xs text-fg-subtle inline-flex items-center gap-1.5 group-hover:text-fg transition-colors">
        Open <Icon.ArrowRight />
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line mt-16">
      <div className="mx-auto max-w-6xl px-6 sm:px-10 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-fg-subtle">
        <div className="flex items-center gap-2">
          <span className="text-fg-muted">GhostOffice</span>
          <span>·</span>
          <span>v1.0</span>
          <span>·</span>
          <span>Bengaluru civic data</span>
        </div>
        <div className="flex gap-6">
          <a href="#" className="hover:text-fg transition-colors">Docs</a>
          <a href="#" className="hover:text-fg transition-colors">API</a>
          <a href="#" className="hover:text-fg transition-colors">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
