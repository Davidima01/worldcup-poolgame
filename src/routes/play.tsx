import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Clock, CheckCircle2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/play")({
  head: () => ({ meta: [{ title: "Open Matchdays — Friends Pool" }] }),
  component: PlayPage,
});

type Match = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  position: number;
  matchday_id: string;
};

type Matchday = { id: string; label: string; created_at: string };
type OpenMatchday = { matchday: Matchday; matches: Match[]; nextKickoff: Date };
type Pick = { outcome: "1" | "X" | "2" | ""; home: string; away: string };

function PlayPage() {
  const { user, ready } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (ready && !user) navigate({ to: "/" });
  }, [ready, user, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["open-matchdays", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<OpenMatchday[]> => {
      const { data: mds, error: e1 } = await supabase
        .from("matchdays")
        .select("id,label,created_at")
        .order("created_at", { ascending: false });
      if (e1) throw e1;
      if (!mds?.length) return [];

      const ids = mds.map((m) => m.id);
      const { data: matches, error: e2 } = await supabase
        .from("matches")
        .select("id,home_team,away_team,kickoff_at,position,matchday_id")
        .in("matchday_id", ids)
        .order("kickoff_at", { ascending: true });
      if (e2) throw e2;

      const { data: subs, error: e3 } = await supabase
        .from("submissions")
        .select("id,matchday_id")
        .in("matchday_id", ids)
        .eq("user_id", user!.id);
      if (e3) throw e3;
      const subIds = (subs ?? []).map((s) => s.id);
      let predictedMatchIds = new Set<string>();
      if (subIds.length) {
        const { data: preds, error: e4 } = await supabase
          .from("predictions")
          .select("match_id")
          .in("submission_id", subIds);
        if (e4) throw e4;
        predictedMatchIds = new Set((preds ?? []).map((p) => p.match_id));
      }

      const now = Date.now();
      const open: OpenMatchday[] = [];
      for (const md of mds) {
        const mm = (matches ?? []).filter(
          (x) =>
            x.matchday_id === md.id &&
            !predictedMatchIds.has(x.id) &&
            new Date(x.kickoff_at).getTime() > now,
        ) as Match[];
        if (mm.length === 0) continue;
        const next = new Date(mm[0].kickoff_at);
        open.push({ matchday: md, matches: mm, nextKickoff: next });
      }
      open.sort((a, b) => a.nextKickoff.getTime() - b.nextKickoff.getTime());
      return open;
    },
  });

  if (!ready || !user) return null;

  return (
    <AppShell>
      {isLoading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : !data || data.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-10">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Open matchdays</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.length} matchday{data.length === 1 ? "" : "s"} waiting for your predictions.
              Save each match on its own — it locks once you submit it.
            </p>
          </div>
          {data.map((om) => (
            <MatchdaySection
              key={om.matchday.id}
              openMd={om}
              onSaved={() => qc.invalidateQueries({ queryKey: ["open-matchdays"] })}
              userId={user.id}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function MatchdaySection({
  openMd,
  onSaved,
  userId,
}: {
  openMd: OpenMatchday;
  onSaved: () => void;
  userId: string;
}) {
  const { matchday, matches, nextKickoff } = openMd;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="rounded-2xl border border-border bg-card/40 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{matchday.label}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Next kickoff in{" "}
            <span className="font-mono font-medium text-foreground">
              {formatCountdown(nextKickoff.getTime() - now)}
            </span>
          </p>
        </div>
        <Badge variant="default">
          {matches.length} match{matches.length === 1 ? "" : "es"} open
        </Badge>
      </div>

      <div className="space-y-3">
        {matches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            now={now}
            userId={userId}
            matchdayId={matchday.id}
            onSaved={onSaved}
          />
        ))}
      </div>
    </section>
  );
}

function MatchCard({
  match,
  now,
  userId,
  matchdayId,
  onSaved,
}: {
  match: Match;
  now: number;
  userId: string;
  matchdayId: string;
  onSaved: () => void;
}) {
  const [pick, setPick] = useState<Pick>({ outcome: "", home: "", away: "" });
  const [saving, setSaving] = useState(false);
  const k = new Date(match.kickoff_at);
  const closed = k.getTime() <= now;
  const complete = isComplete(pick);

  const save = async () => {
    if (!complete) return;
    if (k.getTime() <= Date.now()) {
      toast.error("This match has already started.");
      onSaved();
      return;
    }
    setSaving(true);
    try {
      const { data: sub, error: e1 } = await supabase
        .from("submissions")
        .insert({ user_id: userId, matchday_id: matchdayId })
        .select("id")
        .single();
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("predictions").insert({
        submission_id: sub.id,
        match_id: match.id,
        outcome: pick.outcome as "1" | "X" | "2",
        home_score: Number(pick.home),
        away_score: Number(pick.away),
      });
      if (e2) throw e2;
      toast.success(`Saved: ${match.home_team} vs ${match.away_team}`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const countdown = useMemo(() => formatCountdown(k.getTime() - now), [k, now]);

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">
          {match.home_team} <span className="text-muted-foreground">vs</span> {match.away_team}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{k.toLocaleString()}</span>
          {closed ? (
            <Badge variant="destructive">CLOSED</Badge>
          ) : (
            <span className="font-mono text-foreground">{countdown}</span>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex gap-1">
          {(["1", "X", "2"] as const).map((o) => (
            <button
              key={o}
              type="button"
              disabled={closed || saving}
              onClick={() => setPick((p) => ({ ...p, outcome: o }))}
              className={`h-9 w-10 rounded-md border text-sm font-medium transition-colors ${
                pick.outcome === o
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-secondary"
              } disabled:opacity-50`}
            >
              {o}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            inputMode="numeric"
            className="w-16 text-center"
            placeholder="0"
            value={pick.home}
            disabled={closed || saving}
            onChange={(e) =>
              setPick((p) => ({ ...p, home: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) }))
            }
          />
          <span className="text-muted-foreground">–</span>
          <Input
            inputMode="numeric"
            className="w-16 text-center"
            placeholder="0"
            value={pick.away}
            disabled={closed || saving}
            onChange={(e) =>
              setPick((p) => ({ ...p, away: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) }))
            }
          />
        </div>
        <div className="ml-auto">
          <Button
            size="sm"
            onClick={save}
            disabled={closed || saving || !complete}
          >
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function isComplete(p?: Pick) {
  if (!p) return false;
  if (!p.outcome) return false;
  if (p.home === "" || p.away === "") return false;
  return /^\d{1,2}$/.test(p.home) && /^\d{1,2}$/.test(p.away);
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
      <h2 className="mt-3 text-lg font-medium">All caught up</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        No open matches awaiting your predictions.
      </p>
    </div>
  );
}
