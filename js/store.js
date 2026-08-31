/**
 * =========================================================
 * شاي بكر — طبقة التخزين (Store)
 * =========================================================
 * المسؤوليات:
 *  - حفظ الطلبات والزيارات
 *  - العمل على سحابة Supabase إن وُجدت المفاتيح (تكلفة مجانية)
 *  - وإلا الحفظ المحلي localStorage للتجربة على نفس المتصفح
 *
 * لإضافة جدول/كيان جديد لاحقاً:
 *  1) أضف الجدول في sql/schema.sql
 *  2) أضف دوال create/list/update هنا بنفس النمط
 * =========================================================
 */
(function (global) {
  const KEYS = {
    orders: "bakr-orders-v1",
    visits: "bakr-visits-v1",
    visitSession: "bakr-visit-session",
    deletedIds: "bakr-deleted-orders-v1",
    issues: "bakr-issues-v1",
    reviews: "bakr-reviews-v1",
  };

  /**
   * علامة الحذف داخل حقل الملاحظات.
   * سبب وجودها: عمود status في السحابة مقيّد بـ pending/accepted/rejected،
   * وقد لا تكون صلاحية DELETE مفعّلة، فنحتاج علامة تعمل بصلاحية التحديث الحالية.
   */
  const DELETED_MARK = "__deleted__";

  /** بادئة تميّز سطور خطوات الحجز داخل جدول الزيارات */
  const STEP_PREFIX = "step/";

  function cfg() {
    return global.BAKR_CONFIG || {};
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  /** null = لا قيود — أي مستخدم Supabase Auth مسموح */
  function allowedAdminEmails() {
    const list = cfg().adminEmails;
    if (!Array.isArray(list) || list.length === 0) return null;
    return list.map(normalizeEmail).filter(Boolean);
  }

  function isAdminEmail(email) {
    const allowed = allowedAdminEmails();
    if (!allowed) return true;
    return allowed.includes(normalizeEmail(email));
  }

  function hasCloud() {
    const c = cfg();
    const url = (c.supabaseUrl || "").trim();
    const key = (c.supabaseAnonKey || "").trim();
    return Boolean(url && key && !url.includes("YOUR_PROJECT") && key !== "YOUR_ANON_KEY");
  }

  let client = null;
  /** يصير true إذا لم تُنشأ دالة booked_days بعد، فلا نكرر طلبها */
  let bookedDaysRpcMissing = false;

  async function getClient() {
    if (!hasCloud()) return null;
    if (client) return client;
    if (!global.supabase?.createClient) {
      console.warn("Supabase SDK غير محمّل");
      return null;
    }
    const c = cfg();
    client = global.supabase.createClient(c.supabaseUrl.trim(), c.supabaseAnonKey.trim());
    return client;
  }

  /* ---------------------------------------------------------
   * دخول الإدارة (Supabase Auth)
   * الجلسة تُحفظ في المتصفح، فيدخل الموظف مرة واحدة ويبقى داخلاً.
   * ------------------------------------------------------- */

  function authMessageAr(error) {
    const msg = String(error?.message || "").toLowerCase();
    if (msg.includes("invalid login")) return "البريد أو كلمة المرور غير صحيحة";
    if (msg.includes("email not confirmed")) return "لازم تأكيد البريد من Supabase أولاً";
    if (msg.includes("rate limit") || msg.includes("too many"))
      return "محاولات كثيرة — انتظر دقيقة وحاول مرة ثانية";
    if (msg.includes("failed to fetch")) return "لا يوجد اتصال بالإنترنت";
    return error?.message || "تعذر تسجيل الدخول";
  }

  async function signIn(email, password) {
    const sb = await getClient();
    if (!sb) return { ok: false, message: "قاعدة البيانات غير مربوطة بعد" };
    try {
      const { data, error } = await sb.auth.signInWithPassword({
        email: String(email || "").trim(),
        password: String(password || ""),
      });
      if (error) return { ok: false, message: authMessageAr(error) };
      const user = data?.user || null;
      if (user && !isAdminEmail(user.email)) {
        await sb.auth.signOut();
        return { ok: false, message: "هذا البريد غير مخوّل للدخول إلى الإدارة" };
      }
      return { ok: true, user };
    } catch (err) {
      return { ok: false, message: authMessageAr(err) };
    }
  }

  async function signOut() {
    try {
      const sb = await getClient();
      await sb?.auth?.signOut();
    } catch (err) {
      console.warn("signOut:", err);
    }
  }

  /** المستخدم الحالي أو null — يُستعمل لمعرفة هل الإدارة مسجّلة دخول */
  async function currentUser() {
    try {
      const sb = await getClient();
      if (!sb) return null;
      const { data } = await sb.auth.getSession();
      const user = data?.session?.user || null;
      if (user && !isAdminEmail(user.email)) {
        await sb.auth.signOut();
        return null;
      }
      return user;
    } catch (err) {
      console.warn("currentUser:", err);
      return null;
    }
  }

  function uid() {
    return global.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function readLocal(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  }

  function writeLocal(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function deletedIds() {
    const list = readLocal(KEYS.deletedIds, []);
    return Array.isArray(list) ? list.map(String) : [];
  }

  function rememberDeleted(id) {
    const list = deletedIds();
    const key = String(id);
    if (!list.includes(key)) {
      list.push(key);
      writeLocal(KEYS.deletedIds, list.slice(-500));
    }
  }

  function isDeletedOrder(order, hiddenIds) {
    if (!order) return false;
    if (order.status === "deleted") return true;
    if (String(order.notes || "").startsWith(DELETED_MARK)) return true;
    const ids = hiddenIds || deletedIds();
    return ids.includes(String(order.id));
  }

  /** يستبعد المحذوفات مرة واحدة بدل قراءة التخزين لكل طلب */
  function withoutDeleted(rows) {
    const ids = deletedIds();
    return (rows || []).filter((o) => !isDeletedOrder(o, ids));
  }

  function sessionId() {
    let id = sessionStorage.getItem(KEYS.visitSession);
    if (!id) {
      id = uid();
      sessionStorage.setItem(KEYS.visitSession, id);
    }
    return id;
  }

  /** اختبار اتصال السحابة */
  async function ping() {
    if (!hasCloud()) {
      return { ok: false, mode: "local", message: "لم تُضبط مفاتيح Supabase بعد" };
    }
    try {
      const sb = await getClient();
      const { error } = await sb.from("orders").select("id").limit(1);
      if (error) {
        return {
          ok: false,
          mode: "cloud-error",
          message: error.message || "تعذر الوصول للجداول — نفّذ sql/schema.sql",
        };
      }
      return { ok: true, mode: "cloud", message: "متصل بقاعدة البيانات السحابية" };
    } catch (err) {
      return { ok: false, mode: "cloud-error", message: String(err?.message || err) };
    }
  }

  /** يحذف أعمدة اختيارية غير موجودة بعد في Supabase ويعيد المحاولة */
  async function insertOrderRow(sb, row) {
    let payload = { ...row };
    const optionalCols = ["amount_paid", "location_area"];

    for (let attempt = 0; attempt <= optionalCols.length; attempt++) {
      const { error } = await sb.from("orders").insert(payload);
      if (!error) return payload;

      const msg = String(error.message || error.details || error.hint || "");
      const code = String(error.code || "");
      let missing = optionalCols.find((col) => col in payload && new RegExp(col, "i").test(msg));
      if (!missing && code === "PGRST204") {
        missing = optionalCols.find((col) => col in payload && msg.includes(col));
      }
      if (!missing) throw error;

      const next = { ...payload };
      delete next[missing];
      payload = next;
    }

    throw new Error("تعذر إرسال الطلب");
  }

  async function createOrder(payload) {
    const now = new Date();
    const row = {
      created_at: now.toISOString(),
      status: payload.status || "pending",
      city_id: payload.cityId,
      city_label: payload.cityLabel,
      event_label: payload.eventLabel,
      package_id: payload.packageId,
      package_name: payload.packageName,
      package_price: Number(payload.packagePrice) || 0,
      addons: payload.addons || [],
      addons_total: Number(payload.addonsTotal) || 0,
      grand_total: Number(payload.grandTotal) || 0,
      event_date: payload.eventDate,
      customer_name: payload.customerName,
      customer_phone: payload.customerPhone,
      hall_name: payload.hallName,
      location_link: payload.locationLink || "",
      notes: payload.notes || "",
      hour_of_day: now.getHours(),
    };

    if (payload.locationArea) row.location_area = payload.locationArea;
    if (payload.amountPaid != null) row.amount_paid = Number(payload.amountPaid) || 0;

    try {
      const sb = await getClient();
      if (sb) {
        const inserted = await insertOrderRow(sb, row);
        return { ...inserted, saved: true };
      }
    } catch (err) {
      console.warn("createOrder cloud → local:", err);
    }

    const localRow = { id: uid(), ...row };
    const all = readLocal(KEYS.orders, []);
    all.unshift(localRow);
    writeLocal(KEYS.orders, all);
    // بدون سحابة: الطلب محفوظ في جهاز العميل فقط، والإدارة لن تراه
    return { ...localRow, saved: !hasCloud() };
  }

  /**
   * تواريخ محجوزة: أي طلب بانتظار القرار أو مقبول.
   * مجرد إرسال الطلب يحجز التاريخ حتى يُرفض أو يُحذف.
   */
  async function listBookedDates() {
    // الطريقة الآمنة: دالة في قاعدة البيانات ترجّع التواريخ فقط بدون بيانات العملاء.
    // إن لم تكن منشأة بعد (قبل تنفيذ sql/patch-secure-admin.sql) نرجع للطريقة القديمة.
    if (!bookedDaysRpcMissing) {
      try {
        const sb = await getClient();
        if (sb) {
          const { data, error } = await sb.rpc("booked_days");
          if (!error && Array.isArray(data)) {
            return data
              .map((row) => String(row?.booked_days ?? row?.event_date ?? row).slice(0, 10))
              .filter(Boolean);
          }
          // غير منشأة بعد — لا نعيد المحاولة في هذه الجلسة
          bookedDaysRpcMissing = true;
        }
      } catch (err) {
        bookedDaysRpcMissing = true;
        console.warn("booked_days RPC → fallback:", err);
      }
    }

    const orders = await listOrders();
    const dates = new Set();
    (orders || []).forEach((o) => {
      if (o.status === "rejected") return;
      const d = String(o.event_date || "").slice(0, 10);
      if (d) dates.add(d);
    });
    return [...dates];
  }

  async function listOrders() {
    try {
      const sb = await getClient();
      if (sb) {
        const { data, error } = await sb
          .from("orders")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return withoutDeleted(data);
      }
    } catch (err) {
      console.warn("listOrders cloud → local:", err);
    }
    return withoutDeleted(readLocal(KEYS.orders, []));
  }

  async function updateOrderStatus(id, status) {
    try {
      const sb = await getClient();
      if (sb) {
        const { data, error } = await sb
          .from("orders")
          .update({ status })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    } catch (err) {
      console.warn("updateOrderStatus cloud → local:", err);
    }

    const all = readLocal(KEYS.orders, []);
    const idx = all.findIndex((o) => o.id === id);
    if (idx < 0) return null;
    all[idx] = { ...all[idx], status };
    writeLocal(KEYS.orders, all);
    return all[idx];
  }

  async function updateOrderPayment(id, amountPaid) {
    const paid = Math.max(0, Number(amountPaid) || 0);
    const patch = { amount_paid: paid };

    try {
      const sb = await getClient();
      if (sb) {
        let { data, error } = await sb
          .from("orders")
          .update(patch)
          .eq("id", id)
          .select()
          .single();
        if (error && /amount_paid/i.test(String(error.message || ""))) {
          const { data: current } = await sb
            .from("orders")
            .select("notes")
            .eq("id", id)
            .maybeSingle();
          const notes = upsertPaidInNotes(current?.notes || "", paid);
          ({ data, error } = await sb
            .from("orders")
            .update({ notes })
            .eq("id", id)
            .select()
            .single());
        }
        if (error) throw error;
        return data;
      }
    } catch (err) {
      console.warn("updateOrderPayment cloud → local:", err);
    }

    const all = readLocal(KEYS.orders, []);
    const idx = all.findIndex((o) => o.id === id);
    if (idx < 0) return null;
    all[idx] = {
      ...all[idx],
      amount_paid: paid,
      notes: upsertPaidInNotes(all[idx].notes || "", paid),
    };
    writeLocal(KEYS.orders, all);
    return all[idx];
  }

  function upsertPaidInNotes(notes, paid) {
    const parts = String(notes || "")
      .split("|")
      .map((p) => p.trim())
      .filter((p) => p && !/^المدفوع\s*:/.test(p));
    parts.push(`المدفوع: ${paid.toLocaleString("en-US")} ر.س`);
    return parts.join(" | ");
  }

  /**
   * حذف طلب نهائياً من الموقع.
   * نجرّب بالترتيب حتى ينجح واحد مع صلاحيات السحابة الحالية:
   *  1) DELETE فعلي للصف
   *  2) status = 'deleted'
   *  3) status = 'rejected' + علامة حذف في الملاحظات (يتحرر التاريخ ويختفي الطلب)
   */
  async function deleteOrder(id) {
    rememberDeleted(id);

    let cloudOk = false;
    try {
      const sb = await getClient();
      if (sb) {
        // 1) حذف فعلي — RLS قد يمنعه بصمت فنتحقق من عدد الصفوف المحذوفة
        const { data: removed } = await sb
          .from("orders")
          .delete()
          .eq("id", id)
          .select("id");
        cloudOk = Boolean(removed?.length);

        // 2) تعليمه محذوفاً (يفشل إن كان قيد status لا يسمح بالقيمة)
        if (!cloudOk) {
          const { data: marked } = await sb
            .from("orders")
            .update({ status: "deleted" })
            .eq("id", id)
            .select("id");
          cloudOk = Boolean(marked?.length);
        }

        // 3) الحل المتوافق مع القيد الحالي: مرفوض + علامة في الملاحظات
        if (!cloudOk) {
          const { data: current } = await sb
            .from("orders")
            .select("notes")
            .eq("id", id)
            .maybeSingle();
          const notes = String(current?.notes || "");
          const { data: hidden } = await sb
            .from("orders")
            .update({
              status: "rejected",
              notes: notes.startsWith(DELETED_MARK) ? notes : `${DELETED_MARK}${notes}`,
            })
            .eq("id", id)
            .select("id");
          cloudOk = Boolean(hidden?.length);
        }
      }
    } catch (err) {
      console.warn("deleteOrder cloud → local:", err);
    }

    const all = readLocal(KEYS.orders, []);
    writeLocal(
      KEYS.orders,
      all.filter((o) => String(o.id) !== String(id))
    );
    return { ok: true, cloud: cloudOk };
  }

  /**
   * يسجّل سطراً في جدول الزيارات مرة واحدة لكل جلسة ولكل مفتاح.
   * path = "/" للزيارة العادية، و "step/date" لخطوات الحجز (قياس أين يتوقف الزوار).
   */
  async function recordVisitRow(path, onceKey) {
    const sid = sessionId();
    const flag = `bakr-visited-${sid}-${onceKey}`;
    if (sessionStorage.getItem(flag)) return null;
    sessionStorage.setItem(flag, "1");

    const row = {
      created_at: new Date().toISOString(),
      path: path || "/",
      session_id: sid,
    };

    try {
      const sb = await getClient();
      if (sb) {
        // بدون select() — الزائر يضيف ولا يقرأ
        const { error } = await sb.from("visits").insert(row);
        if (error) throw error;
        return row;
      }
    } catch (err) {
      console.warn("trackVisit cloud → local:", err);
    }

    const localRow = { id: uid(), ...row };
    const all = readLocal(KEYS.visits, []);
    all.push(localRow);
    writeLocal(KEYS.visits, all);
    return localRow;
  }

  function trackVisit(path) {
    return recordVisitRow(path, "visit");
  }

  /** يسجّل أن الزائر وصل لخطوة معيّنة في الحجز */
  function trackStep(step) {
    const name = String(step || "").trim();
    if (!name) return Promise.resolve(null);
    return recordVisitRow(`${STEP_PREFIX}${name}`, `step-${name}`);
  }

  /** true إذا كان السطر خطوة حجز وليس زيارة للموقع */
  function isStepRow(row) {
    return String(row?.path || "").startsWith(STEP_PREFIX);
  }

  function stepName(row) {
    return String(row?.path || "").slice(STEP_PREFIX.length);
  }

  async function listVisits() {
    try {
      const sb = await getClient();
      if (sb) {
        const { data, error } = await sb
          .from("visits")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      }
    } catch (err) {
      console.warn("listVisits cloud → local:", err);
    }
    return readLocal(KEYS.visits, []);
  }

  /** بلاغ مشكلة من زائر الموقع — يصل مباشرة للإدارة */
  async function reportIssue(payload) {
    const row = {
      created_at: new Date().toISOString(),
      message: String(payload?.message || "").trim(),
      contact: String(payload?.contact || "").trim(),
      page: String(payload?.page || "").trim(),
      step: String(payload?.step || "").trim(),
      user_agent: String(payload?.userAgent || "").slice(0, 300),
      session_id: sessionId(),
      status: "open",
    };

    try {
      const sb = await getClient();
      if (sb) {
        const { error } = await sb.from("issue_reports").insert(row);
        if (error) throw error;
        return { ...row, saved: true };
      }
    } catch (err) {
      console.warn("reportIssue cloud → local:", err);
    }

    const localRow = { id: uid(), ...row };
    const all = readLocal(KEYS.issues, []);
    all.unshift(localRow);
    writeLocal(KEYS.issues, all);
    return { ...localRow, saved: !hasCloud() };
  }

  async function listIssueReports() {
    try {
      const sb = await getClient();
      if (sb) {
        const { data, error } = await sb
          .from("issue_reports")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      }
    } catch (err) {
      console.warn("listIssueReports cloud → local:", err);
    }
    return readLocal(KEYS.issues, []);
  }

  async function updateIssueStatus(id, status) {
    try {
      const sb = await getClient();
      if (sb) {
        const { data, error } = await sb
          .from("issue_reports")
          .update({ status })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    } catch (err) {
      console.warn("updateIssueStatus cloud → local:", err);
    }

    const all = readLocal(KEYS.issues, []);
    const idx = all.findIndex((o) => o.id === id);
    if (idx < 0) return null;
    all[idx] = { ...all[idx], status };
    writeLocal(KEYS.issues, all);
    return all[idx];
  }

  async function getReviewEvent(orderId) {
    const id = String(orderId || "").trim();
    if (!id) return null;
    try {
      const sb = await getClient();
      if (sb) {
        const { data, error } = await sb.rpc("review_event_info", { p_order_id: id });
        if (!error && Array.isArray(data) && data[0]) return data[0];
      }
    } catch (err) {
      console.warn("getReviewEvent:", err);
    }
    const orders = readLocal(KEYS.orders, []);
    const row = orders.find((o) => String(o.id) === id);
    if (!row || row.status !== "accepted") return null;
    return {
      package_name: row.package_name,
      event_date: row.event_date,
      event_label: row.event_label,
      city_label: row.city_label,
      hall_name: row.hall_name,
    };
  }

  async function submitReview(payload) {
    const row = {
      created_at: new Date().toISOString(),
      order_id: payload.orderId || null,
      first_name: String(payload.firstName || "").trim(),
      last_name: String(payload.lastName || "").trim(),
      package_name: String(payload.packageName || "").trim(),
      rating: Math.max(1, Math.min(5, Number(payload.rating) || 0)),
      event_date: String(payload.eventDate || "").slice(0, 10),
      comment: String(payload.comment || "").trim(),
      city_label: String(payload.cityLabel || "").trim(),
      event_label: String(payload.eventLabel || "").trim(),
      status: "pending",
    };
    if (row.first_name.length < 2 || row.last_name.length < 2) {
      throw new Error("اكتب الاسم الأول والثاني");
    }
    if (!row.package_name) throw new Error("اختر نوع البكج");
    if (!row.event_date) throw new Error("اختر تاريخ المناسبة");
    if (row.rating < 1) throw new Error("اختر التقييم بالنجوم");

    try {
      const sb = await getClient();
      if (sb) {
        const { error } = await sb.from("hospitality_reviews").insert(row);
        if (error) throw error;
        return { ...row, saved: true };
      }
    } catch (err) {
      console.warn("submitReview cloud → local:", err);
      if (hasCloud()) throw err;
    }

    const localRow = { id: uid(), ...row };
    const all = readLocal(KEYS.reviews, []);
    all.unshift(localRow);
    writeLocal(KEYS.reviews, all);
    return { ...localRow, saved: true };
  }

  async function listApprovedReviews() {
    try {
      const sb = await getClient();
      if (sb) {
        const { data, error } = await sb
          .from("hospitality_reviews")
          .select("id,created_at,first_name,last_name,package_name,rating,event_date,comment,city_label,event_label")
          .eq("status", "approved")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      }
    } catch (err) {
      console.warn("listApprovedReviews cloud → local:", err);
    }
    return readLocal(KEYS.reviews, []).filter((r) => r.status === "approved");
  }

  async function listReviews() {
    try {
      const sb = await getClient();
      if (sb) {
        const { data, error } = await sb
          .from("hospitality_reviews")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      }
    } catch (err) {
      console.warn("listReviews cloud → local:", err);
    }
    return readLocal(KEYS.reviews, []);
  }

  async function updateReviewStatus(id, status) {
    try {
      const sb = await getClient();
      if (sb) {
        const { data, error } = await sb
          .from("hospitality_reviews")
          .update({ status })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    } catch (err) {
      console.warn("updateReviewStatus cloud → local:", err);
    }
    const all = readLocal(KEYS.reviews, []);
    const idx = all.findIndex((o) => String(o.id) === String(id));
    if (idx < 0) return null;
    all[idx] = { ...all[idx], status };
    writeLocal(KEYS.reviews, all);
    return all[idx];
  }

  global.BakrStore = {
    createOrder,
    listOrders,
    listBookedDates,
    updateOrderStatus,
    updateOrderPayment,
    deleteOrder,
    isDeletedOrder,
    trackVisit,
    trackStep,
    isStepRow,
    stepName,
    listVisits,
    reportIssue,
    listIssueReports,
    updateIssueStatus,
    getReviewEvent,
    submitReview,
    listApprovedReviews,
    listReviews,
    updateReviewStatus,
    signIn,
    signOut,
    currentUser,
    ping,
    hasCloud,
    storageMode: () => (hasCloud() ? "cloud" : "local"),
  };
})(window);
