import { useState } from "react";
import PageLayout from "../components/PageLayout";

export default function FaqPage() {
  const [openIndex, setOpenIndex] = useState(0);

  const faqs = [
    {
      q: "12% Interest mere account me kab aur kaise add hota hai?",
      a: "Educa Fintech me interest har din ke ending balance par calculate hota hai aur har roz raat 12 baje seedhe aapke Savings Wallet me credit kar diya jata hai. Aap is interest ko jab chahe turant UPI ya bank transfer se nikal sakte hain.",
    },
    {
      q: "Kya khata kholne ke liye minimum balance maintain karna zaroori hai?",
      a: "Bilkul nahi! Educa Fintech ka khata 100% Zero Balance account hai. Agar aapka balance ₹0 bhi rehta hai toh koi penalty ya maintenance charge nahi lagta.",
    },
    {
      q: "₹199 ka Instant Recharge Loan kaise milta hai aur CIBIL ki zaroorat hai?",
      a: "Nahi, ₹199 micro-loan ke liye kisi CIBIL score ki zaroorat nahi hai. Account register karke Aadhaar verification karte hi aapko ₹199 instant loan mil jata hai jo direct aapke mobile recharge ya UPI me disburse hota hai.",
    },
    {
      q: "Platinum VIP Card kaise unlock hota hai?",
      a: "Platinum VIP Obsidian Card un users ke liye unlock hota hai jo 4 loans time par successfully repay kar chuke hain, ya jinko Admin se direct VIP Invitation mila hai. Is card me ₹1.5 Lakh limit aur 2.5% cashback milta hai.",
    },
    {
      q: "KYC ke liye kaun se documents chahiye?",
      a: "Aadhaar Card, PAN Card (ya Form 60 declaration), aur ek live selfie capture. Pura KYC process 100% paperless hai aur mobile se 2 minute me complete ho jata hai.",
    },
    {
      q: "Mera paisa kitna safe aur secure hai?",
      a: "Aapka data aur transaction 256-Bit Bank-Grade SSL Encryption se protected hain. Hum certified banking partners aur RBI-compliant NBFC frameworks ke tehat operate karte hain.",
    },
    {
      q: "Agar koi samasya aaye toh support se kaise contact karein?",
      a: "Aap hamare support email support@educafintech.com par likh sakte hain ya hamare registered office (Vihar Gali No. 3, Utthan Road, Jhalwa, Prayagraj) me visit kar sakte hain. Hum 24 ghante ke andar har query ka resolution dete hain.",
    },
  ];

  return (
    <PageLayout title="FAQs — Frequently Asked Questions">
      <section className="py-16 bg-gradient-to-b from-blue-50 to-white text-center px-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-black rounded-full uppercase tracking-wider">
            Help & Knowledge Base
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#0A192F] tracking-tight">
            Frequently Asked <span className="text-[#1D6AE5]">Questions</span>
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm sm:text-base">
            Accounts, loans, 12% interest, aur virtual cards ke bare me sabhi sawalo ke aasan jawab.
          </p>
        </div>
      </section>

      <section className="py-12 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="space-y-4">
          {faqs.map((faq, idx) => (
            <div
              key={idx}
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden transition shadow-xs"
            >
              <button
                onClick={() => setOpenIndex(openIndex === idx ? -1 : idx)}
                className="w-full p-5 text-left font-bold text-sm sm:text-base text-gray-900 flex justify-between items-center gap-4 hover:bg-gray-50 transition"
              >
                <span>{faq.q}</span>
                <span className="text-gray-400 text-lg font-mono">
                  {openIndex === idx ? "−" : "+"}
                </span>
              </button>
              {openIndex === idx && (
                <div className="px-5 pb-5 text-xs sm:text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </PageLayout>
  );
}
