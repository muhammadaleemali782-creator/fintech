import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-[#0A1128] text-white pt-16 pb-12 border-t border-blue-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-gray-800">
          {/* BRAND COLUMN */}
          <div className="lg:col-span-2 space-y-4">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#1D6AE5] to-[#0DC98A] flex items-center justify-center text-white font-black text-lg shadow-md">
                E
              </div>
              <span className="font-extrabold text-xl text-white tracking-tight">
                Educa<span className="text-[#0DC98A]">Fintech</span>
              </span>
            </Link>
            <p className="text-gray-400 text-xs sm:text-sm leading-relaxed max-w-sm">
              India's smart student and micro-financing platform. Offering world-class 12% annual interest on savings accounts, instant ₹199 micro-loans, and education financing without CIBIL barriers.
            </p>
            <div className="pt-2 text-xs text-gray-400 space-y-1">
              <p className="font-bold text-gray-300">Registered Office:</p>
              <p>Vihar Gali No. 3, Utthan Road, Jhalwa,</p>
              <p>Prayagraj, Uttar Pradesh — 211012</p>
              <p className="text-emerald-400 pt-1">📧 support@educafintech.com</p>
            </div>
          </div>

          {/* PRODUCTS & ACCOUNTS */}
          <div className="space-y-3">
            <h4 className="text-sm font-extrabold text-white uppercase tracking-wider">Products</h4>
            <ul className="space-y-2 text-xs text-gray-400">
              <li><Link to="/accounts" className="hover:text-white transition">12% Savings Account</Link></li>
              <li><Link to="/loans" className="hover:text-white transition">₹199 Instant Micro Loan</Link></li>
              <li><Link to="/loans" className="hover:text-white transition">Bike & Vehicle Loans</Link></li>
              <li><Link to="/loans" className="hover:text-white transition">School & Tuition Loans</Link></li>
              <li><Link to="/investments" className="hover:text-white transition">High-Yield Investments</Link></li>
              <li><Link to="/cards" className="hover:text-white transition">Virtual & Physical Cards</Link></li>
            </ul>
          </div>

          {/* CARDS & BENEFITS */}
          <div className="space-y-3">
            <h4 className="text-sm font-extrabold text-white uppercase tracking-wider">Cards & Perks</h4>
            <ul className="space-y-2 text-xs text-gray-400">
              <li><Link to="/cards/silver" className="hover:text-white transition">Silver Virtual Card</Link></li>
              <li><Link to="/cards/platinum" className="hover:text-white transition">Platinum VIP Metal Card</Link></li>
              <li><Link to="/offers" className="hover:text-white transition">Offers & Cashback</Link></li>
              <li><Link to="/rates-charges" className="hover:text-white transition">Rates & Transparent Fees</Link></li>
              <li><Link to="/kyc" className="hover:text-white transition">KYC Verification Guide</Link></li>
              <li><Link to="/faq" className="hover:text-white transition">FAQs & Help Center</Link></li>
            </ul>
          </div>

          {/* LEGAL & COMPLIANCE */}
          <div className="space-y-3">
            <h4 className="text-sm font-extrabold text-white uppercase tracking-wider">Legal & Trust</h4>
            <ul className="space-y-2 text-xs text-gray-400">
              <li><Link to="/about" className="hover:text-white transition">About Us</Link></li>
              <li><Link to="/contact" className="hover:text-white transition">Contact Support</Link></li>
              <li><Link to="/privacy" className="hover:text-white transition">Privacy Policy</Link></li>
              <li><Link to="/terms" className="hover:text-white transition">Terms & Conditions</Link></li>
              <li><Link to="/disclaimer" className="hover:text-white transition">Financial Disclaimer</Link></li>
              <li><Link to="/grievance" className="hover:text-white transition">Grievance Redressal</Link></li>
            </ul>
          </div>
        </div>

        {/* BOTTOM BAR */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-400">
          <p>© 2026 Educa Fintech Private Limited. All rights reserved.</p>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> 256-Bit SSL Encrypted</span>
            <span>·</span>
            <span>RBI / NBFC Compliant Architecture</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
