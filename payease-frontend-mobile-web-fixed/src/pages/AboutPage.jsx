import { Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";

export default function AboutPage() {
  const values = [
    {
      title: "100% Financial Inclusion",
      desc: "Jise traditional banks CIBIL score na hone ke karan reject kar dete hain, unhe Educa Fintech samman ke sath micro-loans aur khata pradan karta hai.",
      icon: "🤝",
    },
    {
      title: "Fair Wealth Creation",
      desc: "Hum vishwas karte hain ki aam nagrik aur student ke hard-earned paise par unhe duniya ka sabse behtar 12% saal ka interest milna chahiye.",
      icon: "📈",
    },
    {
      title: "Zero Hidden Traps",
      desc: "Koi chhipa hua maintenance charge nahi, koi minimum balance penalty nahi. Sab kuch transparent aur clear.",
      icon: "🛡️",
    },
  ];

  return (
    <PageLayout title="About Us — Our Mission, Vision & Values">
      <section className="py-16 bg-gradient-to-b from-blue-50 to-white text-center px-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-black rounded-full uppercase tracking-wider">
            Empowering India's Next Generation
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#0A192F] tracking-tight">
            Hamara Lakshya: <span className="text-[#1D6AE5]">Har Haath me Aarthik Azadi</span>
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            Educa Fintech ek aadhunik digital financial platform hai jo Bharat ke students, daily wage earners, aur aam parivaaron ko aasan loans aur high-yield savings pradan karne ke liye banaya gaya hai.
          </p>
        </div>
      </section>

      <section className="py-12 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-10 items-center mb-16">
          <div className="space-y-4">
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900">
              Kyu shuru hua Educa Fintech?
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
              Bharat me karodo students aur chhote vyapariyon ke pass CIBIL score nahi hota, jiski wajah se unhe mobile recharge ya emergency school fees ke liye bhi banks se loan nahi mil pata.
            </p>
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
              Isi samasya ko door karne ke liye humne <strong>₹199 Instant Micro-Loans</strong> aur <strong>12% Flat Annual Interest Savings Account</strong> ka ecosystem taiyar kiya hai, jahan technology sabhi ko aage badhne ka avsar deti hai.
            </p>
          </div>

          <div className="bg-gradient-to-tr from-[#1D6AE5] to-[#0DC98A] p-8 rounded-3xl text-white shadow-xl space-y-6">
            <div className="text-4xl">🏛️</div>
            <h3 className="text-2xl font-black">Registered & Governed</h3>
            <p className="text-xs text-blue-50 leading-relaxed">
              Headquartered at <strong>Prayagraj, Uttar Pradesh</strong>, hamare financial operations aur security protocols industry ke highest security standards ke mutabiq auditted hain.
            </p>
            <div className="flex gap-4 text-xs font-bold pt-2 border-t border-white/20">
              <div>✓ 256-Bit SSL</div>
              <div>✓ Paperless e-KYC</div>
              <div>✓ 24x7 Disbursals</div>
            </div>
          </div>
        </div>

        {/* CORE VALUES */}
        <div className="text-center mb-8">
          <h3 className="text-2xl font-black text-gray-900">Hamare Siddhant (Core Values)</h3>
        </div>
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {values.map((v, i) => (
            <div key={i} className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm space-y-3">
              <div className="text-3xl">{v.icon}</div>
              <h4 className="text-lg font-black text-gray-900">{v.title}</h4>
              <p className="text-xs text-gray-600 leading-relaxed">{v.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="bg-blue-50 border border-blue-200 p-8 rounded-3xl text-center space-y-4">
          <h3 className="text-2xl font-black text-blue-950">Aap bhi banein Educa Fintech Parivaar ka Hissa</h3>
          <p className="text-xs sm:text-sm text-gray-600 max-w-xl mx-auto">
            Aaj hi apna free 12% savings khata kholein aur smart financial freedom ki taraf kadam badhayein.
          </p>
          <div>
            <Link
              to="/login"
              className="inline-block px-8 py-3.5 bg-[#1D6AE5] hover:bg-[#1558cc] text-white font-extrabold text-xs rounded-xl shadow-lg transition"
            >
              Open Free Account in 2 Minutes →
            </Link>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
