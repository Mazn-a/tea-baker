/**
 * توليد ملف PDF لتأكيد/رفض الطلب بشعار شاي بكر.
 * يعتمد على html2pdf.js + شعار مضمّن (data URL) لتفادي مشاكل التحميل.
 */
(function () {
  function logoSrc() {
    return window.BAKR_LOGO_DATA_URL || "../assets/logo-brand.png?v=12";
  }

  /** نفس أسلوب الموقع: نص عربي وأرقام إنجليزية وتقويم ميلادي مثبّت */
  const AR_GREGORIAN = "ar-SA-u-ca-gregory-nu-latn";

  function money(n) {
    return `${Number(n || 0).toLocaleString("ar-SA-u-nu-latn")} ر.س`;
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(AR_GREGORIAN, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
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

  function decisionMeta(status) {
    if (status === "accepted") {
      return {
        title: "تم قبول طلبك",
        subtitle: "ملف تأكيد رسمي من شاي بكر",
        tone: "#1f7a3f",
        toneBg: "#e8f6ee",
        icon: "✓",
      };
    }
    if (status === "rejected") {
      return {
        title: "تم رفض الطلب",
        subtitle: "نعتذر — التاريخ غير متاح حالياً",
        tone: "#b42318",
        toneBg: "#fdecea",
        icon: "×",
      };
    }
    return {
      title: "طلب قيد المراجعة",
      subtitle: "تفاصيل طلبك كما وصلتنا",
      tone: "#9a6700",
      toneBg: "#fff6e0",
      icon: "…",
    };
  }

  function row(label, value) {
    return `
      <tr>
        <td class="lbl">${label}</td>
        <td class="val">${value}</td>
      </tr>`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fileName(order) {
    const status =
      order.status === "accepted"
        ? "قبول"
        : order.status === "rejected"
          ? "رفض"
          : "طلب";
    const name = String(order.customer_name || "عميل")
      .replace(/[^\u0600-\u06FFa-zA-Z0-9-_ ]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 24);
    return `شاي-بكر-${status}-${name || "طلب"}.pdf`;
  }

  function buildReceiptInner(order) {
    const meta = decisionMeta(order.status);
    const addons = Array.isArray(order.addons) ? order.addons : [];
    const addonRows =
      addons.length > 0
        ? addons
            .map(
              (a) => `
          <tr>
            <td>${escapeHtml(a.name)}</td>
            <td class="num">${a.qty}</td>
            <td class="num">${money(a.price * a.qty)}</td>
          </tr>`
            )
            .join("")
        : `<tr><td colspan="3" class="muted">بدون إضافات</td></tr>`;

    const shortId = String(order.id || "").slice(0, 8).toUpperCase() || "——";
    const notesRaw = String(order.notes || "")
      .split("|")
      .map((p) => p.trim())
      .filter((p) => p && !/^الموقع\s*:/.test(p))
      .join(" | ");
    const notes = notesRaw ? escapeHtml(notesRaw) : "";
    const mapLink = String(order.location_link || "").trim();

    return `
      <table class="head">
        <tr>
          <td class="brand-cell">
            <div class="brand">
              <img src="${logoSrc()}" alt="شاي بكر" />
              <div>
                <h1>شاي بكر</h1>
                <p>للضيافة والمناسبات · مكة · جدة · الطائف</p>
              </div>
            </div>
          </td>
          <td class="meta-side">
            <div>رقم المرجع: ${shortId}</div>
            <div>${formatDateTime(order.created_at)}</div>
          </td>
        </tr>
      </table>

      <div class="banner" style="background:${meta.toneBg};border-color:${meta.tone}33">
        <div class="mark" style="background:${meta.tone}">${meta.icon}</div>
        <div>
          <h2 style="color:${meta.tone}">${meta.title}</h2>
          <p>${meta.subtitle}</p>
        </div>
      </div>

      <h3>بيانات العميل</h3>
      <table class="info">
        ${row("الاسم", escapeHtml(order.customer_name || "—"))}
        ${row("الجوال", `<span dir="ltr">${escapeHtml(order.customer_phone || "—")}</span>`)}
      </table>

      <h3>تفاصيل المناسبة</h3>
      <table class="info">
        ${row("المدينة", escapeHtml(order.city_label || "—"))}
        ${row("نوع المناسبة", escapeHtml(order.event_label || "—"))}
        ${row("البكج", `${escapeHtml(order.package_name || "—")} — ${money(order.package_price)}`)}
        ${row("تاريخ المناسبة", formatDate(order.event_date))}
        ${row("القاعة", escapeHtml(order.hall_name || "—"))}
        ${row(
          "رابط الخريطة",
          mapLink
            ? `<a class="map-link" href="${escapeHtml(mapLink)}" target="_blank" rel="noopener" dir="ltr">${escapeHtml(mapLink)}</a>`
            : "—"
        )}
      </table>

      <h3>الإضافات</h3>
      <table class="addons">
        <thead>
          <tr><th>الصنف</th><th>الكمية</th><th>المبلغ</th></tr>
        </thead>
        <tbody>${addonRows}</tbody>
      </table>

      <table class="total-box">
        <tr>
          <td class="total-label">الإجمالي النهائي</td>
          <td class="total-value">${money(order.grand_total)}</td>
        </tr>
      </table>

      ${
        notes
          ? `<div class="notes"><strong>ملاحظات العميل</strong>${notes}</div>`
          : ""
      }

      <div class="foot">
        ${
          order.status === "accepted"
            ? "للتأكيد النهائي والتفاهم على العربون، ردّ على واتساب بكلمة <b>«أؤكد»</b>."
            : order.status === "rejected"
              ? "يمكنك تقديم طلب جديد بتاريخ آخر من موقع شاي بكر، أو مراسلتنا للاستفسار."
              : "سنوافيك بالنتيجة قريباً عبر واتساب."
        }
        <br />
        <b>شاي بكر</b> · 0533508361
      </div>`;
  }

  const RECEIPT_CSS = `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #efe4d4;
      font-family: "Tajawal", "Segoe UI", Tahoma, sans-serif;
      color: #1a120c;
    }
    .toolbar {
      position: sticky; top: 0; z-index: 5;
      display: flex; flex-wrap: wrap; gap: 0.6rem; justify-content: center;
      padding: 0.85rem 1rem; background: #2a1810; color: #fffdf9;
    }
    .toolbar button {
      appearance: none; border: 0; border-radius: 999px; min-height: 2.6rem;
      padding: 0.45rem 1.1rem; font: inherit; font-weight: 800; cursor: pointer;
    }
    .toolbar .primary { background: #c4a35a; color: #2a1810; }
    .toolbar .ghost { background: rgba(255,255,255,0.12); color: #fffdf9; }
    .toolbar span { width: 100%; text-align: center; font-size: 0.92rem; opacity: 0.9; }
    .sheet-wrap { padding: 1.25rem 1rem 2.5rem; }
    .bakr-receipt {
      width: min(794px, 100%); margin: 0 auto; padding: 36px 40px 44px;
      background: #fffdf9; direction: rtl; text-align: right;
      box-shadow: 0 18px 40px rgba(42, 24, 16, 0.14); border-radius: 1rem;
    }
    .head {
      width: 100%; border-collapse: collapse;
      padding-bottom: 22px; border-bottom: 3px solid #633a11;
    }
    .head td { vertical-align: middle; padding: 0; }
    .brand-cell { width: 70%; }
    .brand { display: flex; align-items: center; gap: 16px; min-width: 0; }
    .brand img {
      width: 110px; height: 110px; object-fit: contain;
      border-radius: 20px; background: #f3ebe0; flex-shrink: 0;
    }
    .brand h1 {
      margin: 0; font-family: "Reem Kufi", "Tajawal", sans-serif;
      font-size: 30px; color: #633a11; line-height: 1.2;
    }
    .brand p { margin: 4px 0 0; color: #6b5344; font-size: 14px; }
    .meta-side {
      width: 30%; font-size: 13px;
      color: #6b5344; line-height: 1.7;
    }
    .banner {
      margin: 24px 0 20px; padding: 16px 20px; border-radius: 16px;
      border: 1px solid transparent;
      display: flex; align-items: center; gap: 14px;
    }
    .banner .mark {
      width: 44px; height: 44px; border-radius: 50%; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; font-weight: 800; flex-shrink: 0;
    }
    .banner h2 { margin: 0; font-size: 22px; }
    .banner p { margin: 2px 0 0; font-size: 14px; color: #4a3222; }
    h3 {
      margin: 22px 0 10px; font-size: 16px; color: #633a11;
      border-right: 4px solid #c4a35a; padding-right: 10px;
    }
    table.info { width: 100%; border-collapse: collapse; font-size: 14px; table-layout: fixed; }
    table.info td {
      padding: 10px 12px; border-bottom: 1px solid #ead4bd; vertical-align: top;
    }
    table.info .lbl {
      width: 30%; color: #6b5344; font-weight: 600; background: #f7f1e8;
    }
    table.info .val {
      width: 70%; font-weight: 700; color: #1a120c;
      overflow-wrap: anywhere; word-break: break-word; white-space: normal;
    }
    table.info .val .map-link {
      color: #633a11; text-decoration: underline;
      font-size: 12px; font-weight: 700;
      overflow-wrap: anywhere; word-break: break-all;
    }
    table.addons { width: 100%; border-collapse: collapse; font-size: 14px; }
    table.addons th {
      background: #633a11; color: #fffdf9; padding: 10px 12px;
      font-weight: 700; text-align: right;
    }
    table.addons td { padding: 10px 12px; border-bottom: 1px solid #ead4bd; }
    table.addons .num {
      font-variant-numeric: tabular-nums; white-space: nowrap;
    }
    .muted { color: #8a7363; font-weight: 500; }
    .total-box {
      width: 100%; margin-top: 18px; border-radius: 14px;
      background: linear-gradient(135deg, #633a11, #4a3222);
      color: #fffdf9; border-collapse: collapse;
    }
    .total-box td {
      padding: 16px 18px; vertical-align: middle;
    }
    .total-label { font-size: 15px; opacity: 0.92; width: 60%; }
    .total-value { font-size: 26px; font-weight: 800; width: 40%; }
    .notes {
      margin-top: 16px; padding: 14px 16px; border-radius: 12px;
      background: #f3ebe0; border: 1px dashed #c4a35a;
      font-size: 14px; line-height: 1.7;
    }
    .notes strong { color: #633a11; display: block; margin-bottom: 4px; }
    .foot {
      margin-top: 28px; padding-top: 16px; border-top: 1px solid #ead4bd;
      font-size: 13px; color: #6b5344; line-height: 1.75; text-align: center;
    }
    .foot b { color: #633a11; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none !important; }
      .sheet-wrap { padding: 0; }
      .bakr-receipt { box-shadow: none; border-radius: 0; width: 100%; }
    }
  `;

  function buildReceiptHtml(order) {
    const name = fileName(order);
    // html2pdf يُحمَّل من نفس أصل لوحة الإدارة عبر مسار مطلق نسبي للـ blob لا يعمل؛
    // لذلك نضمّن سكربت التحميل من النافذة الأم عبر postMessage، ونوفّر طباعة دائماً.
    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>شاي بكر — تأكيد الطلب</title>
  <link href="https://fonts.googleapis.com/css2?family=Reem+Kufi:wght@600;700&family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet" />
  <style>${RECEIPT_CSS}</style>
</head>
<body>
  <div class="toolbar" id="toolbar">
    <span>ملف تأكيد شاي بكر — اضغط «تحميل PDF» أو «طباعة» واختر حفظ كـ PDF</span>
    <button type="button" class="primary" id="btnSavePdf">تحميل PDF</button>
    <button type="button" class="ghost" id="btnPrint">طباعة / حفظ PDF</button>
  </div>
  <div class="sheet-wrap">
    <div class="bakr-receipt" id="receipt">${buildReceiptInner(order)}</div>
  </div>
  <script>
    document.getElementById("btnPrint").onclick = function () { window.print(); };
    document.getElementById("btnSavePdf").onclick = function () {
      // اطلب من لوحة الإدارة توليد الملف (نفس النافذة الأم)
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: "bakr-save-pdf", fileName: ${JSON.stringify(name)} }, "*");
      } else {
        window.print();
      }
    };
  <\/script>
</body>
</html>`;
  }

  function openReceiptPreview(order) {
    const html = buildReceiptHtml(order);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return Boolean(win);
  }

  async function makePdfFile(order) {
    if (typeof html2pdf === "undefined") {
      throw new Error("مكتبة PDF غير محمّلة");
    }

    const CAPTURE_WIDTH = 794;

    const style = document.createElement("style");
    style.setAttribute("data-bakr-pdf", "1");
    style.textContent = `${RECEIPT_CSS}
      .bakr-receipt-pdf-host {
        position: fixed !important;
        left: 0 !important;
        right: auto !important;
        top: 0 !important;
        width: ${CAPTURE_WIDTH}px !important;
        margin: 0 !important;
        padding: 0 !important;
        /* لا تستخدم opacity:0 / z-index:-1 — سفاري الجوال يلتقط بإزاحة RTL خاطئة */
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: none !important;
        z-index: 2147483646 !important;
        transform: translateY(-12000px) !important;
        direction: ltr !important;
        text-align: left !important;
        background: transparent !important;
        overflow: visible !important;
      }
      .bakr-receipt-pdf-root {
        width: ${CAPTURE_WIDTH}px !important;
        max-width: ${CAPTURE_WIDTH}px !important;
        margin: 0 !important;
        padding: 36px 40px 44px !important;
        background: #fffdf9 !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        direction: rtl !important;
        text-align: right !important;
        color: #1a120c;
        font-family: "Tajawal", "Segoe UI", Tahoma, sans-serif;
        position: relative !important;
        left: 0 !important;
        right: auto !important;
        transform: none !important;
      }
    `;

    const host = document.createElement("div");
    host.className = "bakr-receipt-pdf-host";
    host.setAttribute("data-bakr-pdf-host", "1");
    host.setAttribute("dir", "ltr");

    const el = document.createElement("div");
    el.className = "bakr-receipt bakr-receipt-pdf-root";
    el.setAttribute("dir", "rtl");
    el.innerHTML = buildReceiptInner(order);

    document.head.appendChild(style);
    host.appendChild(el);
    document.body.appendChild(host);

    const img = el.querySelector("img");
    if (img) {
      await new Promise((resolve) => {
        if (img.complete && img.naturalWidth) {
          resolve();
          return;
        }
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 2500);
      });
    }
    try {
      await document.fonts?.ready;
    } catch (_) {}
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const captureHeight = Math.max(
      Math.ceil(el.scrollHeight || el.offsetHeight || 1123),
      400
    );

    try {
      const blob = await html2pdf()
        .set({
          margin: [8, 8, 8, 8],
          filename: fileName(order),
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: "#fffdf9",
            logging: false,
            scrollX: 0,
            scrollY: 0,
            x: 0,
            y: 0,
            width: CAPTURE_WIDTH,
            height: captureHeight,
            windowWidth: CAPTURE_WIDTH,
            windowHeight: captureHeight,
            foreignObjectRendering: false,
            onclone(clonedDoc) {
              const clonedHost = clonedDoc.querySelector("[data-bakr-pdf-host]");
              const clonedEl = clonedDoc.querySelector(".bakr-receipt-pdf-root");
              if (clonedHost) {
                clonedHost.style.cssText = [
                  "position:fixed",
                  "left:0",
                  "right:auto",
                  "top:0",
                  `width:${CAPTURE_WIDTH}px`,
                  "margin:0",
                  "padding:0",
                  "opacity:1",
                  "visibility:visible",
                  "pointer-events:none",
                  "transform:none",
                  "direction:ltr",
                  "text-align:left",
                  "background:transparent",
                  "overflow:visible",
                ].join(";");
                clonedHost.setAttribute("dir", "ltr");
              }
              if (clonedEl) {
                clonedEl.style.cssText = [
                  `width:${CAPTURE_WIDTH}px`,
                  `max-width:${CAPTURE_WIDTH}px`,
                  "margin:0",
                  "padding:36px 40px 44px",
                  "background:#fffdf9",
                  "box-shadow:none",
                  "border-radius:0",
                  "direction:rtl",
                  "text-align:right",
                  "position:relative",
                  "left:0",
                  "right:auto",
                  "transform:none",
                ].join(";");
                clonedEl.setAttribute("dir", "rtl");
              }
              const htmlEl = clonedDoc.documentElement;
              const bodyEl = clonedDoc.body;
              if (htmlEl) {
                htmlEl.style.direction = "ltr";
                htmlEl.setAttribute("dir", "ltr");
              }
              if (bodyEl) {
                bodyEl.style.direction = "ltr";
                bodyEl.style.margin = "0";
                bodyEl.setAttribute("dir", "ltr");
              }
            },
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["avoid-all", "css", "legacy"] },
        })
        .from(el)
        .outputPdf("blob");

      if (!blob || blob.size < 1500) {
        throw new Error("ملف PDF فاضي — حدّث الصفحة وحاول مرة ثانية");
      }

      return new File([blob], fileName(order), { type: "application/pdf" });
    } finally {
      host.remove();
      style.remove();
    }
  }

  async function downloadOrderPdf(order) {
    window.__bakrLastPdfOrder = order;
    const file = await makePdfFile(order);
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return { ok: true, file, opened: false };
  }

  // استقبال طلب تحميل من تبويب المعاينة
  window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "bakr-save-pdf") return;
    const order = window.__bakrLastPdfOrder;
    if (!order) return;
    downloadOrderPdf(order).catch((err) => console.warn(err));
  });

  window.BakrOrderPdf = {
    makePdfFile,
    downloadOrderPdf,
    openReceiptPreview,
    prepare: downloadOrderPdf,
  };
})();
