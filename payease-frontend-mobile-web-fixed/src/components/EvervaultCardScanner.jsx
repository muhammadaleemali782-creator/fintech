import { useEffect, useRef, useMemo } from "react";

// Card themes for Educa Fintech with clean protocol specifications for scanner
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
    scanLines: [
      "// PROTOCOL: 12% LIQUID SAVINGS VAULT",
      "STATUS: ACTIVE • ZERO MINIMUM BALANCE",
      "CORE_YIELD: 12.00% DAILY COMPOUNDING",
      "LOCK_IN: ZERO • 24x7 INSTANT UPI WITHDRAWAL",
      "PAYOUT: REAL-TIME DAILY TO PROFIT WALLET",
      "SECURITY: 100% RBI PARTNER & ASSET BACKED",
      "HASH_SIG: 0x12FA_EDUCA_SAVINGS_VAULT_OK",
    ],
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
    scanLines: [
      "// PROTOCOL: ₹199 INSTANT RECHARGE MICRO LOAN",
      "STATUS: SANCTIONED • PRE-APPROVED ACCESS",
      "LOAN_AMOUNT: ₹199.00 DIRECT UPI CREDIT",
      "CIBIL_SCORE_REQ: 0 • ZERO CIBIL REQUIRED",
      "DISBURSAL: INSTANT 1-CLICK DISBURSEMENT",
      "TENURE: 30 DAYS EXTENDABLE COVERAGE",
      "HASH_SIG: 0x0199_EDUCA_MICRO_RECHARGE_OK",
    ],
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
    scanLines: [
      "// PROTOCOL: TWO-WHEELER VEHICLE LOAN",
      "STATUS: PRE-QUALIFIED UP TO ₹1,50,000",
      "EMI_SCHEME: LOW FLAT RATE • ZERO ADVANCE",
      "TENURE: 12 TO 36 MONTHS FLEXIBLE PAY",
      "DISBURSAL: DIRECT TO AUTHORIZED DEALER",
      "DOCUMENTATION: MINIMAL AADHAAR / KYC",
      "HASH_SIG: 0x8840_EDUCA_BIKE_FINANCING_OK",
    ],
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
    scanLines: [
      "// PROTOCOL: STUDENT EDUCATION EMI AID",
      "STATUS: 100% PARENT RELIEF SANCTIONED",
      "PURPOSE: SCHOOL & COLLEGE TERM FEES",
      "INTEREST_TERMS: 0% ADVANCE INTEREST AID",
      "REPAYMENT: QUARTERLY FLEXIBLE INSTALLMENTS",
      "DISBURSAL: DIRECT TO EDUCATIONAL CAMPUS",
      "HASH_SIG: 0x5521_EDUCA_STUDENT_RELIEF_OK",
    ],
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
    scanLines: [
      "// PROTOCOL: 18% FIXED WEALTH BOND",
      "STATUS: GUARANTEED MATURITY RETURN",
      "ANNUAL_PROFIT: 18.00% FLAT MATURITY PAYOUT",
      "TENURE: 365 DAYS FIXED WEALTH BOND",
      "MIN_ALLOCATION: ₹1,00,000 PER BOND UNIT",
      "BACKED_BY: 100% FINTECH RESERVE LIQUIDITY",
      "HASH_SIG: 0x9999_EDUCA_WEALTH_BOND_OK",
    ],
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
          state: 999,
        };
      });

      cardLine.style.transform = `translate3d(${stateRef.current.position}px, 0, 0)`;

      // 5 cards = 1 cycle of cardDefs. When wrapping, shift by 5 cards (seamless repeat)
      if (cardData.length >= 5 && cardData[5]) {
        wrapWidth = cardData[5].baseLeft - cardData[0].baseLeft;
      } else {
        wrapWidth = (cardData[0]?.width || 240) * 5;
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

      // Move continuously leftward
      s.position += s.velocity * s.direction * dt;

      // Infinite wrap by exactly 1 cycle (5 cards)
      if (wrapWidth > 0 && s.position <= -wrapWidth) {
        s.position += wrapWidth;
        for (let i = 0; i < cardData.length; i++) {
          cardData[i].state = 999;
        }
      }

      cardLine.style.transform = `translate3d(${s.position}px, 0, 0)`;

      // Split clip-path scanner laser decryption effect
      let anyScanning = false;
      const pos = s.position;

      for (let i = 0; i < cardData.length; i++) {
        const card = cardData[i];
        if (!card.normal || !card.ascii) continue;

        const cardLeft = card.baseLeft + pos;
        const cardRight = cardLeft + card.width;

        if (cardRight <= scannerX) {
          // Fully past scanner -> 100% decrypted cyber scan, normal hidden
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
          // Actively crossing the scanner beam -> Split clip-path!
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
      className="relative w-full overflow-hidden bg-[#0A0D14] py-3 sm:py-6 my-2 sm:my-4 border-y border-white/10 shadow-2xl pointer-events-none select-none min-h-[190px] sm:min-h-[250px] md:min-h-[290px]"
      style={{
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
      <div className="relative w-full h-[165px] sm:h-[210px] md:h-[245px] flex items-center z-10 overflow-visible pointer-events-none">
        <div
          ref={cardLineRef}
          className="flex items-center gap-4 sm:gap-6 md:gap-8 whitespace-nowrap will-change-transform px-4 pointer-events-none"
          style={{
            transform: "translate3d(0px, 0, 0)",
            willChange: "transform",
          }}
        >
          {repeatedCards.map((c, i) => (
            <div
              key={i}
              className="evervault-card-wrapper relative shrink-0 w-[215px] h-[138px] sm:w-[270px] sm:h-[175px] md:w-[320px] md:h-[205px] rounded-2xl overflow-hidden pointer-events-none shadow-xl border border-white/15"
              style={{
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.7)",
                contain: "paint",
              }}
            >
              {/* (A) NORMAL CARD DESIGN */}
              <div
                className="card-normal absolute inset-0 rounded-2xl p-3 sm:p-4 md:p-5 text-white flex flex-col justify-between overflow-hidden pointer-events-none"
                style={{
                  background: c.bg,
                  transform: "translateZ(0)",
                  backfaceVisibility: "hidden",
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-base sm:text-xl md:text-2xl">{c.icon}</span>
                    <div>
                      <div className="text-[7px] sm:text-[8px] md:text-[9px] tracking-wider uppercase font-bold text-white/60">
                        {c.type}
                      </div>
                      <div className="text-[11px] sm:text-xs md:text-sm font-extrabold text-white leading-tight">
                        {c.name}
                      </div>
                    </div>
                  </div>
                  <span
                    className="text-[7px] sm:text-[8px] md:text-[9px] font-black px-1.5 sm:px-2 py-0.5 rounded-full shrink-0"
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
                <div className="my-auto py-1">
                  <div
                    className="font-mono text-xs sm:text-sm md:text-base tracking-widest font-bold"
                    style={{ color: c.accent }}
                  >
                    {c.number}
                  </div>
                  <p className="text-[8px] sm:text-[10px] md:text-xs text-gray-300 mt-0.5 line-clamp-1">
                    {c.tagline}
                  </p>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-[7px] sm:text-[8px] md:text-[10px] text-white/70 border-t border-white/10 pt-1.5 sm:pt-2">
                  <div>
                    <span className="block text-[6px] sm:text-[7px] uppercase tracking-wider text-white/40">
                      Product
                    </span>
                    <span className="font-bold text-white">EDUCA FINTECH</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[6px] sm:text-[7px] uppercase tracking-wider text-white/40">
                      Approval
                    </span>
                    <span className="font-bold text-cyan-300">{c.valid}</span>
                  </div>
                </div>
              </div>

              {/* (B) DECRYPTED CYBER SECURITY PROTOCOL SPECIFICATIONS */}
              <div
                className="card-ascii absolute inset-0 rounded-2xl bg-[#070B12]/95 p-3 sm:p-4 text-cyan-400 font-mono overflow-hidden select-none border border-cyan-500/50 pointer-events-none flex flex-col justify-between"
                style={{
                  textShadow: "0 0 2px rgba(0, 229, 255, 0.7)",
                  transform: "translateZ(0)",
                  backfaceVisibility: "hidden",
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-cyan-500/30 pb-1">
                  <div className="flex items-center gap-1.5 text-[7px] sm:text-[8px] md:text-[9px] font-bold text-cyan-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                    <span>DECRYPTED: {c.type}</span>
                  </div>
                  <span className="text-[6.5px] sm:text-[7.5px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/40">
                    {c.valid}
                  </span>
                </div>

                {/* Real Specifications Lines */}
                <div className="space-y-0.5 my-auto text-[7px] sm:text-[8px] md:text-[8.5px] leading-tight text-cyan-200/90 font-mono">
                  {c.scanLines.map((line, idx) => (
                    <div key={idx} className="truncate">
                      {line}
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-[6.5px] sm:text-[7.5px] text-cyan-400/70 border-t border-cyan-500/30 pt-1 font-mono">
                  <span>EDUCA PROTOCOL v4.2</span>
                  <span className="text-emerald-400 font-bold">VERIFIED ✓</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
