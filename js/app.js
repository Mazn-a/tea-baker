/**
 * شاي بكر — تطبيق العملاء
 * البيانات (أسعار/بكجات) من js/catalog.js
 * التخزين من js/store.js
 */
const STORAGE_BOOKED = "bakr-booked-dates";
const STORAGE_DRAFT = "bakr-booking-draft";
/** أقصى مدى للحجز من اليوم: 12 شهراً فقط */
const BOOKING_MONTHS_AHEAD = 12;

const state = {
  stepIndex: 0,
  city: "",
  event: "",
  eventOther: "",
  packageId: "",
  addonQty: {},
  date: "",
  name: "",
  phone: "",
  hallName: "",
  locationArea: "",
  locationLink: "",
  notes: "",
  calendar: new Date(),
  calendarMode: "gregorian",
  dateSearch: "",
  bookedDates: new Set(),
  dateFeedback: "idle",
  discountCode: "",
  discountApplied: false,
};

const money = (n) => `${Number(n).toLocaleString("ar-SA")} ر.س`;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function labelOf(list, id) {
  return list.find((x) => x.id === id)?.label || "—";
}

function eventLabel() {
  if (state.event === "other") {
    const custom = state.eventOther.trim();
    return custom ? `أخرى: ${custom}` : "أخرى";
  }
  return labelOf(EVENTS, state.event);
}

function pkg() {
  return PACKAGES.find((p) => p.id === state.packageId);
}

/** السعر الظاهر للبكج (حركة تسويقية) */
function packageListPrice(p = pkg()) {
  if (!p) return 0;
  return Number(p.listPrice != null ? p.listPrice : p.price) || 0;
}

/** السعر الحقيقي للبكج بعد الخصم */
function packageSalePrice(p = pkg()) {
  if (!p) return 0;
  return Number(p.price) || 0;
}

function expectedDiscountCode() {
  return String(window.DISCOUNT_CODE || window.BAKR_CATALOG?.discountCode || "")
    .trim()
    .toLowerCase();
}

function tryApplyDiscount(raw) {
  const typed = String(raw || "").trim();
  const got = typed.toLowerCase();
  const expected = expectedDiscountCode();
  const canonical =
    String(window.DISCOUNT_CODE || window.BAKR_CATALOG?.discountCode || "Bakr10").trim() ||
    "Bakr10";
  const ok = Boolean(expected && got === expected);
  state.discountApplied = ok;
  // احفظ الشكل الرسمي عند النجاح، وإلا ما كتبه العميل
  state.discountCode = ok ? canonical : typed;
  return ok;
}

function selectedAddons() {
  const qtyMap = state.addonQty || {};
  return ADDONS.map((a) => ({
    ...a,
    qty: Math.max(0, Number(qtyMap[a.id] || 0)),
  })).filter((a) => a.qty > 0);
}

function addonsTotal() {
  return selectedAddons().reduce((sum, a) => sum + Number(a.price || 0) * a.qty, 0);
}

function addonsCount() {
  return selectedAddons().reduce((sum, a) => sum + a.qty, 0);
}

function packageTotal() {
  if (!pkg()) return 0;
  return state.discountApplied ? packageSalePrice() : packageListPrice();
}

function packageSavings() {
  if (!state.discountApplied || !pkg()) return 0;
  return Math.max(0, packageListPrice() - packageSalePrice());
}

function grandTotal() {
  return packageTotal() + addonsTotal();
}

function formatPkgPriceHtml(p, { startsFrom = false } = {}) {
  // اعرض سعر القائمة فقط — لا تكشف سعر الخصم على البكج
  const amount = `<span class="pkg-price-now">${money(packageListPrice(p))}</span>`;
  if (startsFrom) {
    return `<span class="pkg-price-from"><span class="pkg-price-from-label">يبدأ من</span> ${amount}</span>`;
  }
  return amount;
}

function orderListSubtotal() {
  return packageListPrice() + addonsTotal();
}

function getAddonQty(id) {
  return Math.max(0, Number((state.addonQty || {})[id] || 0));
}

function setAddonQty(id, qty) {
  const next = { ...(state.addonQty || {}) };
  const n = Math.max(0, Math.min(20, Math.floor(Number(qty) || 0)));
  if (n <= 0) delete next[id];
  else next[id] = n;
  state.addonQty = next;
}

function bumpAddonQty(id, delta) {
  setAddonQty(id, getAddonQty(id) + delta);
}

function currentStep() {
  return FLOW[state.stepIndex];
}

function isBooked(iso) {
  return state.bookedDates.has(String(iso || "").slice(0, 10));
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function maxBookingDate() {
  const d = startOfToday();
  d.setMonth(d.getMonth() + BOOKING_MONTHS_AHEAD);
  return d;
}

function maxBookingIso() {
  const d = maxBookingDate();
  return toISO(d.getFullYear(), d.getMonth(), d.getDate());
}

function isPastDate(iso) {
  const dateObj = new Date(`${iso}T12:00:00`);
  return Number.isNaN(dateObj.getTime()) || dateObj < startOfToday();
}

function isBeyondBookingWindow(iso) {
  const dateObj = new Date(`${iso}T12:00:00`);
  return Number.isNaN(dateObj.getTime()) || dateObj > maxBookingDate();
}

function isDateUnavailable(iso) {
  return isPastDate(iso) || isBeyondBookingWindow(iso) || isBooked(iso);
}

function loadLocalBooked() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_BOOKED) || "[]");
    raw.forEach((d) => {
      const iso = String(d || "").slice(0, 10);
      if (iso) state.bookedDates.add(iso);
    });
  } catch (_) {}
}

function persistBookedDate(iso) {
  const day = String(iso || "").slice(0, 10);
  if (!day) return;
  state.bookedDates.add(day);
  localStorage.setItem(STORAGE_BOOKED, JSON.stringify([...state.bookedDates]));
}

function syncBookedLocalStorage() {
  localStorage.setItem(STORAGE_BOOKED, JSON.stringify([...state.bookedDates]));
}

function saveDraft() {
  const draft = {
    stepIndex: Math.min(state.stepIndex, FLOW.indexOf("review")),
    city: state.city,
    event: state.event,
    eventOther: state.eventOther,
    packageId: state.packageId,
    addonQty: state.addonQty,
    date: state.date,
    calendarMode: state.calendarMode,
    dateSearch: state.dateSearch,
    name: state.name,
    phone: state.phone,
    hallName: state.hallName,
    locationArea: state.locationArea,
    locationLink: state.locationLink,
    notes: state.notes,
    discountCode: state.discountCode,
    discountApplied: state.discountApplied,
  };
  localStorage.setItem(STORAGE_DRAFT, JSON.stringify(draft));
}

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_DRAFT) || "null");
    if (!d) return;
    Object.assign(state, d);
    // توافق المسودات: مصفوفة قديمة → كميات
    if (!state.addonQty || typeof state.addonQty !== "object" || Array.isArray(state.addonQty)) {
      state.addonQty = {};
    }
    if (Array.isArray(d.addonIds)) {
      d.addonIds.forEach((id) => {
        state.addonQty[id] = (state.addonQty[id] || 0) + 1;
      });
    }
    // توافق مع المسودات القديمة
    if (!state.hallName && d.location) state.hallName = d.location;
    if (!state.locationArea && d.locationArea) state.locationArea = d.locationArea;
    state.phone = sanitizePhoneInput(state.phone || "");
    if (d.discountCode) tryApplyDiscount(d.discountCode);
    if (state.date) {
      if (isDateUnavailable(state.date)) {
        state.date = "";
        state.dateFeedback = "idle";
      } else {
        const dt = new Date(`${state.date}T12:00:00`);
        state.calendar = new Date(dt.getFullYear(), dt.getMonth(), 1);
      }
    }
  } catch (_) {}
}

async function loadBookedDates() {
  const fromJson = new Set();
  const fromStore = new Set();
  let storeOk = false;

  try {
    const res = await fetch("./data/booked-dates.json", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      (data.booked || []).forEach((d) => {
        const iso = String(d || "").slice(0, 10);
        if (iso) fromJson.add(iso);
      });
    }
  } catch (_) {}

  try {
    if (window.BakrStore?.listBookedDates) {
      const cloudDates = await window.BakrStore.listBookedDates();
      storeOk = true;
      (cloudDates || []).forEach((d) => {
        const iso = String(d || "").slice(0, 10);
        if (iso) fromStore.add(iso);
      });
    }
  } catch (_) {}

  if (storeOk) {
    // المصدر الرسمي: طلبات بانتظار/مقبولة (+ ملف ثابت إن وُجد)
    // حتى يتحرر التاريخ فور رفض الطلب
    state.bookedDates = new Set([...fromJson, ...fromStore]);
    syncBookedLocalStorage();
  } else {
    loadLocalBooked();
    fromJson.forEach((d) => state.bookedDates.add(d));
  }
}

function showView(name, opts = {}) {
  const { scroll = true } = opts;
  $$(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === name));
  const hash = (location.hash || "").replace("#", "");
  $$(".nav-links a[data-nav]").forEach((a) => {
    const href = a.getAttribute("href") || "";
    const nav = a.dataset.nav;
    let isActive = false;
    if (nav === "contact") isActive = hash === "contact";
    else if (name === "home") isActive = href === "#home" && hash !== "contact";
    else if (name === "about") isActive = nav === "about";
    else isActive = nav === name;
    a.classList.toggle("active", isActive);
  });
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  const header = $(".site-header");
  header.classList.toggle("is-booking", name === "booking");
}

function startBooking(preselectPackage) {
  if (preselectPackage) state.packageId = preselectPackage;
  state.stepIndex = state.packageId ? FLOW.indexOf("package") : 0;
  // If package preselected from marketing, still start from city for clarity
  state.stepIndex = 0;
  if (preselectPackage) state.packageId = preselectPackage;
  showView("booking");
  renderWizard();
}

function goHomeMarketing() {
  showView("home");
}

function setStep(index) {
  state.stepIndex = Math.max(0, Math.min(FLOW.length - 1, index));
  saveDraft();
  renderWizard();
}

function canProceed() {
  const step = currentStep();
  switch (step) {
    case "city":
      return Boolean(state.city);
    case "event":
      if (state.event === "other") return state.eventOther.trim().length >= 2;
      return Boolean(state.event);
    case "package":
      return Boolean(state.packageId);
    case "addons":
      return true;
    case "date":
      return Boolean(state.date) && !isDateUnavailable(state.date);
    case "name":
      return state.name.trim().length >= 2;
    case "phone":
      return /^05\d{8}$/.test(state.phone.replace(/\s+/g, ""));
    case "location":
      return state.hallName.trim().length >= 2;
    case "notes":
      return true;
    case "review":
      return true;
    default:
      return false;
  }
}

function normalizeLocationLink(value) {
  let link = String(value || "").trim();
  if (!link) return "";
  // امنع لصق أكثر من رابط أو سطور خبيثة
  if (/[\s<>"']/.test(link)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(link)) return "";
  if (link.startsWith("//")) link = `https:${link}`;
  else if (!/^https?:\/\//i.test(link)) link = `https://${link}`;
  return link;
}

function isValidLocationLink(value) {
  const raw = String(value || "").trim();
  if (raw.length < 12 || raw.length > 2048) return false;

  const link = normalizeLocationLink(raw);
  if (!link) return false;

  let url;
  try {
    url = new URL(link);
  } catch (_) {
    return false;
  }

  // https فقط + بدون بيانات دخول داخل الرابط
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = `${url.pathname}${url.search}`.toLowerCase();

  const allowedHosts = new Set([
    "google.com",
    "maps.google.com",
    "google.sa",
    "maps.google.sa",
    "goo.gl",
    "maps.app.goo.gl",
  ]);

  // اسمح أيضاً بنطاقات google.XX الشائعة للخرائط
  const isGoogleMapsHost =
    allowedHosts.has(host) ||
    /^maps\.google\.[a-z.]+$/.test(host) ||
    /^google\.[a-z.]+$/.test(host);

  if (!isGoogleMapsHost) return false;

  // تأكد أنه رابط خرائط وليس أي صفحة قوقل أخرى
  if (host === "goo.gl") return path.startsWith("/maps");
  if (host === "maps.app.goo.gl") return url.pathname.length > 1;
  if (host.startsWith("maps.google.")) return true;
  return path.includes("/maps") || path.includes("maps?") || /[?&](q|ll|query)=/i.test(url.search);
}

function sanitizeLocationLink(value) {
  if (!isValidLocationLink(value)) return "";
  return normalizeLocationLink(value);
}

function validateCurrent() {
  const step = currentStep();
  const err = $("#fieldError");
  if (err) err.textContent = "";

  if (step === "event" && state.event === "other" && state.eventOther.trim().length < 2) {
    if (err) err.textContent = "اكتب نوع المناسبة التي تريدها.";
    return false;
  }
  if (step === "name" && state.name.trim().length < 2) {
    if (err) err.textContent = "فضلاً اكتب الاسم الكامل.";
    return false;
  }
  if (step === "phone") {
    const phone = state.phone.replace(/\s+/g, "");
    if (!/^05\d{8}$/.test(phone)) {
      if (err) err.textContent = "أدخل رقم جوال صحيح يبدأ بـ 05 ويتكون من 10 أرقام.";
      return false;
    }
  }
  if (step === "location") {
    if (state.hallName.trim().length < 2) {
      if (err) err.textContent = "اكتب اسم القاعة.";
      return false;
    }
    if (state.locationLink.trim() && !isValidLocationLink(state.locationLink)) {
      if (err)
        err.textContent =
          "رابط الخريطة غير صالح. الصق رابط قوقل ماب أو اتركه فارغاً.";
      return false;
    }
    if (state.locationLink.trim()) {
      state.locationLink = sanitizeLocationLink(state.locationLink);
    }
  }
  if (step === "date" && (!state.date || isBooked(state.date))) {
    return false;
  }
  return canProceed();
}

async function nextStep() {
  if (currentStep() === "review") {
    await confirmBooking();
    return;
  }
  if (!validateCurrent()) return;
  setStep(state.stepIndex + 1);
}

function prevStep() {
  if (state.stepIndex === 0) {
    goHomeMarketing();
    return;
  }
  if (currentStep() === "success") {
    goHomeMarketing();
    return;
  }
  setStep(state.stepIndex - 1);
}

async function confirmBooking() {
  if (!state.date || isDateUnavailable(state.date)) {
    state.dateFeedback = state.date && isBeyondBookingWindow(state.date) ? "beyond" : "bad";
    setStep(FLOW.indexOf("date"));
    return;
  }
  // احجز التاريخ فوراً بمجرد إرسال الطلب (حتى وهو بانتظار القبول/الرفض)
  persistBookedDate(state.date);
  localStorage.removeItem(STORAGE_DRAFT);

  const p = pkg();
  const addons = selectedAddons().map((a) => ({
    id: a.id,
    name: a.name,
    price: a.price,
    qty: a.qty,
  }));

  try {
    if (window.BakrStore?.createOrder) {
      await window.BakrStore.createOrder({
        cityId: state.city,
        cityLabel: labelOf(CITIES, state.city),
        eventLabel: eventLabel(),
        packageId: state.packageId,
        packageName: p?.name || "",
        packagePrice: packageTotal(),
        packageListPrice: packageListPrice(),
        discountCode: state.discountApplied ? state.discountCode : "",
        discountApplied: state.discountApplied,
        addons,
        addonsTotal: addonsTotal(),
        grandTotal: grandTotal(),
        eventDate: state.date,
        customerName: state.name.trim(),
        customerPhone: state.phone.replace(/\s+/g, ""),
        hallName: state.hallName.trim(),
        locationArea: "",
        locationLink: state.locationLink.trim(),
        notes: [
          state.notes.trim(),
          state.discountApplied ? `كود خصم مطبّق: ${state.discountCode}` : "",
        ]
          .filter(Boolean)
          .join(" | "),
      });
    }
  } catch (err) {
    console.warn("تعذر حفظ الطلب في لوحة الإدارة:", err);
  }

  setStep(FLOW.indexOf("success"));
}

function buildWhatsAppMessage() {
  const p = pkg();
  const addons = selectedAddons();
  const addonLines =
    addons.length > 0
      ? [
          "• الإضافات:",
          ...addons.map((a) => `  - ${a.name} × ${a.qty} (${money(a.price * a.qty)})`),
          `• مجموع الإضافات: ${money(addonsTotal())}`,
        ]
      : ["• الإضافات: بدون"];
  return [
    "مرحباً، أرغب بتأكيد طلب حجز من شاي بكر:",
    `• المدينة: ${labelOf(CITIES, state.city)}`,
    `• نوع المناسبة: ${eventLabel()}`,
    `• البكج: ${p?.name || "—"}`,
    state.discountApplied ? `• كود الخصم: ${state.discountCode}` : null,
    ...addonLines,
    `• التاريخ: ${formatDateLabel(state.date)}`,
    `• اسم القاعة: ${state.hallName}`,
    state.locationLink.trim() ? `• رابط الخريطة: ${state.locationLink}` : null,
    `• الإجمالي: ${money(grandTotal())}`,
    `• الاسم: ${state.name}`,
    `• الجوال: ${state.phone}`,
    state.notes.trim() ? `• ملاحظات: ${state.notes.trim()}` : null,
    "",
    "أرجو إرسال رسالة تأكيد الحجز والتاريخ عبر واتساب.",
  ]
    .filter(Boolean)
    .join("\n");
}

function openWhatsApp() {
  const wa = window.WA_NUMBER || window.BAKR_CONFIG?.waNumber || "966533508361";
  const url = `https://wa.me/${wa}?text=${encodeURIComponent(buildWhatsAppMessage())}`;
  window.open(url, "_blank", "noopener");
}

function formatDateLabel(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  const g = d.toLocaleDateString("ar-SA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `${g} · ${formatHijriFull(d)}`;
}

function toISO(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function getHijriParts(date) {
  const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return { day: parts.day, month: parts.month, year: parts.year };
}

function formatHijriMonthLabel(date) {
  return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatHijriFull(date) {
  return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function buildHijriMonthDays(anchorDate) {
  const target = getHijriParts(anchorDate);
  const start = new Date(anchorDate);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - 45);
  const days = [];
  for (let i = 0; i < 90; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const h = getHijriParts(d);
    if (h.year === target.year && h.month === target.month) {
      days.push({
        day: h.day,
        iso: toISO(d.getFullYear(), d.getMonth(), d.getDate()),
        date: d,
      });
    }
  }
  days.sort((a, b) => a.day - b.day);
  return {
    year: target.year,
    month: target.month,
    days,
    label: formatHijriMonthLabel(days[0]?.date || anchorDate),
  };
}

function findGregorianForHijri(hy, hm, hd) {
  const estimateYear = Math.floor(((hy - 1) * 354.367) / 365.25 + 622);
  const start = new Date(estimateYear - 1, 0, 1);
  start.setHours(12, 0, 0, 0);
  for (let i = 0; i < 900; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const h = getHijriParts(d);
    if (h.year === hy && h.month === hm && h.day === hd) return d;
  }
  return null;
}

function parseDateSearch(raw, mode) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const m = text.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/);
  if (!m) return null;
  let a = Number(m[1]);
  let b = Number(m[2]);
  let c = Number(m[3]);

  if (mode === "hijri") {
    let hy, hm, hd;
    if (a > 1300) { hy = a; hm = b; hd = c; }
    else if (c > 1300) { hd = a; hm = b; hy = c; }
    else return null;
    if (hm < 1 || hm > 12 || hd < 1 || hd > 30) return null;
    return findGregorianForHijri(hy, hm, hd);
  }

  let year, month, day;
  if (a > 31) { year = a; month = b; day = c; }
  else if (c > 31) { day = a; month = b; year = c; }
  else return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

function applyPickedDate(iso) {
  const dateObj = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(dateObj.getTime()) || isDateUnavailable(iso)) {
    state.date = "";
    state.dateFeedback = isBeyondBookingWindow(iso) ? "beyond" : "bad";
    return false;
  }
  state.date = iso;
  state.dateFeedback = "ok";
  state.calendar = new Date(dateObj);
  return true;
}

function calendarMonthStart(dateObj = state.calendar) {
  return new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
}

function canGoPrevMonth() {
  const view = calendarMonthStart();
  const todayMonth = calendarMonthStart(startOfToday());
  return view > todayMonth;
}

function canGoNextMonth() {
  const view = calendarMonthStart();
  const maxMonth = calendarMonthStart(maxBookingDate());
  return view < maxMonth;
}

function shiftCalendarMonth(delta) {
  if (delta < 0 && !canGoPrevMonth()) return;
  if (delta > 0 && !canGoNextMonth()) return;
  if (state.calendarMode === "hijri") {
    state.calendar.setDate(state.calendar.getDate() + delta * 30);
  } else {
    state.calendar.setMonth(state.calendar.getMonth() + delta);
  }
  const view = calendarMonthStart();
  const minMonth = calendarMonthStart(startOfToday());
  const maxMonth = calendarMonthStart(maxBookingDate());
  if (view < minMonth) state.calendar = new Date(minMonth);
  if (view > maxMonth) state.calendar = new Date(maxMonth);
}

function renderChoices(list, selectedId, onPick, colsClass = "cols-3") {
  return `
    <div class="choice-grid ${colsClass}">
      ${list
        .map(
          (item) => `
        <button type="button" class="choice-card ${selectedId === item.id ? "is-selected" : ""}" data-id="${item.id}">
          <span class="label">${item.label}</span>
        </button>`
        )
        .join("")}
    </div>`;
}

function bindChoices(onPick) {
  $$(".choice-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      onPick(btn.dataset.id);
      renderWizard();
    });
  });
}

function renderCalendar() {
  const isHijri = state.calendarMode === "hijri";

  let label = "";
  let cells = "";

  if (isHijri) {
    const monthData = buildHijriMonthDays(state.calendar);
    label = monthData.label;
    const firstWeekday = monthData.days[0]?.date.getDay() ?? 0;
    for (let i = 0; i < firstWeekday; i++) {
      cells += `<button class="day-btn muted" type="button" disabled></button>`;
    }
    for (const item of monthData.days) {
      cells += renderDayCell(item.iso, item.day);
    }
  } else {
    const year = state.calendar.getFullYear();
    const month = state.calendar.getMonth();
    label = state.calendar.toLocaleDateString("ar-SA", { month: "long", year: "numeric" });
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) {
      cells += `<button class="day-btn muted" type="button" disabled></button>`;
    }
    for (let day = 1; day <= daysInMonth; day++) {
      cells += renderDayCell(toISO(year, month, day), day);
    }
  }

  const searchPlaceholder = isHijri
    ? "مثال: 12/2/1447 أو 1447-02-12"
    : "مثال: 6/8/2026 أو 2026-08-06";

  return `
    <div class="cal-wrap">
      <div class="cal-mode-toggle" role="group" aria-label="نوع التقويم">
        <button type="button" class="cal-mode ${!isHijri ? "is-on" : ""}" data-cal-mode="gregorian">ميلادي</button>
        <button type="button" class="cal-mode ${isHijri ? "is-on" : ""}" data-cal-mode="hijri">هجري</button>
      </div>

      <div class="cal-search">
        <label for="dateSearch">اكتب أو ابحث عن التاريخ</label>
        <div class="cal-search-row">
          <input id="dateSearch" type="text" inputmode="numeric" placeholder="${searchPlaceholder}" value="${
            state.dateSearch || ""
          }" />
          <button type="button" class="btn btn-primary" id="dateSearchBtn">بحث</button>
        </div>
        <p class="cal-search-hint">يمكنك الكتابة يدوياً أو الاختيار من التقويم بالأسفل.</p>
      </div>

      <div class="cal-nav">
        <button type="button" id="nextMonth" aria-label="الشهر التالي" ${
          canGoNextMonth() ? "" : "disabled"
        }>‹</button>
        <strong>${label}</strong>
        <button type="button" id="prevMonth" aria-label="الشهر السابق" ${
          canGoPrevMonth() ? "" : "disabled"
        }>›</button>
      </div>
      <p class="cal-window-hint">الحجز متاح حتى ${formatDateLabel(maxBookingIso())} (١٢ شهراً قادمة فقط).</p>
      <div class="cal-week">
        <span>أحد</span><span>إثن</span><span>ثلا</span><span>أرب</span>
        <span>خمي</span><span>جمع</span><span>سبت</span>
      </div>
      <div class="cal-days">${cells}</div>
      <div class="date-status ${state.dateFeedback === "beyond" ? "bad" : state.dateFeedback}" id="dateStatus">${dateStatusText()}</div>
    </div>`;
}

/** اختصارات أيام الأسبوع من ar-SA (Intl) — ليست اختصارات يدوية */
function weekdayHeadersAr() {
  const fmt = new Intl.DateTimeFormat("ar-SA", { weekday: "short" });
  // أحد معروف: 2 أغسطس 2026
  const sunday = new Date(2026, 7, 2, 12, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return String(fmt.format(d) || "")
      .replace(/^ال/, "")
      .trim();
  });
}

function renderDayCell(iso, dayLabel) {
  const past = isPastDate(iso);
  const beyond = isBeyondBookingWindow(iso);
  const booked = isBooked(iso);
  const selected = state.date === iso;
  const locked = past || beyond || booked;
  let cls = "day-btn";
  if (past || beyond) cls += " muted";
  else if (booked) cls += " booked";
  else cls += " available";
  if (selected) cls += " selected";
  const mark = booked ? "<small>محجوز</small>" : "";
  const title = beyond ? ' title="خارج مدى الـ ١٢ شهراً"' : booked ? ' title="محجوز"' : "";
  return `<button class="${cls}" type="button" data-date="${iso}"${title} ${
    locked ? "disabled" : ""
  }>${dayLabel}${mark}</button>`;
}

function dateStatusText() {
  if (state.dateFeedback === "ok") {
    return state.date ? `التاريخ متاح: ${formatDateLabel(state.date)}` : "هذا التاريخ متاح.";
  }
  if (state.dateFeedback === "beyond") {
    return "لا يمكن الحجز لأكثر من ١٢ شهراً قادمة. اختر تاريخاً أقرب.";
  }
  if (state.dateFeedback === "bad") return "هذا اليوم غير متاح (محجوز أو بانتظار قرار)، اختر تاريخاً آخر.";
  return "اختر يوماً من التقويم أو ابحث بالأعلى.";
}

function renderPackagesStep() {
  return `
    <div class="pkg-stack pkg-wizard">
      ${PACKAGES.map((p) => {
        const selected = state.packageId === p.id;
        return `
        <button type="button" class="pkg-card pkg-pick ${selected ? "is-selected" : ""}" data-pick-pkg="${p.id}">
          <img src="${p.image}" alt="" />
          <div class="body">
            <h3>${p.name}</h3>
            <div class="pkg-meta-row">
              <span class="pkg-price">${formatPkgPriceHtml(p)}</span>
              <span class="pkg-guests">${p.guests}</span>
            </div>
            <ul class="pkg-features">
              ${p.features.map((f) => `<li>${f}</li>`).join("")}
            </ul>
            <span class="pkg-pick-label">${selected ? "تم الاختيار ✓" : "اضغط للاختيار"}</span>
          </div>
        </button>`;
      }).join("")}
    </div>`;
}

function renderAddonsStep() {
  const total = addonsTotal();
  const count = addonsCount();
  return `
    <div class="addons-pick-wrap">
      <div class="addons-pick-grid">
        ${ADDONS.map((a) => {
          const qty = getAddonQty(a.id);
          const on = qty > 0;
          return `
          <div class="addon-pick ${on ? "is-selected" : ""}" data-addon-card="${a.id}">
            <div class="addon-pick-main" data-addon-inc="${a.id}" role="button" tabindex="0">
              <span class="addon-pick-name">${a.name}</span>
              <span class="addon-pick-unit">${money(a.price)} للواحدة</span>
            </div>
            <div class="addon-qty">
              <button type="button" class="addon-qty-btn" data-addon-dec="${a.id}" aria-label="إنقاص">−</button>
              <span class="addon-qty-value">${qty}</span>
              <button type="button" class="addon-qty-btn" data-addon-inc="${a.id}" aria-label="زيادة">+</button>
            </div>
            <div class="addon-pick-price">${on ? money(a.price * qty) : money(a.price)}</div>
          </div>`;
        }).join("")}
      </div>
      <div class="addons-total-bar" id="addonsTotalBar">
        <div>
          <strong>مجموع الإضافات فقط</strong>
          <span class="addons-total-count">${count ? `${count} قطعة` : "بدون إضافات"}</span>
        </div>
        <div class="addons-total-price">${money(total)}</div>
      </div>
      <p class="field-hint">اضغط على المنتج أو زر + لزيادة الكمية، و− للتقليل.</p>
    </div>`;
}

function renderField(id, label, type, value, placeholder, extra = "", attrs = "") {
  return `
    <div class="field-card">
      <label for="${id}">${label}</label>
      ${
        type === "textarea"
          ? `<textarea id="${id}" placeholder="${placeholder}" ${attrs}>${value || ""}</textarea>`
          : `<input id="${id}" type="${type}" inputmode="${extra}" placeholder="${placeholder}" value="${
              value || ""
            }" ${attrs} />`
      }
      <div class="field-error" id="fieldError"></div>
    </div>`;
}

/** رقم سعودي: أرقام فقط وبحد أقصى 10 */
function sanitizePhoneInput(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("966")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("00966")) digits = `0${digits.slice(5)}`;
  return digits.slice(0, 10);
}

function renderReview() {
  const p = pkg();
  const addons = selectedAddons();
  const listPkg = packageListPrice();
  const savings = packageSavings();
  const listSubtotal = orderListSubtotal();
  const chargedTotal = grandTotal();
  const addonsHtml = addons.length
    ? `<ul class="review-addons-list">${addons
        .map((a) => `<li>${a.name} <span class="review-addon-qty">× ${a.qty}</span></li>`)
        .join("")}</ul>`
    : "بدون";

  const rows = [
    ["المدينة", labelOf(CITIES, state.city)],
    ["نوع المناسبة", eventLabel()],
    ["البكج", p ? p.name : "—"],
    ["الإضافات", addonsHtml, addons.length ? "addons" : ""],
    ["تاريخ المناسبة", formatDateLabel(state.date)],
    ["اسم القاعة", state.hallName || "—"],
    ["رابط الخريطة", state.locationLink || "—"],
    ["الاسم", state.name || "—"],
    ["الجوال", state.phone || "—"],
  ];
  if (state.notes.trim()) rows.push(["ملاحظات", state.notes.trim()]);

  const discountMsg = state.discountApplied
    ? `<p class="discount-feedback is-ok">تم تطبيق كود الخصم</p>`
    : state.discountCode
      ? `<p class="discount-feedback is-err">كود الخصم غير صحيح</p>`
      : "";

  // واجهة الخصم تبدو على الإجمالي؛ الحساب الفعلي يبقى على البكج فقط
  const totalsHtml =
    state.discountApplied && savings > 0
      ? `
      <div class="review-row">
        <span>سعر البكج</span>
        <strong>${money(listPkg)}</strong>
      </div>
      <div class="review-row">
        <span>مجموع الإضافات</span>
        <strong>${money(addonsTotal())}</strong>
      </div>
      <div class="review-row discount-save">
        <span>الخصم</span>
        <strong>− ${money(savings)}</strong>
      </div>
      <div class="review-row price">
        <span>الإجمالي</span>
        <strong class="pkg-price-stack">
          <span class="pkg-price-old">${money(listSubtotal)}</span>
          <span class="pkg-price-now">${money(chargedTotal)}</span>
        </strong>
      </div>`
      : `
      <div class="review-row">
        <span>سعر البكج</span>
        <strong>${money(listPkg)}</strong>
      </div>
      <div class="review-row">
        <span>مجموع الإضافات</span>
        <strong>${money(addonsTotal())}</strong>
      </div>
      <div class="review-row price">
        <span>الإجمالي</span>
        <strong>${money(chargedTotal)}</strong>
      </div>`;

  return `
    <div class="review-card">
      <div class="review-banner">ملخص طلبك الكامل</div>
      ${rows
        .map(([k, v, kind]) =>
          kind === "addons"
            ? `<div class="review-row review-row-addons">
          <span class="review-addons-label">${k}</span>
          <div class="review-addons">${v}</div>
        </div>`
            : `<div class="review-row">
          <span>${k}</span>
          <strong>${v}</strong>
        </div>`
        )
        .join("")}

      <div class="discount-box">
        <label for="inputDiscount">كود الخصم</label>
        <div class="discount-row">
          <input
            id="inputDiscount"
            type="text"
            inputmode="text"
            autocomplete="off"
            placeholder="أدخل كود الخصم"
            value="${String(state.discountCode || "").replace(/"/g, "&quot;")}"
          />
          <button type="button" class="btn btn-primary" id="btnApplyDiscount">تطبيق</button>
        </div>
        ${discountMsg}
      </div>

      ${totalsHtml}
    </div>
    <div class="procedure-box">
      <h3>ماذا بعد تأكيد الطلب؟</h3>
      <ol>
        <li>اضغط <strong>تأكيد الطلب</strong> بالأسفل لإرسال الطلب عبر الموقع.</li>
        <li>انتظر رسالة واتساب على رقمك لمعرفة قبول الطلب أو رفضه.</li>
      </ol>
    </div>`;
}

function renderSuccess() {
  const p = pkg();
  return `
    <div class="success-wrap">
      <div class="success-card">
        <div class="success-mark">✓</div>
        <h2>تم استلام طلبكم</h2>
        <p class="success-lead">
          وصل طلبك إلى إدارة شاي بكر.
          انتظر رسالة واتساب على رقمك
          <strong>${String(state.phone || "").replace(/</g, "")}</strong>
          لمعرفة قبول الطلب أو رفضه.
        </p>
        <div class="review-card success-summary">
          <div class="review-row"><span>البكج</span><strong>${p?.name || "—"}</strong></div>
          <div class="review-row"><span>التاريخ</span><strong>${formatDateLabel(state.date)}</strong></div>
          <div class="review-row"><span>مجموع الإضافات</span><strong>${money(addonsTotal())}</strong></div>
          <div class="review-row price"><span>الإجمالي</span><strong>${money(grandTotal())}</strong></div>
        </div>
        <button type="button" class="btn btn-ghost" id="backHome" style="width:100%">العودة للعروض</button>
      </div>
    </div>`;
}

function progressInfo() {
  // Exclude success from progress denominator for friendlier UX
  const countable = FLOW.filter((s) => s !== "success");
  const step = currentStep();
  if (step === "success") return { current: countable.length, total: countable.length, pct: 100 };
  const current = state.stepIndex + 1;
  const total = countable.length;
  return { current, total, pct: Math.round((current / total) * 100) };
}

function renderWizard() {
  const step = currentStep();
  const progress = progressInfo();
  const body = $("#wizardBody");
  const title = $("#stepTitle");
  const sub = $("#stepSub");
  const backBtn = $("#btnBack");
  const nextBtn = $("#btnNext");
  const actions = $("#wizardActions");
  const progressFill = $("#progressFill");
  const progressText = $("#progressText");

  progressFill.style.width = `${progress.pct}%`;
  progressText.textContent = step === "success" ? "اكتمل" : `خطوة ${progress.current} من ${progress.total}`;

  backBtn.style.display = step === "success" ? "none" : "";
  actions.classList.toggle("single", step === "success");

  let nextLabel = "التالي";
  if (step === "review") nextLabel = "تأكيد الطلب";
  if (step === "success") nextLabel = "";
  nextBtn.textContent = nextLabel;
  nextBtn.style.display = step === "success" ? "none" : "";
  nextBtn.disabled = step === "notes" || step === "review" || step === "addons" ? false : !canProceed();

  const titles = {
    city: "اختر مدينة المناسبة",
    event: "اختر نوع المناسبة",
    package: "اختر البكج",
    addons: "اختر الإضافات",
    date: "اختر تاريخ المناسبة",
    name: "ما اسمك الكامل؟",
    phone: "ما رقم جوالك؟",
    location: "اسم القاعة وموقعها",
    notes: "هل لديك ملاحظات؟",
    review: "طلبك الكامل — راجع قبل التأكيد",
    success: "",
  };
  const subs = {
    city: "نخدم مكة المكرمة وجدة والطائف فقط.",
    event: "اختر نوع المناسبة من البطاقات. إذا اخترت «أخرى» فاكتب نوعها.",
    package: "اختر البكج المناسب لطلبك.",
    addons: "اختر ما تريد من الإضافات — المجموع هنا للإضافات فقط.",
    date: "ميلادي أو هجري، واكتب التاريخ أو اختره من التقويم.",
    name: "خطوة واحدة فقط الآن.",
    phone: "للتواصل وإرسال رسالة القبول أو الرفض على واتساب.",
    location: "اكتب اسم القاعة — رابط الخريطة اختياري.",
    notes: "اختياري — يمكنك تركها فارغة والضغط على التالي.",
    review: "راجع كل التفاصيل والسعر، ثم أكّد الطلب من الموقع.",
    success: "",
  };

  title.textContent = titles[step] || "";
  sub.textContent = subs[step] || "";
  title.style.display = step === "success" ? "none" : "";
  sub.style.display = step === "success" ? "none" : "";

  // على الجوال: ارجع أعلى منطقة التمرير عند تغيير الخطوة
  const wizardBodyEl = document.querySelector(".view[data-view='booking'] .wizard-body");
  if (wizardBodyEl) wizardBodyEl.scrollTop = 0;

  if (step === "city") {
    body.innerHTML = renderChoices(CITIES, state.city, null, "cols-3");
    bindChoices((id) => {
      state.city = id;
      nextBtn.disabled = false;
    });
  } else if (step === "event") {
    const otherField =
      state.event === "other"
        ? `
      <div class="field-card other-event-field">
        <label for="inputEventOther">اكتب نوع المناسبة</label>
        <input id="inputEventOther" type="text" placeholder="مثال: تخرج، عقيقة، افتتاح..." value="${
          state.eventOther || ""
        }" />
        <div class="field-error" id="fieldError"></div>
      </div>`
        : "";
    body.innerHTML = `${renderChoices(EVENTS, state.event, null, "cols-2")}${otherField}`;
    bindChoices((id) => {
      state.event = id;
      if (id !== "other") state.eventOther = "";
    });
    const otherInput = $("#inputEventOther");
    if (otherInput) {
      otherInput.focus();
      otherInput.addEventListener("input", (e) => {
        state.eventOther = e.target.value;
        nextBtn.disabled = !canProceed();
      });
    }
    nextBtn.disabled = !canProceed();
  } else if (step === "package") {
    body.innerHTML = renderPackagesStep();
    nextBtn.disabled = !state.packageId;
    $$("[data-pick-pkg]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.packageId = btn.dataset.pickPkg;
        nextBtn.disabled = false;
        renderWizard();
      });
    });
  } else if (step === "addons") {
    body.innerHTML = renderAddonsStep();
    nextBtn.disabled = false;
    const refresh = () => renderWizard();
    $$("[data-addon-inc]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        bumpAddonQty(el.dataset.addonInc, 1);
        refresh();
      });
    });
    $$("[data-addon-dec]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        bumpAddonQty(el.dataset.addonDec, -1);
        refresh();
      });
    });
  } else if (step === "date") {
    body.innerHTML = renderCalendar();
    nextBtn.disabled = !state.date;

    $$("[data-cal-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.calendarMode = btn.dataset.calMode;
        state.dateSearch = "";
        renderWizard();
      });
    });

    const runSearch = () => {
      const input = $("#dateSearch");
      state.dateSearch = input?.value || "";
      const found = parseDateSearch(state.dateSearch, state.calendarMode);
      if (!found) {
        state.date = "";
        state.dateFeedback = "bad";
        const status = $("#dateStatus");
        if (status) {
          status.className = "date-status bad";
          status.textContent = "لم يتم التعرف على التاريخ، تأكد من الصيغة.";
        }
        nextBtn.disabled = true;
        return;
      }
      const iso = toISO(found.getFullYear(), found.getMonth(), found.getDate());
      applyPickedDate(iso);
      renderWizard();
    };

    $("#dateSearch")?.addEventListener("input", (e) => {
      state.dateSearch = e.target.value;
    });
    $("#dateSearch")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        runSearch();
      }
    });
    $("#dateSearchBtn")?.addEventListener("click", runSearch);

    $("#prevMonth")?.addEventListener("click", () => {
      shiftCalendarMonth(-1);
      renderWizard();
    });
    $("#nextMonth")?.addEventListener("click", () => {
      shiftCalendarMonth(1);
      renderWizard();
    });
    $$("[data-date]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        applyPickedDate(btn.dataset.date);
        nextBtn.disabled = !state.date;
        renderWizard();
      });
    });
  } else if (step === "name") {
    body.innerHTML = renderField("inputName", "الاسم الكامل", "text", state.name, "مثال: أحمد محمد");
    $("#inputName").addEventListener("input", (e) => {
      state.name = e.target.value;
      nextBtn.disabled = !canProceed();
    });
  } else if (step === "phone") {
    body.innerHTML = renderField(
      "inputPhone",
      "رقم الجوال",
      "tel",
      sanitizePhoneInput(state.phone),
      "05xxxxxxxx",
      "numeric",
      'maxlength="10" autocomplete="tel" pattern="05[0-9]{8}"'
    );
    const phoneInput = $("#inputPhone");
    phoneInput.addEventListener("input", (e) => {
      const cleaned = sanitizePhoneInput(e.target.value);
      e.target.value = cleaned;
      state.phone = cleaned;
      nextBtn.disabled = !canProceed();
    });
    phoneInput.addEventListener("blur", (e) => {
      const cleaned = sanitizePhoneInput(e.target.value);
      e.target.value = cleaned;
      state.phone = cleaned;
      nextBtn.disabled = !canProceed();
    });
  } else if (step === "location") {
    const esc = (s) =>
      String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
    body.innerHTML = `
      <div class="fields-stack">
        <div class="field-card">
          <label for="inputHallName">اسم القاعة</label>
          <input id="inputHallName" type="text" placeholder="مثال: قاعة الأفراح" value="${esc(
            state.hallName
          )}" />
        </div>
        <div class="field-card">
          <label for="inputLocationLink">رابط خرائط قوقل <span class="field-optional">(اختياري)</span></label>
          <input
            id="inputLocationLink"
            type="url"
            inputmode="url"
            dir="ltr"
            placeholder="الصق رابط خرائط قوقل"
            value="${esc(state.locationLink)}"
          />
          <div class="field-error" id="fieldError"></div>
        </div>
      </div>`;
    const sync = () => {
      state.hallName = $("#inputHallName").value;
      state.locationLink = $("#inputLocationLink").value.trim();
      nextBtn.disabled = !canProceed();
      const err = $("#fieldError");
      if (!err) return;
      const link = state.locationLink;
      if (!link) {
        err.textContent = "";
        return;
      }
      err.textContent = isValidLocationLink(link)
        ? ""
        : "هذا ليس رابط خرائط قوقل صالحاً — عدّله أو امسحه.";
    };
    $("#inputHallName").addEventListener("input", sync);
    $("#inputLocationLink").addEventListener("input", sync);
  } else if (step === "notes") {
    body.innerHTML = renderField(
      "inputNotes",
      "ملاحظات إضافية (اختياري)",
      "textarea",
      state.notes,
      "اكتب أي تفاصيل تساعدنا في خدمتك"
    );
    $("#inputNotes").addEventListener("input", (e) => {
      state.notes = e.target.value;
    });
    nextBtn.disabled = false;
  } else if (step === "review") {
    body.innerHTML = renderReview();
    nextBtn.disabled = false;
    const apply = () => {
      tryApplyDiscount($("#inputDiscount")?.value || "");
      renderWizard();
    };
    $("#btnApplyDiscount")?.addEventListener("click", apply);
    $("#inputDiscount")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        apply();
      }
    });
  } else if (step === "success") {
    body.innerHTML = renderSuccess();
    $("#backHome").addEventListener("click", () => {
      resetBookingSoft();
      goHomeMarketing();
    });
  }

  saveDraft();
}

function resetBookingSoft() {
  state.stepIndex = 0;
  state.city = "";
  state.event = "";
  state.eventOther = "";
  state.packageId = "";
  state.addonQty = {};
  state.date = "";
  state.name = "";
  state.phone = "";
  state.hallName = "";
  state.locationArea = "";
  state.locationLink = "";
  state.notes = "";
  state.dateFeedback = "idle";
  state.dateSearch = "";
  state.calendarMode = "gregorian";
  state.discountCode = "";
  state.discountApplied = false;
}

function renderMarketingPackages() {
  const box = $("#marketPackages");
  if (!box) return;
  box.innerHTML = PACKAGES.map(
    (p) => `
    <article class="pkg-card market-pkg receipt-pkg ${p.featured ? "is-featured" : ""}">
      <div class="pkg-thumb-wrap">
        <img class="pkg-thumb" src="${p.image}" alt="" />
      </div>
      <div class="body">
        <div class="pkg-head">
          <span class="pkg-badge">${p.badge || "بكج ضيافة"}</span>
          <div class="pkg-title-row">
            <h3>${p.name}</h3>
            <span class="pkg-guests">${p.guests}</span>
          </div>
          <div class="pkg-price">${formatPkgPriceHtml(p, { startsFrom: true })}</div>
        </div>
        <ul class="pkg-features pkg-features-desk">
          ${p.features.map((f) => `<li>${f}</li>`).join("")}
        </ul>
        <details class="pkg-details pkg-details-mob">
          <summary>عرض التفاصيل</summary>
          <ul class="pkg-features">
            ${p.features.map((f) => `<li>${f}</li>`).join("")}
          </ul>
        </details>
        <button type="button" class="btn btn-primary" data-book-pkg="${p.id}">
          اطلب هذا البكج
        </button>
      </div>
    </article>`
  ).join("");
  $$("[data-book-pkg]").forEach((btn) => {
    btn.addEventListener("click", () => startBooking(btn.dataset.bookPkg));
  });
}

function renderMarketingAddons() {
  const box = $("#marketAddons");
  if (!box) return;

  const PAGE = 4;
  let shown = Math.min(PAGE, ADDONS.length);

  const paint = () => {
    const items = ADDONS.slice(0, shown)
      .map(
        (a) => `
    <article class="addon-card panel-card">
      <h3>${a.name}</h3>
      <div class="addon-price">${money(a.price)}</div>
    </article>`
      )
      .join("");

    const more =
      shown < ADDONS.length
        ? `<button type="button" class="btn-more-addons" id="btnMoreAddons">المزيد</button>`
        : "";

    box.innerHTML = `${items}${more}`;

    $("#btnMoreAddons")?.addEventListener("click", () => {
      shown = Math.min(shown + PAGE, ADDONS.length);
      paint();
      $("#btnMoreAddons")?.focus();
    });
  };

  paint();
}

function setupNav() {
  const toggle = $("#menuToggle");
  const links = $("#navLinks");
  toggle?.addEventListener("click", () => links.classList.toggle("open"));

  // إغلاق القائمة عند الضغط خارجها
  document.addEventListener("click", (e) => {
    if (!links?.classList.contains("open")) return;
    if (toggle?.contains(e.target) || links.contains(e.target)) return;
    links.classList.remove("open");
  });

  // عند فتح لوحة المفاتيح: مرّر الحقل ليظهر فوق أزرار التالي/رجوع
  document.addEventListener("focusin", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches("input, textarea, select")) return;
    const scroller = target.closest(".wizard-body");
    if (!scroller) return;
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  });

  // الشعار: تحديث الصفحة والرجوع للرئيسية داخل الموقع
  $("#brandHome")?.addEventListener("click", (e) => {
    e.preventDefault();
    links?.classList.remove("open");
    if (location.hash === "#home") {
      location.reload();
      return;
    }
    location.hash = "home";
    location.reload();
  });

  $$("[data-nav]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      links?.classList.remove("open");
      const view = el.dataset.nav;
      const href = el.getAttribute("href") || "";
      if (view === "booking") {
        startBooking();
        return;
      }
      if (view === "about") {
        location.hash = "about";
        showView("about");
        return;
      }
      if (view === "contact") {
        location.hash = "contact";
        showView("home", { scroll: false });
        requestAnimationFrame(() => {
          document.getElementById("contact")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        return;
      }
      if (href.startsWith("#") && href !== "#home") {
        location.hash = href.slice(1);
        showView("home", { scroll: false });
        requestAnimationFrame(() => {
          document.querySelector(href)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        return;
      }
      location.hash = "home";
      showView("home");
    });
  });

  $("#navOrderBtn")?.addEventListener("click", () => startBooking());
  $("#navOrderBtnMobile")?.addEventListener("click", () => startBooking());
  $("#heroOrderBtn")?.addEventListener("click", () => startBooking());
  $("#heroPackagesBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    location.hash = "packages";
    showView("home", { scroll: false });
    requestAnimationFrame(() => {
      document.getElementById("packages")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  $("#btnBack").addEventListener("click", prevStep);
  $("#btnNext").addEventListener("click", nextStep);
}

async function init() {
  loadDraft();
  await loadBookedDates();
  if (state.date && isDateUnavailable(state.date)) {
    state.date = "";
    state.dateFeedback = "idle";
  }
  renderMarketingPackages();
  renderMarketingAddons();
  setupNav();

  try {
    await window.BakrStore?.trackVisit?.(location.pathname + location.hash);
  } catch (err) {
    console.warn("تعذر تسجيل الزيارة:", err);
  }

  const hash = (location.hash || "").replace("#", "");
  if (hash === "book") {
    startBooking();
  } else if (hash === "about") {
    showView("about");
  } else if (["packages", "addons", "contact", "faq"].includes(hash)) {
    showView("home", { scroll: false });
    requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  } else {
    showView("home");
  }
}

document.addEventListener("DOMContentLoaded", init);
