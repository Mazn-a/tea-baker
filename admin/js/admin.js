const state = {
  range: "month", // month | year
  cursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  status: "all",
  orders: [],
  visits: [],
  issues: [],
  reviews: [],
  issueStatus: "open",
  reviewStatus: "pending",
  selectedOrderId: null,
  pendingOpenId: null,
  charts: {},
  page: "home",
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function cfg() {
  return window.BAKR_CONFIG || {};
}

/** يحوّل الأرقام العربية/الفارسية إلى إنجليزية */
function normalizeDigits(value) {
  return String(value || "")
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/\s+/g, "")
    .trim();
}

/** نفس أسلوب الموقع: نص عربي وأرقام إنجليزية وتقويم ميلادي مثبّت */
const AR_GREGORIAN = "ar-SA-u-ca-gregory-nu-latn";
const AR_NUMBERS = "ar-SA-u-nu-latn";

function money(n) {
  return `${Number(n || 0).toLocaleString(AR_NUMBERS)} ر.س`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(AR_GREGORIAN, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateDual(iso) {
  if (!iso) return "—";
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const g = d.toLocaleDateString(AR_GREGORIAN, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const h = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(d)
    .replace(/\s(هـ)$/, "\u00A0$1");
  return `${g} · ${h}`;
}

function daysUntil(iso) {
  const day = String(iso || "").slice(0, 10);
  if (!day) return null;
  const today = startOfToday();
  const event = new Date(`${day}T12:00:00`);
  if (Number.isNaN(event.getTime())) return null;
  return Math.round((event - today) / 86400000);
}

function daysUntilLabel(iso) {
  const n = daysUntil(iso);
  if (n == null) return "—";
  if (n < 0) return "انتهت";
  if (n === 0) return "اليوم";
  if (n === 1) return "باقي يوم واحد بالضبط";
  if (n === 2) return "باقي يومين بالضبط";
  return `باقي ${n} أيام بالضبط`;
}

function parsePaidFromNotes(notes) {
  const m = String(notes || "").match(/المدفوع\s*:\s*([\d,\.]+)/);
  if (!m) return null;
  return Number(String(m[1]).replace(/,/g, "")) || 0;
}

/** إجمالي العقد = البكج + الإضافات */
function orderContractTotal(o) {
  const parts = Number(o?.package_price || 0) + Number(o?.addons_total || 0);
  if (parts > 0) return parts;
  return Number(o?.grand_total || 0);
}

/** المبلغ المدفوع — من العمود أو الملاحظات أو الحجوزات القديمة */
function orderAmountPaid(o) {
  if (o?.amount_paid != null && Number.isFinite(Number(o.amount_paid))) {
    return Math.max(0, Number(o.amount_paid));
  }
  const fromNotes = parsePaidFromNotes(o?.notes);
  if (fromNotes != null) return fromNotes;

  const total = orderContractTotal(o);
  const grand = Number(o?.grand_total || 0);
  if (String(o?.notes || "").includes("حجز مسجّل من الإدارة") && total > grand) {
    return grand;
  }
  return 0;
}

function orderRemaining(o) {
  return Math.max(0, orderContractTotal(o) - orderAmountPaid(o));
}

function todayIsoLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function eventOccasionTitle(order) {
  const kind = String(order?.event_label || "زواج").trim() || "زواج";
  const who = String(order?.customer_name || "").trim();
  return who ? `${kind} ${who}` : kind;
}

function reviewRateUrl(order) {
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const base = String((local ? location.origin : cfg().siteUrl) || location.origin).replace(/\/$/, "");
  const id = typeof order === "string" ? order : order?.id;
  const pkg = typeof order === "object" && order ? String(order.package_name || "").trim() : "";
  const dt = typeof order === "object" && order ? String(order.event_date || "").slice(0, 10) : "";
  const ev = typeof order === "object" && order ? String(order.event_label || "").trim() : "";
  const who = typeof order === "object" && order ? String(order.customer_name || "").trim() : "";
  const params = new URLSearchParams();
  if (id) params.set("o", String(id));
  if (pkg) params.set("pkg", pkg);
  if (dt) params.set("dt", dt);
  if (ev) params.set("ev", ev);
  if (who) params.set("who", who);
  return `${base}/rate.html?${params.toString()}`;
}

function reviewQrSrc(url, size = 280) {
  const px = Math.max(120, Number(size) || 280);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${px}x${px}&margin=8&data=${encodeURIComponent(url)}`;
}

const RATE_LINK_LABEL = "تقييم ضيافة شاي بكر";
const RATE_POSTER_SRC = "../assets/rate-poster.jpg";

function rateFileName(order, kind) {
  const who = String(order?.customer_name || "شاي-بكر").replace(/\s+/g, "-");
  const prefix = kind === "poster" ? "ضيافة-شاي-بكر" : "باركود-تقييم";
  return `${prefix}-${who}.png`;
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  const href = URL.createObjectURL(blob);
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
}

async function loadQrBitmap(url, size = 800) {
  const res = await fetch(reviewQrSrc(url, size));
  if (!res.ok) throw new Error("تعذر إنشاء الباركود");
  const blob = await res.blob();
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("تعذر إنشاء الباركود"));
    img.src = URL.createObjectURL(blob);
  });
}

function loadPosterImage() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("تعذر تحميل صورة شاي بكر"));
    img.src = RATE_POSTER_SRC;
  });
}

function canvasToBlob(canvas, type = "image/png") {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("تعذر تجهيز الصورة"));
    }, type);
  });
}

async function shareOrDownloadBlob(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type || "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title, text: title });
    return "shared";
  }
  downloadBlob(blob, filename);
  return "downloaded";
}

async function composeRatePoster(url) {
  const [poster, qr] = await Promise.all([loadPosterImage(), loadQrBitmap(url, 900)]);
  const canvas = document.createElement("canvas");
  canvas.width = poster.naturalWidth || poster.width;
  canvas.height = poster.naturalHeight || poster.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(poster, 0, 0, canvas.width, canvas.height);

  const size = Math.round(canvas.width * 0.46);
  const pad = Math.round(size * 0.08);
  const box = size + pad * 2;
  const x = Math.round((canvas.width - box) / 2);
  const y = Math.round(canvas.height * 0.545);

  ctx.fillStyle = "#fffdf8";
  ctx.strokeStyle = "rgba(42, 24, 16, 0.22)";
  ctx.lineWidth = Math.max(2, Math.round(canvas.width * 0.006));
  const r = Math.round(box * 0.08);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + box, y, x + box, y + box, r);
  ctx.arcTo(x + box, y + box, x, y + box, r);
  ctx.arcTo(x, y + box, x, y, r);
  ctx.arcTo(x, y, x + box, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.drawImage(qr, x + pad, y + pad, size, size);
  return canvas;
}

function reviewStars(n) {
  const v = Math.max(1, Math.min(5, Number(n) || 0));
  return "★".repeat(v) + "☆".repeat(5 - v);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isWeddingOrder(order) {
  const label = String(order?.event_label || "").trim();
  if (label === "زواج") return true;
  // حجوزات الإدارة القديمة — قبل حقل «نوع المناسبة» كانت تُحفظ كـ «حجز خارجي»
  if (label === "حجز خارجي") return true;
  const notes = String(order?.notes || "");
  if (notes.includes("حجز مسجّل من الإدارة") || notes.includes("حجز خارجي")) return true;
  return false;
}

/** كل المناسبات القادمة (للعرض أو التشخيص) */
function upcomingOccasions(list = state.orders) {
  const todayIso = bookingWindowBounds().minIso;
  return activeOrders(list)
    .filter((o) => o.status === "accepted" || o.status === "pending")
    .filter((o) => String(o.event_date || "").slice(0, 10) >= todayIso)
    .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
}

/** المناسبات القادمة — زواج + حجوزات الإدارة + أي طلب مقبول/جديد بتاريخ مستقبلي */
function upcomingWeddings(list = state.orders) {
  // اعرض كل المناسبات القادمة — الإدارة تحتاج تشوف كل الحجوزات المستقبلية
  return upcomingOccasions(list);
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(AR_GREGORIAN, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(s) {
  if (s === "accepted") return "مقبول";
  if (s === "rejected") return "مرفوض";
  if (s === "deleted") return "محذوف";
  return "جديد";
}

function activeOrders(list = state.orders) {
  return (list || []).filter((o) => o.status !== "deleted");
}

function periodBounds() {
  const c = state.cursor;
  const y = c.getFullYear();
  const m = c.getMonth();
  if (state.range === "year") {
    return {
      start: new Date(y, 0, 1, 0, 0, 0, 0),
      end: new Date(y, 11, 31, 23, 59, 59, 999),
    };
  }
  return {
    start: new Date(y, m, 1, 0, 0, 0, 0),
    end: new Date(y, m + 1, 0, 23, 59, 59, 999),
  };
}

function inPeriod(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const { start, end } = periodBounds();
  return t >= start.getTime() && t <= end.getTime();
}

function periodLabelText() {
  const c = state.cursor;
  if (state.range === "year") {
    return c.toLocaleDateString(AR_GREGORIAN, { year: "numeric" });
  }
  return c.toLocaleDateString(AR_GREGORIAN, { month: "long", year: "numeric" });
}

function shiftPeriod(dir) {
  const c = new Date(state.cursor);
  if (state.range === "year") c.setFullYear(c.getFullYear() + dir);
  else c.setMonth(c.getMonth() + dir);
  state.cursor = new Date(c.getFullYear(), c.getMonth(), 1);
  renderStats();
}

function resetPeriodToNow() {
  const now = new Date();
  state.cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  renderStats();
}

function updatePeriodNav() {
  const label = $("#periodLabel");
  if (label) label.textContent = periodLabelText();
  const today = $("#periodToday");
  if (today) {
    today.textContent = state.range === "year" ? "السنة الحالية" : "هذا الشهر";
  }
  // امنع الذهاب لمستقبل بعيد
  const now = new Date();
  const nextBtn = $("#periodNext");
  if (nextBtn) {
    const limit =
      state.range === "year"
        ? new Date(now.getFullYear(), 0, 1)
        : new Date(now.getFullYear(), now.getMonth(), 1);
    nextBtn.disabled = state.cursor.getTime() >= limit.getTime();
  }
}

function phoneToWa(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("966")) return digits;
  if (digits.startsWith("05") && digits.length === 10) return `966${digits.slice(1)}`;
  if (digits.startsWith("5") && digits.length === 9) return `966${digits}`;
  return digits;
}

function buildConfirmMessage(order) {
  const isAccepted = order.status === "accepted";
  const isRejected = order.status === "rejected";

  const decision = isAccepted
    ? "✅ تم قبول طلبك من شاي بكر."
    : isRejected
      ? "❌ نعتذر، تم رفض الطلب للتاريخ المطلوب."
      : "وصلنا طلبك ونراجعه حالياً.";

  return [
    `مرحباً ${order.customer_name}،`,
    decision,
    `المناسبة: ${order.event_label} · ${formatDate(order.event_date)}`,
    `الإجمالي: ${money(orderContractTotal(order))}`,
    orderRemaining(order) > 0 ? `المتبقي: ${money(orderRemaining(order))}` : "",
    isAccepted
      ? "للتأكيد النهائي ردّ بكلمة «أؤكد»."
      : isRejected
        ? "يمكنك تقديم طلب جديد بتاريخ آخر."
        : "سنوافيك بالنتيجة قريباً.",
  ]
    .filter(Boolean)
    .join("\n");
}

function showToast(message, tone = "ok") {
  let el = $("#adminToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "adminToast";
    el.className = "admin-toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.tone = tone;
  el.classList.add("is-on");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("is-on"), 6200);
}

function closeShareModal() {
  $("#shareModal")?.remove();
}

function showShareModal({ order, file, text }) {
  closeShareModal();
  const modal = document.createElement("div");
  modal.id = "shareModal";
  modal.className = "share-modal";
  modal.innerHTML = `
    <div class="share-card" role="dialog" aria-modal="true">
      <img src="../assets/logo-brand.png?v=12" alt="" class="share-logo" />
      <h3>إرسال القرار مع ملف PDF</h3>
      <p>الملف جاهز بشعار شاي بكر. اختر طريقة الإرسال:</p>
      <ol class="share-steps">
        <li>اضغط <strong>إرسال عبر واتساب مع الملف</strong></li>
        <li>من القائمة اختر <strong>WhatsApp</strong></li>
        <li>تأكد أن الرقم <strong dir="ltr">${order.customer_phone}</strong></li>
      </ol>
      <div class="share-actions">
        <button type="button" class="btn btn-ok" id="shareWaBtn">إرسال عبر واتساب مع الملف</button>
        <button type="button" class="btn btn-ghost" id="shareDlBtn">تحميل PDF فقط</button>
        <button type="button" class="btn btn-wa" id="shareTextBtn">واتساب نص فقط</button>
        <button type="button" class="btn btn-ghost" id="shareCloseBtn">إغلاق</button>
      </div>
      <p class="share-note">ملاحظة: رابط واتساب العادي ما يقدر يرفق ملف لحاله — المشاركة تضمّن الملف مع الرسالة.</p>
    </div>`;
  document.body.appendChild(modal);

  $("#shareCloseBtn", modal).onclick = closeShareModal;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeShareModal();
  });

  $("#shareDlBtn", modal).onclick = () => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 20_000);
    showToast("تم تحميل PDF");
  };

  $("#shareTextBtn", modal).onclick = () => {
    openWhatsApp(order);
  };

  $("#shareWaBtn", modal).onclick = async () => {
    const btn = $("#shareWaBtn", modal);
    btn.disabled = true;
    try {
      const result = await window.BakrWhatsAppSend.shareWithWhatsApp({
        file,
        text,
        title: "تأكيد شاي بكر",
      });
      if (result.ok) {
        showToast("اختر واتساب من القائمة — الملف مرفق مع الرسالة");
        closeShareModal();
        return;
      }
      if (result.reason === "cancelled") {
        showToast("تم إلغاء المشاركة", "warn");
      } else if (result.reason === "unsupported") {
        showToast("جهازك ما يدعم إرفاق ملف — استخدم الجوال أو فعّل Cloud API", "warn");
      } else {
        showToast("ما اكتملت المشاركة — جرّب من الجوال", "warn");
      }
    } finally {
      btn.disabled = false;
    }
  };
}

async function deliverDecision(order) {
  const text = buildConfirmMessage(order);
  const phone = phoneToWa(order.customer_phone);

  try {
    showToast("جاري تجهيز ملف PDF…");
    const file = await window.BakrOrderPdf.makePdfFile(order);

    // 1) إرسال سحابي تلقائي إن مفعّل
    const cloud = window.BakrWhatsAppSend?.cloudCfg?.() || {};
    if (cloud.enabled) {
      await window.BakrWhatsAppSend.sendPdfToCustomer({
        phone,
        file,
        caption: text,
      });
      showToast("تم إرسال ملف PDF مباشرة لواتساب العميل");
      return;
    }

    // 2) مشاركة النظام مع الملف (مضمّن مع واتساب)
    if (window.BakrWhatsAppSend?.canShareFile?.(file)) {
      const shared = await window.BakrWhatsAppSend.shareWithWhatsApp({
        file,
        text,
        title: "تأكيد شاي بكر",
      });
      if (shared.ok) {
        showToast("أرسل الملف عبر واتساب من قائمة المشاركة");
        return;
      }
      if (shared.reason === "cancelled") {
        showShareModal({ order, file, text });
        return;
      }
    }

    // 3) واجهة اختيار واضحة
    showShareModal({ order, file, text });
  } catch (err) {
    console.warn("deliverDecision:", err);
    showToast(err?.message || "تعذر تجهيز الملف — حدّث الصفحة وحاول", "warn");
    openWhatsApp(order);
  }
}

/* =========================================================
 * الدخول — حساب Supabase فقط (بريد + كلمة مرور)
 * ========================================================= */

function isLocalHost() {
  return /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
}

/** معاينة الواجهة على الجهاز فقط — لا تعمل على bakr-tea.com */
function isLocalPreview() {
  return isLocalHost() && new URLSearchParams(location.search).get("preview") === "1";
}

function shiftIsoDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ensureLocalPreviewFixtures() {
  if (!isLocalPreview()) return;
  const reviewKey = "bakr-reviews-v1";
  const orderKey = "bakr-orders-v1";
  let reviews = [];
  try {
    reviews = JSON.parse(localStorage.getItem(reviewKey) || "[]");
  } catch (_) {
    reviews = [];
  }
  if (!Array.isArray(reviews) || !reviews.length) {
    reviews = [
      {
        id: "preview-rev-pending-1",
        created_at: new Date().toISOString(),
        first_name: "عبدالرحمن",
        last_name: "الغامدي",
        package_name: "البكج الذهبي",
        rating: 5,
        event_date: shiftIsoDays(-2),
        comment: "الركن مرتّب والمباشرين بزي رسمي. الضيوف سألوا عن الشاي أكثر من مرة.",
        city_label: "مكة المكرمة",
        event_label: "زواج",
        status: "pending",
      },
      {
        id: "preview-rev-pending-2",
        created_at: new Date().toISOString(),
        first_name: "نورة",
        last_name: "الزهراني",
        package_name: "البكج الفضي",
        rating: 4,
        event_date: shiftIsoDays(-3),
        comment: "طلبت من الموقع ووصلني واتساب في نفس اليوم.",
        city_label: "جدة",
        event_label: "ملكة",
        status: "pending",
      },
      {
        id: "preview-rev-approved-1",
        created_at: new Date().toISOString(),
        first_name: "فيصل",
        last_name: "الحربي",
        package_name: "البكج الملكي",
        rating: 5,
        event_date: shiftIsoDays(-8),
        comment: "البكج الملكي كفى العدد اللي اتفقنا عليه.",
        city_label: "الطائف",
        event_label: "زواج",
        status: "approved",
      },
    ];
    localStorage.setItem(reviewKey, JSON.stringify(reviews));
  }

  let orders = [];
  try {
    orders = JSON.parse(localStorage.getItem(orderKey) || "[]");
  } catch (_) {
    orders = [];
  }
  if (!Array.isArray(orders)) orders = [];
  const previewOrders = [
    {
      id: "preview-rate-order",
      created_at: new Date().toISOString(),
      status: "accepted",
      customer_name: "خالد السعيد",
      customer_phone: "0533508361",
      package_name: "البكج الذهبي",
      package_price: 3500,
      addons_total: 0,
      grand_total: 3500,
      amount_paid: 1000,
      event_date: shiftIsoDays(-1),
      event_label: "زواج",
      city_label: "مكة المكرمة",
      hall_name: "قاعة النور",
      location_link: "https://maps.google.com/?q=Makkah",
      notes: "",
    },
    {
      id: "preview-rate-ended",
      created_at: new Date().toISOString(),
      status: "accepted",
      customer_name: "سعد القحطاني",
      customer_phone: "0533508361",
      package_name: "البكج الملكي",
      package_price: 5500,
      addons_total: 0,
      grand_total: 5500,
      amount_paid: 5500,
      event_date: shiftIsoDays(-21),
      event_label: "زواج",
      city_label: "جدة",
      hall_name: "قاعة الورد",
      location_link: "",
      notes: "",
    },
    {
      id: "preview-rate-soon",
      created_at: new Date().toISOString(),
      status: "accepted",
      customer_name: "فهد العتيبي",
      customer_phone: "0533508361",
      package_name: "البكج الفضي",
      package_price: 2500,
      addons_total: 0,
      grand_total: 2500,
      amount_paid: 800,
      event_date: shiftIsoDays(12),
      event_label: "زواج",
      city_label: "الطائف",
      hall_name: "قاعة الأصيل",
      location_link: "",
      notes: "",
    },
  ];
  let wrote = false;
  for (const row of previewOrders) {
    if (!orders.some((o) => String(o.id) === row.id)) {
      orders.unshift(row);
      wrote = true;
    }
  }
  if (wrote) localStorage.setItem(orderKey, JSON.stringify(orders));
}

function applyLocalPreviewData() {
  if (!isLocalPreview()) return;
  ensureLocalPreviewFixtures();
  try {
    const reviews = JSON.parse(localStorage.getItem("bakr-reviews-v1") || "[]");
    if (Array.isArray(reviews) && reviews.length) state.reviews = reviews;
  } catch (_) {}
  try {
    const orders = JSON.parse(localStorage.getItem("bakr-orders-v1") || "[]");
    const previewRows = (orders || []).filter((o) => String(o.id || "").startsWith("preview-rate-"));
    for (const preview of previewRows) {
      if (!state.orders.some((o) => String(o.id) === String(preview.id))) {
        state.orders = [preview, ...state.orders];
      }
    }
  } catch (_) {}
}

async function isAuthed() {
  if (isLocalPreview()) return true;
  return Boolean(await window.BakrStore?.currentUser?.());
}

async function refreshConnectionStatus() {
  const statusEl = $("#setupStatus");
  const helpEl = $("#setupHelp");
  const alertEl = $("#connAlert");
  const badge = $("#storageBadge");

  const result = (await window.BakrStore?.ping?.()) || {
    ok: false,
    mode: "local",
    message: "المخزن غير جاهز",
  };

  if (statusEl) {
    statusEl.textContent = result.message;
    statusEl.classList.toggle("is-ok", Boolean(result.ok));
    statusEl.classList.toggle("is-bad", !result.ok);
  }

  if (badge) {
    if (result.ok) {
      badge.classList.add("is-ok");
      badge.classList.remove("is-bad");
      badge.title = "متصل بالسحابة";
      badge.setAttribute("aria-label", "متصل بالسحابة");
    } else {
      badge.classList.remove("is-ok");
      badge.classList.add("is-bad");
      const title =
        result.mode === "local" ? "وضع محلي — لا اتصال سحابي" : "خطأ في الاتصال";
      badge.title = title;
      badge.setAttribute("aria-label", title);
    }
  }

  // التنبيه يظهر فقط عند انقطاع الاتصال
  if (alertEl) {
    const show = !result.ok;
    alertEl.hidden = !show;
    alertEl.classList.toggle("is-hidden", !show);
  }
  if (helpEl) helpEl.hidden = Boolean(result.ok);
}

function showApp() {
  const login = $("#loginView");
  const app = $("#appView");
  if (login) {
    login.hidden = true;
    login.classList.add("is-hidden");
  }
  if (app) {
    app.hidden = false;
    app.classList.remove("is-hidden");
  }
  refreshConnectionStatus();
  loadData()
    .then(() => {
      if (!state.selectedOrderId && !state.pendingOpenId) {
        /* الصفحة تُضبط من setup عبر showPage */
      }
    })
    .catch((err) => {
      console.warn("loadData:", err);
    });
}

function showLogin() {
  const login = $("#loginView");
  const app = $("#appView");
  if (login) {
    login.hidden = false;
    login.classList.remove("is-hidden");
  }
  if (app) {
    app.hidden = true;
    app.classList.add("is-hidden");
  }
}

function showLoginError(message) {
  const errEl = $("#loginError");
  if (!errEl) return;
  errEl.textContent = message || "";
  errEl.hidden = !message;
  errEl.classList.toggle("is-hidden", !message);
}

/** دخول بالبريد وكلمة المرور — الجلسة تبقى محفوظة فلا يعيد الكتابة كل مرة */
async function tryLogin() {
  const email = String($("#adminEmail")?.value || "").trim();
  const password = String($("#adminPassword")?.value || "");
  const btn = $("#loginBtn");

  if (!email || !password) {
    showLoginError("اكتب البريد وكلمة المرور");
    return false;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = "جاري الدخول…";
  }
  const res = (await window.BakrStore?.signIn?.(email, password)) || {
    ok: false,
    message: "المخزن غير جاهز",
  };
  if (btn) {
    btn.disabled = false;
    btn.textContent = "دخول";
  }

  if (!res.ok) {
    showLoginError(res.message);
    return false;
  }

  showLoginError("");
  const pass = $("#adminPassword");
  if (pass) pass.value = "";
  showApp();
  showPage(state.page || "home");
  return true;
}

/* =========================================================
 * تصدير الطلبات — نسخة احتياطية تفتح في Excel
 * ========================================================= */

function csvCell(value) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

function ordersToCsv(orders) {
  const head = [
    "التاريخ",
    "الحالة",
    "الاسم",
    "الجوال",
    "المدينة",
    "المناسبة",
    "البكج",
    "سعر البكج",
    "الإضافات",
    "مجموع الإضافات",
    "الإجمالي",
    "القاعة",
    "رابط الخريطة",
    "ملاحظات",
    "وقت الطلب",
  ];

  const lines = orders.map((o) => {
    const addons = (Array.isArray(o.addons) ? o.addons : [])
      .map((a) => `${a.name} ×${a.qty || 1}`)
      .join(" | ");
    return [
      o.event_date || "",
      statusLabel(o.status),
      o.customer_name || "",
      o.customer_phone || "",
      o.city_label || "",
      o.event_label || "",
      o.package_name || "",
      Number(o.package_price || 0),
      addons,
      Number(o.addons_total || 0),
      Number(o.grand_total || 0),
      o.hall_name || "",
      o.location_link || "",
      o.notes || "",
      o.created_at || "",
    ]
      .map(csvCell)
      .join(",");
  });

  // BOM حتى يقرأ Excel العربية صح
  return `\uFEFF${[head.map(csvCell).join(","), ...lines].join("\r\n")}`;
}

function exportOrders() {
  const orders = activeOrders();
  if (!orders.length) {
    showToast("ما فيه طلبات للتصدير", "warn");
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([ordersToCsv(orders)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `طلبات-شاي-بكر-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`تم تصدير ${orders.length} طلب`);
}

function countBy(items, keyFn) {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item) || "—";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

const CHART_COLORS = [
  "#633a11",
  "#c4a35a",
  "#8b5a2b",
  "#1f7a3f",
  "#4a2b19",
  "#b42318",
  "#9a6700",
  "#128c7e",
];

function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    delete state.charts[key];
  }
}

function makeDoughnut(canvasId, key, rows, emptyText) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;
  destroyChart(key);

  const wrap = canvas.parentElement;
  let empty = wrap?.querySelector(".chart-empty");
  if (!rows.length) {
    if (!empty && wrap) {
      empty = document.createElement("p");
      empty.className = "chart-empty";
      wrap.appendChild(empty);
    }
    if (empty) empty.textContent = emptyText || "لا بيانات في هذه الفترة";
    canvas.hidden = true;
    return;
  }
  if (empty) empty.remove();
  canvas.hidden = false;

  state.charts[key] = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: rows.map(([l]) => l),
      datasets: [
        {
          data: rows.map(([, n]) => n),
          backgroundColor: rows.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
          borderColor: "#fffdf9",
          borderWidth: 3,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "58%",
      plugins: {
        legend: {
          position: "bottom",
          rtl: true,
          labels: {
            font: { family: "Tajawal", size: 12, weight: "700" },
            color: "#4a2b19",
            boxWidth: 12,
            padding: 12,
          },
        },
        tooltip: {
          rtl: true,
          titleFont: { family: "Tajawal", weight: "700" },
          bodyFont: { family: "Tajawal" },
          callbacks: {
            label(ctx) {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0) || 1;
              const pct = Math.round((ctx.parsed / total) * 100);
              return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

function makeBar(canvasId, key, rows, emptyText, barLabel = "الطلبات") {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;
  destroyChart(key);

  const wrap = canvas.parentElement;
  let empty = wrap?.querySelector(".chart-empty");
  if (!rows.length) {
    if (!empty && wrap) {
      empty = document.createElement("p");
      empty.className = "chart-empty";
      wrap.appendChild(empty);
    }
    if (empty) empty.textContent = emptyText || "لا بيانات في هذه الفترة";
    canvas.hidden = true;
    return;
  }
  if (empty) empty.remove();
  canvas.hidden = false;

  state.charts[key] = new Chart(canvas, {
    type: "bar",
    data: {
      labels: rows.map(([l]) => l),
      datasets: [
        {
          label: barLabel,
          data: rows.map(([, n]) => n),
          backgroundColor: "rgba(99, 58, 17, 0.85)",
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 42,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          rtl: true,
          titleFont: { family: "Tajawal", weight: "700" },
          bodyFont: { family: "Tajawal" },
        },
      },
      scales: {
        x: {
          ticks: {
            font: { family: "Tajawal", weight: "700", size: 11 },
            color: "#6a5240",
            maxRotation: 0,
          },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            font: { family: "Tajawal", weight: "700" },
            color: "#6a5240",
            precision: 0,
          },
          grid: { color: "rgba(99, 58, 17, 0.08)" },
        },
      },
    },
  });
}

function renderStats() {
  updatePeriodNav();
  const orders = state.orders.filter((o) => inPeriod(o.created_at));
  const visits = realVisits().filter((v) => inPeriod(v.created_at));
  const accepted = orders.filter((o) => o.status === "accepted");
  const rejected = orders.filter((o) => o.status === "rejected");
  const pending = orders.filter((o) => o.status === "pending");
  const revenue = accepted.reduce((sum, o) => sum + Number(o.grand_total || 0), 0);
  const avg = accepted.length > 0 ? Math.round(revenue / accepted.length) : 0;
  const when = periodLabelText();

  $("#statGrid").innerHTML = `
    <article class="stat-card is-money is-hero">
      <span>الدخل الكامل</span>
      <strong>${money(revenue)}</strong>
      <em>من الطلبات المقبولة · متوسط الطلب ${money(avg)}</em>
    </article>
    <article class="stat-card is-orders">
      <span>عدد الطلبات</span>
      <strong>${orders.length}</strong>
      <em>${when}</em>
    </article>
    <article class="stat-card is-pending">
      <span>بانتظار القرار</span>
      <strong>${pending.length}</strong>
      <em>يحتاجون قبول أو رفض</em>
    </article>
    <article class="stat-card is-visit">
      <span>زيارات الموقع</span>
      <strong>${visits.length}</strong>
      <em>شخص فتح الموقع · ${when}</em>
    </article>
  `;

  const statusRows = [
    ["جديد", pending.length],
    ["مقبول", accepted.length],
    ["مرفوض", rejected.length],
  ].filter(([, n]) => n > 0);

  makeDoughnut("statusChart", "status", statusRows, "ما فيه طلبات في هالفترة");
  makeDoughnut(
    "citiesChart",
    "cities",
    countBy(orders, (o) => o.city_label).slice(0, 6),
    "ما فيه مدن بعد"
  );
  makeDoughnut(
    "packagesChart",
    "packages",
    countBy(orders, (o) => o.package_name).slice(0, 6),
    "ما فيه بكجات بعد"
  );

  const hourMap = new Map();
  for (let h = 0; h < 24; h += 1) hourMap.set(h, 0);
  orders.forEach((o) => {
    const raw = Number(o.hour_of_day);
    const hour = Number.isFinite(raw) ? raw : new Date(o.created_at).getHours();
    hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
  });
  const peakRows = [...hourMap.entries()]
    .filter(([, n]) => n > 0)
    .map(([h, n]) => [`${String(h).padStart(2, "0")}:00`, n]);
  makeBar("peakChart", "peak", peakRows, "ما فيه أوقات ذروة بعد");
}

/* =========================================================
 * زوار الموقع — كم شخص فتح الموقع مقابل من أرسل طلباً
 * الزيارة = جلسة تصفح واحدة (تُسجَّل مرة لكل زائر في الجلسة)
 * ========================================================= */

/** مفتاح اليوم بالتوقيت المحلي: YYYY-MM-DD */
function dayKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function daysAgoStart(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

function countSince(list, days, field = "created_at") {
  const from = daysAgoStart(days);
  return (list || []).filter((row) => new Date(row[field]) >= from).length;
}

/** الزيارات الحقيقية فقط — بدون سطور خطوات الحجز */
function realVisits() {
  return (state.visits || []).filter((v) => !window.BakrStore?.isStepRow?.(v));
}

const STEP_LABELS = {
  city: "اختار المدينة",
  event: "اختار المناسبة",
  package: "اختار البكج",
  addons: "وصل للإضافات",
  date: "وصل للتاريخ",
  name: "كتب الاسم",
  phone: "كتب الجوال",
  location: "كتب القاعة",
  notes: "وصل للملاحظات",
  review: "وصل للمراجعة",
  success: "أرسل الطلب",
};

/** كم زائر مختلف وصل لكل خطوة في آخر 30 يوماً */
function renderFunnel() {
  const box = $("#funnelList");
  if (!box) return;

  const from = daysAgoStart(29);
  const perStep = new Map();
  (state.visits || []).forEach((v) => {
    if (!window.BakrStore?.isStepRow?.(v)) return;
    if (new Date(v.created_at) < from) return;
    const step = window.BakrStore.stepName(v);
    if (!perStep.has(step)) perStep.set(step, new Set());
    perStep.get(step).add(v.session_id || v.id);
  });

  const flow = window.FLOW || Object.keys(STEP_LABELS);
  const rows = flow
    .map((step) => [step, perStep.get(step)?.size || 0])
    .filter(([, n], i) => n > 0 || i === 0);

  const top = rows[0]?.[1] || 0;
  if (!top) {
    box.innerHTML = `<p class="empty-hint">ما فيه بيانات بعد — تظهر أول ما يبدأ الزوار الحجز.</p>`;
    return;
  }

  box.innerHTML = rows
    .map(([step, n]) => {
      const pct = Math.round((n / top) * 100);
      return `
      <div class="funnel-row">
        <span class="funnel-label">${STEP_LABELS[step] || step}</span>
        <span class="funnel-bar"><span style="width:${pct}%"></span></span>
        <span class="funnel-value">${n}</span>
      </div>`;
    })
    .join("");
}

function renderVisitors() {
  const visits = realVisits();
  const orders = activeOrders();

  const today = countSince(visits, 0);
  const week = countSince(visits, 6);
  const month = countSince(visits, 29);
  const ordersMonth = countSince(orders, 29);
  const rate = month > 0 ? Math.round((ordersMonth / month) * 100) : 0;

  const grid = $("#visitorsGrid");
  if (grid) {
    grid.innerHTML = `
      <article class="stat-card is-visit is-hero">
        <span>زيارات اليوم</span>
        <strong>${today}</strong>
        <em>منذ منتصف الليل</em>
      </article>
      <article class="stat-card is-orders">
        <span>آخر 7 أيام</span>
        <strong>${week}</strong>
        <em>مجموع الزيارات في الأسبوع</em>
      </article>
      <article class="stat-card is-money">
        <span>آخر 30 يوم</span>
        <strong>${month}</strong>
        <em>${ordersMonth} منهم أرسلوا طلباً</em>
      </article>
      <article class="stat-card is-pending">
        <span>من كل 100 زائر</span>
        <strong>${month >= 10 ? rate : "—"}</strong>
        <em>${month >= 10 ? "يرسلون طلب حجز" : "تحتاج زيارات أكثر للقياس"}</em>
      </article>
      <article class="stat-card is-total">
        <span>إجمالي الزيارات</span>
        <strong>${visits.length}</strong>
        <em>منذ إطلاق الموقع</em>
      </article>`;
  }

  // آخر 14 يوماً بالترتيب من الأقدم للأحدث
  const counts = new Map();
  for (let i = 13; i >= 0; i -= 1) {
    const d = daysAgoStart(i);
    counts.set(dayKey(d), 0);
  }
  visits.forEach((v) => {
    const key = dayKey(v.created_at);
    if (counts.has(key)) counts.set(key, counts.get(key) + 1);
  });
  const rows = [...counts.entries()].map(([key, n]) => {
    const d = new Date(`${key}T12:00:00`);
    return [d.toLocaleDateString(AR_GREGORIAN, { day: "numeric", month: "numeric" }), n];
  });

  makeBar("visitsChart", "visits", rows, "ما فيه زيارات بعد", "الزيارات");
  renderFunnel();
  updateVisitorsChoiceHint(today);
}

function updateVisitorsChoiceHint(todayCount) {
  const el = $("#visitorsChoiceHint");
  if (!el) return;
  const today = typeof todayCount === "number" ? todayCount : countSince(realVisits(), 0);
  el.textContent = today > 0 ? `${today} زيارة اليوم — اضغط للتفاصيل` : "كم شخص دخل الموقع";
}

function issueStatusLabel(s) {
  return s === "resolved" ? "تم الحل" : "مفتوحة";
}

function filteredIssues() {
  const list = state.issues || [];
  if (state.issueStatus === "all") return list;
  return list.filter((r) => (r.status || "open") === state.issueStatus);
}

function renderIssues() {
  const box = $("#issuesList");
  if (!box) return;
  const list = filteredIssues();

  if (!list.length) {
    box.innerHTML = `<p class="empty-hint">لا توجد بلاغات في هذا التبويب.</p>`;
    return;
  }

  box.innerHTML = list
    .map((r) => {
      const stepText = r.step ? STEP_LABELS[r.step] || r.step : "";
      const pageText = [stepText, r.page].filter(Boolean).join(" — ") || "—";
      const contactBtn = r.contact
        ? `<button type="button" class="btn btn-ghost btn-sm" data-issue-wa="${escapeAttr(r.id)}">واتساب العميل</button>`
        : "";
      const toggleLabel = r.status === "resolved" ? "إعادة فتح" : "تحديد كمحلولة";
      return `
      <article class="order-row is-${escapeAttr(r.status || "open")}" data-issue-id="${escapeAttr(r.id)}">
        <div class="order-row-main">
          <div class="order-row-title">
            <strong>${escapeHtml(r.message)}</strong>
            <span class="status-pill ${escapeAttr(r.status || "open")}">${issueStatusLabel(r.status)}</span>
          </div>
          <p class="issue-meta">${escapeHtml(pageText)} · ${escapeHtml(formatDateTime(r.created_at))}</p>
          ${r.contact ? `<p class="issue-meta">جوال: ${escapeHtml(r.contact)}</p>` : ""}
        </div>
        <div class="order-row-side">
          ${contactBtn}
          <button type="button" class="btn btn-primary btn-sm" data-issue-toggle="${escapeAttr(r.id)}">${toggleLabel}</button>
        </div>
      </article>`;
    })
    .join("");
}

function updateIssuesChoiceHint() {
  const el = $("#issuesChoiceHint");
  const open = (state.issues || []).filter((r) => (r.status || "open") === "open").length;
  if (el) {
    el.textContent = open > 0 ? `${open} بلاغ يحتاج مراجعة` : "بلاغات العملاء عن أخطاء بالموقع";
  }
  const badge = $("#issuesBadge");
  if (badge) {
    badge.hidden = open === 0;
    badge.textContent = String(open);
  }
}

function updateUpcomingChoiceHint() {
  const el = $("#upcomingChoiceHint");
  if (!el) return;
  const n = upcomingWeddings().length;
  el.textContent = n > 0 ? `${n} مناسبة قادمة — مرتّبة بالأيام` : "لا توجد مناسبات قادمة حالياً";
}

function filteredReviews() {
  const list = state.reviews || [];
  if (state.reviewStatus === "all") return list;
  return list.filter((r) => (r.status || "pending") === state.reviewStatus);
}

function reviewStatusLabel(s) {
  if (s === "approved") return "ظاهرة";
  if (s === "rejected") return "مرفوضة";
  return "بانتظار الموافقة";
}

function dueRatingOrders() {
  return activeOrders()
    .filter((o) => o.status === "accepted")
    .sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)));
}

function renderDueRatings() {
  const box = $("#dueRatingList");
  if (!box) return;
  const rows = dueRatingOrders();
  if (!rows.length) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = `
    <h3 class="due-rating-title">باركود التقييم لكل مناسبة — مفتوح دائماً وخاص بها</h3>
    ${rows
      .map((o) => {
        const title = eventOccasionTitle(o);
        const url = reviewRateUrl(o);
        const ended = daysUntil(o.event_date) < 0;
        return `
      <article class="due-rating-row has-qr">
        <a class="due-rating-qr" href="${escapeAttr(url)}" target="_blank" rel="noopener" title="${escapeAttr(RATE_LINK_LABEL)}">
          <img src="${escapeAttr(reviewQrSrc(url))}" alt="باركود ${escapeAttr(title)}" width="96" height="96" />
        </a>
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(o.package_name || "")} · ${formatDate(o.event_date)}${
            ended ? " · انتهت" : ""
          }</span>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-open-rate="${escapeAttr(o.id)}">فتح الطلب</button>
      </article>`;
      })
      .join("")}`;
  box.querySelectorAll("[data-open-rate]").forEach((btn) => {
    btn.addEventListener("click", () => showOrderDetail(btn.dataset.openRate));
  });
}

function renderAdminReviews() {
  const box = $("#reviewsAdminList");
  if (!box) return;
  renderDueRatings();
  const list = filteredReviews();
  if (!list.length) {
    box.innerHTML = `<p class="empty-hint">لا توجد تقييمات في هذا التبويب.</p>`;
    return;
  }
  box.innerHTML = list
    .map((r) => {
      const name = `${r.first_name || ""} ${r.last_name || ""}`.trim() || "ضيف";
      return `
      <article class="order-row is-${escapeAttr(r.status || "pending")}">
        <div class="order-row-main">
          <div class="order-row-title">
            <strong>${escapeHtml(name)}</strong>
            <span class="status-pill ${escapeAttr(r.status || "pending")}">${reviewStatusLabel(r.status)}</span>
          </div>
          <p class="admin-review-stars" aria-label="${escapeAttr(r.rating)} من 5">${reviewStars(r.rating)}</p>
          <p class="issue-meta">${escapeHtml(r.package_name || "")} · ${formatDate(r.event_date)}${
            r.city_label ? ` · ${escapeHtml(r.city_label)}` : ""
          }</p>
          ${r.comment ? `<p class="issue-meta">«${escapeHtml(r.comment)}»</p>` : ""}
        </div>
        <div class="order-row-side">
          ${
            r.status !== "approved"
              ? `<button type="button" class="btn btn-ok btn-sm" data-review-status="approved" data-review-id="${escapeAttr(r.id)}">إظهار</button>`
              : ""
          }
          ${
            r.status !== "rejected"
              ? `<button type="button" class="btn btn-err btn-sm" data-review-status="rejected" data-review-id="${escapeAttr(r.id)}">إخفاء</button>`
              : ""
          }
        </div>
      </article>`;
    })
    .join("");
}

function updateReviewsChoiceHint() {
  const el = $("#reviewsChoiceHint");
  const pending = (state.reviews || []).filter((r) => (r.status || "pending") === "pending").length;
  if (el) {
    el.textContent = pending > 0 ? `${pending} تقييم بانتظار موافقتك` : "اعتماد آراء الضيوف وباركود المناسبة";
  }
  const badge = $("#reviewsPendingBadge");
  const tab = document.querySelector('#reviewStatusTabs [data-review-status="pending"]');
  if (badge) {
    badge.hidden = pending === 0;
    badge.textContent = String(pending);
  }
  tab?.classList.toggle("has-new", pending > 0);
}

function reviewsToCsv(rows) {
  const head = ["الاسم الأول", "الاسم الثاني", "البكج", "التقييم", "التاريخ", "التعليق", "الحالة"];
  const lines = rows.map((r) =>
    [r.first_name, r.last_name, r.package_name, r.rating, r.event_date, r.comment, reviewStatusLabel(r.status)]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  return `\uFEFF${[head.map((h) => `"${h}"`).join(","), ...lines].join("\r\n")}`;
}

function exportReviews() {
  const rows = state.reviews || [];
  if (!rows.length) {
    showToast("ما فيه تقييمات للتصدير", "warn");
    return;
  }
  const blob = new Blob([reviewsToCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `تقييمات-شاي-بكر-${todayIsoLocal()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
  showToast(`تم تصدير ${rows.length} تقييم`);
}

function updateOrdersChoiceHint() {
  const el = $("#ordersChoiceHint");
  const pending = activeOrders().filter((o) => o.status === "pending").length;
  if (el) {
    if (pending > 0) {
      el.textContent = `${pending} طلب بانتظار القرار — اضغط للعرض`;
    } else {
      el.textContent = "عرض الطلبات واتخاذ القرار";
    }
  }
  updatePendingBadge(pending);
}

function updatePendingBadge(count) {
  const pending =
    typeof count === "number"
      ? count
      : activeOrders().filter((o) => o.status === "pending").length;
  const badge = $("#pendingBadge");
  const tab = $("#pendingFilterTab") || document.querySelector('#statusTabs [data-status="pending"]');
  if (!badge) return;
  if (pending > 0) {
    badge.hidden = false;
    badge.textContent = String(pending);
    badge.setAttribute("aria-label", `${pending} طلب جديد`);
    tab?.classList.add("has-new");
  } else {
    badge.hidden = true;
    badge.textContent = "";
    badge.removeAttribute("aria-label");
    tab?.classList.remove("has-new");
  }
}

function showPage(page) {
  state.page = page || "home";
  state.selectedOrderId = null;
  document.body.classList.remove("admin-detail-open");

  const detail = $("#orderDetailView");
  if (detail) {
    detail.hidden = true;
    detail.setAttribute("hidden", "");
    detail.classList.add("is-hidden");
  }

  const dash = $("#dashboardView");
  if (dash) {
    dash.hidden = false;
    dash.removeAttribute("hidden");
    dash.classList.remove("is-hidden");
  }

  $$(".admin-page").forEach((el) => {
    const on = el.dataset.page === state.page;
    el.hidden = !on;
    if (on) el.removeAttribute("hidden");
    else el.setAttribute("hidden", "");
    el.classList.toggle("is-page-on", on);
  });

  if (state.page === "stats") {
    requestAnimationFrame(() => renderStats());
  }
  if (state.page === "visitors") {
    requestAnimationFrame(() => renderVisitors());
  }
  if (state.page === "reports") {
    requestAnimationFrame(() => renderIssues());
  }
  if (state.page === "upcoming") {
    renderUpcoming();
  }
  if (state.page === "reviews") {
    renderAdminReviews();
  }
  if (state.page === "orders") {
    renderOrders();
  }

  const hash = state.page === "home" ? "" : `#${state.page}`;
  history.replaceState(null, "", location.pathname + location.search + hash);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showDashboard() {
  showPage("orders");
}

function showOrderDetail(id) {
  const order = state.orders.find((o) => String(o.id) === String(id));
  if (!order) {
    showToast("الطلب غير موجود", "warn");
    showPage("orders");
    return;
  }
  state.selectedOrderId = order.id;
  state.page = "orders";
  document.body.classList.add("admin-detail-open");

  $$(".admin-page").forEach((el) => {
    el.hidden = true;
    el.setAttribute("hidden", "");
    el.classList.remove("is-page-on");
  });

  // أخفِ قائمة اللوحة بالكامل حتى تظهر صفحة التفاصيل فقط
  const dash = $("#dashboardView");
  if (dash) {
    dash.hidden = true;
    dash.setAttribute("hidden", "");
    dash.classList.add("is-hidden");
  }

  const detail = $("#orderDetailView");
  if (detail) {
    detail.hidden = false;
    detail.removeAttribute("hidden");
    detail.classList.remove("is-hidden");
  }
  renderOrderDetail(order);
  history.replaceState(null, "", `#order=${encodeURIComponent(order.id)}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function releaseLocalBookedDate(iso) {
  const day = String(iso || "").slice(0, 10);
  if (!day) return;
  try {
    const key = "bakr-booked-dates";
    const all = JSON.parse(localStorage.getItem(key) || "[]").filter(
      (d) => String(d).slice(0, 10) !== day
    );
    localStorage.setItem(key, JSON.stringify(all));
  } catch (_) {}
}

function bookingWindowBounds() {
  const min = new Date();
  min.setHours(0, 0, 0, 0);
  const max = new Date(min);
  max.setMonth(max.getMonth() + 12);
  const toIso = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return { minIso: toIso(min), maxIso: toIso(max), min, max };
}

function renderUpcoming() {
  const list = $("#upcomingList");
  if (!list) return;
  const rows = upcomingWeddings();
  if (!rows.length) {
    list.innerHTML = `<p class="empty-hint">لا توجد مناسبات قادمة — إذا حجزت من الإدارة، افتح «الطلبات» وتأكد أن التاريخ مستقبلي ثم اضغط «تحديث».</p>`;
    return;
  }

  list.innerHTML = rows
    .map((o, idx) => {
      const days = daysUntilLabel(o.event_date);
      const urgent = daysUntil(o.event_date) <= 7;
      const total = orderContractTotal(o);
      const paid = orderAmountPaid(o);
      const remaining = orderRemaining(o);
      const addons = Array.isArray(o.addons) ? o.addons : [];
      return `
      <article class="upcoming-card ${urgent ? "is-soon" : ""} ${remaining > 0 ? "has-due" : ""}">
        <div class="upcoming-rank">${idx + 1}</div>
        <div class="upcoming-body">
          <div class="upcoming-top">
            <strong>${escapeHtml(o.customer_name || "—")}</strong>
            <span class="upcoming-days">${days}</span>
          </div>
          <p class="upcoming-date">${formatDateDual(o.event_date)}</p>
          <p class="upcoming-meta">
            <span>${escapeHtml(o.city_label || "—")}</span>
            <span>·</span>
            <span>${escapeHtml(o.hall_name || "—")}</span>
            <span>·</span>
            <span>${escapeHtml(o.event_label || "زواج")}</span>
            <span>·</span>
            <span>${statusLabel(o.status)}</span>
          </p>
          <p class="upcoming-package">${escapeHtml(o.package_name || "—")}${addons.length ? ` · ${addons.length} إضافة` : ""}</p>
          <div class="upcoming-pay">
            <span>الإجمالي ${money(total)}</span>
            <span>مدفوع ${money(paid)}</span>
            <strong class="upcoming-due">${remaining > 0 ? `باقي ${money(remaining)}` : "مسدّد بالكامل"}</strong>
          </div>
          ${
            o.status === "accepted"
              ? `<div class="upcoming-qr">
            <a href="${escapeAttr(reviewRateUrl(o))}" target="_blank" rel="noopener" title="${escapeAttr(RATE_LINK_LABEL)}">
              <img src="${escapeAttr(reviewQrSrc(reviewRateUrl(o)))}" alt="باركود ${escapeAttr(eventOccasionTitle(o))}" width="88" height="88" />
            </a>
            <span>باركود ${escapeHtml(eventOccasionTitle(o))}</span>
          </div>`
              : ""
          }
          <button type="button" class="btn btn-ghost upcoming-open" data-id="${escapeAttr(o.id)}">فتح الطلب</button>
        </div>
      </article>`;
    })
    .join("");

  list.querySelectorAll(".upcoming-open").forEach((btn) => {
    btn.addEventListener("click", () => showOrderDetail(btn.dataset.id));
  });
}

function renderOrders() {
  const list = $("#ordersList");
  if (!list) return;
  let orders = activeOrders().slice();
  if (state.status !== "all") {
    orders = orders.filter((o) => o.status === state.status);
  }

  if (!orders.length) {
    list.innerHTML = `<p class="empty-hint">لا توجد طلبات في هذا التبويب.</p>`;
    return;
  }

  list.innerHTML = orders
    .map((o, index) => {
      const addons = Array.isArray(o.addons) ? o.addons : [];
      const isExternal =
        o.package_id === "external" ||
        String(o.notes || "").includes("حجز مسجّل من الإدارة");
      const status = o.status || "pending";
      const pendingHint =
        status === "pending" ? `<span class="order-row-hint pending-hint">بانتظار قرارك</span>` : "";
      const ctaClass =
        status === "pending" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm";
      const tone = index % 2 === 0 ? "tone-a" : "tone-b";
      return `
      <article class="order-row is-${escapeAttr(status)} ${tone}" data-id="${String(o.id || "").replace(/"/g, "")}" data-open-order="1">
        <div class="order-row-main">
          <div class="order-row-title">
            <strong>${escapeHtml(o.customer_name)}</strong>
            <span class="status-pill ${escapeAttr(status)}">${statusLabel(status)}</span>
            ${isExternal ? `<span class="ext-pill">خارج الموقع</span>` : ""}
          </div>
          <div class="order-row-meta">
            <span>${escapeHtml(o.city_label)}</span>
            <span>·</span>
            <span>${escapeHtml(o.event_label)}</span>
            <span>·</span>
            <span>${escapeHtml(o.package_name || "—")}</span>
            <span>·</span>
            <span>${formatDate(o.event_date)}</span>
          </div>
          <div class="order-row-sub">
            <span class="order-phone">${escapeHtml(o.customer_phone)}</span>
            <span>${formatDateTime(o.created_at)}</span>
          </div>
        </div>
        <div class="order-row-side">
          <strong class="order-row-total">${money(orderContractTotal(o))}</strong>
          ${
            orderRemaining(o) > 0
              ? `<span class="order-row-due">باقي ${money(orderRemaining(o))}</span>`
              : `<span class="order-row-hint">مسدّد</span>`
          }
          <span class="order-row-hint">${addons.length ? `${addons.length} إضافة` : "بدون إضافات"}</span>
          ${pendingHint}
          <button type="button" class="${ctaClass}" data-open-order="1">فتح الطلب</button>
        </div>
      </article>`;
    })
    .join("");
}

function renderOrderDetail(o) {
  const root = $("#orderDetail");
  if (!root) return;
  const addons = Array.isArray(o.addons) ? o.addons : [];
  const addonList =
    addons.length > 0
      ? `<ul class="addon-list">${addons
          .map(
            (a) =>
              `<li><span>${escapeHtml(a.name)}</span><span class="qty">× ${a.qty} · ${money(a.price * a.qty)}</span></li>`
          )
          .join("")}</ul>`
      : `<p class="empty-hint">بدون إضافات</p>`;

  const mapLink = o.location_link || "";
  const isMap = /^https?:\/\//i.test(mapLink);
  const cleanNotes = String(o.notes || "")
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p && !/^الموقع\s*:/.test(p))
    .join(" | ");

  const shortId = String(o.id || "").slice(0, 8).toUpperCase() || "——";
  const decideHint =
    o.status === "pending"
      ? `<p class="order-decide-hint">راجع كل التفاصيل بالأسفل ثم اضغط قبول أو رفض.</p>`
      : "";
  const contractTotal = orderContractTotal(o);
  const amountPaid = orderAmountPaid(o);
  const remaining = orderRemaining(o);

  root.innerHTML = `
    <div class="order-top">
      <div>
        <h3>${escapeHtml(o.customer_name)}</h3>
        <p>${formatDateTime(o.created_at)} · مرجع ${shortId}</p>
      </div>
      <span class="status-pill ${o.status}">${statusLabel(o.status)}</span>
    </div>
    ${decideHint}

    <section class="order-section">
      <h4 class="order-section-title">بيانات العميل</h4>
      <div class="order-kv">
        <div class="item"><span class="lbl">الاسم</span><span class="val">${escapeHtml(o.customer_name || "—")}</span></div>
        <div class="item"><span class="lbl">الجوال</span><span class="val order-phone">${escapeHtml(o.customer_phone || "—")}</span></div>
      </div>
    </section>

    <section class="order-section">
      <h4 class="order-section-title">المناسبة والبكج</h4>
      <div class="order-kv">
        <div class="item"><span class="lbl">المدينة</span><span class="val">${escapeHtml(o.city_label || "—")}</span></div>
        <div class="item"><span class="lbl">المناسبة</span><span class="val">${escapeHtml(o.event_label || "—")}</span></div>
        <div class="item"><span class="lbl">البكج</span><span class="val">${escapeHtml(o.package_name || "—")}</span></div>
        <div class="item"><span class="lbl">سعر البكج</span><span class="val">${money(o.package_price)}</span></div>
        <div class="item"><span class="lbl">مجموع الإضافات</span><span class="val">${money(o.addons_total)}</span></div>
        <div class="item"><span class="lbl">تاريخ المناسبة</span><span class="val">${formatDate(o.event_date)}</span></div>
        <div class="item total span-2"><span class="lbl">إجمالي العقد</span><span class="val">${money(contractTotal)}</span></div>
      </div>
    </section>

    <section class="order-section">
      <h4 class="order-section-title">الدفع والمتبقي</h4>
      <div class="order-kv">
        <div class="item"><span class="lbl">المبلغ المدفوع</span><span class="val">${money(amountPaid)}</span></div>
        <div class="item total span-2 ${remaining > 0 ? "due-row" : ""}"><span class="lbl">المتبقي</span><span class="val">${remaining > 0 ? money(remaining) : "مسدّد بالكامل ✓"}</span></div>
      </div>
      <div class="order-paid-edit">
        <label class="field">
          <span>تحديث المبلغ المدفوع</span>
          <div class="order-paid-row">
            <input id="orderPaidInput" type="number" min="0" step="1" inputmode="numeric" value="${amountPaid || ""}" dir="ltr" />
            <button type="button" class="btn btn-ok btn-sm" data-action="save-paid">حفظ المدفوع</button>
          </div>
          <small class="field-hint">اكتب كم دفع العميل — المتبقي يتحدّث تلقائياً في الزواجات القادمة</small>
        </label>
      </div>
    </section>

    <section class="order-section">
      <h4 class="order-section-title">القاعة والموقع</h4>
      <div class="order-kv">
        <div class="item"><span class="lbl">اسم القاعة</span><span class="val">${escapeHtml(o.hall_name || "—")}</span></div>
        <div class="item span-2"><span class="lbl">رابط الخريطة</span><span class="val">${
          mapLink
            ? isMap
              ? `<a href="${escapeAttr(mapLink)}" target="_blank" rel="noopener">فتح في خرائط قوقل</a>
                 <div class="map-url" dir="ltr">${escapeHtml(mapLink)}</div>`
              : escapeHtml(mapLink)
            : "—"
        }</span></div>
      </div>
    </section>

    ${
      o.status === "accepted"
        ? `<section class="order-section">
            <h4 class="order-section-title">باركود تقييم الضيافة</h4>
            <p class="field-hint">الباركود خاص بـ${escapeHtml(eventOccasionTitle(o))} — مفتوح دائماً، والتاريخ يتعبّأ تلقائي.</p>
            <div class="rate-qr">
              <a class="rate-qr-link" href="${escapeAttr(reviewRateUrl(o))}" target="_blank" rel="noopener" title="${escapeAttr(RATE_LINK_LABEL)}">
                <img src="${escapeAttr(reviewQrSrc(reviewRateUrl(o)))}" alt="باركود التقييم" width="180" height="180" />
              </a>
              <div class="rate-qr-actions">
                <button type="button" class="btn btn-ghost btn-sm" data-action="save-qr">حفظ كصورة</button>
                <button type="button" class="btn btn-ghost btn-sm" data-action="share-qr-poster">مشاركة صورة شاي بكر</button>
                <button type="button" class="btn btn-ghost btn-sm" data-action="copy-rate">نسخ الرابط</button>
              </div>
              <a class="rate-qr-name" href="${escapeAttr(reviewRateUrl(o))}" target="_blank" rel="noopener">${escapeHtml(RATE_LINK_LABEL)}</a>
            </div>
          </section>`
        : ""
    }

    <section class="order-section">
      <h4 class="order-section-title">الإضافات (${addons.length})</h4>
      ${addonList}
    </section>

    ${
      cleanNotes
        ? `<section class="order-section">
            <h4 class="order-section-title">ملاحظات العميل</h4>
            <p class="order-notes">${escapeHtml(cleanNotes)}</p>
          </section>`
        : ""
    }

    <div class="order-actions">
      <button type="button" class="btn btn-ok" data-action="accept" ${
        o.status === "accepted" ? "disabled" : ""
      }>قبول + إرسال PDF</button>
      <button type="button" class="btn btn-err" data-action="reject" ${
        o.status === "rejected" ? "disabled" : ""
      }>رفض + إرسال PDF</button>
      <button type="button" class="btn btn-ghost" data-action="pdf">معاينة / تحميل PDF</button>
      <button type="button" class="btn btn-wa" data-action="whatsapp">واتساب نص فقط</button>
    </div>
    <div class="order-delete-box">
      <button type="button" class="btn btn-delete" data-action="delete">حذف الطلب نهائياً</button>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

async function loadData() {
  if (!window.BakrStore) {
    $("#ordersList").innerHTML =
      `<p class="empty-hint">تعذر تحميل مخزن البيانات. حدّث الصفحة.</p>`;
    return;
  }
  const [orders, visits, issues, reviews] = await Promise.all([
    window.BakrStore.listOrders(),
    window.BakrStore.listVisits(),
    window.BakrStore.listIssueReports?.() ?? Promise.resolve([]),
    window.BakrStore.listReviews?.() ?? Promise.resolve([]),
  ]);
  state.orders = (orders || []).filter(
    (o) => !window.BakrStore.isDeletedOrder?.(o) && o.status !== "deleted"
  );
  state.visits = visits || [];
  state.issues = issues || [];
  state.reviews = reviews || [];
  applyLocalPreviewData();
  renderStats();
  renderOrders();
  updateOrdersChoiceHint();
  updateUpcomingChoiceHint();
  updateVisitorsChoiceHint();
  updateIssuesChoiceHint();
  updateReviewsChoiceHint();
  if (state.page === "visitors") renderVisitors();
  if (state.page === "reports") renderIssues();
  if (state.page === "upcoming") renderUpcoming();
  if (state.page === "reviews") renderAdminReviews();
  if (state.selectedOrderId) {
    const still = state.orders.find((o) => String(o.id) === String(state.selectedOrderId));
    if (still) renderOrderDetail(still);
    else {
      state.selectedOrderId = null;
      document.body.classList.remove("admin-detail-open");
      showPage("orders");
    }
  } else if (state.pendingOpenId) {
    const id = state.pendingOpenId;
    state.pendingOpenId = null;
    if (state.orders.some((o) => String(o.id) === String(id))) showOrderDetail(id);
    else showPage("orders");
  }
}

async function handleOrderAction(action, order, btn) {
  const id = order.id;
  if (action === "accept") {
    if (btn) btn.disabled = true;
    await setStatus(id, "accepted");
    const updated = state.orders.find((o) => o.id === id);
    if (updated) {
      renderOrderDetail(updated);
      await deliverDecision(updated);
    }
  } else if (action === "reject") {
    if (btn) btn.disabled = true;
    await setStatus(id, "rejected");
    const updated = state.orders.find((o) => o.id === id);
    if (updated) {
      renderOrderDetail(updated);
      await deliverDecision(updated);
    }
  } else if (action === "pdf") {
    if (btn) btn.disabled = true;
    try {
      const file = await window.BakrOrderPdf.makePdfFile(order);
      showShareModal({
        order,
        file,
        text: buildConfirmMessage(order),
      });
      window.BakrOrderPdf.openReceiptPreview?.(order);
    } catch (err) {
      console.warn(err);
      showToast("تعذر توليد الملف — حدّث الصفحة (Cmd+Shift+R)", "warn");
    } finally {
      if (btn) btn.disabled = false;
    }
  } else if (action === "whatsapp") {
    openWhatsApp(order);
  } else if (action === "save-paid") {
    const raw = normalizeDigits($("#orderPaidInput")?.value || "").replace(/[^\d.]/g, "");
    const paid = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(paid) || paid < 0) {
      showToast("المبلغ المدفوع غير صحيح", "warn");
      return;
    }
    if (btn) btn.disabled = true;
    try {
      await window.BakrStore.updateOrderPayment(id, paid);
      await loadData();
      showToast("تم حفظ المبلغ المدفوع");
    } catch (err) {
      console.warn(err);
      showToast("تعذر حفظ المبلغ — حاول مرة ثانية", "warn");
    } finally {
      if (btn) btn.disabled = false;
    }
  } else if (action === "copy-rate") {
    const url = reviewRateUrl(order);
    try {
      await navigator.clipboard.writeText(url);
      showToast("تم نسخ رابط التقييم");
    } catch (_) {
      window.prompt("انسخ رابط التقييم", url);
    }
  } else if (action === "save-qr") {
    if (btn) btn.disabled = true;
    try {
      const qr = await loadQrBitmap(reviewRateUrl(order), 800);
      const canvas = document.createElement("canvas");
      canvas.width = qr.width || 800;
      canvas.height = qr.height || 800;
      canvas.getContext("2d").drawImage(qr, 0, 0, canvas.width, canvas.height);
      downloadBlob(await canvasToBlob(canvas), rateFileName(order, "qr"));
      showToast("تم حفظ الباركود");
    } catch (err) {
      console.warn(err);
      showToast("تعذر حفظ الباركود — حاول مرة ثانية", "warn");
    } finally {
      if (btn) btn.disabled = false;
    }
  } else if (action === "share-qr-poster") {
    if (btn) btn.disabled = true;
    try {
      const canvas = await composeRatePoster(reviewRateUrl(order));
      const how = await shareOrDownloadBlob(
        await canvasToBlob(canvas),
        rateFileName(order, "poster"),
        RATE_LINK_LABEL
      );
      showToast(how === "shared" ? "تم فتح المشاركة" : "تم حفظ صورة شاي بكر");
    } catch (err) {
      console.warn(err);
      showToast(err?.message || "تعذر تجهيز صورة المشاركة", "warn");
    } finally {
      if (btn) btn.disabled = false;
    }
  } else if (action === "delete") {
    await deleteOrderById(order, btn);
  }
}

function isDateStillBooked(iso, exceptId) {
  const day = String(iso || "").slice(0, 10);
  if (!day) return false;
  return state.orders.some(
    (o) =>
      String(o.id) !== String(exceptId) &&
      o.status !== "rejected" &&
      o.status !== "deleted" &&
      String(o.event_date || "").slice(0, 10) === day
  );
}

async function deleteOrderById(order, btn) {
  const name = order.customer_name || "هذا الطلب";
  const dateLabel = formatDate(order.event_date);
  const ok = window.confirm(
    `هل أنت متأكد؟\n\nسيتم حذف طلب «${name}» بتاريخ ${dateLabel} نهائياً من الموقع.\nلا يمكن التراجع عن هذا الإجراء.`
  );
  if (!ok) return false;

  if (btn) btn.disabled = true;
  const eventDate = order.event_date;
  const orderId = order.id;

  // أخفِ الطلب فوراً من الواجهة
  state.orders = state.orders.filter((o) => String(o.id) !== String(orderId));
  state.selectedOrderId = null;
  document.body.classList.remove("admin-detail-open");
  renderOrders();
  updateOrdersChoiceHint();
  updateUpcomingChoiceHint();
  showPage("orders");

  try {
    const res = await window.BakrStore.deleteOrder(orderId);
    if (!isDateStillBooked(eventDate, orderId)) {
      releaseLocalBookedDate(eventDate);
    }
    await loadData();
    if (window.BakrStore.hasCloud?.() && res && res.cloud === false) {
      showToast("اختفى من هذا الجهاز — تعذر الحذف من قاعدة البيانات", "warn");
    } else {
      showToast("تم حذف الطلب نهائياً من الموقع");
    }
    return true;
  } catch (err) {
    console.warn(err);
    showToast("تعذر حفظ الحذف — حدّث الصفحة وحاول مرة ثانية", "warn");
    await loadData();
    if (btn) btn.disabled = false;
    return false;
  }
}

async function setStatus(id, status) {
  const current = state.orders.find((o) => o.id === id);
  await window.BakrStore.updateOrderStatus(id, status);
  // عند الرفض يتحرر التاريخ من الحجز المحلي أيضاً
  if (status === "rejected" && current?.event_date) {
    releaseLocalBookedDate(current.event_date);
  }
  await loadData();
}

function openWhatsApp(order) {
  const phone = phoneToWa(order.customer_phone);
  const text = buildConfirmMessage(order);
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener");
}

/** حالة نموذج الحجز اليدوي */
const bkState = { addonQty: {}, paidTouched: false };

function adminPackagePricing(p, cityId) {
  if (!p) return { listPrice: 0, price: 0 };
  const cityKey = String(cityId || "");
  const cityDeal =
    cityKey && cityKey !== "makkah" && p.cityPricing && p.cityPricing[cityKey]
      ? p.cityPricing[cityKey]
      : null;
  if (cityDeal) {
    const price = Number(cityDeal.price) || 0;
    const listPrice =
      cityDeal.listPrice != null ? Number(cityDeal.listPrice) || price : price;
    return { listPrice, price };
  }
  const price = Number(p.price) || 0;
  const listPrice = Number(p.listPrice != null ? p.listPrice : p.price) || 0;
  return { listPrice, price };
}

function getBkPackage() {
  const id = $("#bkPackage")?.value;
  return (window.BAKR_CATALOG?.packages || []).find((p) => p.id === id) || null;
}

function getBkAddonQty(id) {
  return Math.max(0, Number(bkState.addonQty[id] || 0));
}

function setBkAddonQty(id, qty) {
  bkState.addonQty[id] = Math.max(0, Number(qty) || 0);
}

function getBkSelectedAddons() {
  return (window.BAKR_CATALOG?.addons || [])
    .map((a) => ({ ...a, qty: getBkAddonQty(a.id) }))
    .filter((a) => a.qty > 0);
}

function calcBkPackagePrice() {
  const pkg = getBkPackage();
  if (!pkg) return 0;
  return adminPackagePricing(pkg, $("#bkCity")?.value).price;
}

function calcBkAddonsTotal() {
  return getBkSelectedAddons().reduce(
    (sum, a) => sum + Number(a.price || 0) * a.qty,
    0
  );
}

function calcBkGrandTotal() {
  return calcBkPackagePrice() + calcBkAddonsTotal();
}

function renderBkAddons() {
  const host = $("#bkAddonsHost");
  if (!host) return;
  const addons = window.BAKR_CATALOG?.addons || [];
  if (!addons.length) {
    host.innerHTML = `<p class="empty-hint">لا توجد إضافات في الكتالوج</p>`;
    return;
  }
  host.innerHTML = `
    <div class="bk-addons-grid">
      ${addons
        .map((a) => {
          const qty = getBkAddonQty(a.id);
          const on = qty > 0;
          return `
          <div class="bk-addon ${on ? "is-on" : ""}" data-bk-addon="${a.id}">
            <div class="bk-addon-info">
              <span class="bk-addon-name">${escapeHtml(a.name)}</span>
              <span class="bk-addon-unit">${money(a.price)}</span>
            </div>
            <div class="bk-addon-qty">
              <button type="button" class="bk-addon-btn" data-bk-dec="${a.id}" aria-label="إنقاص">−</button>
              <span class="bk-addon-val">${qty}</span>
              <button type="button" class="bk-addon-btn" data-bk-inc="${a.id}" aria-label="زيادة">+</button>
            </div>
          </div>`;
        })
        .join("")}
    </div>`;
}

function updateBkPriceSummary({ syncPaid = true } = {}) {
  const root = $("#bkPriceSummary");
  const paidInput = $("#bkPaid");
  if (!root) return;

  const pkg = getBkPackage();
  const pkgPrice = calcBkPackagePrice();
  const addonsTotal = calcBkAddonsTotal();
  const calculated = pkgPrice + addonsTotal;
  const selected = getBkSelectedAddons();
  const paidRaw = normalizeDigits(paidInput?.value || "").replace(/[^\d.]/g, "");
  const paid = paidRaw !== "" ? Number(paidRaw) : calculated;
  const remaining = Math.max(0, calculated - (Number.isFinite(paid) ? paid : 0));

  if (syncPaid && paidInput && !bkState.paidTouched) {
    paidInput.value = calculated > 0 ? String(calculated) : "";
  }

  root.innerHTML = `
    <div class="bk-price-row"><span>البكج</span><strong>${escapeHtml(pkg?.name || "—")} · ${money(pkgPrice)}</strong></div>
    <div class="bk-price-row"><span>الإضافات</span><strong>${selected.length ? `${selected.length} نوع · ${money(addonsTotal)}` : "بدون إضافات"}</strong></div>
    <div class="bk-price-row bk-price-total"><span>إجمالي العقد</span><strong>${money(calculated)}</strong></div>
    <div class="bk-price-row"><span>المبلغ المدفوع</span><strong>${money(Number.isFinite(paid) ? paid : 0)}</strong></div>
    <div class="bk-price-row bk-price-due"><span>المتبقي</span><strong>${remaining > 0 ? money(remaining) : "مسدّد بالكامل"}</strong></div>`;
}

function resetBkBookingForm() {
  bkState.addonQty = {};
  bkState.paidTouched = false;
  renderBkAddons();
  updateBkPriceSummary({ syncPaid: true });
}

async function setup() {
  $("#loginBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    tryLogin();
  });

  $("#brandHomeBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    showPage("home");
  });

  $("#togglePinVisibility")?.addEventListener("click", (e) => {
    e.preventDefault();
    const input = $("#adminPassword");
    const btn = $("#togglePinVisibility");
    if (!input || !btn) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-pressed", show ? "true" : "false");
    btn.setAttribute("aria-label", show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
    const openIcon = btn.querySelector(".eye-open");
    const closedIcon = btn.querySelector(".eye-closed");
    if (openIcon) openIcon.hidden = show;
    if (closedIcon) closedIcon.hidden = !show;
    input.focus();
  });

  [$("#adminEmail"), $("#adminPassword")].forEach((el) => {
    el?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        tryLogin();
      }
    });
  });

  $("#logoutBtn")?.addEventListener("click", async () => {
    await window.BakrStore?.signOut?.();
    showLogin();
  });

  $("#refreshBtn")?.addEventListener("click", () => {
    refreshConnectionStatus();
    loadData().catch((err) => console.warn(err));
  });

  $("#exportOrdersBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    exportOrders();
  });

  $("#exportReviewsBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    exportReviews();
  });

  $("#pingBtn")?.addEventListener("click", () => {
    refreshConnectionStatus();
  });

  $$("#rangeTabs .range-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("#rangeTabs .range-tab").forEach((b) => b.classList.remove("is-on"));
      btn.classList.add("is-on");
      state.range = btn.dataset.range === "year" ? "year" : "month";
      renderStats();
    });
  });

  $("#periodPrev")?.addEventListener("click", () => shiftPeriod(-1));
  $("#periodNext")?.addEventListener("click", () => shiftPeriod(1));
  $("#periodToday")?.addEventListener("click", () => resetPeriodToNow());

  $$("#statusTabs .filter-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("#statusTabs .filter-tab").forEach((b) => b.classList.remove("is-on"));
      btn.classList.add("is-on");
      state.status = btn.dataset.status;
      renderOrders();
    });
  });

  $$("#issueStatusTabs .filter-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("#issueStatusTabs .filter-tab").forEach((b) => b.classList.remove("is-on"));
      btn.classList.add("is-on");
      state.issueStatus = btn.dataset.issueStatus;
      renderIssues();
    });
  });

  $$("#reviewStatusTabs .filter-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("#reviewStatusTabs .filter-tab").forEach((b) => b.classList.remove("is-on"));
      btn.classList.add("is-on");
      state.reviewStatus = btn.dataset.reviewStatus;
      renderAdminReviews();
    });
  });

  $("#reviewsAdminList")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-review-id]");
    if (!btn) return;
    const id = btn.dataset.reviewId;
    const next = btn.dataset.reviewStatus;
    btn.disabled = true;
    try {
      await window.BakrStore.updateReviewStatus(id, next);
      await loadData();
      showToast(next === "approved" ? "ظهر التقييم على الموقع" : "تم إخفاء التقييم");
    } catch (err) {
      console.warn(err);
      showToast("تعذر حفظ حالة التقييم", "warn");
    } finally {
      btn.disabled = false;
    }
  });

  $("#issuesList")?.addEventListener("click", async (e) => {
    const waBtn = e.target.closest("[data-issue-wa]");
    const toggleBtn = e.target.closest("[data-issue-toggle]");
    if (waBtn) {
      const id = waBtn.dataset.issueWa;
      const report = state.issues.find((r) => String(r.id) === String(id));
      if (report?.contact) {
        window.open(`https://wa.me/${phoneToWa(report.contact)}`, "_blank", "noopener");
      }
      return;
    }
    if (toggleBtn) {
      const id = toggleBtn.dataset.issueToggle;
      const report = state.issues.find((r) => String(r.id) === String(id));
      if (!report) return;
      toggleBtn.disabled = true;
      const nextStatus = report.status === "resolved" ? "open" : "resolved";
      await window.BakrStore?.updateIssueStatus?.(id, nextStatus);
      report.status = nextStatus;
      renderIssues();
      updateIssuesChoiceHint();
    }
  });

  document.addEventListener("click", (e) => {
    // أزرار التنقل فقط — لا تلتقط أقسام الصفحة ذات data-page
    const pageBtn = e.target.closest("button[data-page], a[data-page]");
    if (pageBtn && pageBtn.dataset.page) {
      e.preventDefault();
      showPage(pageBtn.dataset.page);
    }
  });

  $("#ordersList")?.addEventListener("click", (e) => {
    const row = e.target.closest(".order-row[data-id]");
    if (!row) return;
    const id = row.dataset.id;
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    showOrderDetail(id);
  });

  $("#backToListBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    showPage("orders");
  });

  $("#orderDetail")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = state.selectedOrderId;
    const order = state.orders.find((o) => o.id === id);
    if (!order) return;
    await handleOrderAction(btn.dataset.action, order, btn);
  });

  // حجز جديد من خارج الموقع
  const citySelect = $("#bkCity");
  if (citySelect && window.BAKR_CATALOG?.cities) {
    citySelect.innerHTML = window.BAKR_CATALOG.cities
      .map((c) => `<option value="${c.id}">${c.label}</option>`)
      .join("");
  }
  const eventSelect = $("#bkEvent");
  if (eventSelect && window.BAKR_CATALOG?.events) {
    eventSelect.innerHTML = window.BAKR_CATALOG.events
      .map((ev) => `<option value="${ev.id}">${ev.label}</option>`)
      .join("");
  }
  const packageSelect = $("#bkPackage");
  if (packageSelect && window.BAKR_CATALOG?.packages) {
    packageSelect.innerHTML = window.BAKR_CATALOG.packages
      .map((p) => `<option value="${p.id}">${p.name}</option>`)
      .join("");
  }

  const bkAddonsHost = $("#bkAddonsHost");
  renderBkAddons();
  updateBkPriceSummary({ syncPaid: true });

  packageSelect?.addEventListener("change", () => updateBkPriceSummary({ syncPaid: true }));
  citySelect?.addEventListener("change", () => updateBkPriceSummary({ syncPaid: true }));

  $("#bkPaid")?.addEventListener("input", () => {
    bkState.paidTouched = true;
    updateBkPriceSummary({ syncPaid: false });
  });

  bkAddonsHost?.addEventListener("click", (e) => {
    const inc = e.target.closest("[data-bk-inc]");
    const dec = e.target.closest("[data-bk-dec]");
    const id = inc?.dataset.bkInc || dec?.dataset.bkDec;
    if (!id) return;
    e.preventDefault();
    const next = getBkAddonQty(id) + (inc ? 1 : -1);
    setBkAddonQty(id, next);
    renderBkAddons();
    updateBkPriceSummary({ syncPaid: true });
  });

  const bkCalendarHost = $("#bkCalendarHost");
  const bkDateInput = $("#bkDate");
  const bookingBounds = bookingWindowBounds();
  let bkCalendar = null;
  if (bkCalendarHost && window.AdminCalendar) {
    bkCalendar = window.AdminCalendar.create(
      bkCalendarHost,
      bkDateInput,
      bookingBounds,
      () => window.BakrStore?.listBookedDates?.()
    );
  }

  async function openBookingModal() {
    const modal = $("#bookingModal");
    const err = $("#bkError");
    if (err) {
      err.hidden = true;
      err.textContent = "";
    }
    $("#bookingForm")?.reset();
    resetBkBookingForm();
    bkCalendar?.reset();
    await bkCalendar?.refreshBooked();
    if (modal) {
      modal.hidden = false;
      modal.classList.remove("is-hidden");
    }
  }

  function closeBookingModal() {
    const modal = $("#bookingModal");
    if (modal) {
      modal.hidden = true;
      modal.classList.add("is-hidden");
    }
  }

  $("#newBookingBtn")?.addEventListener("click", openBookingModal);
  $("#bkCancelBtn")?.addEventListener("click", closeBookingModal);
  $("#bookingModal")?.addEventListener("click", (e) => {
    if (e.target === $("#bookingModal")) closeBookingModal();
  });

  $("#bookingForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#bkError");
    const customerName = String($("#bkName")?.value || "").trim();
    const phone = normalizeDigits($("#bkPhone")?.value || "").replace(/\D/g, "");
    const cityId = $("#bkCity")?.value;
    const eventId = $("#bkEvent")?.value;
    const eventDate = bkCalendar?.getValue?.() || $("#bkDate")?.value;
    const notes = String($("#bkNotes")?.value || "").trim();
    const hallName = String($("#bkHall")?.value || "").trim();
    const locationLink = String($("#bkLocation")?.value || "").trim();
    const selectedPkg = getBkPackage();
    const packagePrice = calcBkPackagePrice();
    const selectedAddons = getBkSelectedAddons();
    const addonsTotal = calcBkAddonsTotal();
    const calculatedTotal = packagePrice + addonsTotal;
    const paidRaw = normalizeDigits($("#bkPaid")?.value || "").replace(/[^\d.]/g, "");
    const paidAmount = paidRaw !== "" ? Number(paidRaw) : calculatedTotal;
    const city = (window.BAKR_CATALOG?.cities || []).find((c) => c.id === cityId);
    const eventItem = (window.BAKR_CATALOG?.events || []).find((ev) => ev.id === eventId);
    const eventLabel = eventItem?.label || "زواج";

    const showErr = (msg) => {
      if (!err) return;
      err.hidden = false;
      err.textContent = msg;
    };

    if (customerName.length < 2) return showErr("اكتب اسم العميل");
    if (!/^05\d{8}$/.test(phone)) return showErr("رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام");
    if (!city) return showErr("اختر المدينة");
    if (!eventItem) return showErr("اختر نوع المناسبة");
    if (!selectedPkg) return showErr("اختر باقة الضيافة");
    if (hallName.length < 2) return showErr("اكتب اسم القاعة أو المكان");
    if (!eventDate) return showErr("اختر تاريخ المناسبة من التقويم");
    if (!Number.isFinite(paidAmount) || paidAmount < 0) return showErr("المبلغ المدفوع غير صحيح");

    const { minIso, maxIso } = bookingWindowBounds();
    if (eventDate < minIso) return showErr("لا يمكن اختيار تاريخ سابق");
    if (eventDate > maxIso) return showErr("الحجز متاح لـ 12 شهراً قادمة فقط");

    const booked = await window.BakrStore.listBookedDates();
    if ((booked || []).includes(eventDate)) {
      return showErr("هذا التاريخ محجوز أو عليه طلب بانتظار القرار — اختر تاريخاً آخر");
    }

    const btn = $("#bkSaveBtn");
    if (btn) btn.disabled = true;
    try {
      const noteParts = ["حجز مسجّل من الإدارة (خارج الموقع)"];
      if (notes) noteParts.push(notes);

      await window.BakrStore.createOrder({
        status: "accepted",
        cityId: city.id,
        cityLabel: city.label,
        eventLabel,
        packageId: selectedPkg.id,
        packageName: selectedPkg.name,
        packagePrice,
        addons: selectedAddons.map((a) => ({
          id: a.id,
          name: a.name,
          price: a.price,
          qty: a.qty,
        })),
        addonsTotal,
        grandTotal: calculatedTotal,
        amountPaid: paidAmount,
        eventDate,
        customerName,
        customerPhone: phone,
        hallName,
        locationLink: locationLink || "https://maps.google.com/?q=Saudi+Arabia",
        notes: noteParts.join(" | "),
      });

      // حدّث التخزين المحلي للتواريخ أيضاً
      try {
        const key = "bakr-booked-dates";
        const all = JSON.parse(localStorage.getItem(key) || "[]");
        if (!all.includes(eventDate)) {
          all.push(eventDate);
          localStorage.setItem(key, JSON.stringify(all));
        }
      } catch (_) {}

      closeBookingModal();
      showToast("تم حفظ الحجز — التاريخ محجوز الآن");
      await loadData();
      showPage("orders");
    } catch (ex) {
      console.warn(ex);
      showErr("تعذر حفظ الحجز — حاول مرة ثانية");
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  const hash = location.hash || "";
  const orderMatch = hash.match(/^#order=(.+)$/);
  if (orderMatch?.[1]) state.pendingOpenId = decodeURIComponent(orderMatch[1]);
  else if (hash === "#orders") state.page = "orders";
  else if (hash === "#upcoming") state.page = "upcoming";
  else if (hash === "#visitors") state.page = "visitors";
  else if (hash === "#stats") state.page = "stats";
  else if (hash === "#reports") state.page = "reports";
  else if (hash === "#reviews") state.page = "reviews";

  if (await isAuthed()) {
    showApp();
    if (!state.pendingOpenId) showPage(state.page || "home");
  } else showLogin();
}

document.addEventListener("DOMContentLoaded", setup);
