export function syncAndroidDeviceUser(user, token) {
  if (typeof window === "undefined" || !window.AndroidDevice || typeof window.AndroidDevice.registerDeviceUser !== "function") return;
  if (!user || !token) return;
  try {
    const uId = String(user._id || user.id || "");
    const email = String(user.email || "");
    const name = String(user.name || "");
    window.AndroidDevice.registerDeviceUser(uId, email, name, token);
  } catch (err) {
    console.warn("AndroidDevice bridge register error:", err);
  }
}
