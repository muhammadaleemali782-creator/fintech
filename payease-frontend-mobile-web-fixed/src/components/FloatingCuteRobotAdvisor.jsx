import { useState, useEffect, useRef } from "react";

/**
 * FloatingCuteRobotAdvisor
 * 
 * Free-floating 3D AI Robot advisor with PointerEvents drag & wall-docking.
 * - Draggable anywhere across the screen on both mobile touch and desktop.
 * - Remembers dragged position in localStorage.
 * - Clicking '✕': docks into whichever wall (left or right) it is closest to,
 *   tucking into that wall at the exact vertical height.
 * - A peeking waving robot hand stays docked at that wall edge.
 * - Clicking the peeking hand pops the robot back out.
 * - Clicking / tapping the robot reliably opens the AI Advisor chat (onOpen).
 */
export default function FloatingCuteRobotAdvisor({ onOpen, isOpen }) {
  const [isPeek, setIsPeek] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Position state (persisted in localStorage)
  const [pos, setPos] = useState(() => {
    if (typeof window === "undefined") return { x: 280, y: 500 };
    try {
      const saved = localStorage.getItem("payease_robot_pos");
      if (saved) {
        const p = JSON.parse(saved);
        if (typeof p.x === "number" && typeof p.y === "number") {
          const w = window.innerWidth || 360;
          const h = window.innerHeight || 640;
          return {
            x: Math.min(Math.max(8, p.x), Math.max(8, w - 76)),
            y: Math.min(Math.max(60, p.y), Math.max(60, h - 110)),
          };
        }
      }
    } catch {}
    const w = window.innerWidth || 360;
    const h = window.innerHeight || 640;
    return {
      x: Math.max(8, w - 84),
      y: Math.max(60, h - 160),
    };
  });

  const dragRef = useRef({ isDown: false, startX: 0, startY: 0, posX: 0, posY: 0, moved: false });
  const lastOpenTimeRef = useRef(0);

  // Debounced/safe open trigger to prevent duplicate calls from pointerup + click
  const triggerOpen = () => {
    const now = Date.now();
    if (now - lastOpenTimeRef.current < 400) return;
    lastOpenTimeRef.current = now;
    onOpen?.();
  };

  // Clamp position within viewport on resize
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => {
        const w = window.innerWidth || 360;
        const h = window.innerHeight || 640;
        const clampedX = Math.min(Math.max(8, prev.x), Math.max(8, w - 76));
        const clampedY = Math.min(Math.max(60, prev.y), Math.max(60, h - 110));
        if (clampedX !== prev.x || clampedY !== prev.y) {
          return { x: clampedX, y: clampedY };
        }
        return prev;
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (isOpen) return null;

  const screenW = typeof window !== "undefined" ? window.innerWidth : 360;
  const isLeftWall = pos.x < screenW / 2;
  const dockSide = isLeftWall ? "left" : "right";

  const handlePointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest("button")) return;

    dragRef.current = {
      isDown: true,
      startX: e.clientX,
      startY: e.clientY,
      posX: pos.x,
      posY: pos.y,
      moved: false,
    };

    const handlePointerMove = (moveEv) => {
      if (!dragRef.current.isDown) return;
      const dx = moveEv.clientX - dragRef.current.startX;
      const dy = moveEv.clientY - dragRef.current.startY;

      // 15px threshold to ignore fingertip wobble on mobile touch screens
      if (!dragRef.current.moved && Math.hypot(dx, dy) > 15) {
        dragRef.current.moved = true;
        setIsDragging(true);
      }

      if (dragRef.current.moved) {
        const w = window.innerWidth || 360;
        const h = window.innerHeight || 640;
        const newX = Math.min(Math.max(8, dragRef.current.posX + dx), w - 76);
        const newY = Math.min(Math.max(60, dragRef.current.posY + dy), h - 110);
        setPos({ x: newX, y: newY });
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);

      const wasMoved = dragRef.current.moved;
      dragRef.current.isDown = false;

      if (wasMoved) {
        setTimeout(() => setIsDragging(false), 50);
        setPos((current) => {
          try {
            localStorage.setItem("payease_robot_pos", JSON.stringify(current));
          } catch {}
          return current;
        });
      } else {
        setIsDragging(false);
        triggerOpen();
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const handleRobotClick = (e) => {
    if (e.target.closest("button")) return;
    if (dragRef.current.moved) return;
    triggerOpen();
  };

  return (
    <>
      {/* 1. FULL ROBOT (Draggable anywhere across the screen, clickable to open chat) */}
      <div
        onPointerDown={handlePointerDown}
        onClick={handleRobotClick}
        style={{
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          touchAction: "none",
          userSelect: "none",
        }}
        className={`fixed z-40 select-none cursor-pointer ${
          isDragging ? "cursor-grabbing" : "cursor-pointer"
        } ${
          isPeek
            ? dockSide === "left"
              ? "-translate-x-[calc(100%+40px)] opacity-0 pointer-events-none scale-90"
              : "translate-x-[calc(100%+40px)] opacity-0 pointer-events-none scale-90"
            : "translate-x-0 opacity-100 scale-100"
        } ${isDragging ? "" : "transition-all duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)]"}`}
        title="AI Advisor (Tap to Chat)"
      >
        <div className="relative group">
          {/* Close 'X' Button - transparent, positioned on inside corner so it never clips off-screen */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setIsPeek(true);
            }}
            aria-label="Close AI Advisor"
            className={`absolute z-30 w-6 h-6 flex items-center justify-center bg-transparent border-0 shadow-none text-slate-400 hover:text-slate-800 dark:hover:text-white transition-all hover:scale-125 active:scale-90 cursor-pointer ${
              isLeftWall ? "-top-1 -right-1" : "-top-1 -left-1"
            }`}
            title="Deewar me chupayein (Hide into wall)"
          >
            <svg className="w-3.5 h-3.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Soft ambient glow */}
          <div className="absolute inset-2 bg-cyan-400/30 rounded-full blur-md group-hover:bg-cyan-400/50 transition pointer-events-none" />

          {/* 3D Robot Image */}
          <img
            src="/ai-robot.png"
            alt="AI Advisor Robot"
            className="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-[0_8px_16px_rgba(34,211,238,0.35)] relative z-10 transition-transform duration-150 group-hover:scale-105 active:scale-95 pointer-events-auto cursor-pointer"
            draggable={false}
          />
        </div>
      </div>

      {/* 2. PEEKING HAND ON DOCKED WALL (Tucked into whichever wall the robot was placed nearest to) */}
      <div
        onClick={() => setIsPeek(false)}
        title="AI Sahayak (Click to call back)"
        aria-label="AI Sahayak"
        style={{
          top: `${Math.min(Math.max(60, pos.y + 8), (typeof window !== "undefined" ? window.innerHeight : 640) - 100)}px`,
          ...(dockSide === "left" ? { left: 0 } : { right: 0 }),
        }}
        className={`fixed z-40 cursor-pointer transition-all duration-300 ease-out select-none flex items-center p-1 ${
          isPeek
            ? dockSide === "left"
              ? "-translate-x-[45%] hover:translate-x-0 opacity-95 hover:opacity-100 scale-100 hover:scale-110 active:scale-95"
              : "translate-x-[45%] hover:translate-x-0 opacity-95 hover:opacity-100 scale-100 hover:scale-110 active:scale-95"
            : dockSide === "left"
              ? "-translate-x-full opacity-0 pointer-events-none scale-75"
              : "translate-x-full opacity-0 pointer-events-none scale-75"
        }`}
      >
        <img
          src={dockSide === "left" ? "/ai-robot-hand.png" : "/ai-robot-hand-left.png"}
          alt="AI Hand"
          className="w-8 h-8 sm:w-9 sm:h-9 object-contain drop-shadow-[0_2px_10px_rgba(34,211,238,0.7)] animate-pulse"
          draggable={false}
        />
      </div>
    </>
  );
}
