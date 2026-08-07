/**
 * =========================================================
 * شاي بكر — كتالوج الأعمال (عدّل هنا بسهولة)
 * =========================================================
 * هذا الملف مصدر البيانات الوحيد للمنتجات والأسعار والمدن.
 * أي إضافة جديدة (بكج / إضافة / مدينة) ضعها هنا فقط.
 * =========================================================
 */
(function (global) {
  const catalog = {
    /** رقم واتساب بصيغة دولية بدون + */
    waNumber: "966533508361",

    cities: [
      { id: "makkah", label: "مكة المكرمة" },
      { id: "jeddah", label: "جدة" },
      { id: "taif", label: "الطائف" },
    ],

    events: [
      { id: "wedding", label: "زواج" },
      { id: "milkah", label: "ملكة" },
      { id: "special", label: "مناسبة خاصة" },
      { id: "other", label: "أخرى" },
    ],

    /**
     * البكجات
     * id: معرّف ثابت (لا تغيّره بعد الإطلاق إن أمكن)
     * price: بالريال
     * featured: يظهر كمميز في الواجهة
     */
    packages: [
      {
        id: "silver",
        name: "البكج الفضي",
        price: 2800,
        guests: "حتى 150 ضيف",
        badge: "خيار عملي",
        image: "./assets/corner.jpg",
        features: [
          "كورنر ضيافة بطول 5 متر",
          "شاي أحمر وأعشاب وليمون وأناناس وكرك",
          "سخانات شعبية",
          "حلويات شرقية",
        ],
      },
      {
        id: "gold",
        name: "البكج الذهبي",
        price: 3800,
        guests: "حتى 200 ضيف",
        badge: "الأكثر طلباً",
        featured: true,
        image: "./assets/hero.jpg",
        features: [
          "كورنر ضيافة بطول 6 متر",
          "4 أنواع شاي (250 حبة)",
          "مباشرين + مشرف",
          "معجنات وحلويات",
          "بخور",
        ],
      },
      {
        id: "royal",
        name: "البكج الملكي",
        price: 4800,
        guests: "حتى 250 ضيف",
        badge: "الأكثر اكتمالاً",
        image: "./assets/corner.jpg",
        features: [
          "كورنر سعودي بطول 6 متر",
          "6 أنواع شاي (250 حبة)",
          "مباشرين + مشرف",
          "ضيافة شعبية",
          "معجنات وحلويات وبخور",
        ],
      },
    ],

    /** الإضافات — أضف سطراً جديداً بنفس الشكل */
    addons: [
      { id: "marqooq", name: "سخان مرقوق فخار 6 لتر", price: 300 },
      { id: "jareesh", name: "سخان جريش بالسمن 6 لتر", price: 300 },
      { id: "qursan", name: "سخان قرصان بالسمن والعسل 6 لتر", price: 200 },
      { id: "arika", name: "سخان عريكة بالتمر 6 لتر", price: 200 },
      { id: "fatta", name: "سخان فتة بالسمن 6 لتر", price: 200 },
      { id: "aish", name: "سخان عيش جنوبي 6 لتر", price: 200 },
      { id: "sababeeb", name: "صبابيب حجم كبير (سمن + عسل)", price: 180 },
      { id: "milla", name: "ملة حجم كبير مع الجبن والتمر", price: 150 },
      { id: "dates", name: "أهرامات التمر 200 حبة", price: 150 },
      { id: "sweets", name: "واحد كيلو حلويات شرقية", price: 95 },
      { id: "maamoul", name: "واحد كيلو معمول مشكل", price: 65 },
      { id: "pastries", name: "واحد كيلو معجنات مشكل", price: 65 },
      { id: "karkadeh", name: "كركديه ملكي 8 لتر", price: 250 },
      { id: "lemon", name: "عصير ليمون نعناع بارد 8 لتر", price: 250 },
    ],

    /** ترتيب خطوات الحجز — لا تحذف success من النهاية */
    flow: [
      "city",
      "event",
      "package",
      "addons",
      "date",
      "name",
      "phone",
      "location",
      "notes",
      "review",
      "success",
    ],
  };

  global.BAKR_CATALOG = catalog;

  // اختصارات عامة لسهولة الاستخدام في app.js (بدون تكرار البيانات)
  global.CITIES = catalog.cities;
  global.EVENTS = catalog.events;
  global.PACKAGES = catalog.packages;
  global.ADDONS = catalog.addons;
  global.FLOW = catalog.flow;
  global.WA_NUMBER = catalog.waNumber;
})(window);
