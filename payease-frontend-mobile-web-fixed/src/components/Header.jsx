import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { tokenStorage } from "../utils/tokenStorage";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [siteLang, setSiteLang] = useState(() => {
    try {
      return localStorage.getItem("educa_site_lang") || "en";
    } catch {
      return "en";
    }
  });

  const toggleLang = (code) => {
    setSiteLang(code);
    try {
      localStorage.setItem("educa_site_lang", code);
      window.dispatchEvent(new Event("site_language_changed"));
    } catch {}
  };

  const location = useLocation();
  const navigate = useNavigate();
  const token = tokenStorage.getToken();
  const user = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("user") || "{}") : {};

  useEffect(() => {
    const handleLangChange = () => {
      try {
        setSiteLang(localStorage.getItem("educa_site_lang") || "en");
      } catch {}
    };
    window.addEventListener("site_language_changed", handleLangChange);
    return () => window.removeEventListener("site_language_changed", handleLangChange);
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { label: "Home", path: "/" },
    { label: "Accounts", path: "/accounts" },
    { label: "Loans", path: "/loans" },
    { label: "Investments", path: "/investments" },
    {
      label: "Cards",
      path: "/cards",
      hasDropdown: true,
      subLinks: [
        { label: "All Cards", path: "/cards", desc: "Overview & Features" },
        { label: "Silver Card", path: "/cards/silver", desc: "Instant ₹25k Virtual Card" },
        { label: "Platinum Card", path: "/cards/platinum", desc: "VIP Obsidian Metal Card" },
      ],
    },
    { label: "Offers", path: "/offers" },
  ];

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled || menuOpen
          ? "bg-[#FAFBFF]/95 backdrop-blur-xl border-b border-[#E8EDF5] shadow-xs"
          : "bg-white/80 backdrop-blur-md border-b border-gray-100"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* LOGO */}
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#1D6AE5] to-[#0DC98A] flex items-center justify-center text-white font-black text-lg shadow-md shadow-blue-500/20">
            E
          </div>
          <div>
            <span className="font-extrabold text-xl text-[#0C1B3A] tracking-tight">
              Educa<span className="text-[#1D6AE5]">Fintech</span>
            </span>
            <span className="hidden md:inline-block ml-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300">
              12% Savings APY
            </span>
          </div>
        </Link>

        {/* DESKTOP NAV */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
          {navLinks.map((item) => {
            const isActive = location.pathname === item.path;
            if (item.hasDropdown) {
              return (
                <div
                  key={item.label}
                  className="relative group"
                  onMouseEnter={() => setCardsOpen(true)}
                  onMouseLeave={() => setCardsOpen(false)}
                >
                  <Link
                    to={item.path}
                    className={`px-3 py-1.5 rounded-lg text-xs xl:text-sm font-bold transition flex items-center gap-1 ${
                      isActive || location.pathname.startsWith("/cards")
                        ? "text-[#1D6AE5] bg-blue-50"
                        : "text-gray-600 hover:text-[#1D6AE5] hover:bg-gray-50"
                    }`}
                  >
                    {item.label}
                    <span className="text-[10px] transition-transform group-hover:rotate-180">▼</span>
                  </Link>

                  {/* DROPDOWN */}
                  {cardsOpen && (
                    <div className="absolute top-full left-0 w-56 pt-2 z-50">
                      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-2 space-y-1">
                        {item.subLinks.map((sub) => (
                          <Link
                            key={sub.path}
                            to={sub.path}
                            onClick={() => setCardsOpen(false)}
                            className="block px-3 py-2 rounded-xl hover:bg-blue-50 transition"
                          >
                            <div className="text-xs font-bold text-gray-800">{sub.label}</div>
                            <div className="text-[10px] text-gray-400">{sub.desc}</div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`px-3 py-1.5 rounded-lg text-xs xl:text-sm font-bold transition ${
                  isActive
                    ? "text-[#1D6AE5] bg-blue-50"
                    : "text-gray-600 hover:text-[#1D6AE5] hover:bg-gray-50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* CTA */}
        <div className="hidden sm:flex items-center gap-3">
          {/* LANGUAGE SWITCHER (EN DEFAULT / HI TOGGLE) */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => toggleLang("en")}
              className={`px-2 py-1 rounded-lg transition cursor-pointer ${
                siteLang === "en" ? "bg-white text-blue-600 shadow-2xs font-black" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => toggleLang("hi")}
              className={`px-2 py-1 rounded-lg transition cursor-pointer ${
                siteLang === "hi" ? "bg-white text-blue-600 shadow-2xs font-black" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              हिंदी
            </button>
          </div>

          {token ? (
            user.role === "admin" ? (
              <>
                <button
                  onClick={() => navigate("/admin")}
                  className="px-3.5 py-1.5 rounded-xl text-xs xl:text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition shadow-md shadow-indigo-500/25 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>🛡️</span> Admin Panel
                </button>
                <button
                  onClick={() => navigate("/dashboard")}
                  className="text-xs xl:text-sm font-bold text-gray-700 hover:text-[#1D6AE5] px-3 py-2 transition cursor-pointer"
                >
                  Dashboard
                </button>
              </>
            ) : (
              <button
                onClick={() => navigate("/dashboard")}
                className="px-4 py-2 rounded-xl text-xs xl:text-sm font-extrabold text-white bg-[#1D6AE5] hover:bg-[#1558cc] active:scale-95 transition shadow-md shadow-blue-500/25 flex items-center gap-1.5 cursor-pointer"
              >
                <span>📊</span> Go to Dashboard
              </button>
            )
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="px-4 py-2 rounded-xl text-xs xl:text-sm font-extrabold text-white bg-[#1D6AE5] hover:bg-[#1558cc] active:scale-95 transition shadow-md shadow-blue-500/25 flex items-center gap-1.5 cursor-pointer"
            >
              <span>👤</span> Account
            </button>
          )}
        </div>

        {/* MOBILE MENU TOGGLE */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="lg:hidden p-2 rounded-lg bg-gray-100 text-gray-700 text-base"
          aria-label="Toggle menu"
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* MOBILE DRAWER */}
      {menuOpen && (
        <div className="lg:hidden bg-white border-b border-gray-200 px-6 py-4 space-y-2 max-h-[80vh] overflow-y-auto">
          {/* MOBILE LANGUAGE SWITCHER */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100 text-xs">
            <span className="font-bold text-gray-700">Language / भाषा:</span>
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => toggleLang("en")}
                className={`px-3 py-1 rounded-lg transition ${
                  siteLang === "en" ? "bg-white text-blue-600 shadow-2xs font-black" : "text-slate-600"
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => toggleLang("hi")}
                className={`px-3 py-1 rounded-lg transition ${
                  siteLang === "hi" ? "bg-white text-blue-600 shadow-2xs font-black" : "text-slate-600"
                }`}
              >
                हिंदी
              </button>
            </div>
          </div>
          {navLinks.map((item) => (
            <div key={item.label}>
              <Link
                to={item.path}
                onClick={() => setMenuOpen(false)}
                className={`block py-2 text-sm font-bold border-b border-gray-50 ${
                  location.pathname === item.path ? "text-[#1D6AE5]" : "text-gray-700"
                }`}
              >
                {item.label}
              </Link>
              {item.subLinks && (
                <div className="pl-4 py-1 space-y-1 bg-gray-50 rounded-lg my-1">
                  {item.subLinks.map((sub) => (
                    <Link
                      key={sub.path}
                      to={sub.path}
                      onClick={() => setMenuOpen(false)}
                      className="block py-1.5 text-xs text-gray-600 hover:text-[#1D6AE5]"
                    >
                      • {sub.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="pt-3 flex flex-col gap-2">
            {token ? (
              user.role === "admin" ? (
                <>
                  <button
                    onClick={() => { setMenuOpen(false); navigate("/admin"); }}
                    className="w-full py-2.5 rounded-xl text-sm font-black text-white bg-indigo-600 flex items-center justify-center gap-1.5"
                  >
                    <span>🛡️</span> Admin Panel
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); navigate("/dashboard"); }}
                    className="w-full py-2.5 rounded-xl text-sm font-bold text-[#1D6AE5] border border-[#1D6AE5]"
                  >
                    Customer Dashboard
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { setMenuOpen(false); navigate("/dashboard"); }}
                  className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-[#1D6AE5]"
                >
                  Go to Dashboard
                </button>
              )
            ) : (
              <button
                onClick={() => { setMenuOpen(false); navigate("/login"); }}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-[#1D6AE5] flex items-center justify-center gap-2"
              >
                <span>👤</span> Account
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
