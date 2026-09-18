let raw = (import.meta.env.VITE_API_URL || "").trim();

// Strip accidental "VITE_API_URL=" prefix if pasted into Vercel's value field
if (raw.startsWith("VITE_API_URL=")) {
  raw = raw.replace(/^VITE_API_URL=/, "").trim();
}

// Production auto-fallback if on vercel.app or if raw is empty
if (!raw || (typeof window !== "undefined" && window.location.hostname.includes("vercel.app") && (raw.includes("localhost") || !raw.startsWith("http")))) {
  raw = "https://educafintech.onrender.com/api";
} else if (!raw) {
  raw = "http://localhost:5000/api";
}

export const API = raw.replace(/\/+$/, "");
