import { useEffect, useRef } from "react";

const CODE_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789(){}[]<>;:,._-+=!@#$%^&*|\\/\"'`~?";

export default function EvervaultCardScanner() {
  const containerRef = useRef(null);
  const cardLineRef = useRef(null);
  const particleCanvasRef = useRef(null);
  const scannerCanvasRef = useRef(null);

  const stateRef = useRef({
    position: 0,
    velocity: 25, // Gentle, calm, smooth speed (px/sec)
    direction: -1, // Infinite continuous one-direction loop (leftward)
    lastTime: performance.now(),
    containerWidth: 0,
    cardLineWidth: 0,
    scanningActive: false,
  });

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
    },
  ];

  // Helper to generate ASCII code block
  const generateAscii = (w = 48, h = 18) => {
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

  /* ═══════════════════════════════════════════════════════════
     BACKGROUND PARTICLES CANVAS
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const canvas = particleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;

    const resize = () => {
      canvas.width = canvas.parentElement?.offsetWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.offsetHeight || 380;
    };
    resize();
    window.addEventListener("resize", resize);

    const count = 90;
    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3 + 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      r: Math.random() * 1.5 + 0.4,
      alpha: Math.random() * 0.6 + 0.2,
      hue: Math.random() > 0.5 ? 210 : 160,
    }));

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x > canvas.width + 10) p.x = -10;
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.y > canvas.height + 10) p.y = -10;
        if (p.y < -10) p.y = canvas.height + 10;

        ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      animId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  /* ═══════════════════════════════════════════════════════════
     VERTICAL SCANNER LASER BEAM CANVAS
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const canvas = scannerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;

    const resize = () => {
      canvas.width = canvas.parentElement?.offsetWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.offsetHeight || 380;
    };
    resize();
    window.addEventListener("resize", resize);

    const particles = [];
    const maxParticles = 280;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      const lightBarX = w / 2;
      const lightBarWidth = 4;
      const isScanning = stateRef.current.scanningActive;

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      // 1. Core bright laser beam
      const coreGrad = ctx.createLinearGradient(lightBarX - 4, 0, lightBarX + 4, 0);
      coreGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
      coreGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.95)");
      coreGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

      ctx.fillStyle = coreGrad;
      ctx.fillRect(lightBarX - lightBarWidth / 2, 0, lightBarWidth, h);

      // 2. Violet / Cyan Glow beam
      const glowGrad = ctx.createLinearGradient(lightBarX - 25, 0, lightBarX + 25, 0);
      glowGrad.addColorStop(0, "rgba(0, 229, 255, 0)");
      glowGrad.addColorStop(0.5, isScanning ? "rgba(139, 92, 246, 0.6)" : "rgba(0, 229, 255, 0.35)");
      glowGrad.addColorStop(1, "rgba(0, 229, 255, 0)");

      ctx.fillStyle = glowGrad;
      ctx.fillRect(lightBarX - 20, 0, 40, h);

      // 3. Spray particles emitted from laser beam
      if (particles.length < maxParticles) {
        const pCount = isScanning ? 4 : 2;
        for (let i = 0; i < pCount; i++) {
          particles.push({
            x: lightBarX + (Math.random() - 0.5) * 4,
            y: Math.random() * h,
            vx: (Math.random() * 1.5 + 0.4) * (Math.random() > 0.3 ? 1 : -1),
            vy: (Math.random() - 0.5) * 0.7,
            alpha: 1,
            r: Math.random() * 1.6 + 0.4,
            color: Math.random() > 0.5 ? "rgba(0, 229, 255, " : "rgba(196, 181, 253, ",
          });
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= isScanning ? 0.015 : 0.022;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.fillStyle = `${p.color}${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
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
     PURE AUTOMATIC ONE-WAY INFINITE LOOP (No clicks, no dragging)
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const container = containerRef.current;
    const cardLine = cardLineRef.current;
    if (!container || !cardLine) return;

    let animId;

    const updateDimensions = () => {
      stateRef.current.containerWidth = container.offsetWidth || window.innerWidth;
      const cardCount = cardLine.children.length;
      const firstCard = cardLine.children[0];
      const cardWidth = firstCard ? firstCard.offsetWidth : 340;
      const gap = 32;
      // Total span of all cards
      stateRef.current.cardLineWidth = (cardWidth + gap) * cardCount;
    };
    updateDimensions();
    window.addEventListener("resize", updateDimensions);

    const updateCardClipping = () => {
      const containerRect = container.getBoundingClientRect();
      const scannerX = containerRect.left + containerRect.width / 2;
      let anyScanning = false;

      const wrappers = cardLine.querySelectorAll(".evervault-card-wrapper");
      wrappers.forEach((wrapper) => {
        const rect = wrapper.getBoundingClientRect();
        const cardLeft = rect.left;
        const cardRight = rect.right;
        const cardWidth = rect.width;

        const normalCard = wrapper.querySelector(".card-normal");
        const asciiCard = wrapper.querySelector(".card-ascii");
        if (!normalCard || !asciiCard) return;

        if (cardLeft < scannerX && cardRight > scannerX) {
          anyScanning = true;
          const progress = ((scannerX - cardLeft) / cardWidth) * 100;
          normalCard.style.clipPath = `inset(0 0 0 ${progress}%)`;
          asciiCard.style.clipPath = `inset(0 calc(100% - ${progress}%) 0 0)`;
        } else if (cardRight <= scannerX) {
          normalCard.style.clipPath = "inset(0 0 0 100%)";
          asciiCard.style.clipPath = "inset(0 0% 0 0)";
        } else {
          normalCard.style.clipPath = "inset(0 0 0 0%)";
          asciiCard.style.clipPath = "inset(0 100% 0 0)";
        }
      });

      stateRef.current.scanningActive = anyScanning;
    };

    // Continuous loop with constant smooth velocity
    const animateLoop = () => {
      const s = stateRef.current;
      const now = performance.now();
      const dt = (now - s.lastTime) / 1000;
      s.lastTime = now;

      // Move continuously in one direction (leftward)
      s.position += s.velocity * s.direction * dt;

      // Seamless infinite loop wrap
      // Half-way loop wrap so cards are never interrupted
      const halfWidth = s.cardLineWidth / 2;
      if (s.position < -halfWidth) {
        s.position += halfWidth;
      }

      cardLine.style.transform = `translateX(${s.position}px)`;
      updateCardClipping();

      animId = requestAnimationFrame(animateLoop);
    };
    animId = requestAnimationFrame(animateLoop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", updateDimensions);
    };
  }, []);

  // Duplicate cards twice (25 cards total) so infinite wrap is completely seamless
  const repeatedCards = Array.from({ length: 25 }, (_, i) => ({
    ...cardDefs[i % cardDefs.length],
    idx: i,
  }));

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden bg-[#0A0D14] py-8 my-5 border-y border-white/10 shadow-2xl pointer-events-none select-none"
      style={{ minHeight: "360px" }}
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
      <div className="relative w-full h-[280px] sm:h-[310px] flex items-center z-10 overflow-visible pointer-events-none">
        <div
          ref={cardLineRef}
          className="flex items-center gap-6 sm:gap-8 whitespace-nowrap will-change-transform px-4 pointer-events-none"
          style={{ transform: "translateX(0px)" }}
        >
          {repeatedCards.map((c, i) => (
            <div
              key={i}
              className="evervault-card-wrapper relative shrink-0 w-[260px] h-[165px] sm:w-[320px] sm:h-[200px] md:w-[360px] md:h-[225px] rounded-2xl overflow-hidden pointer-events-none"
              style={{
                boxShadow: "0 15px 35px rgba(0, 0, 0, 0.8)",
              }}
            >
              {/* (A) NORMAL CARD DESIGN */}
              <div
                className="card-normal absolute inset-0 rounded-2xl p-4 sm:p-5 text-white flex flex-col justify-between overflow-hidden border border-white/15 pointer-events-none"
                style={{
                  background: c.bg,
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
                  textShadow: "0 0 5px rgba(0, 229, 255, 0.6)",
                }}
              >
                <div className="text-[7px] text-purple-300 font-bold mb-1 opacity-70">
                  // DECRYPTED SCAN: {c.type}
                </div>
                <pre className="font-mono whitespace-pre-wrap opacity-90 leading-tight">
                  {generateAscii(38, 14)}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
