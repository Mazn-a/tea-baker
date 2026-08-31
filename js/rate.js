(function () {
  const $ = (sel) => document.querySelector(sel);

  function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function orderIdFromUrl() {
    return new URLSearchParams(location.search).get("o") || "";
  }

  function isOpen(eventDate) {
    const day = String(eventDate || "").slice(0, 10);
    return Boolean(day) && day < todayIso();
  }

  function paintStars(selected) {
    const host = $("#starPick");
    if (!host) return;
    host.innerHTML = [1, 2, 3, 4, 5]
      .map(
        (n) =>
          `<button type="button" class="star-btn${n <= selected ? " is-on" : ""}" data-star="${n}" aria-label="${n} من 5">★</button>`
      )
      .join("");
  }

  function fillPackages(selected) {
    const sel = $("#ratePackage");
    if (!sel) return;
    const pkgs = window.BAKR_CATALOG?.packages || [];
    sel.innerHTML = `<option value="">اختر البكج</option>${pkgs
      .map((p) => `<option value="${p.name}">${p.name}</option>`)
      .join("")}`;
    if (selected) sel.value = selected;
  }

  async function setup() {
    fillPackages();
    paintStars(0);
    const form = $("#rateForm");
    const wait = $("#rateWait");
    const lead = $("#rateLead");
    const err = $("#rateError");
    const orderId = orderIdFromUrl();
    let eventInfo = null;

    $("#starPick")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-star]");
      if (!btn) return;
      const n = Number(btn.dataset.star);
      $("#rateStars").value = String(n);
      paintStars(n);
    });

    if (orderId && window.BakrStore?.getReviewEvent) {
      try {
        eventInfo = await window.BakrStore.getReviewEvent(orderId);
      } catch (ex) {
        console.warn(ex);
      }
    }

    if (eventInfo) {
      fillPackages(eventInfo.package_name);
      if (eventInfo.event_date) $("#rateDate").value = String(eventInfo.event_date).slice(0, 10);
      if (lead) {
        lead.textContent = `${eventInfo.hall_name || "المناسبة"} · ${eventInfo.city_label || ""} · ${
          eventInfo.package_name || ""
        }`.replace(/ · $/, "");
      }
      if (!isOpen(eventInfo.event_date)) {
        if (wait) {
          wait.hidden = false;
          wait.textContent = "التقييم ينفتح بعد المناسبة بيوم — امسح الباركود مرة ثانية غداً.";
        }
        return;
      }
    }

    if (form) form.hidden = false;

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (err) {
        err.hidden = true;
        err.textContent = "";
      }
      const firstName = String($("#rateFirst")?.value || "").trim();
      const lastName = String($("#rateLast")?.value || "").trim();
      const packageName = String($("#ratePackage")?.value || "").trim();
      const rating = Number($("#rateStars")?.value || 0);
      const eventDate = String($("#rateDate")?.value || "").slice(0, 10);
      const comment = String($("#rateComment")?.value || "").trim();

      const showErr = (msg) => {
        if (!err) return;
        err.hidden = false;
        err.textContent = msg;
      };

      if (firstName.length < 2) return showErr("اكتب الاسم الأول");
      if (lastName.length < 2) return showErr("اكتب الاسم الثاني");
      if (!packageName) return showErr("اختر نوع البكج");
      if (rating < 1) return showErr("اختر التقييم بالنجوم");
      if (!eventDate) return showErr("اختر تاريخ المناسبة");
      if (!isOpen(eventDate)) return showErr("التقييم ينفتح بعد المناسبة بيوم");

      const btn = $("#rateSubmit");
      if (btn) btn.disabled = true;
      try {
        await window.BakrStore.submitReview({
          orderId: orderId || "",
          firstName,
          lastName,
          packageName,
          rating,
          eventDate,
          comment,
          cityLabel: eventInfo?.city_label || "",
          eventLabel: eventInfo?.event_label || "",
        });
        form.hidden = true;
        const done = $("#rateDone");
        if (done) done.hidden = false;
      } catch (ex) {
        showErr(ex?.message || "تعذر إرسال التقييم — حاول مرة ثانية");
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", setup);
})();
