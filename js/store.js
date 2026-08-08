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
  };

  /**
   * علامة الحذف داخل حقل الملاحظات.
   * سبب وجودها: عمود status في السحابة مقيّد بـ pending/accepted/rejected،
   * وقد لا تكون صلاحية DELETE مفعّلة، فنحتاج علامة تعمل بصلاحية التحديث الحالية.
   */
  const DELETED_MARK = "__deleted__";

  function cfg() {
    return global.BAKR_CONFIG || {};
  }

  function hasCloud() {
    const c = cfg();
    const url = (c.supabaseUrl || "").trim();
    const key = (c.supabaseAnonKey || "").trim();
    return Boolean(url && key && !url.includes("YOUR_PROJECT") && key !== "YOUR_ANON_KEY");
  }

  let client = null;

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

  function isDeletedOrder(order) {
    if (!order) return false;
    if (order.status === "deleted") return true;
    if (String(order.notes || "").startsWith(DELETED_MARK)) return true;
    return deletedIds().includes(String(order.id));
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
      location_area: payload.locationArea || "",
      notes: payload.notes || "",
      hour_of_day: now.getHours(),
    };

    try {
      const sb = await getClient();
      if (sb) {
        // إن ما كان عمود location_area موجود في السحابة، نعيد المحاولة بدونه
        let { data, error } = await sb.from("orders").insert(row).select().single();
        if (error && /location_area/i.test(String(error.message || ""))) {
          const { location_area, ...fallback } = row;
          ({ data, error } = await sb.from("orders").insert(fallback).select().single());
        }
        if (error) throw error;
        // saved: true يعني وصل الطلب فعلاً للوحة الإدارة
        return { ...data, saved: true };
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
        return (data || []).filter((o) => !isDeletedOrder(o));
      }
    } catch (err) {
      console.warn("listOrders cloud → local:", err);
    }
    return readLocal(KEYS.orders, []).filter((o) => !isDeletedOrder(o));
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

  async function trackVisit(path) {
    const sid = sessionId();
    const flag = `bakr-visited-${sid}`;
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
        const { data, error } = await sb.from("visits").insert(row).select().single();
        if (error) throw error;
        return data;
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

  global.BakrStore = {
    createOrder,
    listOrders,
    listBookedDates,
    updateOrderStatus,
    deleteOrder,
    isDeletedOrder,
    trackVisit,
    listVisits,
    ping,
    hasCloud,
    storageMode: () => (hasCloud() ? "cloud" : "local"),
  };
})(window);
