import { useEffect, useMemo, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Per-route animated background layer. Pure CSS + lightweight canvas.
 * Sits fixed behind all content (z-0). Content uses z-10.
 */
export function SceneBackground() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const scene = useMemo(() => routeToScene(pathname), [pathname]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, #0f3d24 0%, #0a2e1a 45%, #061a10 100%)",
      }}
    >
      {scene === "login" && <LoginScene />}
      {scene === "play" && <PlayScene />}
      {scene === "tournament" && <TournamentScene />}
      {scene === "results" && <ResultsScene />}
      {scene === "leaderboard" && <LeaderboardScene />}
      {scene === "history" && <HistoryScene />}
      {scene === "admin" && <AdminScene />}
      {/* universal vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </div>
  );
}

function routeToScene(path: string) {
  if (path === "/" || path === "") return "login";
  if (path.startsWith("/play")) return "play";
  if (path.startsWith("/tournament")) return "tournament";
  if (path.startsWith("/results")) return "results";
  if (path.startsWith("/leaderboard")) return "leaderboard";
  if (path.startsWith("/history")) return "history";
  if (path.startsWith("/admin")) return "admin";
  return "login";
}

/* =================== LOGIN =================== */
function LoginScene() {
  return (
    <>
      <div
        className="absolute left-1/2 top-1/2 h-[180vmax] w-[180vmax] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgba(255,215,0,0.10) 8deg, transparent 16deg, transparent 60deg, rgba(255,215,0,0.07) 68deg, transparent 76deg, transparent 180deg, rgba(255,215,0,0.08) 188deg, transparent 196deg, transparent 300deg, rgba(255,215,0,0.06) 308deg, transparent 316deg)",
          animation: "beam-spin 60s linear infinite",
          opacity: 0.7,
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(255,215,0,0.25) 0%, transparent 70%)",
          animation: "pulse-glow 6s ease-in-out infinite",
        }}
      />
      <GoldParticles count={40} />
      {/* stadium silhouette */}
      <svg
        className="absolute bottom-0 left-0 w-full"
        viewBox="0 0 1440 200"
        preserveAspectRatio="none"
        style={{ height: "30vh", opacity: 0.85 }}
      >
        <path
          d="M0,200 L0,140 C120,90 260,70 360,90 C460,110 520,60 640,55 C760,50 820,100 960,95 C1100,90 1180,55 1320,75 C1380,84 1420,110 1440,130 L1440,200 Z"
          fill="#04130a"
        />
        <path
          d="M0,200 L0,170 C200,150 380,160 600,150 C820,140 1000,170 1440,160 L1440,200 Z"
          fill="#020b06"
        />
      </svg>
    </>
  );
}

function GoldParticles({ count = 30 }: { count?: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        size: 2 + Math.random() * 3,
        delay: Math.random() * 14,
        duration: 14 + Math.random() * 16,
        opacity: 0.4 + Math.random() * 0.5,
      })),
    [count]
  );
  return (
    <div className="absolute inset-0">
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute bottom-0 rounded-full"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: "radial-gradient(circle, #FFD700, transparent 70%)",
            opacity: p.opacity,
            animation: `drift-up ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* =================== PLAY =================== */
function PlayScene() {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, rgba(180,220,180,0.18) 0%, transparent 60%)",
        }}
      />
      {/* floodlight glow corners */}
      <div
        className="absolute -left-40 -top-40 h-[60vmin] w-[60vmin] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,200,0.20), transparent 70%)" }}
      />
      <div
        className="absolute -right-40 -top-40 h-[60vmin] w-[60vmin] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,200,0.20), transparent 70%)" }}
      />
      <svg
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        viewBox="0 0 800 500"
        style={{ width: "min(120vw, 1100px)", opacity: 0.55 }}
      >
        <g
          fill="none"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="2"
          strokeDasharray="1200"
          style={{ animation: "pitch-draw 2.4s ease-out forwards" }}
        >
          <rect x="40" y="40" width="720" height="420" />
          <line x1="400" y1="40" x2="400" y2="460" />
          <circle cx="400" cy="250" r="70" />
          <rect x="40" y="140" width="120" height="220" />
          <rect x="640" y="140" width="120" height="220" />
          <rect x="40" y="200" width="50" height="100" />
          <rect x="710" y="200" width="50" height="100" />
        </g>
      </svg>
      {/* crowd haze */}
      <div
        className="absolute inset-x-0 bottom-0 h-40"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.6), transparent)",
        }}
      />
    </>
  );
}

/* =================== TOURNAMENT =================== */
function TournamentScene() {
  return (
    <>
      <div
        className="absolute left-1/2 top-1/2 h-[80vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(255,215,0,0.28) 0%, rgba(255,215,0,0.06) 40%, transparent 70%)",
          animation: "pulse-glow 5s ease-in-out infinite",
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-[200vmax] w-[200vmax] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgba(255,215,0,0.08) 10deg, transparent 30deg, transparent 120deg, rgba(255,215,0,0.06) 130deg, transparent 150deg, transparent 240deg, rgba(255,215,0,0.07) 250deg, transparent 270deg)",
          animation: "beam-spin 90s linear infinite",
        }}
      />
      {/* trophy silhouette */}
      <svg
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        viewBox="0 0 200 280"
        style={{ width: "min(50vmin, 380px)", opacity: 0.1 }}
      >
        <path
          d="M60 20 H140 V60 Q140 130 100 150 Q60 130 60 60 Z M40 30 Q10 40 20 80 Q30 110 60 110 M160 30 Q190 40 180 80 Q170 110 140 110 M90 150 H110 V190 H90 Z M60 190 H140 V210 H60 Z M50 210 H150 V240 H50 Z"
          fill="#FFD700"
        />
      </svg>
    </>
  );
}

/* =================== RESULTS =================== */
function ResultsScene() {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(20,40,80,0.4) 0%, transparent 60%)",
        }}
      />
      {/* scoreboard flicker */}
      <div
        className="absolute left-1/2 top-[18%] h-2 w-[60vmin] -translate-x-1/2 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,215,0,0.6), transparent)",
          filter: "blur(6px)",
          animation: "flicker 3s ease-in-out infinite",
        }}
      />
      {/* light sweep */}
      <div
        className="absolute -top-20 left-0 h-[140vh] w-[40vw]"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(180,220,255,0.18), transparent)",
          animation: "sweep-light 9s ease-in-out infinite",
        }}
      />
      {/* city lights */}
      <div className="absolute bottom-0 left-0 right-0 h-32">
        {Array.from({ length: 60 }).map((_, i) => (
          <span
            key={i}
            className="absolute bottom-2 rounded-full"
            style={{
              left: `${(i / 60) * 100}%`,
              width: 2,
              height: 2,
              background: i % 3 === 0 ? "#FFD700" : "#cfe7ff",
              opacity: 0.6,
              boxShadow: "0 0 6px currentColor",
              animation: `flicker ${2 + (i % 5)}s ease-in-out ${i * 0.1}s infinite`,
            }}
          />
        ))}
      </div>
    </>
  );
}

/* =================== LEADERBOARD =================== */
function LeaderboardScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);
    const colors = ["#FFD700", "#ffffff", "#ffcf40", "#fff7c2"];
    type P = { x: number; y: number; vx: number; vy: number; r: number; rot: number; vr: number; c: string };
    const particles: P[] = Array.from({ length: 110 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      vx: (Math.random() - 0.5) * 0.3 * dpr,
      vy: (0.3 + Math.random() * 0.6) * dpr,
      r: (2 + Math.random() * 3) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.04,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const fade = ctx.createLinearGradient(0, 0, 0, canvas.height);
      fade.addColorStop(0, "rgba(255,215,0,0.0)");
      fade.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fade;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > canvas.height + 10) {
          p.y = -10;
          p.x = Math.random() * canvas.width;
        }
        const alpha = Math.max(0, 1 - p.y / canvas.height);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return (
    <>
      <div
        className="absolute left-1/2 top-1/3 h-[80vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(255,215,0,0.18), transparent 70%)",
          animation: "pulse-glow 7s ease-in-out infinite",
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </>
  );
}

/* =================== HISTORY =================== */
function HistoryScene() {
  return (
    <div
      id="scene-history-layer"
      className="absolute inset-0"
      style={{ animation: "parallax-drift 18s ease-in-out infinite alternate" }}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 800 600"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* pitch top-down */}
        <defs>
          <radialGradient id="hpitch" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1d5a36" />
            <stop offset="100%" stopColor="#0a2e1a" />
          </radialGradient>
        </defs>
        <ellipse cx="400" cy="320" rx="320" ry="200" fill="url(#hpitch)" opacity="0.85" />
        <g fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
          <rect x="200" y="220" width="400" height="200" />
          <line x1="400" y1="220" x2="400" y2="420" />
          <circle cx="400" cy="320" r="45" />
        </g>
        {/* stands */}
        <g fill="#04130a" opacity="0.75">
          <ellipse cx="400" cy="320" rx="380" ry="260" />
          <ellipse cx="400" cy="320" rx="330" ry="215" fill="#0a2e1a" />
        </g>
        <g fill="#02100a" opacity="0.6">
          <rect x="80" y="100" width="640" height="40" rx="20" />
          <rect x="60" y="480" width="680" height="50" rx="20" />
        </g>
      </svg>
    </div>
  );
}

/* =================== ADMIN =================== */
function AdminScene() {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,40,50,0.35) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "linear-gradient(rgba(80,200,180,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(80,200,180,0.12) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          animation: "grid-pan 14s linear infinite",
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(80,220,200,0.18), transparent 70%)",
          animation: "pulse-glow 8s ease-in-out infinite",
        }}
      />
      <GoldParticles count={18} />
    </>
  );
}