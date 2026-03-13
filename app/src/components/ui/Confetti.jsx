import { useEffect, useRef } from 'react';

const COLORS     = ['#f97316', '#fb923c', '#fbbf24', '#4ade80', '#60a5fa', '#c084fc', '#f43f5e', '#ffffff'];
const SPAWN_RATE = 8;
const FADE_MS    = 350;

function spawnParticle(width) {
  return {
    x:     Math.random() * width,
    y:     -12,
    vx:    (Math.random() - 0.5) * 5,
    vy:    Math.random() * 3 + 2,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    w:     Math.random() * 11 + 5,
    h:     Math.random() * 6  + 3,
    angle: Math.random() * Math.PI * 2,
    spin:  (Math.random() - 0.5) * 0.22,
  };
}

export function Confetti({ matchWin = false, teamName = '', onDone }) {
  const rainMs  = matchWin ? 15000 : 5000;
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    const particles = [];
    let rafId;
    let startTime = null;

    function draw(ts) {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;

      // Spawn continuously for rainMs
      if (elapsed < rainMs) {
        for (let i = 0; i < SPAWN_RATE; i++) particles.push(spawnParticle(canvas.width));
      }

      // Fade out after rainMs
      const alpha = elapsed < rainMs
        ? 1
        : Math.max(0, 1 - (elapsed - rainMs) / FADE_MS);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x     += p.vx;
        p.y     += p.vy;
        p.vy    += 0.13;
        p.angle += p.spin;

        // Remove once off-screen
        if (p.y > canvas.height + 20) { particles.splice(i, 1); continue; }

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (elapsed < rainMs + FADE_MS) {
        rafId = requestAnimationFrame(draw);
      } else {
        onDone?.();
      }
    }

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [rainMs]);

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-center">
      <canvas ref={canvasRef} className="absolute inset-0" />
      {matchWin && (
        <p className="relative text-center font-black uppercase tracking-widest leading-tight
          text-white animate-win-flash
          drop-shadow-[0_0_24px_rgba(249,115,22,0.9)]"
          style={{ fontSize: 'clamp(2rem, 8vmin, 5rem)' }}
        >
          {teamName || 'HOME'}<br />WINS
        </p>
      )}
    </div>
  );
}
