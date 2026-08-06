/**
 * إرسال ملف PDF عبر واتساب:
 * 1) WhatsApp Cloud API إن وُجدت المفاتيح (إرسال تلقائي كامل)
 * 2) Web Share API (يفتح مشاركة النظام مع الملف — اختر واتساب)
 */
(function () {
  function cloudCfg() {
    const c = window.BAKR_CONFIG?.whatsappCloud || {};
    return {
      enabled: Boolean(c.enabled && c.token && c.phoneNumberId),
      token: c.token || "",
      phoneNumberId: String(c.phoneNumberId || ""),
      apiVersion: c.apiVersion || "v21.0",
    };
  }

  async function uploadMedia(file, cfg) {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", "application/pdf");
    form.append("file", file, file.name);

    const res = await fetch(
      `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.token}` },
        body: form,
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) {
      throw new Error(data?.error?.message || "فشل رفع الملف لواتساب");
    }
    return data.id;
  }

  async function sendDocumentMessage({ to, mediaId, filename, caption, cfg }) {
    const res = await fetch(
      `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "document",
          document: {
            id: mediaId,
            filename,
            caption: String(caption || "").slice(0, 1024),
          },
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || "فشل إرسال رسالة واتساب");
    }
    return data;
  }

  function canShareFile(file) {
    try {
      if (!navigator.share || !navigator.canShare) return false;
      return navigator.canShare({ files: [file] });
    } catch (_) {
      return false;
    }
  }

  async function shareWithWhatsApp({ file, text, title }) {
    if (!canShareFile(file)) {
      return { ok: false, reason: "unsupported" };
    }
    try {
      await navigator.share({
        files: [file],
        text,
        title: title || "شاي بكر",
      });
      return { ok: true, mode: "share" };
    } catch (err) {
      if (err?.name === "AbortError") return { ok: false, reason: "cancelled" };
      return { ok: false, reason: "share-failed", error: err };
    }
  }

  async function sendPdfToCustomer({ phone, file, caption }) {
    const cfg = cloudCfg();
    if (cfg.enabled) {
      const mediaId = await uploadMedia(file, cfg);
      await sendDocumentMessage({
        to: phone,
        mediaId,
        filename: file.name,
        caption,
        cfg,
      });
      return { ok: true, mode: "cloud" };
    }

    const shared = await shareWithWhatsApp({
      file,
      text: caption,
      title: "تأكيد شاي بكر",
    });
    if (shared.ok) return shared;
    return { ok: false, reason: shared.reason || "fallback", error: shared.error };
  }

  window.BakrWhatsAppSend = {
    cloudCfg,
    canShareFile,
    shareWithWhatsApp,
    sendPdfToCustomer,
  };
})();
