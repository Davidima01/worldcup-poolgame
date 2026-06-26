import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { BarChart3, Crown, Trophy, TrendingUp, TrendingDown, Minus, ChevronRight, ChevronLeft } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard — Friends Pool" }] }),
  component: LeaderboardPage,
});

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

type Breakdown = {
  exactScores: number;
  outcomeBase: number;
  outcomeBonus: number;
  tournament: number;
};

type PredRow = { submission_id: string; match_id: string; outcome: string; home_score: number; away_score: number };
type MatchRes = { match_id: string; outcome: string; home_score: number; away_score: number };
type TPred = { user_id: string; champion: string; top_scorer: string };
type TRes = {
  champion_1st: string | null;
  champion_2nd: string | null;
  champion_3rd: string | null;
  top_scorer_1st: string | null;
  top_scorer_2nd: string | null;
} | null;

function computeScores(
  userIds: string[],
  subUser: Map<string, string>,
  preds: PredRow[],
  matchActuals: Map<string, MatchRes>,
  tpreds: TPred[],
  tres: TRes,
) {
  const scores = new Map<string, Breakdown>();
  const ensure = (uid: string) => {
    if (!scores.has(uid)) scores.set(uid, { exactScores: 0, outcomeBase: 0, outcomeBonus: 0, tournament: 0 });
    return scores.get(uid)!;
  };
  for (const u of userIds) ensure(u);

  const predsByMatch = new Map<string, PredRow[]>();
  for (const p of preds) {
    if (!matchActuals.has(p.match_id)) continue;
    const arr = predsByMatch.get(p.match_id) ?? [];
    arr.push(p);
    predsByMatch.set(p.match_id, arr);
  }

  for (const [matchId, matchPreds] of predsByMatch) {
    const actual = matchActuals.get(matchId)!;
    const correct = matchPreds.filter((p) => p.outcome === actual.outcome);
    const pts = correct.length === 1 ? 2 : correct.length === 2 ? 1.5 : 1;
    for (const p of matchPreds) {
      const uid = subUser.get(p.submission_id);
      if (!uid) continue;
      const b = ensure(uid);
      if (p.outcome === actual.outcome) {
        b.outcomeBase += 1;
        b.outcomeBonus += pts - 1;
      }
      if (p.home_score === actual.home_score && p.away_score === actual.away_score) {
        b.exactScores += 1;
      }
    }
  }

  if (tres) {
    const championTable: { actual: string | null; tier: [number, number, number] }[] = [
      { actual: tres.champion_1st, tier: [8, 10, 12] },
      { actual: tres.champion_2nd, tier: [4, 5, 6] },
      { actual: tres.champion_3rd, tier: [2, 2.5, 3] },
    ];
    const scorerTable: { actual: string | null; tier: [number, number, number] }[] = [
      { actual: tres.top_scorer_1st, tier: [4, 5, 6] },
      { actual: tres.top_scorer_2nd, tier: [2, 2.5, 3] },
    ];
    const award = (
      rows: { actual: string | null; tier: [number, number, number] }[],
      getPick: (p: TPred) => string,
    ) => {
      for (const { actual, tier } of rows) {
        const a = norm(actual);
        if (!a) continue;
        const hits = tpreds.filter((p) => norm(getPick(p)) === a);
        const pts = hits.length === 1 ? tier[2] : hits.length === 2 ? tier[1] : tier[0];
        for (const h of hits) ensure(h.user_id).tournament += pts;
      }
    };
    award(championTable, (p) => p.champion);
    award(scorerTable, (p) => p.top_scorer);
  }

  return scores;
}

function rankMap(scores: Map<string, Breakdown>, userIds: string[], usernames: Map<string, string>) {
  const arr = userIds.map((id) => {
    const b = scores.get(id)!;
    return { id, total: b.exactScores + b.outcomeBase + b.outcomeBonus + b.tournament };
  });
  arr.sort((a, b) => b.total - a.total || (usernames.get(a.id) ?? "").localeCompare(usernames.get(b.id) ?? ""));
  const m = new Map<string, number>();
  arr.forEach((r, i) => m.set(r.id, i + 1));
  return m;
}

function LeaderboardPage() {
  const { user, ready } = useSession();
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (ready && !user) navigate({ to: "/" });
  }, [ready, user, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    enabled: !!user,
    queryFn: async () => {
      const [users, subs, preds, matchRes, matches, tpreds, tres] = await Promise.all([
        supabase.from("users").select("id,username"),
        supabase.from("submissions").select("id,user_id"),
        supabase.from("predictions").select("submission_id,match_id,outcome,home_score,away_score"),
        supabase.from("match_results").select("match_id,outcome,home_score,away_score"),
        supabase.from("matches").select("id,matchday_id,kickoff_at"),
        supabase.from("tournament_predictions").select("user_id,champion,top_scorer"),
        supabase.from("tournament_results").select("*").maybeSingle(),
      ]);
      for (const r of [users, subs, preds, matchRes, matches, tpreds, tres]) {
        if (r.error) throw r.error;
      }
      return {
        users: users.data ?? [],
        subs: subs.data ?? [],
        preds: (preds.data ?? []) as PredRow[],
        matchRes: (matchRes.data ?? []) as MatchRes[],
        matches: (matches.data ?? []) as { id: string; matchday_id: string; kickoff_at: string }[],
        tpreds: (tpreds.data ?? []) as TPred[],
        tres: tres.data as TRes,
      };
    },
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const subUser = new Map(data.subs.map((s) => [s.id, s.user_id]));
    const usernames = new Map(data.users.map((u) => [u.id, u.username]));
    const userIds = data.users.map((u) => u.id);
    const matchActual = new Map(data.matchRes.map((r) => [r.match_id, r]));
    const matchInfo = new Map(data.matches.map((m) => [m.id, m]));

    const scores = computeScores(userIds, subUser, data.preds, matchActual, data.tpreds, data.tres);
    const currentRank = rankMap(scores, userIds, usernames);

    // Previous standings: exclude the most recent matchday that has results
    const resultedMatchdays = new Map<string, number>();
    for (const r of data.matchRes) {
      const m = matchInfo.get(r.match_id);
      if (!m) continue;
      const t = new Date(m.kickoff_at).getTime();
      const cur = resultedMatchdays.get(m.matchday_id) ?? -Infinity;
      if (t > cur) resultedMatchdays.set(m.matchday_id, t);
    }
    let latestMdId: string | null = null;
    let latestT = -Infinity;
    for (const [mdId, t] of resultedMatchdays) {
      if (t > latestT) { latestT = t; latestMdId = mdId; }
    }
    const excludedMatchIds = new Set<string>();
    if (latestMdId) {
      for (const m of data.matches) if (m.matchday_id === latestMdId) excludedMatchIds.add(m.id);
    }
    const prevActuals = new Map<string, MatchRes>();
    for (const [mid, r] of matchActual) if (!excludedMatchIds.has(mid)) prevActuals.set(mid, r);
    const prevScores = computeScores(userIds, subUser, data.preds, prevActuals, data.tpreds, data.tres);
    const prevRank = rankMap(prevScores, userIds, usernames);
    const hasPrev = latestMdId !== null;

    // Streaks
    const predsByUser = new Map<string, PredRow[]>();
    for (const p of data.preds) {
      const uid = subUser.get(p.submission_id);
      if (!uid) continue;
      if (!matchActual.has(p.match_id) || !matchInfo.has(p.match_id)) continue;
      const arr = predsByUser.get(uid) ?? [];
      arr.push(p);
      predsByUser.set(uid, arr);
    }
    const streaks = new Map<string, number>();
    for (const uid of userIds) {
      const list = (predsByUser.get(uid) ?? []).slice().sort((a, b) => {
        const ta = new Date(matchInfo.get(a.match_id)!.kickoff_at).getTime();
        const tb = new Date(matchInfo.get(b.match_id)!.kickoff_at).getTime();
        return ta - tb;
      });
      let streak = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const actual = matchActual.get(list[i].match_id)!;
        if (list[i].outcome === actual.outcome) streak++;
        else break;
      }
      streaks.set(uid, streak);
    }

    const out = data.users.map((u) => {
      const b = scores.get(u.id)!;
      const total = b.exactScores + b.outcomeBase + b.outcomeBonus + b.tournament;
      const cr = currentRank.get(u.id)!;
      const pr = prevRank.get(u.id)!;
      const delta = hasPrev ? pr - cr : 0;
      return { id: u.id, username: u.username, total, ...b, delta, hasPrev, streak: streaks.get(u.id) ?? 0 };
    });
    out.sort((a, b) => b.total - a.total || a.username.localeCompare(b.username));
    return out;
  }, [data]);

  if (!ready || !user) return null;

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <BarChart3 className="h-6 w-6 text-primary" /> Leaderboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Points update automatically as results are entered.
          </p>
        </header>

        <details className="rounded-xl border border-border bg-white/10 backdrop-blur-md p-4 text-sm">
          <summary className="cursor-pointer font-medium">Scoring rules</summary>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>+1 pt per exact score (home & away match the real result).</li>
            <li>+1 pt per correct 1X2 outcome — boosted to <strong>1.5 pt</strong> if only 2 users got it right, <strong>2 pt</strong> if only 1.</li>
            <li>Champion: <strong>8 / 4 / 2</strong> pts for 1st / 2nd / 3rd; boosted to <strong>10 / 5 / 2.5</strong> if 2 users picked it and <strong>12 / 6 / 3</strong> if only 1.</li>
            <li>Top scorer: <strong>4 / 2</strong> pts for 1st / 2nd; boosted to <strong>5 / 2.5</strong> (2 users) and <strong>6 / 3</strong> (1 user).</li>
            <li>Position arrows compare to standings before the latest scored matchday. 🔥 streak counts consecutive correct 1X2; ⚡ at 5+.</li>
          </ul>
        </details>

        {isLoading ? (
          <div className="text-muted-foreground">Computing scores…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
            No players yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-white/15 backdrop-blur-md">
            <div className="flex justify-end px-3 pt-3">
              <button
                onClick={() => setShowDetails((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground transition hover:bg-secondary"
              >
                {showDetails ? (
                  <>
                    <ChevronLeft className="h-3.5 w-3.5" /> Hide details
                  </>
                ) : (
                  <>
                    Show details <ChevronRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-3 pl-3 sm:pl-4">#</th>
                  <th className="py-3 pr-1 sm:pr-2"></th>
                  <th className="py-3 pr-3 sm:pr-4">Player</th>
                  <th className="py-3 pr-3 text-right sm:pr-4">Streak</th>
                  {showDetails && (
                    <>
                      <th className="py-3 pr-4 text-right">Exact</th>
                      <th className="py-3 pr-4 text-right">1X2</th>
                      <th className="py-3 pr-4 text-right" title="Rarity bonus from outcomes">Bonus</th>
                      <th className="py-3 pr-4 text-right">Tournament</th>
                    </>
                  )}
                  <th className="py-3 pr-3 text-right sm:pr-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={`border-t border-border/60 ${r.id === user.id ? "bg-white/10" : ""}`}>
                    <td className="py-2.5 pl-3 font-mono text-muted-foreground sm:py-3 sm:pl-4">
                      {i === 0 ? <Trophy className="h-4 w-4 text-amber-500" /> :
                       i === 1 ? <Crown className="h-4 w-4 text-zinc-400" /> :
                       i === 2 ? <Crown className="h-4 w-4 text-amber-700" /> :
                       i + 1}
                    </td>
                    <td className="py-2.5 pr-1 sm:py-3 sm:pr-2">
                      {!r.hasPrev ? (
                        <Minus className="h-4 w-4 text-muted-foreground/50" />
                      ) : r.delta > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-emerald-500" title={`Up ${r.delta}`}>
                          <TrendingUp className="h-4 w-4" />
                          <span className="text-xs tabular-nums">{r.delta}</span>
                        </span>
                      ) : r.delta < 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-red-500" title={`Down ${-r.delta}`}>
                          <TrendingDown className="h-4 w-4" />
                          <span className="text-xs tabular-nums">{-r.delta}</span>
                        </span>
                      ) : (
                        <Minus className="h-4 w-4 text-muted-foreground/60" />
                      )}
                    </td>
                    <td className="py-2.5 pr-3 font-medium sm:py-3 sm:pr-4">@{r.username}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums sm:py-3 sm:pr-4">
                      {r.streak > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          {r.streak} <span aria-hidden>{r.streak >= 5 ? "⚡" : "🔥"}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    {showDetails && (
                      <>
                        <td className="py-3 pr-4 text-right tabular-nums">{r.exactScores}</td>
                        <td className="py-3 pr-4 text-right tabular-nums">{r.outcomeBase}</td>
                        <td className="py-3 pr-4 text-right tabular-nums">{r.outcomeBonus.toFixed(1).replace(/\.0$/, "")}</td>
                        <td className="py-3 pr-4 text-right tabular-nums">{r.tournament.toFixed(1).replace(/\.0$/, "")}</td>
                      </>
                    )}
                    <td className="py-2.5 pr-3 text-right text-base font-semibold tabular-nums sm:py-3 sm:pr-4">
                      {r.total.toFixed(1).replace(/\.0$/, "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
