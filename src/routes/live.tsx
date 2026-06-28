import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { Tv2, ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/live")({
  head: () => ({ meta: [{ title: "Live — Friends Pool" }] }),
  component: LivePage,
});

// ─── API ────────────────────────────────────────────────────────────────────
const API_KEY = "a1f1e0b51ce623580370c313f8309213";
const API_BASE = "https://v3.football.api-sports.io";
const LEAGUE = 1;
const SEASON = 2026;
const POLL_MS = 6 * 60 * 1000; // 6 minuti
const KICKOFF_DELAY_MS = 60 * 1000; // 1 minuto dopo kickoff

// Status che indicano partita terminata
const FINISHED_STATUSES = ["FT", "AET", "PEN"];
// Status che indicano partita in corso
const LIVE_STATUSES = ["1H", "2H", "HT", "ET", "BT", "P", "INT", "LIVE"];

// ─── TIPI ───────────────────────────────────────────────────────────────────
type FixtureSummary = {
  id: number;
  date: string; // ISO
  round: string;
  statusShort: string;
  statusElapsed: number | null;
  homeTeam: string;
  homeLogo: string;
  awayTeam: string;
  awayLogo: string;
  homeGoals: number | null;
  awayGoals: number | null;
};

type FixtureStats = {
  fixtureId: number;
  statusShort: string;
  statusElapsed: number | null;
  homeGoals: number | null;
  awayGoals: number | null;
  stats: {
    home: Record<string, string | number | null>;
    away: Record<string, string | number | null>;
  };
  fetchedAt: number; // Date.now()
};

// ─── CACHE LOCALE ────────────────────────────────────────────────────────────
const LS_FIXTURES = "wc2026_fixtures";
const LS_FIXTURES_TS = "wc2026_last_fetch";
const LS_STATS_PREFIX = "wc2026_stats_";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function loadFixturesCache(): FixtureSummary[] | null {
  try {
    const ts = localStorage.getItem(LS_FIXTURES_TS);
    if (!ts || Date.now() - Number(ts) > ONE_DAY_MS) return null;
    const raw = localStorage.getItem(LS_FIXTURES);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveFixturesCache(fixtures: FixtureSummary[]) {
  try {
    localStorage.setItem(LS_FIXTURES, JSON.stringify(fixtures));
    localStorage.setItem(LS_FIXTURES_TS, String(Date.now()));
  } catch {}
}

function loadStatsCache(fixtureId: number): FixtureStats | null {
  try {
    const raw = localStorage.getItem(`${LS_STATS_PREFIX}${fixtureId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveStatsCache(stats: FixtureStats) {
  try {
    localStorage.setItem(`${LS_STATS_PREFIX}${stats.fixtureId}`, JSON.stringify(stats));
  } catch {}
}

// ─── FETCH API-FOOTBALL ──────────────────────────────────────────────────────
async function fetchAllFixtures(): Promise<FixtureSummary[]> {
  const res = await fetch(
    `${API_BASE}/fixtures?league=${LEAGUE}&season=${SEASON}`,
    { headers: { "x-apisports-key": API_KEY } }
  );
  const json = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json.response ?? []).map((f: any): FixtureSummary => ({
    id: f.fixture.id,
    date: f.fixture.date,
    round: f.league.round,
    statusShort: f.fixture.status.short,
    statusElapsed: f.fixture.status.elapsed,
    homeTeam: f.teams.home.name,
    homeLogo: f.teams.home.logo,
    awayTeam: f.teams.away.name,
    awayLogo: f.teams.away.logo,
    homeGoals: f.goals.home,
    awayGoals: f.goals.away,
  }));
}

async function findLiveFixtureId(): Promise<number | null> {
  const res = await fetch(
    `${API_BASE}/fixtures?live=all&league=${LEAGUE}`,
    { headers: { "x-apisports-key": API_KEY } }
  );
  const json = await res.json();
  if (!json.response?.length) return null;
  return json.response[0].fixture.id;
}

async function fetchFixtureStats(fixtureId: number): Promise<FixtureStats> {
  const res = await fetch(
    `${API_BASE}/fixtures?id=${fixtureId}`,
    { headers: { "x-apisports-key": API_KEY } }
  );
  const json = await res.json();
  console.log("[LIVE] risposta fetchFixtureStats:", json);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = json.response?.[0];
  if (!f) throw new Error("No fixture data");

  // Statistiche: array [{team, statistics: [{type, value}]}]
  const statsRaw: { home: Record<string, string | number | null>; away: Record<string, string | number | null> } = {
    home: {},
    away: {},
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (f.statistics ?? []).forEach((teamStat: any, idx: number) => {
    const side = idx === 0 ? "home" : "away";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    teamStat.statistics.forEach((s: any) => {
      statsRaw[side][s.type] = s.value;
    });
  });

  return {
    fixtureId,
    statusShort: f.fixture.status.short,
    statusElapsed: f.fixture.status.elapsed,
    homeGoals: f.goals.home,
    awayGoals: f.goals.away,
    stats: statsRaw,
    fetchedAt: Date.now(),
  };
}

async function fetchOdds(fixtureId: number): Promise<{ home: string; draw: string; away: string } | null> {
  try {
    const res = await fetch(
      `${API_BASE}/odds?fixture=${fixtureId}&bet=1`,
      { headers: { "x-apisports-key": API_KEY } }
    );
    const json = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bookmaker = json.response?.[0]?.bookmakers?.[0];
    if (!bookmaker) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values: any[] = bookmaker.bets?.[0]?.values ?? [];
    return {
      home: values.find((v) => v.value === "Home")?.odd ?? "-",
      draw: values.find((v) => v.value === "Draw")?.odd ?? "-",
      away: values.find((v) => v.value === "Away")?.odd ?? "-",
    };
  } catch { return null; }
}

// ─── HELPERS ────────────────────────────────────────────────────────────────
function groupByRound(fixtures: FixtureSummary[]): Map<string, FixtureSummary[]> {
  const map = new Map<string, FixtureSummary[]>();
  for (const f of fixtures) {
    const arr = map.get(f.round) ?? [];
    arr.push(f);
    map.set(f.round, arr);
  }
  return map;
}

function formatKickoff(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString("it-IT", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function StatusBadge({ status, elapsed }: { status: string; elapsed: number | null }) {
  if (LIVE_STATUSES.includes(status)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold"
        style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.4)" }}>
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" style={{ animation: "pulse 1.5s ease-in-out infinite" }} />
        {status === "HT" ? "HT" : `${elapsed ?? "?"}'`}
      </span>
    );
  }
  if (FINISHED_STATUSES.includes(status)) {
    return (
      <span className="rounded-full px-2 py-0.5 text-xs font-semibold"
        style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
        {status}
      </span>
    );
  }
  return null;
}

function StatRow({ label, home, away }: { label: string; home: string | number | null; away: string | number | null }) {
  const h = home ?? 0;
  const a = away ?? 0;
  const total = Number(h) + Number(a);
  const homePct = total > 0 ? (Number(h) / total) * 100 : 50;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
        <span className="font-medium">{h}</span>
        <span style={{ color: "rgba(255,255,255,0.45)" }}>{label}</span>
        <span className="font-medium">{a}</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
        <div className="rounded-full transition-all duration-500"
          style={{ width: `${homePct}%`, background: "linear-gradient(90deg, #FFD700, #d4af37)" }} />
      </div>
    </div>
  );
}

// ─── COMPONENTE CARD PARTITA ─────────────────────────────────────────────────
function FixtureCard({
  fixture,
  liveStats,
  supabaseKickoff,
}: {
  fixture: FixtureSummary;
  liveStats: FixtureStats | null;
  supabaseKickoff: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [odds, setOdds] = useState<{ home: string; draw: string; away: string } | null>(null);
  const [loadingOdds, setLoadingOdds] = useState(false);

  const isLive = LIVE_STATUSES.includes(fixture.statusShort);
  const isFinished = FINISHED_STATUSES.includes(fixture.statusShort);
  const isFuture = !isLive && !isFinished;

  // Stats da usare: se live usa liveStats, se finished controlla cache
  const cachedStats = isFinished ? loadStatsCache(fixture.id) : null;
  const stats = liveStats ?? cachedStats;

  const displayHome = stats?.homeGoals ?? fixture.homeGoals;
  const displayAway = stats?.awayGoals ?? fixture.awayGoals;

  async function handleOpen() {
    if (isFuture) {
      if (!open && !odds) {
        setLoadingOdds(true);
        const o = await fetchOdds(fixture.id);
        setOdds(o);
        setLoadingOdds(false);
      }
      setOpen((v) => !v);
      return;
    }
    if (isFinished || isLive) setOpen((v) => !v);
  }

  const canOpen = isLive || isFinished || isFuture;

  return (
    <div className="overflow-hidden rounded-xl border transition-all duration-200"
      style={{ borderColor: isLive ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(16px)" }}>
      {/* Header card */}
      <button
        onClick={handleOpen}
        disabled={!canOpen}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
      >
        {/* Home */}
        <div className="flex flex-1 items-center justify-end gap-2">
          <span className="text-sm font-medium text-white">{fixture.homeTeam}</span>
          <img src={fixture.homeLogo} alt="" className="h-6 w-6 object-contain" />
        </div>

        {/* Score / orario */}
        <div className="flex min-w-[80px] flex-col items-center gap-0.5">
          {isLive || isFinished ? (
            <span className="text-xl font-bold tabular-nums text-white">
              {displayHome ?? 0} – {displayAway ?? 0}
            </span>
          ) : (
            <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>
              {formatKickoff(fixture.date)}
            </span>
          )}
          <StatusBadge status={fixture.statusShort} elapsed={stats?.statusElapsed ?? fixture.statusElapsed} />
        </div>

        {/* Away */}
        <div className="flex flex-1 items-center gap-2">
          <img src={fixture.awayLogo} alt="" className="h-6 w-6 object-contain" />
          <span className="text-sm font-medium text-white">{fixture.awayTeam}</span>
        </div>

        {/* Chevron */}
        <span style={{ color: "rgba(255,255,255,0.35)" }}>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {/* Pannello espanso */}
      {open && (
        <div className="border-t px-4 py-4" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          {/* Partita futura → quote */}
          {isFuture && (
            <div className="space-y-2">
              {loadingOdds && <p className="text-center text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>Loading odds…</p>}
              {!loadingOdds && !odds && <p className="text-center text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>No odds available.</p>}
              {odds && (
                <div className="flex justify-around">
                  {[
                    { label: "1", value: odds.home },
                    { label: "X", value: odds.draw },
                    { label: "2", value: odds.away },
                  ].map((o) => (
                    <div key={o.label} className="flex flex-col items-center gap-1">
                      <span className="text-xs font-semibold" style={{ color: "#FFD700" }}>{o.label}</span>
                      <span className="rounded-lg px-3 py-1 text-sm font-bold text-white"
                        style={{ background: "rgba(255,255,255,0.08)" }}>{o.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Partita live o finita → statistiche */}
          {(isLive || isFinished) && (
            <div className="space-y-3">
              {!stats ? (
                <p className="text-center text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {isLive ? "Loading stats…" : "No stats available."}
                </p>
              ) : (
                <>
                  {/* Intestazione squadre */}
                  <div className="flex justify-between pb-1 text-xs font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>
                    <span>{fixture.homeTeam}</span>
                    <span>{fixture.awayTeam}</span>
                  </div>
                  {[
                    "Ball Possession",
                    "Total Shots",
                    "Shots on Goal",
                    "Expected Goals",
                    "Corner Kicks",
                    "Fouls",
                    "Yellow Cards",
                    "Red Cards",
                    "Offsides",
                    "Passes accurate",
                  ]
                    .filter((key) => stats.stats.home[key] !== undefined || stats.stats.away[key] !== undefined)
                    .map((key) => (
                      <StatRow key={key} label={key} home={stats.stats.home[key] ?? null} away={stats.stats.away[key] ?? null} />
                    ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PAGINA ──────────────────────────────────────────────────────────────────
function LivePage() {
  const { user, ready } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !user) navigate({ to: "/" });
  }, [ready, user, navigate]);

  // 1. Carica lista partite da Supabase (per kickoff_at)
  const { data: supabaseMatches } = useQuery({
    queryKey: ["matches-kickoff"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("matches").select("id,kickoff_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  // 2. Lista completa fixture API-Football (cache 1/giorno)
  const [fixtures, setFixtures] = useState<FixtureSummary[]>([]);
  const [loadingFixtures, setLoadingFixtures] = useState(true);

  useEffect(() => {
    if (!user) return;
    const cached = loadFixturesCache();
    if (cached) {
      setFixtures(cached);
      setLoadingFixtures(false);
      return;
    }
    fetchAllFixtures()
      .then((data) => {
        saveFixturesCache(data);
        setFixtures(data);
      })
      .finally(() => setLoadingFixtures(false));
  }, [user]);

  // 3. Polling live
  const [liveFixtureId, setLiveFixtureId] = useState<number | null>(null);
  const [liveStats, setLiveStats] = useState<FixtureStats | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const kickoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Aggiorna anche il summary nella lista fixtures con score live
  const [liveFixtureOverride, setLiveFixtureOverride] = useState<Partial<FixtureSummary> | null>(null);

  async function doPoll(fixtureId: number) {
    try {
      console.log("[LIVE] doPoll chiamato per fixtureId:", fixtureId);
      const stats = await fetchFixtureStats(fixtureId);
      console.log("[LIVE] stats ricevute:", stats);
      setLiveStats(stats);
      setLiveFixtureOverride({
        id: fixtureId,
        statusShort: stats.statusShort,
        statusElapsed: stats.statusElapsed,
        homeGoals: stats.homeGoals,
        awayGoals: stats.awayGoals,
      });

      // Se la partita è finita, salva in cache e ferma il polling
      if (FINISHED_STATUSES.includes(stats.statusShort)) {
        saveStatsCache(stats);
        if (pollRef.current) clearInterval(pollRef.current);
        setLiveFixtureId(null);
      }
    } catch {}
  }

  useEffect(() => {
    if (!supabaseMatches || !user) return;

    const now = Date.now();

    // Trova la partita di Supabase che dovrebbe essere in corso o sta per iniziare
    const upcoming = supabaseMatches
      .map((m) => ({ ...m, kickoffMs: new Date(m.kickoff_at).getTime() }))
      .filter((m) => {
        const sinceKickoff = now - m.kickoffMs;
        // Tra -5 min prima (non ancora iniziata) e +200 min dopo (max con rigori)
        return sinceKickoff > -5 * 60 * 1000 && sinceKickoff < 200 * 60 * 1000;
      })
      .sort((a, b) => a.kickoffMs - b.kickoffMs);

    if (!upcoming.length) return;

    const next = upcoming[0];
    const delayMs = Math.max(0, next.kickoffMs + KICKOFF_DELAY_MS - now);
    console.log("[LIVE] Partita trovata:", next, "delayMs:", delayMs);

    kickoffTimerRef.current = setTimeout(async () => {
      console.log("[LIVE] Timer scattato, cerco fixture live...");
      const id = await findLiveFixtureId();
      console.log("[LIVE] fixture_id trovato:", id);
      if (!id) {
        console.log("[LIVE] Nessuna partita live trovata dall'API");
        return;
      }
      setLiveFixtureId(id);

      // Primo poll immediato
      await doPoll(id);

      // Poi ogni 6 minuti
      pollRef.current = setInterval(() => doPoll(id), POLL_MS);
    }, delayMs);

    return () => {
      if (kickoffTimerRef.current) clearTimeout(kickoffTimerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [supabaseMatches, user]);

  // Merge fixture list con override live
  const mergedFixtures = fixtures.map((f) => {
    if (liveFixtureOverride && f.id === liveFixtureOverride.id) {
      return { ...f, ...liveFixtureOverride };
    }
    return f;
  });

  // Raggruppa per round
  const grouped = groupByRound(mergedFixtures);
  const rounds = Array.from(grouped.keys());

  if (!ready || !user) return null;

  return (
    <AppShell>
      <div className="space-y-8">
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-white">
            <Tv2 className="h-6 w-6" style={{ color: "#FFD700" }} />
            Live Scores
          </h1>
          <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
            FIFA World Cup 2026 — updated every 6 minutes during matches.
          </p>
        </header>

        {loadingFixtures ? (
          <div style={{ color: "rgba(255,255,255,0.5)" }}>Loading fixtures…</div>
        ) : mergedFixtures.length === 0 ? (
          <div className="rounded-xl border p-10 text-center text-sm"
            style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}>
            No fixtures available.
          </div>
        ) : (
          <div className="space-y-6">
            {rounds.map((round) => (
              <section key={round}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest"
                  style={{ color: "rgba(255,215,0,0.7)" }}>
                  {round}
                </h2>
                <div className="space-y-2">
                  {(grouped.get(round) ?? []).map((f) => (
                    <FixtureCard
                      key={f.id}
                      fixture={f}
                      liveStats={liveFixtureId === f.id ? liveStats : null}
                      supabaseKickoff={
                        supabaseMatches?.find((m) => {
                          const d1 = new Date(m.kickoff_at).getTime();
                          const d2 = new Date(f.date).getTime();
                          return Math.abs(d1 - d2) < 10 * 60 * 1000;
                        })?.kickoff_at ?? null
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}