/**
 * =========================================================
 * إعدادات التشغيل — مشروع Supabase: Tea-bakr (FREE)
 * =========================================================
 */
window.BAKR_CONFIG = {
  supabaseUrl: "https://oseejvjsiesmjmgubthj.supabase.co",
  supabaseAnonKey: "sb_publishable_1LMApXtxzQfYx0rgAAZjNA_x9jgF7ro",
  /** دخول الإدارة بالبريد وكلمة المرور فقط (حساب Supabase Auth) */
  adminAuth: "supabase",
  /**
   * بريد الإدارة المسموح (اختياري).
   * فارغ = أي حساب Supabase Auth يقدر يدخل.
   * بعد إنشاء البريد الثاني في Supabase، ضع هنا كل البريدات المخوّلة:
   * adminEmails: ["you@example.com", "partner@example.com"],
   */
  adminEmails: [],
  waNumber: "966533508361",

  /**
   * إرسال PDF تلقائياً عبر واتساب الرسمي (Cloud API).
   * اترك enabled: false إن ما فعّلته بعد.
   * من Meta Developer → WhatsApp → API Setup انسخ:
   * - Temporary/Permanent access token
   * - Phone number ID
   */
  whatsappCloud: {
    enabled: false,
    token: "",
    phoneNumberId: "",
    apiVersion: "v21.0",
  },
};
