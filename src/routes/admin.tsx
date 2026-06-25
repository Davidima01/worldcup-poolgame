import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useSession, isAdmin } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Download, Save, UserX, ShieldAlert, Pencil, Users, Eye } from "lucide-react";
import { toast } from "sonner";
import { AdminBadge } from "@/components/AdminBadge";


export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Friends Pool" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { user, ready } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!ready) return;
    if (!user) navigate({ to: "/" });
    else if (!isAdmin(user)) navigate({ to: "/play" });
  }, [ready, user, navigate]);

  const [label, setLabel] = useState("");
  const today = new Date();
  const defaultLabel = `Giorno ${String(today.getDate()).padStart(2, "0")}/${String(
    today.getMonth() + 1,
  ).padStart(2, "0")}`;

  const { data: matchdays } = useQuery({
    queryKey: ["admin-matchdays"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matchdays")
        .select("id,label,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const createMatchday = async () => {
    const l = (label || defaultLabel).trim();
    if (!l) return;
    const { error } = await supabase.from("matchdays").insert({ label: l });
    if (error) toast.error(error.message);
    else {
      toast.success("Matchday created");
      setLabel("");
      qc.invalidateQueries({ queryKey: ["admin-matchdays"] });
    }
  };

  if (!ready || !user || !isAdmin(user)) return null;

  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Admin</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Create matchdays, add matches, monitor submissions, export results.
      </p>

      <section className="mb-8 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          New matchday
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              placeholder={defaultLabel}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <Button onClick={createMatchday}>
            <Plus className="mr-1 h-4 w-4" /> Create
          </Button>
        </div>
      </section>

      <div className="space-y-4">
        {(matchdays ?? []).map((md) => (
          <MatchdayAdminCard key={md.id} matchday={md} />
        ))}
        {matchdays && matchdays.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
            No matchdays yet.
          </div>
        )}
      </div>

      <UserPicksOverride />
      <TournamentOverride />
      <InactiveUsers />
      <UserPredictionsSection />
    </AppShell>
  );
}

type MD = { id: string; label: string };

function MatchdayAdminCard({ matchday }: { matchday: MD }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-md", matchday.id],
    queryFn: async () => {
      const { data: matches } = await supabase
        .from("matches")
        .select("id,home_team,away_team,kickoff_at,position")
        .eq("matchday_id", matchday.id)
        .order("kickoff_at", { ascending: true });
      const { data: subs } = await supabase
        .from("submissions")
        .select("id")
        .eq("matchday_id", matchday.id);
      return { matches: matches ?? [], subCount: subs?.length ?? 0 };
    },
  });

  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [kickoff, setKickoff] = useState("");

  const firstKickoff =
    data?.matches.length ? new Date(data.matches[0].kickoff_at) : null;
  const isClosed = !!firstKickoff && firstKickoff.getTime() <= Date.now();

  const addMatch = async () => {
    if (!home.trim() || !away.trim() || !kickoff) {
      toast.error("Fill all fields");
      return;
    }
    const { error } = await supabase.from("matches").insert({
      matchday_id: matchday.id,
      home_team: home.trim(),
      away_team: away.trim(),
      kickoff_at: new Date(kickoff).toISOString(),
      position: data?.matches.length ?? 0,
    });
    if (error) toast.error(error.message);
    else {
      setHome("");
      setAway("");
      setKickoff("");
      qc.invalidateQueries({ queryKey: ["admin-md", matchday.id] });
    }
  };

  const removeMatch = async (id: string) => {
    const { error } = await supabase.from("matches").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["admin-md", matchday.id] });
  };

  const deleteMatchday = async () => {
    if (!confirm(`Delete "${matchday.label}" and all its matches, submissions and predictions? This cannot be undone.`)) return;
    const { data: ms } = await supabase.from("matches").select("id").eq("matchday_id", matchday.id);
    const matchIds = (ms ?? []).map((m: any) => m.id);
    const { data: ss } = await supabase.from("submissions").select("id").eq("matchday_id", matchday.id);
    const subIds = (ss ?? []).map((s: any) => s.id);
    if (subIds.length) await supabase.from("predictions").delete().in("submission_id", subIds);
    if (matchIds.length) await supabase.from("match_results").delete().in("match_id", matchIds);
    if (subIds.length) await supabase.from("submissions").delete().in("id", subIds);
    if (matchIds.length) await supabase.from("matches").delete().in("id", matchIds);
    const { error } = await supabase.from("matchdays").delete().eq("id", matchday.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Matchday deleted");
    qc.invalidateQueries({ queryKey: ["admin-matchdays"] });
    qc.invalidateQueries({ queryKey: ["open-matchdays"] });
  };

  const exportCsv = async () => {
    // Fetch all submissions + users + predictions
    const { data: subs } = await supabase
      .from("submissions")
      .select("id,submitted_at,users(username)")
      .eq("matchday_id", matchday.id);
    const subIds = (subs ?? []).map((s: any) => s.id);
    let preds: any[] = [];
    if (subIds.length) {
      const { data } = await supabase
        .from("predictions")
        .select("submission_id,match_id,outcome,home_score,away_score")
        .in("submission_id", subIds);
      preds = data ?? [];
    }
    const matches = data?.matches ?? [];
    const header = ["username", ...matches.map((m: any) => `${m.home_team} vs ${m.away_team}`)];
    const rows = (subs ?? []).map((s: any) => {
      const row = [s.users?.username ?? "?"];
      for (const m of matches) {
        const p = preds.find((x) => x.submission_id === s.id && x.match_id === m.id);
        row.push(p ? `${p.outcome} | ${p.home_score}-${p.away_score}` : "");
      }
      return row;
    });
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${matchday.label.replace(/[^\w]+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{matchday.label}</h3>
            <Badge variant={isClosed ? "destructive" : "default"}>
              {isClosed ? "CLOSED" : "OPEN"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {data?.subCount ?? 0} submission{(data?.subCount ?? 0) === 1 ? "" : "s"}
            {firstKickoff ? ` · First kickoff ${firstKickoff.toLocaleString()}` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!isClosed}
          onClick={exportCsv}
          title={isClosed ? "Export CSV" : "Available after first kickoff"}
        >
          <Download className="mr-1 h-4 w-4" /> Export CSV
        </Button>
        <Button variant="destructive" size="sm" onClick={deleteMatchday}>
          <Trash2 className="mr-1 h-4 w-4" /> Delete matchday
        </Button>
      </div>

      <div className="space-y-2">
        {(data?.matches ?? []).map((m: any) => (
          <MatchRowEditable
            key={m.id}
            match={m}
            onChanged={() => qc.invalidateQueries({ queryKey: ["admin-md", matchday.id] })}
            onRemove={() => removeMatch(m.id)}
            canRemove={!isClosed}
          />
        ))}
        {data && data.matches.length === 0 && (
          <p className="text-sm text-muted-foreground">No matches yet.</p>
        )}
      </div>

      {!isClosed && (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <Input placeholder="Home team" value={home} onChange={(e) => setHome(e.target.value)} />
          <Input placeholder="Away team" value={away} onChange={(e) => setAway(e.target.value)} />
          <Input
            type="datetime-local"
            value={kickoff}
            onChange={(e) => setKickoff(e.target.value)}
          />
          <Button onClick={addMatch}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      )}
    </section>
  );
}

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function MatchRowEditable({
  match, onChanged, onRemove, canRemove,
}: {
  match: any;
  onChanged: () => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(() => toLocalInputValue(match.kickoff_at));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setVal(toLocalInputValue(match.kickoff_at)); }, [match.kickoff_at]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("matches")
      .update({ kickoff_at: new Date(val).toISOString() })
      .eq("id", match.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Kickoff updated");
    setEditing(false);
    onChanged();
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
      <div className="font-medium">
        {match.home_team} vs {match.away_team}
      </div>
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <Input
              type="datetime-local"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className="h-8 w-[200px]"
            />
            <Button size="sm" onClick={save} disabled={saving}>
              <Save className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </>
        ) : (
          <>
            <span className="text-xs text-muted-foreground">
              {new Date(match.kickoff_at).toLocaleString()}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} title="Edit kickoff">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onRemove} disabled={!canRemove}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   ADMIN: Override user predictions per matchday
   ========================================================= */
function UserPicksOverride() {
  const qc = useQueryClient();
  const [mdId, setMdId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");

  const { data: mds } = useQuery({
    queryKey: ["admin-all-mds"],
    queryFn: async () => {
      const { data } = await supabase.from("matchdays").select("id,label").order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const { data: users } = useQuery({
    queryKey: ["admin-all-users"],
    queryFn: async () => {
      const { data } = await supabase.from("users").select("id,username").order("username");
      return data ?? [];
    },
  });
  const { data: ctx } = useQuery({
    queryKey: ["admin-edit-ctx", mdId, userId],
    enabled: !!mdId && !!userId,
    queryFn: async () => {
      const { data: matches } = await supabase
        .from("matches")
        .select("id,home_team,away_team,kickoff_at")
        .eq("matchday_id", mdId)
        .order("kickoff_at", { ascending: true });
      const { data: sub } = await supabase
        .from("submissions")
        .select("id")
        .eq("matchday_id", mdId)
        .eq("user_id", userId)
        .maybeSingle();
      let preds: any[] = [];
      if (sub) {
        const { data: p } = await supabase
          .from("predictions")
          .select("id,match_id,outcome,home_score,away_score,edited_by_admin,admin_edited_at")
          .eq("submission_id", sub.id);
        preds = p ?? [];
      }
      return { matches: matches ?? [], submission: sub, preds };
    },
  });

  return (
    <section className="mt-10 rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Override user picks (any matchday, even closed)
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Matchday</Label>
          <select
            value={mdId}
            onChange={(e) => setMdId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— select —</option>
            {(mds ?? []).map((m: any) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>User</Label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— select —</option>
            {(users ?? []).map((u: any) => (
              <option key={u.id} value={u.id}>@{u.username}</option>
            ))}
          </select>
        </div>
      </div>

      {mdId && userId && ctx && (
        <div className="mt-5 space-y-3">
          {ctx.matches.length === 0 && (
            <p className="text-sm text-muted-foreground">No matches in this matchday.</p>
          )}
          {ctx.matches.map((m: any) => {
            const existing = ctx.preds.find((p) => p.match_id === m.id);
            return (
              <PredictionEditor
                key={m.id}
                match={m}
                existing={existing}
                submissionId={ctx.submission?.id ?? null}
                userId={userId}
                matchdayId={mdId}
                onSaved={() => qc.invalidateQueries({ queryKey: ["admin-edit-ctx", mdId, userId] })}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function PredictionEditor({
  match, existing, submissionId, userId, matchdayId, onSaved,
}: {
  match: any;
  existing?: { id: string; outcome: string; home_score: number; away_score: number; edited_by_admin?: boolean; admin_edited_at?: string | null };
  submissionId: string | null;
  userId: string;
  matchdayId: string;
  onSaved: () => void;
}) {
  const [outcome, setOutcome] = useState<"" | "1" | "X" | "2">((existing?.outcome as any) ?? "");
  const [home, setHome] = useState(existing ? String(existing.home_score) : "");
  const [away, setAway] = useState(existing ? String(existing.away_score) : "");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setOutcome((existing?.outcome as any) ?? "");
    setHome(existing ? String(existing.home_score) : "");
    setAway(existing ? String(existing.away_score) : "");
  }, [existing?.id]);

  const valid = outcome !== "" && /^\d{1,2}$/.test(home) && /^\d{1,2}$/.test(away);

  const save = async () => {
  if (!valid) return;
  setSaving(true);

  try {
    let subId = submissionId;

    if (!subId) {
      const { data, error } = await supabase
        .from("submissions")
        .insert({
          user_id: userId,
          matchday_id: matchdayId,
        })
        .select("id")
        .single();

      if (error) throw error;
      subId = data.id;
    }

    const { error } = await supabase
      .from("predictions")
      .upsert(
        {
          submission_id: subId,
          match_id: match.id,
          outcome: outcome as "1" | "X" | "2",
          home_score: Number(home),
          away_score: Number(away),
          edited_by_admin: true,
          admin_edited_at: new Date().toISOString(),
        },
        {
          onConflict: "submission_id,match_id",
        },
      );

    if (error) throw error;

    toast.success("Pick saved");
    onSaved();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Could not save");
  } finally {
    setSaving(false);
  }
};

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 font-medium">
          <span>{match.home_team} vs {match.away_team}</span>
          {existing?.edited_by_admin && <AdminBadge at={existing.admin_edited_at} />}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{new Date(match.kickoff_at).toLocaleString()}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(["1", "X", "2"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOutcome(o)}
              className={`h-9 w-10 rounded-md border text-sm font-medium ${
                outcome === o
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-secondary"
              }`}
            >{o}</button>
          ))}
        </div>
        <Input className="w-14 text-center" inputMode="numeric" value={home}
          onChange={(e) => setHome(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} />
        <span className="text-muted-foreground">–</span>
        <Input className="w-14 text-center" inputMode="numeric" value={away}
          onChange={(e) => setAway(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} />
        <Button size="sm" className="ml-auto" disabled={!valid || saving} onClick={save}>
          <Save className="mr-1 h-3.5 w-3.5" />
          {saving ? "Saving…" : existing ? "Update" : "Create"}
        </Button>
      </div>
    </div>
  );
}

/* =========================================================
   ADMIN: Override tournament picks
   ========================================================= */
function TournamentOverride() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-tournament"],
    queryFn: async () => {
      const [{ data: users }, { data: picks }] = await Promise.all([
        supabase.from("users").select("id,username").order("username"),
        supabase.from("tournament_predictions").select("id,user_id,champion,top_scorer,edited_by_admin,admin_edited_at"),
      ]);
      return { users: users ?? [], picks: picks ?? [] };
    },
  });

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Override tournament picks
        </h2>
      </div>
      <div className="space-y-2">
        {(data?.users ?? []).map((u: any) => {
          const pick = data?.picks.find((p: any) => p.user_id === u.id);
          return (
            <TournamentRowEditor
              key={u.id}
              user={u}
              pick={pick}
              onSaved={() => qc.invalidateQueries({ queryKey: ["admin-tournament"] })}
            />
          );
        })}
      </div>
    </section>
  );
}

function TournamentRowEditor({
  user, pick, onSaved,
}: { user: any; pick?: any; onSaved: () => void }) {
  const [champ, setChamp] = useState(pick?.champion ?? "");
  const [scorer, setScorer] = useState(pick?.top_scorer ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setChamp(pick?.champion ?? "");
    setScorer(pick?.top_scorer ?? "");
  }, [pick?.id]);

  const valid = champ.trim().length >= 2 && scorer.trim().length >= 2;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const payload = {
        champion: champ.trim(),
        top_scorer: scorer.trim(),
        edited_by_admin: true,
        admin_edited_at: new Date().toISOString(),
      };
      if (pick) {
        const { error } = await supabase.from("tournament_predictions").update(payload).eq("id", pick.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tournament_predictions").insert({ user_id: user.id, ...payload });
        if (error) throw error;
      }
      toast.success("Tournament pick saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        @{user.username}
        {pick?.edited_by_admin && <AdminBadge at={pick.admin_edited_at} />}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input placeholder="Champion" value={champ} onChange={(e) => setChamp(e.target.value)} maxLength={60} />
        <Input placeholder="Top scorer" value={scorer} onChange={(e) => setScorer(e.target.value)} maxLength={60} />
        <Button size="sm" disabled={!valid || saving} onClick={save}>
          <Save className="mr-1 h-3.5 w-3.5" />
          {saving ? "Saving…" : pick ? "Update" : "Create"}
        </Button>
      </div>
    </div>
  );
}

/* =========================================================
   ADMIN: Remove inactive users (>48h)
   ========================================================= */
function InactiveUsers() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-inactive"],
    queryFn: async () => {
      const [{ data: users }, { data: subs }, { data: tps }] = await Promise.all([
        supabase.from("users").select("id,username,created_at"),
        supabase.from("submissions").select("user_id,submitted_at"),
        supabase.from("tournament_predictions").select("user_id,submitted_at"),
      ]);
      const lastActivity = new Map<string, number>();
      (users ?? []).forEach((u: any) => lastActivity.set(u.id, new Date(u.created_at).getTime()));
      const bump = (uid: string, iso: string) => {
        const t = new Date(iso).getTime();
        if (t > (lastActivity.get(uid) ?? 0)) lastActivity.set(uid, t);
      };
      (subs ?? []).forEach((s: any) => bump(s.user_id, s.submitted_at));
      (tps ?? []).forEach((t: any) => bump(t.user_id, t.submitted_at));
      return (users ?? []).map((u: any) => ({
        ...u,
        lastActivity: lastActivity.get(u.id) ?? 0,
      }));
    },
  });

  const cutoff = Date.now() - 48 * 3600 * 1000;
  const inactive = useMemo(
    () => (data ?? []).filter((u: any) => u.lastActivity < cutoff).sort((a: any, b: any) => a.lastActivity - b.lastActivity),
    [data, cutoff],
  );

  const remove = async (u: any) => {
    if (!confirm(`Remove @${u.username}? This deletes their submissions, predictions and tournament picks.`)) return;
    const { data: subs } = await supabase.from("submissions").select("id").eq("user_id", u.id);
    const subIds = (subs ?? []).map((s: any) => s.id);
    if (subIds.length) await supabase.from("predictions").delete().in("submission_id", subIds);
    if (subIds.length) await supabase.from("submissions").delete().in("id", subIds);
    await supabase.from("tournament_predictions").delete().eq("user_id", u.id);
    const { error } = await supabase.from("users").delete().eq("id", u.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Removed @${u.username}`);
    qc.invalidateQueries({ queryKey: ["admin-inactive"] });
    qc.invalidateQueries({ queryKey: ["admin-all-users"] });
  };

  const fmtAgo = (t: number) => {
    const h = Math.floor((Date.now() - t) / 3600000);
    if (h < 48) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  };

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <UserX className="h-4 w-4 text-red-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Inactive users (48h+)
        </h2>
      </div>
      {inactive.length === 0 ? (
        <p className="text-sm text-muted-foreground">No inactive users.</p>
      ) : (
        <div className="space-y-2">
          {inactive.map((u: any) => (
            <div key={u.id} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm">
              <div>
                <span className="font-medium">@{u.username}</span>
                <span className="ml-2 text-xs text-muted-foreground">last active {fmtAgo(u.lastActivity)}</span>
              </div>
              <Button variant="destructive" size="sm" onClick={() => remove(u)}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Tipi ────────────────────────────────────────────────────────────────────
type UserProfile = { id: string; username: string };

type PredRow = {
  pred_id: string;
  submission_id: string;
  match_id: string;
  home_team: string;
  away_team: string;
  matchday_label: string;
  kickoff_at: string;
  outcome: "1" | "X" | "2";
  home_score: number;
  away_score: number;
};

type EditState = {
  outcome: "1" | "X" | "2";
  home_score: string;
  away_score: string;
};

// ─── Componente principale ────────────────────────────────────────────────────
function UserPredictionsSection() {
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [editMap, setEditMap] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  // Lista tutti gli utenti
  const { data: users } = useQuery<UserProfile[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username")
        .order("username");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Carica tutte le predictions dell'utente selezionato
  const { data: rows, isLoading: loadingRows } = useQuery<PredRow[]>({
    queryKey: ["admin-user-predictions", selectedUserId],
    enabled: !!selectedUserId,
    queryFn: async () => {
      // 1. Trova tutte le submissions dell'utente
      const { data: subs, error: e1 } = await supabase
        .from("submissions")
        .select("id, matchday_id")
        .eq("user_id", selectedUserId);
      if (e1) throw e1;
      if (!subs?.length) return [];

      const subIds = subs.map((s) => s.id);
      const matchdayIds = [...new Set(subs.map((s) => s.matchday_id))];

      // 2. Carica matchday labels
      const { data: mds, error: e2 } = await supabase
        .from("matchdays")
        .select("id, label")
        .in("id", matchdayIds);
      if (e2) throw e2;
      const mdMap = Object.fromEntries((mds ?? []).map((m) => [m.id, m.label]));

      // 3. Carica predictions con match
      const { data: preds, error: e3 } = await supabase
        .from("predictions")
        .select("id, submission_id, match_id, outcome, home_score, away_score")
        .in("submission_id", subIds);
      if (e3) throw e3;
      if (!preds?.length) return [];

      const matchIds = [...new Set(preds.map((p) => p.match_id))];

      // 4. Carica matches
      const { data: matches, error: e4 } = await supabase
        .from("matches")
        .select("id, home_team, away_team, kickoff_at, matchday_id")
        .in("id", matchIds);
      if (e4) throw e4;
      const matchMap = Object.fromEntries(
        (matches ?? []).map((m) => [m.id, m])
      );

      // 5. Assembla la sub→matchday map
      const subMatchdayMap = Object.fromEntries(
        subs.map((s) => [s.id, s.matchday_id])
      );

      return preds.map((p) => {
        const match = matchMap[p.match_id];
        const matchdayId = subMatchdayMap[p.submission_id];
        return {
          pred_id: p.id,
          submission_id: p.submission_id,
          match_id: p.match_id,
          home_team: match?.home_team ?? "?",
          away_team: match?.away_team ?? "?",
          kickoff_at: match?.kickoff_at ?? "",
          matchday_label: mdMap[matchdayId] ?? matchdayId,
          outcome: p.outcome,
          home_score: p.home_score,
          away_score: p.away_score,
        } as PredRow;
      }).sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));
    },
  });

  // ── Helpers edit ──────────────────────────────────────────────────────────
  const startEdit = (row: PredRow) => {
    setEditMap((prev) => ({
      ...prev,
      [row.pred_id]: {
        outcome: row.outcome,
        home_score: String(row.home_score),
        away_score: String(row.away_score),
      },
    }));
  };

  const cancelEdit = (predId: string) => {
    setEditMap((prev) => {
      const next = { ...prev };
      delete next[predId];
      return next;
    });
  };

  // ── Save edit ─────────────────────────────────────────────────────────────
  const saveEdit = async (predId: string) => {
    const e = editMap[predId];
    if (!e) return;
    setSaving((s) => ({ ...s, [predId]: true }));
    const { error } = await supabase
      .from("predictions")
      .update({
        outcome: e.outcome,
        home_score: Number(e.home_score),
        away_score: Number(e.away_score),
      })
      .eq("id", predId);
    setSaving((s) => ({ ...s, [predId]: false }));
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Prediction updated");
      cancelEdit(predId);
      qc.invalidateQueries({ queryKey: ["admin-user-predictions", selectedUserId] });
    }
  };

  // ── Delete prediction ─────────────────────────────────────────────────────
  const deletePrediction = async (row: PredRow) => {
    if (!confirm(`Delete prediction for ${row.home_team} vs ${row.away_team}?`)) return;
    setDeleting((d) => ({ ...d, [row.pred_id]: true }));

    const { error } = await supabase
      .from("predictions")
      .delete()
      .eq("id", row.pred_id);

    setDeleting((d) => ({ ...d, [row.pred_id]: false }));
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Prediction deleted");

    // Controlla se la submission è ora vuota → offri di cancellarla
    const { data: remaining } = await supabase
      .from("predictions")
      .select("id")
      .eq("submission_id", row.submission_id);

    if (remaining?.length === 0) {
      if (confirm("The submission is now empty. Delete it too?")) {
        await supabase.from("submissions").delete().eq("id", row.submission_id);
        toast.success("Empty submission deleted");
      }
    }

    qc.invalidateQueries({ queryKey: ["admin-user-predictions", selectedUserId] });
  };

  // ── Delete submission intera ───────────────────────────────────────────────
  const deleteSubmission = async (submissionId: string) => {
    if (!confirm("Delete the entire submission and all its predictions?")) return;
    // Prima cancella predictions (o usa cascade se già configurato nel DB)
    await supabase.from("predictions").delete().eq("submission_id", submissionId);
    const { error } = await supabase
      .from("submissions")
      .delete()
      .eq("id", submissionId);
    if (error) toast.error(error.message);
    else {
      toast.success("Submission deleted");
      qc.invalidateQueries({ queryKey: ["admin-user-predictions", selectedUserId] });
    }
  };

  // ── Raggruppamento per matchday ───────────────────────────────────────────
  const grouped = useMemo(() => {
    if (!rows) return [];
    const map = new Map<string, { label: string; rows: PredRow[] }>();
    for (const row of rows) {
      if (!map.has(row.matchday_label)) {
        map.set(row.matchday_label, { label: row.matchday_label, rows: [] });
      }
      map.get(row.matchday_label)!.rows.push(row);
    }
    return [...map.values()];
  }, [rows]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">User Predictions Editor</h2>
      </div>

      {/* Dropdown utente */}
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1.5 w-64">
          <Label htmlFor="user-select">Select user</Label>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger id="user-select">
              <SelectValue placeholder="Choose a user…" />
            </SelectTrigger>
            <SelectContent>
              {(users ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  @{u.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Contenuto */}
      {!selectedUserId ? (
        <p className="text-sm text-muted-foreground">
          Select a user to see their predictions.
        </p>
      ) : loadingRows ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">No predictions found.</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ label, rows: groupRows }) => {
            // Raggruppa le submission per questo matchday
            const subIds = [...new Set(groupRows.map((r) => r.submission_id))];

            return (
              <div key={label} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {label}
                  </h3>
                  {subIds.length === 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive gap-1"
                      onClick={() => deleteSubmission(subIds[0])}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete submission
                    </Button>
                  )}
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Match</th>
                        <th className="px-3 py-2 text-left font-medium">Kickoff</th>
                        <th className="px-3 py-2 text-left font-medium">Outcome</th>
                        <th className="px-3 py-2 text-left font-medium">Score</th>
                        <th className="px-3 py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {groupRows.map((row) => {
                        const isEditing = !!editMap[row.pred_id];
                        const ed = editMap[row.pred_id];
                        const isSaving = !!saving[row.pred_id];
                        const isDeleting = !!deleting[row.pred_id];

                        return (
                          <tr key={row.pred_id} className="hover:bg-muted/30 transition-colors">
                            {/* Match */}
                            <td className="px-3 py-2 font-medium">
                              {row.home_team} vs {row.away_team}
                            </td>

                            {/* Kickoff */}
                            <td className="px-3 py-2 text-muted-foreground text-xs">
                              {new Date(row.kickoff_at).toLocaleString()}
                            </td>

                            {/* Outcome */}
                            <td className="px-3 py-2">
                              {isEditing ? (
                                <div className="flex gap-1">
                                  {(["1", "X", "2"] as const).map((o) => (
                                    <button
                                      key={o}
                                      onClick={() =>
                                        setEditMap((prev) => ({
                                          ...prev,
                                          [row.pred_id]: { ...ed, outcome: o },
                                        }))
                                      }
                                      className={`h-7 w-8 rounded border text-xs font-medium transition-colors ${
                                        ed.outcome === o
                                          ? "border-primary bg-primary text-primary-foreground"
                                          : "border-border bg-background hover:bg-secondary"
                                      }`}
                                    >
                                      {o}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <Badge variant="outline">{row.outcome}</Badge>
                              )}
                            </td>

                            {/* Score */}
                            <td className="px-3 py-2">
                              {isEditing ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    className="h-7 w-12 text-center text-xs"
                                    value={ed.home_score}
                                    onChange={(e) =>
                                      setEditMap((prev) => ({
                                        ...prev,
                                        [row.pred_id]: {
                                          ...ed,
                                          home_score: e.target.value.replace(/[^0-9]/g, "").slice(0, 2),
                                        },
                                      }))
                                    }
                                  />
                                  <span className="text-muted-foreground">–</span>
                                  <Input
                                    className="h-7 w-12 text-center text-xs"
                                    value={ed.away_score}
                                    onChange={(e) =>
                                      setEditMap((prev) => ({
                                        ...prev,
                                        [row.pred_id]: {
                                          ...ed,
                                          away_score: e.target.value.replace(/[^0-9]/g, "").slice(0, 2),
                                        },
                                      }))
                                    }
                                  />
                                </div>
                              ) : (
                                <span className="tabular-nums">
                                  {row.home_score} – {row.away_score}
                                </span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1">
                                {isEditing ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="h-7 px-2 text-xs"
                                      disabled={isSaving}
                                      onClick={() => saveEdit(row.pred_id)}
                                    >
                                      {isSaving ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Save className="h-3 w-3" />
                                      )}
                                      Save
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => cancelEdit(row.pred_id)}
                                    >
                                      Cancel
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => startEdit(row)}
                                    >
                                      <Pencil className="h-3 w-3" />
                                      Edit
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                      disabled={isDeleting}
                                      onClick={() => deletePrediction(row)}
                                    >
                                      {isDeleting ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3 w-3" />
                                      )}
                                      Delete
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}