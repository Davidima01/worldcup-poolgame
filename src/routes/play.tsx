import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

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

      // Fetch all predictions for this user across these matches
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
              Each match closes at its own kickoff.
            </p>
          </div>
          {data.map((om) => (
            <MatchdaySection
              key={om.matchday.id}
              openMd={om}
              onSubmitted={() => qc.invalidateQueries({ queryKey: ["open-matchdays"] })}
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
  onSubmitted,
  userId,
}: {
  openMd: OpenMatchday;
  onSubmitted: () => void;
  userId: string;
}) {
  const { matchday, matches, nextKickoff } = openMd;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const [picks, setPicks] = useState<Record<string, Pick>>(() =>
    Object.fromEntries(matches.map((m) => [m.id, { outcome: "", home: "", away: "" } as Pick])),
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Only matches still open at "now" can be submitted
  const submittable = useMemo(
    () => matches.filter((m) => new Date(m.kickoff_at).getTime() > now && isComplete(picks[m.id])),
    [matches, picks, now],
  );
  const hasAnySubmittable = submittable.length > 0;

  return (
    <section className="rounded-2xl border border-border bg-card/40 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{matchday.label}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Next kickoff in <span className="font-mono font-medium text-foreground">{formatCountdown(nextKickoff.getTime() - now)}</span>
          </p>
        </div>
        <Badge variant="default">
          {matches.length} match{matches.length === 1 ? "" : "es"} open
        </Badge>
      </div>

      <div className="space-y-3">
        {matches.map((m) => {
          const closed = new Date(m.kickoff_at).getTime() <= now;
          return (
            <MatchCard
              key={m.id}
              match={m}
              disabled={closed}
              pick={picks[m.id] ?? { outcome: "", home: "", away: "" }}
              onChange={(p) => setPicks((prev) => ({ ...prev, [m.id]: p }))}
            />
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {hasAnySubmittable
            ? `${submittable.length} ready to submit`
            : "Complete picks for at least one open match"}
        </p>
        <Button size="lg" disabled={!hasAnySubmittable} onClick={() => setReviewOpen(true)}>
          Review & Submit
        </Button>
      </div>

      <ReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        matches={submittable}
        picks={picks}
        saving={saving}
        onConfirm={async () => {
          setSaving(true);
          try {
            // Re-check kickoff right before submit
            const stillOpen = submittable.filter(
              (m) => new Date(m.kickoff_at).getTime() > Date.now(),
            );
            if (stillOpen.length === 0) {
              toast.error("All these matches have already started.");
              setReviewOpen(false);
              onSubmitted();
              return;
            }
            const { data: sub, error: e1 } = await supabase
              .from("submissions")
              .insert({ user_id: userId, matchday_id: matchday.id })
              .select("id")
              .single();
            if (e1) throw e1;
            const rows = stillOpen.map((m) => ({
              submission_id: sub.id,
              match_id: m.id,
              outcome: picks[m.id].outcome as "1" | "X" | "2",
              home_score: Number(picks[m.id].home),
              away_score: Number(picks[m.id].away),
            }));
            const { error: e2 } = await supabase.from("predictions").insert(rows);
            if (e2) throw e2;
            toast.success(
              `Submitted ${stillOpen.length} pick${stillOpen.length === 1 ? "" : "s"} for ${matchday.label}!`,
            );
            setReviewOpen(false);
            onSubmitted();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not submit");
          } finally {
            setSaving(false);
          }
        }}
      />
    </section>
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

function MatchCard({
  match,
  pick,
  onChange,
  disabled,
}: {
  match: Match;
  pick: Pick;
  onChange: (p: Pick) => void;
  disabled?: boolean;
}) {
  const k = new Date(match.kickoff_at);
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">
          {match.home_team} <span className="text-muted-foreground">vs</span> {match.away_team}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{k.toLocaleString()}</span>
          {disabled && <Badge variant="destructive">CLOSED</Badge>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex gap-1">
          {(["1", "X", "2"] as const).map((o) => (
            <button
              key={o}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...pick, outcome: o })}
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
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...pick, home: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) })
            }
          />
          <span className="text-muted-foreground">–</span>
          <Input
            inputMode="numeric"
            className="w-16 text-center"
            placeholder="0"
            value={pick.away}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...pick, away: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) })
            }
          />
        </div>
      </div>
    </div>
  );
}

function ReviewDialog({
  open,
  onOpenChange,
  matches,
  picks,
  onConfirm,
  saving,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  matches: Match[];
  picks: Record<string, Pick>;
  onConfirm: () => void;
  saving: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review your predictions</DialogTitle>
          <DialogDescription>
            Only matches that haven't started yet will be submitted. Submissions are permanent.
          </DialogDescription>
        </DialogHeader>
        <div className="my-2 max-h-[50vh] space-y-2 overflow-y-auto rounded-md border border-border p-3">
          {matches.map((m) => {
            const p = picks[m.id];
            return (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span>
                  {m.home_team} vs {m.away_team}
                </span>
                <span className="font-mono font-medium">
                  {p?.outcome} | {p?.home}-{p?.away}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Once confirmed, you can't change these picks.
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Back
          </Button>
          <Button onClick={onConfirm} disabled={saving || matches.length === 0}>
            {saving ? "Saving…" : "Confirm & save permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
