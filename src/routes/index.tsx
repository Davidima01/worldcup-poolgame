import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginOrCreate, getSession } from "@/lib/session";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "World Cup Pool — Football Predictions" },
      {
        name: "description",
        content: "A friendly football prediction pool for friends. Pick 1/X/2 and exact scores.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getSession()) navigate({ to: "/live" });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await loginOrCreate(username);
      navigate({ to: "/live" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not continue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div
            className="mb-5 grid h-16 w-16 place-items-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg, #FFD700, #d4af37)",
              color: "#0a2e1a",
              boxShadow:
                "0 10px 40px -10px rgba(255,215,0,0.6), inset 0 1px 0 rgba(255,255,255,0.4)",
            }}
          >
            <Trophy className="h-8 w-8" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            World <span style={{ color: "#FFD700" }}>Cup</span> Pool
          </h1>
          <p className="mt-3 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
            Predict the matchday with your crew. No passwords, just a username.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl p-6 glass-strong">
          <div className="space-y-2">
            <Label htmlFor="username" className="text-foreground">Username</Label>
            <Input
              id="username"
              autoFocus
              autoComplete="off"
              placeholder="e.g. luca"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="border-gold/40 bg-white/5 text-foreground placeholder:text-white/40"
            />
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
              If it doesn't exist, we'll create it.
            </p>
          </div>
          <Button
            type="submit"
            className="w-full shimmer font-semibold"
            style={{
              background: "linear-gradient(135deg, #FFD700, #d4af37)",
              color: "#0a2e1a",
              border: "none",
            }}
            disabled={loading || !username.trim()}
          >
            {loading ? "Loading…" : "Enter the Pool"}
          </Button>
        </form>
      </div>
    </div>
  );
}
