/* Bilingual strings (English / Arabic) and locale-aware formatting. */
(function () {
  const S = {
    en: {
      title: 'MIS Executive Performance Dashboard',
      subtitle: 'Sales, targets, delivery and support in one view',
      synthetic: 'Synthetic demo data',
      asOf: 'Data as of', updated: 'Updated', lang: 'العربية',
      live: 'Live: updates automatically', staticFile: 'Static file: refreshes every minute', embedded: 'Embedded sample (open via the server for live updates)',
      period: 'Period', from: 'From', to: 'To', region: 'Region', branch: 'Branch', category: 'Category', all: 'All', reset: 'Reset filters',
      last3: 'Last 3 months', last6: 'Last 6 months', last12: 'Last 12 months', allTime: 'All data',
      catNote: 'Category applies to sales only. Targets are set per branch and tickets have their own categories.',
      tabOverview: 'Overview', tabSales: 'Sales & targets', tabDelivery: 'Delivery', tabSupport: 'Support', tabRisks: 'Risks & data',
      execSummary: 'Executive summary', vsPrev: 'vs previous period', na: 'n/a', noData: 'No data for this selection',
      kpiRevenue: 'Net revenue', kpiAttain: 'Target attainment', kpiMargin: 'Gross margin', kpiOnTime: 'On-time delivery', kpiSla: 'SLA compliance', kpiCsat: 'Avg CSAT',
      pp: 'pp', sar: 'SAR', m: 'M', bn: 'bn',
      statusGreen: 'On target', statusAmber: 'Watch', statusRed: 'Critical',
      thresholdsNote: 'Status thresholds are illustrative (editable in js/config.js).',
      chRevTarget: 'Net revenue vs target by month', chRevenue: 'Net revenue', chTarget: 'Target',
      chMarginCat: 'Gross margin by category: previous vs current period', chPrev: 'Previous period', chCur: 'Current period',
      chRevRegion: 'Net revenue by region and quarter', chDiscount: 'Average discount by category (monthly)',
      chReps: 'Sales rep leaderboard: net revenue', chRepMargin: 'Gross margin',
      chOnTime: 'On-time delivery by region (monthly)', heatOnTime: 'On-time delivery heatmap: region by month', chDays: 'Average delivery days by region',
      chSla: 'SLA compliance by region (monthly)', chCsat: 'Average CSAT by region', chTicketCat: 'Tickets by category', chPriority: 'Tickets by priority',
      mapHint: 'Click a region to filter the dashboard.',
      mapTitle: 'Regional map (schematic, not to scale)', mapMetric: 'Colour by',
      scorecard: 'Branch scorecard', exportCsv: 'Export CSV', exportPdf: 'Print / PDF', clickDrill: 'Click a row for details',
      colBranch: 'Branch', colRegion: 'Region', colRevenue: 'Net revenue', colAttain: 'Attainment', colMargin: 'Margin', colOnTime: 'On-time', colSla: 'SLA', colCsat: 'CSAT', colStatus: 'Status',
      drillBranch: 'Branch details', drillRep: 'Sales rep details', close: 'Close', mix: 'Revenue by category', monthly: 'Monthly net revenue',
      riskRegister: 'Risk register (rule-based)', riskHeat: 'Risk heatmap by region', riskNote: 'Compares the last {c} months of the selected period with the {b} months before them. Rules and thresholds: js/config.js.',
      colRisk: 'Risk', colScope: 'Scope', colCurrent: 'Current', colBaseline: 'Baseline', colChange: 'Change', colAction: 'Suggested action',
      showAll: 'Show all rules', showFlagged: 'Show flagged only', rulesChecked: '{n} rules checked, {r} critical, {a} watch',
      rDelivery: 'Delivery reliability', rSla: 'Support SLA', rCsat: 'Customer satisfaction', rMargin: 'Margin erosion', rDiscount: 'Discount creep', rBelowCost: 'Below-cost sales', rAttain: 'Target shortfall', rDq: 'Data quality',
      aDelivery: 'Investigate carriers and dispatch for this region; compare promised dates with actual capacity.',
      aSla: 'Review ticket staffing and escalation for this region; check backlog and priority mix.',
      aCsat: 'Review recent low-score tickets and close the loop with affected customers.',
      aMargin: 'Review pricing and discount approvals for this category.',
      aDiscount: 'Tighten discount approval limits and review exceptions for this category.',
      aBelowCost: 'Set a price floor above unit cost and require approval for exceptions.',
      aAttain: 'Review the pipeline and the target phasing for this region.',
      aDq: 'Fix the source systems that produce the flagged records (see data quality panel).',
      dataPanel: 'Data and ingestion', dqTitle: 'Data quality', dqLines: 'Sales lines', dqMissingDisc: 'Missing discount (filled with 0)', dqBadDate: 'Delivery before order (set to blank)', dqNegQty: 'Negative quantity (excluded from revenue)', dqDup: 'Duplicate rows removed', dqAny: 'Lines with any issue', dqOrphan: 'Rows with unknown keys (skipped)',
      ingestTitle: 'Latest ingestion activity', colTime: 'Time', colFile: 'File', colTable: 'Table', colResult: 'Result', ingestEmpty: 'No files ingested yet.',
      accepted: 'Accepted', acceptedRejects: 'Accepted with rejected rows', rejected: 'Rejected', skipped: 'Part skipped',
      inboxHelp: 'Drop CSV, XLSX or JSON files into the inbox folder. The dashboard refreshes by itself.',
      sum1: 'Net revenue was {rev} for the period ({dRev} vs the previous period), {att} of target ({gap}).',
      sum1na: 'Net revenue was {rev} for the period; attainment is not shown because targets are set per branch.',
      sum2: 'Gross margin is {gm} ({dGm}). {worst} has the largest margin decline: {wFrom} to {wTo}, with average discount at {wDisc}.',
      sum2b: 'Gross margin is {gm} ({dGm}). No category lost more than 2 pp of margin.',
      sum2c: 'Gross margin is {gm}.',
      sum3: 'On-time delivery is {ot} ({dOt}). {reg} is the weakest region at {regOt}.',
      sum4: 'SLA compliance is {sla} and average CSAT {csat}. {reg} is the weakest region (SLA {regSla}, CSAT {regCsat}).',
      sum5: '{r} critical and {a} watch items in the risk register for the latest {c} months.',
      flat: 'flat',
    },
    ar: {
      title: 'لوحة الأداء التنفيذية لـ MIS',
      subtitle: 'المبيعات والأهداف والتسليم والدعم في شاشة واحدة',
      synthetic: 'بيانات تجريبية اصطناعية',
      asOf: 'البيانات حتى', updated: 'آخر تحديث', lang: 'English',
      live: 'مباشر: يتحدّث تلقائيًا', staticFile: 'ملف ثابت: يتحدّث كل دقيقة', embedded: 'عيّنة مضمّنة (افتحها عبر الخادم للتحديث المباشر)',
      period: 'الفترة', from: 'من', to: 'إلى', region: 'المنطقة', branch: 'الفرع', category: 'الفئة', all: 'الكل', reset: 'إعادة ضبط الفلاتر',
      last3: 'آخر 3 أشهر', last6: 'آخر 6 أشهر', last12: 'آخر 12 شهرًا', allTime: 'كل البيانات',
      catNote: 'الفئة تنطبق على المبيعات فقط. الأهداف تُحدَّد لكل فرع، وللتذاكر فئاتها الخاصة.',
      tabOverview: 'نظرة عامة', tabSales: 'المبيعات والأهداف', tabDelivery: 'التسليم', tabSupport: 'الدعم', tabRisks: 'المخاطر والبيانات',
      execSummary: 'الملخص التنفيذي', vsPrev: 'مقارنة بالفترة السابقة', na: 'غير متاح', noData: 'لا توجد بيانات لهذا الاختيار',
      kpiRevenue: 'صافي الإيراد', kpiAttain: 'تحقيق الهدف', kpiMargin: 'هامش الربح الإجمالي', kpiOnTime: 'التسليم في الوقت', kpiSla: 'الالتزام بـ SLA', kpiCsat: 'متوسط رضا العملاء',
      pp: 'نقطة مئوية', sar: 'ر.س', m: 'مليون', bn: 'مليار',
      statusGreen: 'ضمن الهدف', statusAmber: 'مراقبة', statusRed: 'حرج',
      thresholdsNote: 'حدود الحالة توضيحية (قابلة للتعديل في js/config.js).',
      chRevTarget: 'صافي الإيراد مقابل الهدف شهريًا', chRevenue: 'صافي الإيراد', chTarget: 'الهدف',
      chMarginCat: 'هامش الربح حسب الفئة: الفترة السابقة والحالية', chPrev: 'الفترة السابقة', chCur: 'الفترة الحالية',
      chRevRegion: 'صافي الإيراد حسب المنطقة والربع', chDiscount: 'متوسط الخصم حسب الفئة (شهريًا)',
      chReps: 'ترتيب مندوبي المبيعات: صافي الإيراد', chRepMargin: 'هامش الربح',
      chOnTime: 'التسليم في الوقت حسب المنطقة (شهريًا)', heatOnTime: 'خريطة حرارية للتسليم في الوقت: المنطقة والشهر', chDays: 'متوسط أيام التسليم حسب المنطقة',
      chSla: 'الالتزام بـ SLA حسب المنطقة (شهريًا)', chCsat: 'متوسط رضا العملاء حسب المنطقة', chTicketCat: 'التذاكر حسب الفئة', chPriority: 'التذاكر حسب الأولوية',
      mapHint: 'اضغط على منطقة لتصفية اللوحة.',
      mapTitle: 'خريطة المناطق (تخطيطية، ليست بمقياس رسم)', mapMetric: 'التلوين حسب',
      scorecard: 'بطاقة أداء الفروع', exportCsv: 'تصدير CSV', exportPdf: 'طباعة / PDF', clickDrill: 'اضغط على صف لعرض التفاصيل',
      colBranch: 'الفرع', colRegion: 'المنطقة', colRevenue: 'صافي الإيراد', colAttain: 'تحقيق الهدف', colMargin: 'الهامش', colOnTime: 'في الوقت', colSla: 'SLA', colCsat: 'الرضا', colStatus: 'الحالة',
      drillBranch: 'تفاصيل الفرع', drillRep: 'تفاصيل مندوب المبيعات', close: 'إغلاق', mix: 'الإيراد حسب الفئة', monthly: 'صافي الإيراد الشهري',
      riskRegister: 'سجل المخاطر (قائم على قواعد)', riskHeat: 'خريطة المخاطر حسب المنطقة', riskNote: 'يقارن آخر {c} أشهر من الفترة المحددة بالأشهر الـ {b} التي قبلها. القواعد والحدود في js/config.js.',
      colRisk: 'الخطر', colScope: 'النطاق', colCurrent: 'الحالي', colBaseline: 'خط الأساس', colChange: 'التغيّر', colAction: 'الإجراء المقترح',
      showAll: 'عرض كل القواعد', showFlagged: 'عرض المنبَّه عليها فقط', rulesChecked: 'تم فحص {n} قاعدة: {r} حرجة و{a} للمراقبة',
      rDelivery: 'موثوقية التسليم', rSla: 'الالتزام بـ SLA في الدعم', rCsat: 'رضا العملاء', rMargin: 'تآكل الهامش', rDiscount: 'تصاعد الخصومات', rBelowCost: 'مبيعات تحت التكلفة', rAttain: 'العجز عن الهدف', rDq: 'جودة البيانات',
      aDelivery: 'افحص شركات الشحن والتوزيع في هذه المنطقة وقارن التواريخ الموعودة بالطاقة الفعلية.',
      aSla: 'راجع توزيع فريق التذاكر والتصعيد في هذه المنطقة، وافحص المتراكم وتوزيع الأولويات.',
      aCsat: 'راجع التذاكر الأخيرة ذات التقييم المنخفض وتواصل مع العملاء المتأثرين.',
      aMargin: 'راجع التسعير واعتماد الخصومات لهذه الفئة.',
      aDiscount: 'شدّد حدود اعتماد الخصم وراجع الاستثناءات لهذه الفئة.',
      aBelowCost: 'ضع حدًّا أدنى للسعر فوق تكلفة الوحدة واشترط الموافقة على الاستثناءات.',
      aAttain: 'راجع خط المبيعات المحتملة وتوزيع الهدف على الأشهر لهذه المنطقة.',
      aDq: 'أصلح الأنظمة المصدرية التي تنتج السجلات المنبَّه عليها (انظر لوحة جودة البيانات).',
      dataPanel: 'البيانات والاستيعاب', dqTitle: 'جودة البيانات', dqLines: 'سطور المبيعات', dqMissingDisc: 'خصم مفقود (يُملأ بصفر)', dqBadDate: 'تسليم قبل الطلب (يُترك فارغًا)', dqNegQty: 'كمية سالبة (تُستبعد من الإيراد)', dqDup: 'صفوف مكررة محذوفة', dqAny: 'سطور فيها أي مشكلة', dqOrphan: 'صفوف بمفاتيح غير معروفة (تُتجاوز)',
      ingestTitle: 'آخر نشاط استيعاب', colTime: 'الوقت', colFile: 'الملف', colTable: 'الجدول', colResult: 'النتيجة', ingestEmpty: 'لم يُستوعب أي ملف بعد.',
      accepted: 'مقبول', acceptedRejects: 'مقبول مع صفوف مرفوضة', rejected: 'مرفوض', skipped: 'جزء مُتجاوَز',
      inboxHelp: 'ضع ملفات CSV أو XLSX أو JSON في مجلد inbox، وتتحدّث اللوحة تلقائيًا.',
      sum1: 'بلغ صافي الإيراد {rev} في الفترة ({dRev} مقارنة بالفترة السابقة)، أي {att} من الهدف ({gap}).',
      sum1na: 'بلغ صافي الإيراد {rev} في الفترة؛ لا يُعرض تحقيق الهدف لأن الأهداف تُحدَّد لكل فرع.',
      sum2: 'هامش الربح الإجمالي {gm} ({dGm}). أكبر تراجع في الهامش في فئة {worst}: من {wFrom} إلى {wTo}، مع متوسط خصم {wDisc}.',
      sum2b: 'هامش الربح الإجمالي {gm} ({dGm}). لم تفقد أي فئة أكثر من نقطتين مئويتين من هامشها.',
      sum2c: 'هامش الربح الإجمالي {gm}.',
      sum3: 'التسليم في الوقت {ot} ({dOt}). أضعف المناطق {reg} بنسبة {regOt}.',
      sum4: 'الالتزام بـ SLA {sla} ومتوسط الرضا {csat}. أضعف المناطق {reg} (SLA {regSla}، الرضا {regCsat}).',
      sum5: '{r} عناصر حرجة و{a} للمراقبة في سجل المخاطر لآخر {c} أشهر.',
      flat: 'دون تغيّر',
    },
  };

  const state = { lang: 'en' };
  const locale = () => (state.lang === 'ar' ? 'ar-u-nu-latn' : 'en-US');   // Latin digits in both languages, for consistency with the BI reports

  function t(key, params) {
    let s = (S[state.lang] && S[state.lang][key]) ?? S.en[key] ?? key;
    if (params) for (const k of Object.keys(params)) s = s.split('{' + k + '}').join(params[k]);
    return s;
  }
  const nf = (opts) => new Intl.NumberFormat(locale(), opts);
  const fmt = {
    int: (n) => (n == null || !isFinite(n) ? '–' : nf({ maximumFractionDigits: 0 }).format(n)),
    dec: (n, d = 1) => (n == null || !isFinite(n) ? '–' : nf({ minimumFractionDigits: d, maximumFractionDigits: d }).format(n)),
    pct: (n, d = 1) => (n == null || !isFinite(n) ? '–' : nf({ minimumFractionDigits: d, maximumFractionDigits: d }).format(n) + '%'),
    /** money in SAR with M / bn suffix */
    sar: (n) => {
      if (n == null || !isFinite(n)) return '–';
      const a = Math.abs(n);
      if (a >= 1e9) return `${nf({ maximumFractionDigits: 2 }).format(n / 1e9)} ${t('bn')}`;
      if (a >= 1e6) return `${nf({ maximumFractionDigits: 1 }).format(n / 1e6)} ${t('m')}`;
      return nf({ maximumFractionDigits: 0 }).format(n);
    },
    signed: (n, d = 1, unit = '') => (n == null || !isFinite(n) ? '–' : '\u200E' + (n > 0 ? '+' : n < 0 ? '−' : '') + nf({ minimumFractionDigits: d, maximumFractionDigits: d }).format(Math.abs(n)) + unit),
    month: (ym) => new Intl.DateTimeFormat(state.lang === 'ar' ? 'ar-u-ca-gregory-nu-latn' : 'en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(ym + '-01T00:00:00Z')),
    quarter: (q) => q, // e.g. 2026-Q3 (same in both languages)
    dateTime: (iso) => new Intl.DateTimeFormat(state.lang === 'ar' ? 'ar-u-ca-gregory-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)),
    date: (s) => new Intl.DateTimeFormat(state.lang === 'ar' ? 'ar-u-ca-gregory-nu-latn' : 'en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(s + 'T00:00:00Z')),
  };
  const catAr = { Hardware: 'الأجهزة', Networking: 'الشبكات', 'Software & Licenses': 'البرمجيات والتراخيص', 'Managed Services': 'الخدمات المُدارة' };
  const ticketCatAr = { 'Technical Support': 'الدعم الفني', 'Delivery Delay': 'تأخر التسليم', 'Product Defect': 'عيب في المنتج', Billing: 'الفوترة', Licensing: 'التراخيص' };
  const priorityAr = { Critical: 'حرجة', High: 'عالية', Medium: 'متوسطة', Low: 'منخفضة' };
  const branchAr = { 'Riyadh HQ': 'الرياض (المقر)', 'Riyadh North': 'شمال الرياض', Jeddah: 'جدة', Makkah: 'مكة المكرمة', Dammam: 'الدمام', Khobar: 'الخبر', Abha: 'أبها', Jazan: 'جازان' };
  const tr = (map, v) => (state.lang === 'ar' && map[v]) || v;

  window.I18N = {
    t, fmt, state,
    setLang(l) { state.lang = l === 'ar' ? 'ar' : 'en'; document.documentElement.lang = state.lang; document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr'; },
    cat: (v) => tr(catAr, v), ticketCat: (v) => tr(ticketCatAr, v), priority: (v) => tr(priorityAr, v), branch: (v) => tr(branchAr, v),
    keys: S,
  };
})();
