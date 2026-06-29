// src/routes/live.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { Tv2, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/live")({
  head: () => ({ meta: [{ title: "Live — Friends Pool" }] }),
  component: LivePage,
});

// ─── EDGE FUNCTION ────────────────────────────────────────────────────────────
const PROXY = "https://dtaseikeklfsknemnpus.supabase.co/functions/v1/live-proxy";

// ─── TIMING (localStorage) ────────────────────────────────────────────────────
const FIXTURES_TTL = 30 * 60 * 1000;       // 30 minuti
const ODDS_TTL     = 24 * 60 * 60 * 1000;  // 24 ore

// ─── LOCALSTORAGE KEYS ────────────────────────────────────────────────────────
const LS_FIX    = "wc2026_fixtures";
const LS_FIX_TS = "wc2026_fixtures_ts";
const LS_ODDS    = "wc2026_odds";
const LS_ODDS_TS = "wc2026_odds_ts";

// ─── STATUS ───────────────────────────────────────────────────────────────────
const LIVE_ST     = ["1H", "2H", "HT", "ET", "BT", "P", "INT", "LIVE"] as const;
const FINISHED_ST = ["FT", "AET", "PEN"] as const;

const isLive     = (s: string) => (LIVE_ST as readonly string[]).includes(s);
const isFinished = (s: string) => (FINISHED_ST as readonly string[]).includes(s);

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Odds {
  matchId: number;
  bet1: number;
  betX: number;
  bet2: number;
  bookmaker?: string;
}

interface Match {
  id: number;
  homeTeam: string;
  homeLogo: string;
  awayTeam: string;
  awayLogo: string;
  date: string;
  time: string;
  round: string;
  status: "live" | "future" | "finished";
  statusShort: string;
  score?: { home: number; away: number };
  odds?: Odds;
}

interface OddsEvent {
  id: string;
  home_team: string;
  away_team: string;
  bookmakers: {
    title: string;
    markets: {
      key: string;
      outcomes: { name: string; price: number }[];
    }[];
  }[];
}

// ─── CACHE ────────────────────────────────────────────────────────────────────
function readCache<T>(key: string, tsKey: string, ttl: number): T | null {
  try {
    const ts = localStorage.getItem(tsKey);
    if (!ts || Date.now() - Number(ts) > ttl) return null;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

function writeCache(key: string, tsKey: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(tsKey, String(Date.now()));
  } catch {}
}

// ─── TEAM NAME MATCH ──────────────────────────────────────────────────────────
function norm(n: string): string {
  return n.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ").trim();
}
function teamsMatch(a: string, b: string): boolean {
  const na = norm(a), nb = norm(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

// ─── API CALLS ────────────────────────────────────────────────────────────────
async function apiFetchFixtures(): Promise<Match[]> {
  const res = await fetch(`${PROXY}?source=fixtures`);
  if (!res.ok) throw new Error(`Fixtures: HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`Fixtures: ${json.error}`);
  if (!Array.isArray(json.response) || json.response.length === 0)
    throw new Error("Nessuna partita ricevuta da API-Football.");

  return (json.response as any[]).map((item): Match => {
    const f      = item.fixture;
    const teams  = item.teams;
    const goals  = item.goals;
    const league = item.league;
    const short: string = f.status?.short ?? "NS";
    const kickoff = new Date(f.date);

    let status: "live" | "future" | "finished";
    if (isLive(short))         status = "live";
    else if (isFinished(short)) status = "finished";
    else                        status = "future";

    return {
      id: f.id,
      homeTeam: teams.home.name,
      homeLogo: teams.home.logo ?? "",
      awayTeam: teams.away.name,
      awayLogo: teams.away.logo ?? "",
      date: f.date,
      time: kickoff.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
      round: league.round ?? "Group Stage",
      status,
      statusShort: short,
      score: (status === "finished" || status === "live")
        ? { home: goals.home ?? 0, away: goals.away ?? 0 }
        : undefined,
    };
  });
}

async function apiFetchOdds(): Promise<OddsEvent[]> {
  const res = await fetch(`${PROXY}?source=odds`);
  if (!res.ok) throw new Error(`Odds: HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`Odds: ${json.error}`);
  return Array.isArray(json) ? json : [];
}

function mergeOdds(matches: Match[], events: OddsEvent[]): Match[] {
  return matches.map((m) => {
    if (m.status === "finished") return m;
    const ev = events.find((e) =>
      (teamsMatch(e.home_team, m.homeTeam) && teamsMatch(e.away_team, m.awayTeam)) ||
      (teamsMatch(e.home_team, m.awayTeam) && teamsMatch(e.away_team, m.homeTeam))
    );
    if (!ev) return m;
    const bm  = ev.bookmakers[0];
    if (!bm)  return m;
    const mkt = bm.markets.find((x) => x.key === "h2h");
    if (!mkt) return m;
    const home = mkt.outcomes.find((o) => teamsMatch(o.name, m.homeTeam));
    const draw = mkt.outcomes.find((o) => o.name.toLowerCase() === "draw");
    const away = mkt.outcomes.find((o) => teamsMatch(o.name, m.awayTeam));
    if (!home || !draw || !away) return m;
    return {
      ...m,
      odds: {
        matchId: m.id,
        bet1: home.price,
        betX: draw.price,
        bet2: away.price,
        bookmaker: bm.title,
      },
    };
  });
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function fmtDay(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("it-IT", {
    weekday: "short", day: "numeric", month: "short",
  });
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function LiveBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider"
      style={{
        background: "rgba(239,68,68,0.15)",
        color: "#ef4444",
        border: "1px solid rgba(239,68,68,0.4)",
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
      LIVE
    </span>
  );
}

function TeamDisplay({
  name, logo, align,
}: {
  name: string; logo: string; align: "left" | "right";
}) {
  return (
    <div className={`flex flex-1 items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
      {logo && (
        <img
          src={logo}
          alt={name}
          className="h-7 w-7 object-contain shrink-0"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      )}
      <span className="text-sm font-semibold text-white leading-tight">{name}</span>
    </div>
  );
}

// Partita LIVE — badge + squadre + orario + quote inline (niente score, niente stats)
function LiveMatchCard({ match }: { match: Match }) {
  return (
    <div
      className="rounded-2xl border px-5 py-4"
      style={{
        borderColor: "rgba(239,68,68,0.35)",
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 0 30px rgba(239,68,68,0.08)",
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span
          className="text-xs font-medium uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          {match.round}
        </span>
        <LiveBadge />
      </div>

      <div className="flex items-center gap-3">
        <TeamDisplay name={match.homeTeam} logo={match.homeLogo} align="left" />

        <div className="flex min-w-[72px] flex-col items-center gap-1">
          <span
            className="text-base font-semibold tabular-nums"
            style={{ color: "rgba(255,255,255,0.65)" }}
          >
            {match.time}
          </span>
          {match.odds && (
            <div className="flex gap-1 text-[10px]" style={{ color: "rgba(255,215,0,0.75)" }}>
              <span>{match.odds.bet1.toFixed(2)}</span>
              <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
              <span>{match.odds.betX.toFixed(2)}</span>
              <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
              <span>{match.odds.bet2.toFixed(2)}</span>
            </div>
          )}
        </div>

        <TeamDisplay name={match.awayTeam} logo={match.awayLogo} align="right" />
      </div>
    </div>
  );
}

// Partita FUTURA — espandibile per le quote
function FutureMatchCard({ match }: { match: Match }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{
        borderColor: "rgba(255,255,255,0.08)",
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(14px)",
      }}
    >
      <button
        onClick={() => match.odds && setOpen((v) => !v)}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
          match.odds ? "hover:bg-white/5 cursor-pointer" : "cursor-default"
        }`}
      >
        <TeamDisplay name={match.homeTeam} logo={match.homeLogo} align="left" />

        <div className="flex min-w-[90px] flex-col items-center gap-0.5">
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            {fmtDay(match.date)}
          </span>
          <span className="text-sm font-bold tabular-nums text-white">
            {match.time}
          </span>
        </div>

        <TeamDisplay name={match.awayTeam} logo={match.awayLogo} align="right" />

        {match.odds ? (
          open
            ? <ChevronUp  className="h-4 w-4 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
            : <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
        ) : (
          <span className="w-4 shrink-0" />
        )}
      </button>

      {open && match.odds && (
        <div
          className="border-t px-4 py-3"
          style={{ borderColor: "rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center justify-around">
            {([
              { label: "1", value: match.odds.bet1 },
              { label: "X", value: match.odds.betX },
              { label: "2", value: match.odds.bet2 },
            ] as const).map((o) => (
              <div key={o.label} className="flex flex-col items-center gap-1">
                <span
                  className="text-[11px] font-bold uppercase"
                  style={{ color: "rgba(255,215,0,0.7)" }}
                >
                  {o.label}
                </span>
                <span
                  className="rounded-lg px-3 py-1 text-sm font-bold text-white tabular-nums"
                  style={{ background: "rgba(255,255,255,0.07)" }}
                >
                  {o.value.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          {match.odds.bookmaker && (
            <p
              className="mt-2 text-center text-[10px]"
              style={{ color: "rgba(255,255,255,0.2)" }}
            >
              {match.odds.bookmaker}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Partita FINITA — score finale, non espandibile
function FinishedMatchCard({ match }: { match: Match }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border px-4 py-3"
      style={{
        borderColor: "rgba(255,255,255,0.06)",
        background: "rgba(0,0,0,0.25)",
        backdropFilter: "blur(12px)",
      }}
    >
      <TeamDisplay name={match.homeTeam} logo={match.homeLogo} align="left" />

      <div className="flex min-w-[80px] flex-col items-center">
        <span className="text-lg font-bold tabular-nums text-white">
          {match.score?.home ?? 0} – {match.score?.away ?? 0}
        </span>
        <span
          className="text-[10px] font-semibold uppercase"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          {match.statusShort}
        </span>
      </div>

      <TeamDisplay name={match.awayTeam} logo={match.awayLogo} align="right" />
    </div>
  );
}

// Sezione collassabile generica (Future / Risultati)
function Section({
  title, count, accent, children,
}: {
  title: string; count: number; accent: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-colors hover:bg-white/5"
        style={{
          borderColor: "rgba(255,255,255,0.08)",
          background: "rgba(0,0,0,0.3)",
          backdropFilter: "blur(12px)",
        }}
      >
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: accent }}>
          {title} — {count}
        </span>
        {open
          ? <ChevronUp   className="h-4 w-4" style={{ color: "rgba(255,255,255,0.35)" }} />
          : <ChevronDown className="h-4 w-4" style={{ color: "rgba(255,255,255,0.35)" }} />}
      </button>
      {open && <div className="mt-2 space-y-2">{children}</div>}
    </section>
  );
}

// ─── PAGINA ───────────────────────────────────────────────────────────────────
function LivePage() {
  const { user, ready } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !user) navigate({ to: "/" });
  }, [ready, user, navigate]);

  const [matches, setMatches]         = useState<Match[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function loadData(force = false) {
    setError(null);
    try {
      // 1. Fixtures (cache 30 min)
      let fixtures = force
        ? null
        : readCache<Match[]>(LS_FIX, LS_FIX_TS, FIXTURES_TTL);

      if (!fixtures) {
        fixtures = await apiFetchFixtures();
        writeCache(LS_FIX, LS_FIX_TS, fixtures);
      }

      // 2. Odds (cache 24h) — solo se ci sono partite non finite
      const needOdds = fixtures.some((m) => m.status !== "finished");
      let oddsEvents: OddsEvent[] = [];

      if (needOdds) {
        const cached = force
          ? null
          : readCache<OddsEvent[]>(LS_ODDS, LS_ODDS_TS, ODDS_TTL);

        if (cached) {
          oddsEvents = cached;
        } else {
          try {
            oddsEvents = await apiFetchOdds();
            writeCache(LS_ODDS, LS_ODDS_TS, oddsEvents);
          } catch (e) {
            // Le odds non sono bloccanti
            console.warn("[live] odds fetch fallito:", e);
          }
        }
      }

      // 3. Merge
      setMatches(mergeOdds(fixtures, oddsEvents));
      setLastUpdated(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  // ─── Filtraggio ───────────────────────────────────────────────────────────
  const liveMatch = matches
    .filter((m) => m.status === "live")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] ?? null;

  const futureMatches = matches
    .filter((m) => m.status === "future")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const finishedMatches = matches
    .filter((m) => m.status === "finished")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (!ready || !user) return null;

  return (
    <AppShell>
      <div className="space-y-6">

        {/* Header */}
        <header className="flex items-start justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-white">
              <Tv2 className="h-6 w-6" style={{ color: "#FFD700" }} />
              Live &amp; Fixtures
            </h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
              FIFA World Cup 2026
              {lastUpdated && (
                <span style={{ color: "rgba(255,255,255,0.25)" }}>
                  {" "}· {lastUpdated.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </p>
          </div>

          <button
            onClick={() => { setLoading(true); loadData(true); }}
            disabled={loading}
            className="mt-1 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5 disabled:opacity-40"
            style={{ borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Aggiorna
          </button>
        </header>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-16">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2"
              style={{ borderColor: "rgba(255,215,0,0.3)", borderTopColor: "#FFD700" }}
            />
          </div>
        )}

        {/* Errore */}
        {!loading && error && (
          <div
            className="rounded-xl border px-5 py-4 text-sm"
            style={{
              borderColor: "rgba(239,68,68,0.3)",
              background: "rgba(239,68,68,0.06)",
            }}
          >
            <p className="font-medium text-red-400">Errore nel caricamento</p>
            <p className="mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>{error}</p>
            <button
              onClick={() => { setLoading(true); loadData(true); }}
              className="mt-3 text-xs font-medium underline"
              style={{ color: "rgba(255,215,0,0.7)" }}
            >
              Riprova
            </button>
          </div>
        )}

        {/* Vuoto */}
        {!loading && !error && matches.length === 0 && (
          <div
            className="rounded-xl border px-5 py-12 text-center text-sm"
            style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}
          >
            Nessuna partita disponibile.
          </div>
        )}

        {/* Contenuto */}
        {!loading && !error && matches.length > 0 && (
          <div className="space-y-4">

            {/* LIVE */}
            {liveMatch && <LiveMatchCard match={liveMatch} />}

            {/* FUTURE */}
            {futureMatches.length > 0 && (
              <Section
                title="Partite Future"
                count={futureMatches.length}
                accent="rgba(255,215,0,0.75)"
              >
                {futureMatches.map((m) => <FutureMatchCard key={m.id} match={m} />)}
              </Section>
            )}

            {/* RISULTATI */}
            {finishedMatches.length > 0 && (
              <Section
                title="Risultati"
                count={finishedMatches.length}
                accent="rgba(255,255,255,0.4)"
              >
                {finishedMatches.map((m) => <FinishedMatchCard key={m.id} match={m} />)}
              </Section>
            )}

          </div>
        )}
      </div>
    </AppShell>
  );
}