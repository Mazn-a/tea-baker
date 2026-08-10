/**
 * تقويم ميلادي/هجري لحجز الإدارة — نفس منطق الموقع
 */
(function (global) {
  const AR_GREGORIAN = "ar-SA-u-ca-gregory-nu-latn";
  const AR_HIJRI = "ar-SA-u-ca-islamic-umalqura-nu-latn";

  function normalizeDigits(value) {
    return String(value || "")
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/\s+/g, "")
      .trim();
  }

  function toISO(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
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
    return new Intl.DateTimeFormat(AR_HIJRI, { month: "long", year: "numeric" }).format(date);
  }

  function formatHijriFull(date) {
    return new Intl.DateTimeFormat(AR_HIJRI, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  }

  function formatGregFull(iso) {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString(AR_GREGORIAN, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
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
        days.push({ day: h.day, iso: toISO(d.getFullYear(), d.getMonth(), d.getDate()), date: d });
      }
    }
    days.sort((a, b) => a.day - b.day);
    return { days, label: formatHijriMonthLabel(days[0]?.date || anchorDate) };
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
    const text = normalizeDigits(raw).trim();
    if (!text) return null;
    const m = text.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/);
    if (!m) return null;
    const a = Number(m[1]);
    const b = Number(m[2]);
    const c = Number(m[3]);

    if (mode === "hijri") {
      let hy, hm, hd;
      if (a > 1300) {
        hy = a;
        hm = b;
        hd = c;
      } else if (c > 1300) {
        hd = a;
        hm = b;
        hy = c;
      } else return null;
      if (hm < 1 || hm > 12 || hd < 1 || hd > 30) return null;
      return findGregorianForHijri(hy, hm, hd);
    }

    let year, month, day;
    if (a > 31) {
      year = a;
      month = b;
      day = c;
    } else if (c > 31) {
      day = a;
      month = b;
      year = c;
    } else return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return d;
  }

  function weekdayHeadersAr() {
    const fmt = new Intl.DateTimeFormat("ar-SA", { weekday: "short" });
    const sunday = new Date(2026, 7, 2, 12, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      return String(fmt.format(d) || "")
        .replace(/^ال/, "")
        .trim();
    });
  }

  function create(host, hiddenInput, bounds, getBooked) {
    const st = {
      calendarMode: "gregorian",
      calendar: new Date(),
      selected: "",
      dateSearch: "",
      feedback: "",
      booked: new Set(),
    };

    function monthStart(dateObj = st.calendar) {
      return new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
    }

    function isPast(iso) {
      return iso < bounds.minIso;
    }

    function isBeyond(iso) {
      return iso > bounds.maxIso;
    }

    function isBooked(iso) {
      return st.booked.has(iso);
    }

    function canPick(iso) {
      return !isPast(iso) && !isBeyond(iso) && !isBooked(iso);
    }

    function setSelected(iso) {
      if (!canPick(iso)) {
        st.selected = "";
        st.feedback = isBeyond(iso) ? "beyond" : "bad";
        if (hiddenInput) hiddenInput.value = "";
        render();
        return false;
      }
      st.selected = iso;
      st.feedback = "ok";
      if (hiddenInput) hiddenInput.value = iso;
      st.calendar = new Date(`${iso}T12:00:00`);
      render();
      return true;
    }

    function statusText() {
      if (st.feedback === "ok" && st.selected) {
        const g = formatGregFull(st.selected);
        const h = formatHijriFull(new Date(`${st.selected}T12:00:00`)).replace(/\s(هـ)$/, "\u00A0$1");
        return `التاريخ: ${g} · ${h}`;
      }
      if (st.feedback === "beyond") return "لا يمكن الحجز لأكثر من 12 شهراً قادمة.";
      if (st.feedback === "bad") return "هذا اليوم غير متاح (محجوز أو سابق) — اختر تاريخاً آخر.";
      return "اختر يوماً من التقويم أو ابحث بالأعلى.";
    }

    function renderDayCell(iso, dayLabel) {
      const past = isPast(iso);
      const beyond = isBeyond(iso);
      const booked = isBooked(iso);
      const selected = st.selected === iso;
      const locked = past || beyond || booked;
      let cls = "day-btn";
      if (past || beyond) cls += " muted";
      else if (booked) cls += " booked";
      else cls += " available";
      if (selected) cls += " selected";
      const mark = booked ? "<small>محجوز</small>" : "";
      return `<button class="${cls}" type="button" data-date="${iso}" ${locked ? "disabled" : ""}>${dayLabel}${mark}</button>`;
    }

    function canGoPrev() {
      return monthStart(st.calendar) > monthStart(startOfToday());
    }

    function canGoNext() {
      const maxMonth = monthStart(bounds.max);
      return monthStart(st.calendar) < maxMonth;
    }

    function shiftMonth(delta) {
      if (delta < 0 && !canGoPrev()) return;
      if (delta > 0 && !canGoNext()) return;
      if (st.calendarMode === "hijri") {
        const month = buildHijriMonthDays(st.calendar);
        const edge = delta > 0 ? month.days[month.days.length - 1] : month.days[0];
        const anchor = new Date(edge?.date || st.calendar);
        anchor.setHours(12, 0, 0, 0);
        anchor.setDate(anchor.getDate() + (delta > 0 ? 1 : -1));
        st.calendar = anchor;
      } else {
        st.calendar.setMonth(st.calendar.getMonth() + delta);
      }
      const minM = monthStart(startOfToday());
      const maxM = monthStart(bounds.max);
      const view = monthStart(st.calendar);
      if (view < minM) st.calendar = new Date(minM);
      if (view > maxM) st.calendar = new Date(maxM);
      render();
    }

    function render() {
      const isHijri = st.calendarMode === "hijri";
      let label = "";
      let cells = "";

      if (isHijri) {
        const monthData = buildHijriMonthDays(st.calendar);
        label = monthData.label;
        const firstWeekday = monthData.days[0]?.date.getDay() ?? 0;
        for (let i = 0; i < firstWeekday; i++) cells += `<button class="day-btn muted" type="button" disabled></button>`;
        for (const item of monthData.days) cells += renderDayCell(item.iso, item.day);
      } else {
        const year = st.calendar.getFullYear();
        const month = st.calendar.getMonth();
        label = st.calendar.toLocaleDateString(AR_GREGORIAN, { month: "long", year: "numeric" });
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let i = 0; i < firstDay; i++) cells += `<button class="day-btn muted" type="button" disabled></button>`;
        for (let day = 1; day <= daysInMonth; day++) cells += renderDayCell(toISO(year, month, day), day);
      }

      const searchPlaceholder = isHijri ? "مثال: 12/2/1447" : "مثال: 6/8/2026";

      host.innerHTML = `
        <div class="cal-wrap admin-cal">
          <div class="cal-mode-toggle" role="group" aria-label="نوع التقويم">
            <button type="button" class="cal-mode ${!isHijri ? "is-on" : ""}" data-cal-mode="gregorian">ميلادي</button>
            <button type="button" class="cal-mode ${isHijri ? "is-on" : ""}" data-cal-mode="hijri">هجري</button>
          </div>
          <div class="cal-search">
            <label for="adminDateSearch">اكتب أو ابحث عن التاريخ</label>
            <div class="cal-search-row">
              <input id="adminDateSearch" type="text" inputmode="numeric" placeholder="${searchPlaceholder}" value="${st.dateSearch.replace(/"/g, "&quot;")}" />
              <button type="button" class="btn btn-primary" id="adminDateSearchBtn">بحث</button>
            </div>
          </div>
          <div class="cal-nav">
            <button type="button" data-cal-next ${canGoNext() ? "" : "disabled"} aria-label="الشهر التالي">‹</button>
            <strong>${label}</strong>
            <button type="button" data-cal-prev ${canGoPrev() ? "" : "disabled"} aria-label="الشهر السابق">›</button>
          </div>
          <div class="cal-week">${weekdayHeadersAr().map((d) => `<span>${d}</span>`).join("")}</div>
          <div class="cal-days">${cells}</div>
          <div class="date-status ${st.feedback === "beyond" ? "bad" : st.feedback}" id="adminDateStatus">${statusText()}</div>
        </div>`;

      host.querySelector('[data-cal-mode="gregorian"]')?.addEventListener("click", () => {
        st.calendarMode = "gregorian";
        render();
      });
      host.querySelector('[data-cal-mode="hijri"]')?.addEventListener("click", () => {
        st.calendarMode = "hijri";
        render();
      });
      host.querySelector("[data-cal-prev]")?.addEventListener("click", () => shiftMonth(-1));
      host.querySelector("[data-cal-next]")?.addEventListener("click", () => shiftMonth(1));
      host.querySelector("#adminDateSearchBtn")?.addEventListener("click", () => {
        const input = host.querySelector("#adminDateSearch");
        st.dateSearch = input?.value || "";
        const found = parseDateSearch(st.dateSearch, st.calendarMode);
        if (!found) {
          st.feedback = "bad";
          render();
          return;
        }
        setSelected(toISO(found.getFullYear(), found.getMonth(), found.getDate()));
      });
      host.querySelectorAll("[data-date]").forEach((btn) => {
        btn.addEventListener("click", () => setSelected(btn.dataset.date));
      });
    }

    async function refreshBooked() {
      const list = (await getBooked?.()) || [];
      st.booked = new Set(list.map((d) => String(d).slice(0, 10)));
      render();
    }

    function reset() {
      st.selected = "";
      st.dateSearch = "";
      st.feedback = "";
      st.calendarMode = "gregorian";
      st.calendar = new Date();
      if (hiddenInput) hiddenInput.value = "";
      render();
    }

    render();

    return {
      reset,
      render,
      refreshBooked,
      getValue: () => st.selected,
    };
  }

  global.AdminCalendar = { create };
})(window);
