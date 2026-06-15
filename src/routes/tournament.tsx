import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Crown, AlertTriangle, Lock, Eye, EyeOff } from "lucide-react";
import { AdminBadge } from "@/components/AdminBadge";

export const Route = createFileRoute("/tournament")({
  head: () => ({ meta: [{ title: "Tournament Picks — Friends Pool" }] }),
  component: TournamentPage,
});

type Row = {
  user_id: string;
  champion: string;
  top_scorer: string;
  submitted_at: string;
  edited_by_admin?: boolean;
  admin_edited_at?: string | null;
};

function TournamentPage() {
  const { user, ready } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (ready && !user) navigate({ to: "/" });
  }, [ready, user, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["tournament-picks"],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: picks, error: e1 }, { data: users, error: e2 }] = await Promise.all([
        supabase
          .from("tournament_predictions")
          .select("user_id,champion,top_scorer,submitted_at,edited_by_admin,admin_edited_at"),
        supabase.from("users").select("id,username"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return {
        picks: (picks ?? []) as Row[],
        usernames: Object.fromEntries((users ?? []).map((u) => [u.id, u.username])),
      };
    },
  });

  if (!ready || !user) return null;

  const mine = data?.picks.find((p) => p.user_id === user.id);
  const others = (data?.picks ?? []).filter((p) => p.user_id !== user.id);

  return (
    <AppShell>
      <div className="space-y-8">
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Crown className="h-6 w-6 text-amber-500" /> Tournament picks
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick the tournament winner and top scorer. One-shot — cannot be changed after submission.
          </p>
        </header>

        {isLoading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : mine ? (
          <LockedCard mine={mine} />
        ) : (
          <SubmitCard
            userId={user.id}
            onDone={() => qc.invalidateQueries({ queryKey: ["tournament-picks"] })}
          />
        )}

        <OthersCard locked={!mine} others={others} usernames={data?.usernames ?? {}} />
      </div>
    </AppShell>
  );
}

function LockedCard({ mine }: { mine: Row }) {
  return (
    <section className="rounded-2xl border border-border bg-card/40 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Lock className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-medium">Your picks </h2>
        <Badge variant="secondary" className="ml-auto">
          {new Date(mine.submitted_at).toLocaleString()}
        </Badge>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Field label="Champion" value={mine.champion} />
        <Field label="Top scorer" value={mine.top_scorer} />
      </dl>
      {mine.edited_by_admin && (
        <div className="mt-3"><AdminBadge at={mine.admin_edited_at} /></div>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function SubmitCard({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [champion, setChampion] = useState("");
  const [topScorer, setTopScorer] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const ok = champion.trim().length >= 2 && topScorer.trim().length >= 2;

  return (
    <section className="rounded-2xl border border-border bg-card/40 p-5">
      <h2 className="mb-4 font-medium">Make your picks</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm text-muted-foreground">World Cup winner</span>
          <Input
            value={champion}
            placeholder="e.g. Spagna"
            maxLength={60}
            onChange={(e) => setChampion(e.target.value)}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-muted-foreground">Top scorer</span>
          <Input
            value={topScorer}
            placeholder="e.g. Harry Kane"
            maxLength={60}
            onChange={(e) => setTopScorer(e.target.value)}
          />
        </label>
      </div>
      <div className="mt-6 flex justify-end">
        <Button size="lg" disabled={!ok} onClick={() => setReviewOpen(true)}>
          Review & Submit
        </Button>
      </div>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm your tournament picks</DialogTitle>
            <DialogDescription>
              Once confirmed, these picks are permanent and cannot be edited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-md border border-border p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">World Cup winner</span><span className="font-medium">{champion}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Top scorer</span><span className="font-medium">{topScorer}</span></div>
          </div>
          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            This action cannot be undone.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)} disabled={saving}>Back</Button>
            <Button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const { error } = await supabase.from("tournament_predictions").insert({
                    user_id: userId,
                    champion: champion.trim(),
                    top_scorer: topScorer.trim(),
                  });
                  if (error) throw error;
                  toast.success("Picks saved permanently!");
                  setReviewOpen(false);
                  onDone();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not save");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving…" : "Confirm & save permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function OthersCard({
  locked, others, usernames,
}: {
  locked: boolean;
  others: Row[];
  usernames: Record<string, string>;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card/40 p-5">
      <div className="mb-3 flex items-center gap-2">
        {locked ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
        <h2 className="font-medium">Other players' picks</h2>
      </div>
      {locked ? (
        <p className="text-sm text-muted-foreground">
          Submit your own picks to reveal everyone else's.
        </p>
      ) : others.length === 0 ? (
        <p className="text-sm text-muted-foreground">No other picks yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">Player</th>
                <th className="py-2 pr-4">Champion</th>
                <th className="py-2">Top scorer</th>
              </tr>
            </thead>
            <tbody>
              {others.map((r) => (
                <tr key={r.user_id} className="border-t border-border/60">
                  <td className="py-2 pr-4 font-medium">@{usernames[r.user_id] ?? "?"}</td>
                  <td className="py-2 pr-4">
                    <span className="inline-flex items-center gap-1.5">
                      {r.champion}
                      {r.edited_by_admin && <AdminBadge at={r.admin_edited_at} />}
                    </span>
                  </td>
                  <td className="py-2">{r.top_scorer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
