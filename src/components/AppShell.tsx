import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Trophy, History, ShieldCheck, LogOut, Crown, ClipboardCheck, BarChart3, Moon, Sun, Tv2 } from "lucide-react";
import { useSession, setSession, isAdmin } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, ready } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!ready) return null;

  const nav = [
    { to: "/live", label: "Live", icon: Tv2 },
    { to: "/play", label: "Matchday", icon: Trophy },
    { to: "/tournament", label: "Tournament", icon: Crown },
    { to: "/results", label: "Results", icon: ClipboardCheck },
    { to: "/leaderboard", label: "Leaderboard", icon: BarChart3 },
    { to: "/history", label: "History", icon: History },
    ...(isAdmin(user) ? [{ to: "/admin", label: "Manage", icon: ShieldCheck }] : []),
  ];


  return (
    <div className="min-h-screen">
      <header
        className="sticky top-0 z-30 border-b"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,46,26,0.85), rgba(10,46,26,0.55))",
          backdropFilter: "blur(18px) saturate(140%)",
          borderColor: "rgba(255,215,0,0.22)",
        }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-4">
          <Link to="/play" className="flex items-center gap-2 font-bold tracking-tight">
            <span
              className="grid h-9 w-9 place-items-center rounded-xl"
              style={{
                background:
                  "linear-gradient(135deg, #FFD700 0%, #d4af37 100%)",
                color: "#0a2e1a",
                boxShadow: "0 6px 20px -6px rgba(255,215,0,0.55)",
              }}
            >
              <Trophy className="h-4 w-4" />
            </span>
            <span className="hidden text-foreground sm:inline">
              World Cup <span style={{ color: "#FFD700" }}>Pool</span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center justify-center gap-0.5 sm:gap-1">
            {nav.map((n) => {
              const Icon = n.icon;
              const active = pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className="relative inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors sm:px-3"
                  style={{
                    color: active ? "#FFD700" : "rgba(255,255,255,0.65)",
                  }}
                >
                  <span className="relative">
                    <Icon className="h-4 w-4" />
                    {n.to === "/live" && (
                      <span
                        className="absolute -right-1 -top-1 h-2 w-2 rounded-full"
                        style={{
                          background: "#ef4444",
                          boxShadow: "0 0 6px 2px rgba(239,68,68,0.7)",
                          animation: "pulse 1.5s ease-in-out infinite",
                        }}
                      />
                    )}
                  </span>
                  <span className="hidden sm:inline">{n.label}</span>
                  <span
                    className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full transition-all duration-300"
                    style={{
                      background: "linear-gradient(90deg, transparent, #FFD700, transparent)",
                      opacity: active ? 1 : 0,
                      transform: active ? "scaleX(1)" : "scaleX(0.4)",
                    }}
                  />
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user && (
              <>
                <span className="hidden text-sm sm:inline" style={{ color: "rgba(255,255,255,0.7)" }}>
                  @{user.username}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSession(null);
                    navigate({ to: "/" });
                  }}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">{children}</main>
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button variant="ghost" size="sm" onClick={toggle} aria-label="Toggle theme">
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
