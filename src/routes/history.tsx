import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { Check, X, ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "History — Friends Pool" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const { user, ready } = useSession();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (ready && !user) navigate({ to: "/" });
  }, [ready, user, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["history", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // 1. All my submissions and predictions
      const { data: mySubs } = await supabase
        .from("submissions")
        .select("id")
        .eq("user_id", user!.id);
      const mySubIds = (mySubs ?? []).map((s: any) => s.id);
      let myPreds: any[] = [];
      if (mySubIds.length) {
        const { data: p } = await supabase
          .from("predictions")
          .select("match_id,outcome,home_score,away_score")
          .in("submission_id", mySubIds);
        myPreds = p ?? [];
      }
      const myMatchIds = Array.from(new Set(myPreds.map((p) => p.match_id)));
      if (!myMatchIds.length) {
        return { matches: [], matchdays: {}, myPreds: {}, others: [], results: {} };
      }

      // 2. Match info + matchday labels
      const { data: matches } = await supabase
        .from("matches")
        .select("id,home_team,away_team,kickoff_at,matchday_id")
        .in("id", myMatchIds)
        .order("kickoff_at", { ascending: true });
      const mdIds = Array.from(new Set((matches ?? []).map((m: any) => m.matchday_id)));
      const { data: mds } = await supabase
        .from("matchdays")
        .select("id,label")
        .in("id", mdIds);
      const matchdays: Record<string, string> = {};
      (mds ?? []).forEach((m: any) => (matchdays[m.id] = m.label));

      // 3. Results
      const { data: rs } = await supabase
        .from("match_results")
        .select("match_id,outcome,home_score,away_score")
        .in("match_id", myMatchIds);
      const results: Record<string, any> = {};
      (rs ?? []).forEach((r: any) => (results[r.match_id] = r));

      // 4. Other users' predictions for those matches
      const { data: otherSubs } = await supabase
        .from("submissions")
        .select("id,user_id,users(username)")
        .neq("user_id", user!.id);
      const otherSubIds = (otherSubs ?? []).map((s: any) => s.id);
      let otherPreds: any[] = [];
      if (otherSubIds.length) {
        const { data: p } = await supabase
          .from("predictions")
          .select("submission_id,match_id,outcome,home_score,away_score")
          .in("submission_id", otherSubIds)
          .in("match_id", myMatchIds);
        otherPreds = p ?? [];
      }
      const subToUser: Record<string, string> = {};
      (otherSubs ?? []).forEach((s: any) => {
        subToUser[s.id] = s.users?.username ?? "?";
      });
      const byUser: Record<string, Record<string, any>> = {};
      otherPreds.forEach((p) => {
        const u = subToUser[p.submission_id];
        if (!u) return;
        if (!byUser[u]) byUser[u] = {};
        byUser[u][p.match_id] = p;
      });
      const others = Object.entries(byUser)
        .map(([username, preds]) => ({ username, preds }))
        .sort((a, b) => a.username.localeCompare(b.username));

      const myPredsByMatch: Record<string, any> = {};
      myPreds.forEach((p) => (myPredsByMatch[p.match_id] = p));

      return { matches: matches ?? [], matchdays, myPreds: myPredsByMatch, others, results };
    },
  });

  if (!ready || !user) return null;

  const renderPick = (p: any, matchId: string) => {
    if (!p) return <span className="text-muted-foreground">—</span>;
    const r = data?.results[matchId];
    const outcomeOk = r ? p.outcome === r.outcome : null;
    const scoreOk = r ? p.home_score === r.home_score && p.away_score === r.away_score : null;
    return (
      <span className="inline-flex items-center gap-1 font-mono text-xs">
        <span className="inline-flex items-center gap-0.5">
          {p.outcome}
          {outcomeOk === true && <Check className="h-3 w-3 text-emerald-500" />}
          {outcomeOk === false && <X className="h-3 w-3 text-red-500" />}
        </span>
        <span className="text-muted-foreground">|</span>
        <span className="inline-flex items-center gap-0.5">
          {p.home_score}-{p.away_score}
          {scoreOk === true && <Check className="h-3 w-3 text-emerald-500" />}
          {scoreOk === false && <X className="h-3 w-3 text-red-500" />}
        </span>
      </span>
    );
  };

  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Your history</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Compact view: matches you've predicted, with your picks and other users' picks side by side.
      </p>
      {isLoading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : !data?.matches.length ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          You haven't predicted any match yet.
        </div>
      ) : (
        <div className="space-y-6">
          {(() => {
            const groups = new Map<string, any[]>();
            data.matches.forEach((m: any) => {
              if (!groups.has(m.matchday_id)) groups.set(m.matchday_id, []);
              groups.get(m.matchday_id)!.push(m);
            });
            return Array.from(groups.entries()).map(([mdId, matches]) => {
              const matchIds = new Set(matches.map((m) => m.id));
              const othersHere = data.others.filter((o) =>
                matches.some((m) => o.preds[m.id]),
              );
              return (
                <section key={mdId}>
                  <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground">
                    {data.matchdays[mdId]}
                  </h2>
                  <div className="overflow-x-auto rounded-xl border border-border bg-card">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2">User</th>
                          {matches.map((m: any) => (
                            <th key={m.id} className="px-3 py-2 whitespace-nowrap">
                              {m.home_team} vs {m.away_team}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-border bg-primary/5">
                          <td className="sticky left-0 z-10 bg-primary/5 px-3 py-2 font-semibold">
                            You
                          </td>
                          {matches.map((m: any) => (
                            <td key={m.id} className="px-3 py-2 whitespace-nowrap">
                              {renderPick(data.myPreds[m.id], m.id)}
                            </td>
                          ))}
                        </tr>
                        {othersHere.map((o) => (
                          <tr key={o.username} className="border-t border-border">
                            <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium">
                              @{o.username}
                            </td>
                            {matches.map((m: any) => (
                              <td key={m.id} className="px-3 py-2 whitespace-nowrap">
                                {renderPick(o.preds[m.id], m.id)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            });
          })()}
        </div>
      )}
    </AppShell>
  );
}
