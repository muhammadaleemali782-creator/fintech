import { useEffect, useRef, useMemo } from "react";

const CODE_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789(){}[]<>;:,._-+=!@#$%^&*|\\/\"'`~?";

// Helper to generate ASCII code block once
const generateAscii = (w = 40, h = 14) => {
  const lines = [];
  const snippets = [
    "// EDUCA_FINTECH_PROTOCOL v4.2",
    "const SAVINGS_APY = 0.1200;",
    "const RECHARGE_LOAN = 199.00;",
    "const BIKE_LOAN_MAX = 150000;",
    "verify_identity(uid, KYC_LEVEL_1);",
    "instant_disburse_upi(user, amount);",
    "function calculate_interest(p, t) {",
    "  return p * Math.pow(1 + 0.12, t);",
    "}",
    "sha256_hash_signature(tx_token);",
    "emit_approval_webhook(admin_channel);",
    "play_audio_chime(FREQS.HIGH);",
  ];

  for (let r = 0; r < h; r++) {
    let line = snippets[r % snippets.length];
    while (line.length < w) {
      line += " " + CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    lines.push(line.slice(0, w));
  }
  return lines.join("\n");
};

// Card themes for Educa Fintech
const cardDefs = [
  {
    id: "savings",
    type: "12% SAVINGS ACCOUNT",
    badge: "WORLD'S HIGHEST",
    bg: "linear-gradient(135deg, #0F2027 0%, #203A43 50%, #2C5364 100%)",
    accent: "#00E5FF",
    name: "12% Interest Savings",
    tagline: "No bank in the world offers 12% on savings",
    number: "•••• •••• •••• 1200",
    valid: "PERPETUAL",
    icon: "🏦",
    asciiCode: generateAscii(36, 13),
  },
  {
    id: "recharge",
    type: "₹199 RECHARGE MICRO LOAN",
    badge: "ZERO CIBIL NEEDED",
    bg: "linear-gradient(135deg, #1A1C29 0%, #162447 60%, #1F4068 100%)",
    accent: "#00F5D4",
    name: "Mobile Recharge Loan",
    tagline: "Instant ₹199 UPI credit for your phone",
    number: "•••• •••• •••• 0199",
    valid: "INSTANT",
    icon: "📱",
    asciiCode: generateAscii(36, 13),
  },
  {
    id: "bike",
    type: "BIKE & VEHICLE LOAN",
    badge: "UP TO ₹1,50,000",
    bg: "linear-gradient(135deg, #232526 0%, #414345 100%)",
    accent: "#FFB703",
    name: "Two-Wheeler Easy EMI",
    tagline: "Apni bike ka sapna pura karein",
    number: "•••• •••• •••• 8840",
    valid: "36 MONTHS",
    icon: "🏍️",
    asciiCode: generateAscii(36, 13),
  },
  {
    id: "school",
    type: "SCHOOL FEES LOAN",
    badge: "PARENT RELIEF",
    bg: "linear-gradient(135deg, #111E25 0%, #1D6AE5 100%)",
    accent: "#70E000",
    name: "Student Education EMI",
    tagline: "Direct school fee payment with 0% advance",
    number: "•••• •••• •••• 5521",
    valid: "QUARTERLY",
    icon: "🎒",
    asciiCode: generateAscii(36, 13),
  },
  {
    id: "investment",
    type: "EDUCA WEALTH POOL",
    badge: "18% ANNUAL YIELD",
    bg: "linear-gradient(135deg, #141E30 0%, #243B55 100%)",
    accent: "#FF007F",
    name: "High-Yield Investment",
    tagline: "Earn monthly passive fintech returns",
    number: "•••• •••• •••• 9999",
    valid: "PREMIUM",
    icon: "📈",
    asciiCode: generateAscii(36, 13),
  },
];

export default function EvervaultCardScanner() {
  const containerRef = useRef(null);
  const cardLineRef = useRef(null);
  const particleCanvasRef = useRef(null);
  const scannerCanvasRef = useRef(null);
  const isVisibleRef = useRef(true);

  const stateRef = useRef({
    position: 0,
    velocity: 28, // Smooth, consistent speed
    direction: -1, // Infinite leftward flow
    lastTime: performance.now(),
    scanningActive: false,
  });

  // 15 cards (3 clean cycles of 5 cards) gives ample track buffer on any screen with 40% less DOM weight
  const repeatedCards = useMemo(
    () =>
      Array.from({ length: 15 }, (_, i) => ({
        ...cardDefs[i % cardDefs.length],
        idx: i,
      })),
    []
  );

  /* ═══════════════════════════════════════════════════════════
     VIEWPORT VISIBILITY OBSERVER (Sleep when scrolled away)
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting) {
          stateRef.current.lastTime = performance.now();
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  /* ═══════════════════════════════════════════════════════════
     1. BACKGROUND STARS CANVAS (Optimized, lightweight)
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const canvas = particleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    let animId;

    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const count = isMobile ? 14 : 36;

    const resize = () => {
      canvas.width = canvas.parentElement?.offsetWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.offsetHeight || 380;
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * (canvas.width || 400),
      y: Math.random() * (canvas.height || 380),
      vx: (Math.random() - 0.5) * 0.25 + 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      size: Math.random() * 1.8 + 1,
      alpha: Math.random() * 0.45 + 0.25,
      color: Math.random() > 0.5 ? "rgba(0, 229, 255," : "rgba(167, 139, 250,",
    }));

    let lastTick = performance.now();

    const render = (now) => {
      if (!isVisibleRef.current) {
        animId = requestAnimationFrame(render);
        return;
      }

      // Throttle background stars to ~30fps on mobile to preserve GPU fill rate
      if (isMobile && now - lastTick < 33) {
        animId = requestAnimationFrame(render);
        return;
      }
      lastTick = now;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;

      for (let i = 0; i < count; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x > w + 5) p.x = -5;
        if (p.x < -5) p.x = w + 5;
        if (p.y > h + 5) p.y = -5;
        if (p.y < -5) p.y = h + 5;

        ctx.fillStyle = `${p.color}${p.alpha})`;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  /* ═══════════════════════════════════════════════════════════
     2. VERTICAL SCANNER LASER BEAM CANVAS (Pre-pooled sparks)
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const canvas = scannerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    let animId;

    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const maxParticles = isMobile ? 12 : 28;

    let coreGrad = null;
    let glowGradScan = null;
    let glowGradIdle = null;
    let lightBarX = 0;
    const lightBarWidth = isMobile ? 3 : 4;

    const resize = () => {
      const w = canvas.parentElement?.offsetWidth || window.innerWidth;
      const h = canvas.parentElement?.offsetHeight || 380;
      canvas.width = w;
      canvas.height = h;
      lightBarX = w / 2;

      coreGrad = ctx.createLinearGradient(lightBarX - 3, 0, lightBarX + 3, 0);
      coreGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
      coreGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.95)");
      coreGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

      glowGradScan = ctx.createLinearGradient(lightBarX - 22, 0, lightBarX + 22, 0);
      glowGradScan.addColorStop(0, "rgba(0, 229, 255, 0)");
      glowGradScan.addColorStop(0.5, "rgba(37, 99, 235, 0.5)");
      glowGradScan.addColorStop(1, "rgba(0, 229, 255, 0)");

      glowGradIdle = ctx.createLinearGradient(lightBarX - 18, 0, lightBarX + 18, 0);
      glowGradIdle.addColorStop(0, "rgba(0, 229, 255, 0)");
      glowGradIdle.addColorStop(0.5, "rgba(0, 229, 255, 0.3)");
      glowGradIdle.addColorStop(1, "rgba(0, 229, 255, 0)");
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    // Pre-allocated static pool (zero garbage collection churn)
    const pool = Array.from({ length: maxParticles }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      alpha: 0,
      r: 1,
      color: "rgba(0, 229, 255,",
    }));

    const spawnSpark = (h) => {
      for (let i = 0; i < maxParticles; i++) {
        const p = pool[i];
        if (!p.active) {
          p.active = true;
          p.x = lightBarX + (Math.random() - 0.5) * 3;
          p.y = Math.random() * h;
          p.vx = (Math.random() * 1.3 + 0.3) * (Math.random() > 0.3 ? 1 : -1);
          p.vy = (Math.random() - 0.5) * 0.6;
          p.alpha = 0.95;
          p.r = Math.random() * 1.5 + 0.6;
          p.color = Math.random() > 0.5 ? "rgba(0, 229, 255," : "rgba(196, 181, 253,";
          return;
        }
      }
    };

    const render = () => {
      if (!isVisibleRef.current) {
        animId = requestAnimationFrame(render);
        return;
      }

      const w = canvas.width;
      const h = canvas.height;
      const isScanning = stateRef.current.scanningActive;

      ctx.clearRect(0, 0, w, h);

      // 1. Core bright laser beam
      if (coreGrad) {
        ctx.fillStyle = coreGrad;
        ctx.fillRect(lightBarX - lightBarWidth / 2, 0, lightBarWidth, h);
      }

      // 2. Cyan / Blue Glow beam
      const currentGlow = isScanning ? glowGradScan : glowGradIdle;
      if (currentGlow) {
        ctx.fillStyle = currentGlow;
        ctx.fillRect(lightBarX - 18, 0, 36, h);
      }

      // 3. Emit spray particles
      if (Math.random() < (isScanning ? 0.75 : 0.35)) {
        spawnSpark(h);
      }

      for (let i = 0; i < maxParticles; i++) {
        const p = pool[i];
        if (!p.active) continue;

        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= isScanning ? 0.024 : 0.034;

        if (p.alpha <= 0) {
          p.active = false;
          continue;
        }

        ctx.fillStyle = `${p.color}${p.alpha})`;
        ctx.fillRect(p.x, p.y, p.r, p.r);
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  /* ═══════════════════════════════════════════════════════════
     3. ZERO-REFLOW HARDWARE-ACCELERATED CARD STREAM
        (Only 1 card crossing the laser has clip-path;
         all other cards use plain display without clip overhead)
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const container = containerRef.current;
    const cardLine = cardLineRef.current;
    if (!container || !cardLine) return;

    let animId;
    let cardData = [];
    let wrapWidth = 0;
    let scannerX = 0;

    const updateDimensions = () => {
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width || window.innerWidth;
      scannerX = containerWidth * 0.5;

      // Reset transform temporarily for measurement
      cardLine.style.transform = "translate3d(0px, 0, 0)";

      const wrappers = Array.from(cardLine.querySelectorAll(".evervault-card-wrapper"));
      cardData = wrappers.map((wrapper) => {
        const rect = wrapper.getBoundingClientRect();
        return {
          wrapper,
          normal: wrapper.querySelector(".card-normal"),
          ascii: wrapper.querySelector(".card-ascii"),
          baseLeft: rect.left - containerRect.left,
          width: rect.width,
          state: 999, // Force recalculation
        };
      });

      cardLine.style.transform = `translate3d(${stateRef.current.position}px, 0, 0)`;

      // 5 cards = 1 cycle of cardDefs. When wrapping, shift by 5 cards (seamless repeat)
      if (cardData.length >= 5 && cardData[5]) {
        wrapWidth = cardData[5].baseLeft - cardData[0].baseLeft;
      } else {
        wrapWidth = (cardData[0]?.width || 280) * 5;
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions, { passive: true });

    const animateLoop = () => {
      if (!isVisibleRef.current) {
        stateRef.current.lastTime = performance.now();
        animId = requestAnimationFrame(animateLoop);
        return;
      }

      const s = stateRef.current;
      const now = performance.now();
      const dt = Math.min((now - s.lastTime) / 1000, 0.05);
      s.lastTime = now;

      // Move leftward
      s.position += s.velocity * s.direction * dt;

      // Infinite wrap by exactly 1 cycle (5 cards)
      if (wrapWidth > 0 && s.position <= -wrapWidth) {
        s.position += wrapWidth;
        for (let i = 0; i < cardData.length; i++) {
          cardData[i].state = 999;
        }
      }

      cardLine.style.transform = `translate3d(${s.position}px, 0, 0)`;

      // Extremely efficient clipping: only the 1 card crossing the laser has clip-path
      let anyScanning = false;
      const pos = s.position;

      for (let i = 0; i < cardData.length; i++) {
        const card = cardData[i];
        if (!card.normal || !card.ascii) continue;

        const cardLeft = card.baseLeft + pos;
        const cardRight = cardLeft + card.width;

        if (cardRight <= scannerX) {
          // Fully past scanner -> 100% decrypted ASCII, normal hidden
          if (card.state !== 1) {
            card.normal.style.display = "none";
            card.ascii.style.display = "flex";
            card.ascii.style.clipPath = "none";
            card.state = 1;
          }
        } else if (cardLeft >= scannerX) {
          // Not yet reached scanner -> 100% normal card, ascii hidden
          if (card.state !== -1) {
            card.normal.style.display = "flex";
            card.normal.style.clipPath = "none";
            card.ascii.style.display = "none";
            card.state = -1;
          }
        } else {
          // Actively crossing the scanner beam -> Apply split clip-path only to this card!
          anyScanning = true;
          if (card.state !== 0) {
            card.normal.style.display = "flex";
            card.ascii.style.display = "flex";
            card.state = 0;
          }
          const progress = Math.max(0, Math.min(100, ((scannerX - cardLeft) / card.width) * 100));
          const pStr = progress.toFixed(1);
          card.normal.style.clipPath = `inset(0 0 0 ${pStr}%)`;
          card.ascii.style.clipPath = `inset(0 calc(100% - ${pStr}%) 0 0)`;
        }
      }

      s.scanningActive = anyScanning;
      animId = requestAnimationFrame(animateLoop);
    };

    animId = requestAnimationFrame(animateLoop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", updateDimensions);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden bg-[#0A0D14] py-8 my-5 border-y border-white/10 shadow-2xl pointer-events-none select-none"
      style={{
        minHeight: "380px",
        contain: "layout paint",
      }}
    >
      {/* 1. BACKGROUND STARS CANVAS */}
      <canvas
        ref={particleCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-0 opacity-70"
      />

      {/* 2. VERTICAL LASER SCANNER CANVAS */}
      <canvas
        ref={scannerCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-20"
      />

      {/* 3. NON-INTERACTIVE CONTINUOUS CARD STREAM */}
      <div className="relative w-full h-[280px] sm:h-[310px] md:h-[340px] flex items-center z-10 overflow-visible pointer-events-none">
        <div
          ref={cardLineRef}
          className="flex items-center gap-6 sm:gap-8 whitespace-nowrap will-change-transform px-4 pointer-events-none"
          style={{
            transform: "translate3d(0px, 0, 0)",
            willChange: "transform",
          }}
        >
          {repeatedCards.map((c, i) => (
            <div
              key={i}
              className="evervault-card-wrapper relative shrink-0 w-[260px] h-[165px] sm:w-[320px] sm:h-[200px] md:w-[360px] md:h-[225px] rounded-2xl overflow-hidden pointer-events-none"
              style={{
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.7)",
                contain: "paint",
              }}
            >
              {/* (A) NORMAL CARD DESIGN */}
              <div
                className="card-normal absolute inset-0 rounded-2xl p-4 sm:p-5 text-white flex flex-col justify-between overflow-hidden border border-white/15 pointer-events-none"
                style={{
                  background: c.bg,
                  transform: "translateZ(0)",
                  backfaceVisibility: "hidden",
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl sm:text-2xl">{c.icon}</span>
                    <div>
                      <div className="text-[8px] sm:text-[9px] tracking-wider uppercase font-bold text-white/60">
                        {c.type}
                      </div>
                      <div className="text-xs sm:text-sm font-extrabold text-white">
                        {c.name}
                      </div>
                    </div>
                  </div>
                  <span
                    className="text-[8px] sm:text-[9px] font-black px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${c.accent}25`,
                      color: c.accent,
                      border: `1px solid ${c.accent}60`,
                    }}
                  >
                    {c.badge}
                  </span>
                </div>

                {/* Card Number & Tagline */}
                <div className="my-auto">
                  <div
                    className="font-mono text-sm sm:text-base tracking-widest font-bold"
                    style={{ color: c.accent }}
                  >
                    {c.number}
                  </div>
                  <p className="text-[9px] sm:text-xs text-gray-300 mt-1 line-clamp-1">
                    {c.tagline}
                  </p>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-[8px] sm:text-[10px] text-white/70 border-t border-white/10 pt-2">
                  <div>
                    <span className="block text-[7px] uppercase tracking-wider text-white/40">
                      Product
                    </span>
                    <span className="font-bold text-white">EDUCA FINTECH</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[7px] uppercase tracking-wider text-white/40">
                      Approval
                    </span>
                    <span className="font-bold text-cyan-300">{c.valid}</span>
                  </div>
                </div>
              </div>

              {/* (B) ASCII MATRIX CODE (Revealed by Center Scanner) */}
              <div
                className="card-ascii absolute inset-0 rounded-2xl bg-black/95 p-3 text-cyan-400 font-mono text-[8px] sm:text-[9px] leading-[11px] overflow-hidden select-none border border-cyan-500/40 pointer-events-none"
                style={{
                  textShadow: "0 0 2px rgba(0, 229, 255, 0.7)",
                  transform: "translateZ(0)",
                  backfaceVisibility: "hidden",
                }}
              >
                <div className="text-[7px] text-cyan-300 font-bold mb-1 opacity-70">
                  // DECRYPTED SCAN: {c.type}
                </div>
                <pre className="font-mono whitespace-pre-wrap opacity-90 leading-tight">
                  {c.asciiCode}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
