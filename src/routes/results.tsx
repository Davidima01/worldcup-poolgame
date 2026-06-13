import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { ClipboardCheck, Save, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/results")({
  head: () => ({ meta: [{ title: "Real Results — Friends Pool" }] }),
  component: ResultsPage,
});

type Match = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  matchday_id: string;
};
type Matchday = { id: string; label: string };
type MatchResult = { match_id: string; outcome: "1" | "X" | "2"; home_score: number; away_score: number };

function ResultsPage() {
  const { user, ready } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (ready && !user) navigate({ to: "/" });
  }, [ready, user, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["real-results"],
    enabled: !!user,
    queryFn: async () => {
      const [mds, ms, mr, tr] = await Promise.all([
        supabase.from("matchdays").select("id,label,created_at").order("created_at", { ascending: true }),
        supabase.from("matches").select("id,home_team,away_team,kickoff_at,matchday_id").order("kickoff_at", { ascending: true }),
        supabase.from("match_results").select("match_id,outcome,home_score,away_score"),
        supabase.from("tournament_results").select("*").maybeSingle(),
      ]);
      if (mds.error) throw mds.error;
      if (ms.error) throw ms.error;
      if (mr.error) throw mr.error;
      if (tr.error) throw tr.error;
      return {
        matchdays: (mds.data ?? []) as Matchday[],
        matches: (ms.data ?? []) as Match[],
        results: (mr.data ?? []) as MatchResult[],
        tournament: (tr.data ?? null) as null | {
          id: string;
          champion_1st: string | null;
          champion_2nd: string | null;
          champion_3rd: string | null;
          top_scorer_1st: string | null;
          top_scorer_2nd: string | null;
        },
      };
    },
  });

  if (!ready || !user) return null;

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ClipboardCheck className="h-6 w-6 text-primary" /> Real results
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Anyone can enter the official match results and tournament outcomes.
          </p>
        </header>

        {isLoading || !data ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : (
          <Accordion type="multiple" className="space-y-3">
            <AccordionItem
              value="tournament"
              className="overflow-hidden rounded-2xl border border-border bg-card/40"
            >
              <AccordionTrigger className="px-5 py-4 hover:no-underline">
                <div className="flex items-center gap-2 text-base font-semibold">
                  Tournament outcomes
                  {data.tournament && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-5">
                <TournamentResults
                  current={data.tournament}
                  onSaved={() => qc.invalidateQueries({ queryKey: ["real-results"] })}
                />
              </AccordionContent>
            </AccordionItem>

            {data.matchdays.map((md) => {
              const mdMatches = data.matches.filter((m) => m.matchday_id === md.id);
              if (mdMatches.length === 0) return null;
              const filled = mdMatches.filter((m) => data.results.some((r) => r.match_id === m.id)).length;
              return (
                <AccordionItem
                  key={md.id}
                  value={md.id}
                  className="overflow-hidden rounded-2xl border border-border bg-card/40"
                >
                  <AccordionTrigger className="px-5 py-4 hover:no-underline">
                    <div className="flex w-full items-center justify-between gap-3 pr-2">
                      <span className="text-base font-semibold">{md.label}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {filled}/{mdMatches.length} entered
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5">
                    <div className="space-y-3">
                      {mdMatches.map((m) => (
                        <ResultRow
                          key={m.id}
                          match={m}
                          initial={data.results.find((r) => r.match_id === m.id)}
                          onSaved={() => qc.invalidateQueries({ queryKey: ["real-results"] })}
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </div>
    </AppShell>
  );
}

function ResultRow({
  match, initial, onSaved,
}: {
  match: Match;
  initial?: MatchResult;
  onSaved: () => void;
}) {
  const [outcome, setOutcome] = useState<"" | "1" | "X" | "2">(initial?.outcome ?? "");
  const [home, setHome] = useState<string>(initial ? String(initial.home_score) : "");
  const [away, setAway] = useState<string>(initial ? String(initial.away_score) : "");
  const [saving, setSaving] = useState(false);

  const valid = useMemo(
    () => outcome !== "" && /^\d{1,2}$/.test(home) && /^\d{1,2}$/.test(away),
    [outcome, home, away]
  );

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("match_results").upsert({
        match_id: match.id,
        outcome: outcome as "1" | "X" | "2",
        home_score: Number(home),
        away_score: Number(away),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Result saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">
          {match.home_team} <span className="text-muted-foreground">vs</span> {match.away_team}
        </div>
        <div className="text-xs text-muted-foreground">{new Date(match.kickoff_at).toLocaleString()}</div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex gap-1">
          {(["1", "X", "2"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOutcome(o)}
              className={`h-9 w-10 rounded-md border text-sm font-medium transition-colors ${
                outcome === o
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-secondary"
              }`}
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
            value={home}
            onChange={(e) => setHome(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            inputMode="numeric"
            className="w-16 text-center"
            placeholder="0"
            value={away}
            onChange={(e) => setAway(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
          />
        </div>
        <Button onClick={save} disabled={!valid || saving} size="sm" className="ml-auto">
          <Save className="mr-1 h-4 w-4" />
          {saving ? "Saving…" : initial ? "Update" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function TournamentResults({
  current, onSaved,
}: {
  current: null | {
    id: string;
    champion_1st: string | null;
    champion_2nd: string | null;
    champion_3rd: string | null;
    top_scorer_1st: string | null;
    top_scorer_2nd: string | null;
  };
  onSaved: () => void;
}) {
  const [c1, setC1] = useState(current?.champion_1st ?? "");
  const [c2, setC2] = useState(current?.champion_2nd ?? "");
  const [c3, setC3] = useState(current?.champion_3rd ?? "");
  const [t1, setT1] = useState(current?.top_scorer_1st ?? "");
  const [t2, setT2] = useState(current?.top_scorer_2nd ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const payload = {
        champion_1st: c1.trim() || null,
        champion_2nd: c2.trim() || null,
        champion_3rd: c3.trim() || null,
        top_scorer_1st: t1.trim() || null,
        top_scorer_2nd: t2.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = current
        ? await supabase.from("tournament_results").update(payload).eq("id", current.id)
        : await supabase.from("tournament_results").insert(payload);
      if (error) throw error;
      toast.success("Tournament results saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Champion (1st)" value={c1} onChange={setC1} />
        <Field label="Runner-up (2nd)" value={c2} onChange={setC2} />
        <Field label="Third place" value={c3} onChange={setC3} />
        <Field label="Top scorer (1st)" value={t1} onChange={setT1} />
        <Field label="Top scorer (2nd)" value={t2} onChange={setT2} />
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={saving}>
          <Save className="mr-1 h-4 w-4" />
          {saving ? "Saving…" : "Save tournament results"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <Input value={value} maxLength={60} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
