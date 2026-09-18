import { Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";

export default function KycPage() {
  const steps = [
    {
      step: "01",
      title: "Mobile OTP Verification",
      desc: "Apna active mobile number enter karein aur 6-digit secure SMS OTP ke dwara authenticate karein.",
    },
    {
      step: "02",
      title: "Aadhaar Card e-KYC",
      desc: "Apna 12-digit Aadhaar number daalein aur UIDAI linked phone par aane wale OTP se instant address verify karein.",
    },
    {
      step: "03",
      title: "PAN Card Details",
      desc: "Financial regulations ke compliance ke liye apna PAN number verify karein ya Form 60 declare karein.",
    },
    {
      step: "04",
      title: "Live Face Match (Selfie)",
      desc: "Identity theft aur fraud se bachne ke liye 2 second ki live camera selfie capture karein.",
    },
  ];

  return (
    <PageLayout title="KYC Verification — Instant Paperless Identity Check">
      <section className="py-16 bg-gradient-to-b from-blue-50 to-white text-center px-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-black rounded-full uppercase tracking-wider">
            100% Paperless & Secure
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#0A192F] tracking-tight">
            KYC <span className="text-[#1D6AE5]">Verification Process</span>
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm sm:text-base">
            Sirf 2 minute me apna account verify karein aur ₹1.5 Lakh tak ki limit unlock karein.
          </p>
        </div>
      </section>

      <section className="py-12 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {steps.map((s, i) => (
            <div key={i} className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#1D6AE5] font-black text-lg flex items-center justify-center shrink-0 border border-blue-100">
                {s.step}
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900 mb-1">{s.title}</h3>
                <p className="text-xs text-gray-600 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-3xl p-8 border border-gray-200 text-center space-y-4 shadow-md">
          <h3 className="text-xl font-black text-gray-900">Ready to complete your KYC?</h3>
          <p className="text-xs text-gray-500 max-w-lg mx-auto">
            Aap apne Customer Dashboard me login karke sidhe "Profile & KYC" section se document upload kar sakte hain.
          </p>
          <Link
            to="/login"
            className="inline-block px-8 py-3.5 bg-[#1D6AE5] hover:bg-[#1558cc] text-white font-extrabold text-xs rounded-xl shadow-lg transition"
          >
            Go to Dashboard & Complete KYC →
          </Link>
        </div>
      </section>
    </PageLayout>
  );
}
