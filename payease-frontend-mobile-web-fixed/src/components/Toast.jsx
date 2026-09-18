import { useEffect } from "react";

export default function Toast({ msg, onHide }) {
  useEffect(() => {
    if (msg.text) {
      const t = setTimeout(onHide, 3000);
      return () => clearTimeout(t);
    }
  }, [msg, onHide]);

  if (!msg.text) return null;

  return (
    <div
      className={`fixed bottom-20 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-auto sm:max-w-sm px-5 py-3.5 rounded-2xl shadow-2xl z-[60] text-white text-sm font-semibold ${
        msg.type === "success" ? "bg-green-600" : "bg-red-600"
      }`}
      role="status"
    >
      {msg.text}
    </div>
  );
}
