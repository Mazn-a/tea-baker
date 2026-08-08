/**
 * =========================================================
 * إعدادات التشغيل — مشروع Supabase: Tea-bakr (FREE)
 * =========================================================
 */
window.BAKR_CONFIG = {
  supabaseUrl: "https://oseejvjsiesmjmgubthj.supabase.co",
  supabaseAnonKey: "sb_publishable_1LMApXtxzQfYx0rgAAZjNA_x9jgF7ro",
  /**
   * طريقة دخول الإدارة:
   *   "supabase" = بريد وكلمة مرور فقط (الوضع الآمن — بعد تنفيذ sql/patch-secure-admin.sql)
   *   أي قيمة أخرى = يسمح أيضاً بالدخول بالرمز المؤقت أدناه
   */
  adminAuth: "supabase",
  adminPin: "1234",
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
