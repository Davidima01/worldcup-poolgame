import { useEffect, useMemo, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Per-route background layer.
 * - Static image: /admin, /leaderboard
 * - Scroll-scrubbed video: /play, /results, /history
 * - Custom scenes: /, /tournament (preserved unchanged)
 * A dark overlay rgba(0,0,0,0.5) sits over the media for readability.
 * Premium UI finishes live on cards/tables, not here.
 */
export function SceneBackground() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const scene = useMemo(() => routeToScene(pathname), [pathname]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ background: "#0a2e1a" }}
    >
      {scene === "login" && <LoginScene />}
      {scene === "tournament" && <TournamentScene />}
      {scene === "admin" && (
        <StaticImage src="https://dtaseikeklfsknemnpus.supabase.co/storage/v1/object/public/DavidesBucket/modern-luxury-office.jpg" />
      )}
      {scene === "leaderboard" && (
        <StaticImage src="https://dtaseikeklfsknemnpus.supabase.co/storage/v1/object/public/DavidesBucket/1782366765235.jpg?v=2" />
      )}
      {(scene === "play" || scene === "results" || scene === "history") && <ScrollVideo />}
      {/* dark overlay for readability */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.5)" }}
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

/* =================== STATIC IMAGE =================== */
function StaticImage({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        zIndex: 0,
      }}
    />
  );
}

/* =================== SCROLL VIDEO =================== */
function ScrollVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let rafId = 0;
    let targetTime = 0;
    let currentTime = 0;
    let isReady = false;

    const onReady = () => {
      if (isReady) return;
      isReady = true;
      // Avvia e metti subito in pausa: forza il browser a bufferare i frame
      video.play().then(() => {
        video.pause();
        video.currentTime = 0;
        currentTime = 0;
        targetTime = 0;
      }).catch(() => {});
    };

    const handleScroll = () => {
      if (!video.duration) return;
      const scrollTop = window.scrollY;
      const maxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight);
      const progress = Math.min(1, scrollTop / maxScroll);
      targetTime = progress * video.duration;
    };

    const loop = () => {
      if (isReady && video.duration) {
        currentTime += (targetTime - currentTime) * 0.12;
        if (Math.abs(video.currentTime - currentTime) > 0.01) {
          video.currentTime = currentTime;
        }
      }
      rafId = requestAnimationFrame(loop);
    };

    video.addEventListener("canplaythrough", onReady);
    window.addEventListener("scroll", handleScroll, { passive: true });
    rafId = requestAnimationFrame(loop);

    return () => {
      video.removeEventListener("canplaythrough", onReady);
      window.removeEventListener("scroll", handleScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <video
      ref={videoRef}
      muted
      playsInline
      preload="auto"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        zIndex: 0,
      }}
      src="https://videos.pexels.com/video-files/28892463/12506627_2560_1440_30fps.mp4"
    />
  );
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