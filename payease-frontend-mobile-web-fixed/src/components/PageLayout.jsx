import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";

export default function PageLayout({ children, title }) {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (title) {
      document.title = `${title} — Educa Fintech`;
    }
  }, [pathname, title]);

  return (
    <div className="min-h-screen flex flex-col font-sans bg-[#FAFBFF] text-[#0C1B3A]">
      <Header />
      <main className="flex-1 pt-16">{children}</main>
      <Footer />
    </div>
  );
}
