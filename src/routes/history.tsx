import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { Check, X, ChevronDown, ChevronRight } from "lucide-react";
import { AdminBadge } from "@/components/AdminBadge";


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
      if (typeof document !== "undefined") {
        if (next.size > 0) document.body.classList.add("scene-zoom");
        else document.body.classList.remove("scene-zoom");
      }
      return next;
    });
  };

  useEffect(() => {
    return () => {
      if (typeof document !== "undefined") document.body.classList.remove("scene-zoom");
    };
  }, []);

  useEffect(() => {
    if (ready && !user) navigate({ to: "/" });
  }, [ready, user, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["history", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Unica chiamata RPC — il join avviene nel database
      const [allPreds, mySubsRes] = await Promise.all([
        supabase.rpc("get_history_for_user", { p_user_id: user!.id }),
        supabase.from("submissions").select("id").eq("user_id", user!.id),
      ]);

      const mySubIds = new Set((mySubsRes.data ?? []).map((s: any) => s.id));
      const allRows = (allPreds.data ?? []) as any[];
      const myMatchIds = Array.from(new Set(allRows.map((r) => r.match_id)));

      if (!myMatchIds.length) {
        return { matches: [], matchdays: {}, myPreds: {}, others: [], results: {} };
      }

      // Match info + matchday labels + results in parallelo
      const [matchesRes, resultsRes] = await Promise.all([
        supabase
          .from("matches")
          .select("id,home_team,away_team,kickoff_at,matchday_id")
          .in("id", myMatchIds)
          .order("kickoff_at", { ascending: true }),
        supabase
          .from("match_results")
          .select("match_id,outcome,home_score,away_score")
          .in("match_id", myMatchIds),
      ]);

      const matches = matchesRes.data ?? [];
      const mdIds = Array.from(new Set(matches.map((m: any) => m.matchday_id)));
      const { data: mds } = await supabase
        .from("matchdays")
        .select("id,label")
        .in("id", mdIds);

      const matchdays: Record<string, string> = {};
      (mds ?? []).forEach((m: any) => (matchdays[m.id] = m.label));

      const results: Record<string, any> = {};
      (resultsRes.data ?? []).forEach((r: any) => (results[r.match_id] = r));

      // Separa le mie predictions da quelle degli altri
      const myPredsByMatch: Record<string, any> = {};
      const byUser: Record<string, Record<string, any>> = {};

      for (const row of allRows) {
        if (mySubIds.size === 0) break; // fallback safety
        // Le mie: username corrisponde al mio user
        // Usiamo un approccio diverso: la RPC restituisce tutto,
        // separiamo in base a se il username è il nostro o no
      }

      // Recupera il mio username
      const { data: meData } = await supabase
        .from("users")
        .select("username")
        .eq("id", user!.id)
        .single();
      const myUsername = meData?.username ?? "";

      for (const row of allRows) {
        if (row.username === myUsername) {
          myPredsByMatch[row.match_id] = row;
        } else {
          if (!byUser[row.username]) byUser[row.username] = {};
          byUser[row.username][row.match_id] = row;
        }
      }

      const others = Object.entries(byUser)
        .map(([username, preds]) => ({ username, preds }))
        .sort((a, b) => a.username.localeCompare(b.username));

      return { matches, matchdays, myPreds: myPredsByMatch, others, results };
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
        {p.edited_by_admin && <AdminBadge at={p.admin_edited_at} />}
      </span>
    );
  };

  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Your history</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Compact view: check yours and other users' picks.
      </p>
      {isLoading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : !data?.matches.length ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          You haven't predicted any match yet.
        </div>
      ) : (
        <div className="space-y-3">
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
              const isOpen = expanded.has(mdId);
              const totalPlayers = 1 + othersHere.length;
              return (
                <div key={mdId} className="rounded-xl border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => toggle(mdId)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-semibold tracking-wide">
                        {data.matchdays[mdId]}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {matches.length} match{matches.length !== 1 ? "es" : ""} · {totalPlayers} player{totalPlayers !== 1 ? "s" : ""}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="overflow-x-auto border-t border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="sticky left-0 z-10 bg-muted px-3 py-2 border-r border-border">User</th>
                            {matches.map((m: any) => (
                              <th key={m.id} className="px-3 py-2 whitespace-nowrap">
                                {m.home_team} vs {m.away_team}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t border-border bg-muted">
                            <td className="sticky left-0 z-10 bg-muted px-3 py-2 font-semibold border-r border-border">
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
                              <td className="sticky left-0 z-10 bg-background px-3 py-2 font-medium border-r border-border">
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
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}
    </AppShell>
  );
}
