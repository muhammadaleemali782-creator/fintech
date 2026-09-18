import { useState } from "react";
import PageLayout from "../components/PageLayout";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "", category: "account" });

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <PageLayout title="Contact Us — Office & Customer Support">
      <section className="py-16 bg-gradient-to-b from-blue-50 to-white text-center px-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-black rounded-full uppercase tracking-wider">
            24x7 Customer Helpdesk
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#0A192F] tracking-tight">
            Humse <span className="text-[#1D6AE5]">Sampark Karein</span>
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto text-sm sm:text-base">
            Khata kholne, loan application, ya card se judi kisi bhi sahayata ke liye hamari team se judein.
          </p>
        </div>
      </section>

      <section className="py-12 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-12 gap-10">
          {/* CONTACT INFO */}
          <div className="md:col-span-5 space-y-6">
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-black text-gray-900 mb-1">📍 Registered Office</h3>
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                  Educa Fintech Private Limited<br />
                  Vihar Gali No. 3, Utthan Road, Jhalwa,<br />
                  Prayagraj, Uttar Pradesh — 211012
                </p>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-lg font-black text-gray-900 mb-1">📧 Email Support</h3>
                <p className="text-xs sm:text-sm text-[#1D6AE5] font-semibold">
                  support@educafintech.com
                </p>
                <p className="text-[11px] text-gray-400">Response within 2-4 hours</p>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-lg font-black text-gray-900 mb-1">⏰ Support Hours</h3>
                <p className="text-xs sm:text-sm text-gray-600">
                  Monday to Saturday: 9:00 AM – 7:00 PM<br />
                  Sunday: Closed (Emergency automated support active)
                </p>
              </div>
            </div>

            {/* MAP CARD */}
            <div className="bg-gradient-to-br from-blue-900 to-indigo-950 p-6 rounded-3xl text-white">
              <div className="text-xs uppercase tracking-widest text-cyan-300 font-bold mb-2">Location</div>
              <h4 className="font-extrabold text-base mb-1">Jhalwa, Prayagraj, UP</h4>
              <p className="text-xs text-gray-300 leading-relaxed mb-4">
                Near Utthan College & IIIT Allahabad road corridor. Easily accessible by local public transport.
              </p>
              <a
                href="https://maps.google.com/?q=Jhalwa+Prayagraj+Uttar+Pradesh"
                target="_blank"
                rel="noreferrer"
                className="inline-block px-4 py-2 bg-white/15 hover:bg-white/25 rounded-xl text-xs font-bold transition border border-white/20"
              >
                Open in Google Maps ↗
              </a>
            </div>
          </div>

          {/* CONTACT FORM */}
          <div className="md:col-span-7">
            <div className="bg-white p-6 sm:p-10 rounded-3xl border border-gray-200 shadow-lg">
              <h3 className="text-xl font-black text-gray-900 mb-2">Send Us a Direct Message</h3>
              <p className="text-xs text-gray-500 mb-6">
                Apna sawal likhein, hamare customer representative aapse turant connect karenge.
              </p>

              {submitted ? (
                <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-2">
                  <div className="text-3xl">✅</div>
                  <h4 className="text-base font-black text-emerald-900">Message Received!</h4>
                  <p className="text-xs text-emerald-700">
                    Aapka message hamare support team ko bhej diya gaya hai. Hum jaldi hi aapse contact karenge.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Full Name</label>
                      <input
                        type="text"
                        required
                        placeholder="Aapka naam"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-[#1D6AE5] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Phone Number</label>
                      <input
                        type="tel"
                        required
                        placeholder="Mobile number"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-[#1D6AE5] outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="name@email.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-[#1D6AE5] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Query Type</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-[#1D6AE5] outline-none bg-white"
                    >
                      <option value="account">12% Savings Account Inquiry</option>
                      <option value="loan">₹199 / Bike Loan Application</option>
                      <option value="card">Silver / Platinum VIP Card</option>
                      <option value="kyc">KYC & Document Verification</option>
                      <option value="other">General Support & Feedback</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Your Message</label>
                    <textarea
                      rows={4}
                      required
                      placeholder="Apna sawal ya message yahan likhein..."
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-[#1D6AE5] outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 bg-[#1D6AE5] hover:bg-[#1558cc] text-white font-extrabold text-xs rounded-xl shadow-md transition"
                  >
                    Submit Query →
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
