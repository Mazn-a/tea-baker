(function () {
  const $ = (sel) => document.querySelector(sel);

  function query() {
    return new URLSearchParams(location.search);
  }

  function orderIdFromUrl() {
    return query().get("o") || "";
  }

  function isoDate(value) {
    return String(value || "").slice(0, 10);
  }

  function occasionTitle(eventLabel, customerName) {
    const kind = String(eventLabel || "").trim() || "زواج";
    const who = String(customerName || "").trim();
    return who ? `${kind} ${who}` : kind;
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

  function fillPackages(selected, locked) {
    const sel = $("#ratePackage");
    if (!sel) return;
    const pkgs = window.BAKR_CATALOG?.packages || [];
    const names = pkgs.map((p) => p.name);
    if (selected && !names.includes(selected)) names.push(selected);
    sel.innerHTML = `${locked && selected ? "" : `<option value="">اختر البكج</option>`}${names
      .map((name) => `<option value="${name}">${name}</option>`)
      .join("")}`;
    if (selected) sel.value = selected;
    sel.disabled = Boolean(locked && selected);
  }

  function lockDate(iso, locked) {
    const input = $("#rateDate");
    if (!input) return;
    if (iso) input.value = iso;
    input.readOnly = Boolean(locked && iso);
  }

  const COMMENT_SUGGESTS = [
    "الضيافة مرتّبة ومتكاملة",
    "الطاقم محترف وأنيق",
    "التقديم فاخر ومتقن",
    "المستوى يليق بالمناسبة",
  ];

  function commentParts() {
    const raw = String($("#rateComment")?.value || "").trim();
    if (!raw) return [];
    return raw
      .split(/\s*[.،]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function setCommentParts(parts) {
    const ta = $("#rateComment");
    if (!ta) return;
    ta.value = parts.join(". ");
  }

  function paintSuggest() {
    const host = $("#rateSuggest");
    if (!host) return;
    const chosen = new Set(commentParts());
    host.innerHTML = COMMENT_SUGGESTS.map((text) => {
      const on = chosen.has(text);
      return `<button type="button" class="rate-chip${on ? " is-on" : ""}" data-suggest="${text}">${text}</button>`;
    }).join("");
  }

  function toggleSuggest(text) {
    const parts = commentParts();
    const idx = parts.indexOf(text);
    if (idx >= 0) parts.splice(idx, 1);
    else parts.push(text);
    setCommentParts(parts);
    paintSuggest();
  }

  async function setup() {
    fillPackages();
    paintStars(0);
    paintSuggest();
    const form = $("#rateForm");
    const lead = $("#rateLead");
    const err = $("#rateError");
    const orderId = orderIdFromUrl();
    const urlPkg = String(query().get("pkg") || "").trim();
    const urlDate = isoDate(query().get("dt"));
    const urlEvent = String(query().get("ev") || "").trim();
    const urlWho = String(query().get("who") || "").trim();
    let eventInfo = null;

    $("#starPick")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-star]");
      if (!btn) return;
      const n = Number(btn.dataset.star);
      $("#rateStars").value = String(n);
      paintStars(n);
    });

    $("#rateSuggest")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-suggest]");
      if (!btn) return;
      toggleSuggest(btn.dataset.suggest);
    });
    $("#rateComment")?.addEventListener("input", paintSuggest);

    if (orderId && window.BakrStore?.getReviewEvent) {
      try {
        eventInfo = await window.BakrStore.getReviewEvent(orderId);
      } catch (ex) {
        console.warn(ex);
      }
    }

    const packageName = String(eventInfo?.package_name || urlPkg || "").trim();
    const eventDate = isoDate(eventInfo?.event_date || urlDate);
    const eventLabel = String(eventInfo?.event_label || urlEvent || "").trim();
    const customerName = String(eventInfo?.customer_name || urlWho || "").trim();
    const fromEvent = Boolean(orderId && (packageName || eventDate || eventLabel || customerName));

    fillPackages(packageName, fromEvent);
    lockDate(eventDate, fromEvent);

    if (lead) {
      lead.textContent = fromEvent
        ? `التقييم خاص بـ${occasionTitle(eventLabel, customerName)} — التاريخ معبّأ تلقائي.`
        : "نرحّب بتقييمك لضيافة المناسبة.";
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
      const chosenPackage = String($("#ratePackage")?.value || "").trim();
      const rating = Number($("#rateStars")?.value || 0);
      const chosenDate = isoDate($("#rateDate")?.value);
      const comment = String($("#rateComment")?.value || "").trim();

      const showErr = (msg) => {
        if (!err) return;
        err.hidden = false;
        err.textContent = msg;
      };

      if (firstName.length < 2) return showErr("اكتب الاسم الأول");
      if (lastName.length < 2) return showErr("اكتب الاسم الثاني");
      if (!chosenPackage) return showErr("اختر نوع البكج");
      if (rating < 1) return showErr("اختر التقييم بالنجوم");
      if (!chosenDate) return showErr("اختر تاريخ المناسبة");

      const btn = $("#rateSubmit");
      if (btn) btn.disabled = true;
      try {
        await window.BakrStore.submitReview({
          orderId: orderId || "",
          firstName,
          lastName,
          packageName: chosenPackage,
          rating,
          eventDate: chosenDate,
          comment,
          cityLabel: eventInfo?.city_label || "",
          eventLabel: eventLabel || eventInfo?.event_label || "",
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
