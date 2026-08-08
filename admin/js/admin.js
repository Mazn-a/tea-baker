const AUTH_KEY = "bakr-admin-auth";

const state = {
  range: "month", // month | year
  cursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  status: "all",
  orders: [],
  visits: [],
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

function expectedPin() {
  return normalizeDigits(cfg().adminPin || "1234") || "1234";
}

function money(n) {
  return `${Number(n || 0).toLocaleString("ar-SA")} ر.س`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ar-SA", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ar-SA", {
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
    return c.toLocaleDateString("ar-SA", { year: "numeric" });
  }
  return c.toLocaleDateString("ar-SA", { month: "long", year: "numeric" });
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
    `الإجمالي: ${money(order.grand_total)}`,
    isAccepted
      ? "للتأكيد النهائي ردّ بكلمة «أؤكد»."
      : isRejected
        ? "يمكنك تقديم طلب جديد بتاريخ آخر."
        : "سنوافيك بالنتيجة قريباً.",
  ].join("\n");
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
      <img src="../assets/logo-brand.png?v=11" alt="" class="share-logo" />
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

function isAuthed() {
  return sessionStorage.getItem(AUTH_KEY) === "1";
}

function setAuthed(on) {
  if (on) sessionStorage.setItem(AUTH_KEY, "1");
  else sessionStorage.removeItem(AUTH_KEY);
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

function tryLogin() {
  const pin = normalizeDigits($("#adminPin")?.value);
  const expected = expectedPin();
  const errEl = $("#loginError");
  if (!pin || pin !== expected) {
    if (errEl) {
      errEl.hidden = false;
      errEl.classList.remove("is-hidden");
      errEl.textContent = "رمز غير صحيح";
    }
    return false;
  }
  if (errEl) {
    errEl.hidden = true;
    errEl.classList.add("is-hidden");
  }
  setAuthed(true);
  showApp();
  return true;
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

function makeBar(canvasId, key, rows, emptyText) {
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
          label: "الطلبات",
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
  const visits = state.visits.filter((v) => inPeriod(v.created_at));
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
      <em>من الطلبات المقبولة · ${when}</em>
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
      <em>متوسط الطلب المقبول: ${money(avg)}</em>
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
  if (state.page === "orders") {
    renderOrders();
  }

  const hash =
    state.page === "home" ? "" : state.page === "orders" ? "#orders" : "#stats";
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
      const isExternal = o.package_id === "external";
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
            <span>${formatDate(o.event_date)}</span>
          </div>
          <div class="order-row-sub">
            <span class="order-phone">${escapeHtml(o.customer_phone)}</span>
            <span>${formatDateTime(o.created_at)}</span>
          </div>
        </div>
        <div class="order-row-side">
          <strong class="order-row-total">${money(o.grand_total)}</strong>
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
        <div class="item total span-2"><span class="lbl">الإجمالي</span><span class="val">${money(o.grand_total)}</span></div>
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
  const [orders, visits] = await Promise.all([
    window.BakrStore.listOrders(),
    window.BakrStore.listVisits(),
  ]);
  state.orders = (orders || []).filter((o) => o.status !== "deleted");
  state.visits = visits || [];
  renderStats();
  renderOrders();
  updateOrdersChoiceHint();
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
    `حذف طلب «${name}» بتاريخ ${dateLabel}؟\n\nسيختفي من القائمة ويتحرر التاريخ إن لم يكن عليه طلب آخر.`
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
  showPage("orders");

  try {
    await window.BakrStore.deleteOrder(orderId);
    if (!isDateStillBooked(eventDate, orderId)) {
      releaseLocalBookedDate(eventDate);
    }
    await loadData();
    showToast("تم حذف الطلب — التاريخ صار متاحاً");
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

function setup() {
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
    const input = $("#adminPin");
    const btn = $("#togglePinVisibility");
    if (!input || !btn) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-pressed", show ? "true" : "false");
    btn.setAttribute("aria-label", show ? "إخفاء رمز الدخول" : "إظهار رمز الدخول");
    const openIcon = btn.querySelector(".eye-open");
    const closedIcon = btn.querySelector(".eye-closed");
    if (openIcon) openIcon.hidden = show;
    if (closedIcon) closedIcon.hidden = !show;
    input.focus();
  });

  $("#adminPin")?.addEventListener("input", (e) => {
    const el = e.target;
    const start = el.selectionStart;
    const before = el.value;
    const next = normalizeDigits(before).replace(/\D/g, "").slice(0, 8);
    if (next !== before) {
      el.value = next;
      const pos = Math.min(start ?? next.length, next.length);
      try {
        el.setSelectionRange(pos, pos);
      } catch (_) {
        /* ignore */
      }
    }
  });

  $("#adminPin")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      tryLogin();
    }
  });

  $("#logoutBtn")?.addEventListener("click", () => {
    setAuthed(false);
    showLogin();
  });

  $("#refreshBtn")?.addEventListener("click", () => {
    refreshConnectionStatus();
    loadData().catch((err) => console.warn(err));
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

  $("#deleteOrderBtn")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const id = state.selectedOrderId;
    const order = state.orders.find((o) => String(o.id) === String(id));
    if (!order) return;
    await deleteOrderById(order, e.currentTarget);
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

  function openBookingModal() {
    const modal = $("#bookingModal");
    const err = $("#bkError");
    if (err) {
      err.hidden = true;
      err.textContent = "";
    }
    $("#bookingForm")?.reset();
    const dateInput = $("#bkDate");
    if (dateInput) {
      const { minIso, maxIso } = bookingWindowBounds();
      dateInput.min = minIso;
      dateInput.max = maxIso;
    }
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
    const eventDate = $("#bkDate")?.value;
    const notes = String($("#bkNotes")?.value || "").trim();
    const city = (window.BAKR_CATALOG?.cities || []).find((c) => c.id === cityId);

    const showErr = (msg) => {
      if (!err) return;
      err.hidden = false;
      err.textContent = msg;
    };

    if (customerName.length < 2) return showErr("اكتب اسم العميل");
    if (!/^05\d{8}$/.test(phone)) return showErr("رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام");
    if (!city) return showErr("اختر المدينة");
    if (!eventDate) return showErr("اختر تاريخ المناسبة");

    const { minIso, maxIso } = bookingWindowBounds();
    if (eventDate < minIso) return showErr("لا يمكن اختيار تاريخ سابق");
    if (eventDate > maxIso) return showErr("الحجز متاح لـ ١٢ شهراً قادمة فقط");

    const booked = await window.BakrStore.listBookedDates();
    if ((booked || []).includes(eventDate)) {
      return showErr("هذا التاريخ محجوز أو عليه طلب بانتظار القرار — اختر تاريخاً آخر");
    }

    const btn = $("#bkSaveBtn");
    if (btn) btn.disabled = true;
    try {
      await window.BakrStore.createOrder({
        status: "accepted",
        cityId: city.id,
        cityLabel: city.label,
        eventLabel: "حجز خارجي",
        packageId: "external",
        packageName: "حجز من خارج الموقع",
        packagePrice: 0,
        addons: [],
        addonsTotal: 0,
        grandTotal: 0,
        eventDate,
        customerName,
        customerPhone: phone,
        hallName: "خارج الموقع",
        locationLink: "https://maps.google.com/?q=Saudi+Arabia",
        notes: notes
          ? `حجز خارجي — ${notes}`
          : "حجز مسجّل من الإدارة (خارج الموقع)",
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
  else if (hash === "#stats") state.page = "stats";

  if (isAuthed()) {
    showApp();
    if (!state.pendingOpenId) showPage(state.page || "home");
  } else showLogin();
}

document.addEventListener("DOMContentLoaded", setup);
