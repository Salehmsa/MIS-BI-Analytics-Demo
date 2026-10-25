/* =====================================================================
   مشروع MIS - تحليل البيانات بـ SQL Server  (ملف المقابلة)
   الدور: محلل بيانات / مطور ذكاء أعمال
   قاعدة البيانات: MIS_BI   |   البيانات: اصطناعية بالكامل
   ---------------------------------------------------------------------
   طريقة الاستخدام:
     1) شغّل القسم 0 مرة واحدة (إنشاء الـ Views): ظلّله ثم F5
     2) لكل سؤال: ظلّل الاستعلام فقط ثم F5  (الإجابة في التعليق تحته)
   ملاحظة: الإيراد بالمليون، وحدة العملة غير محددة، والأهداف اصطناعية.
   ===================================================================== */

USE MIS_BI;
GO

/* =====================================================================
   القسم 0: طبقات الـ Views
   ===================================================================== */

-- الطبقة 1: تنظيف fact_sales
--   * إزالة المكرر (نسخة واحدة لكل order_line_id)
--   * الخصم الفارغ = 0 ويُوسَم
--   * تاريخ تسليم أقدم من الطلب = NULL ويُوسَم
--   * الكمية السالبة تُوسَم ولا تُحذف (قد تكون مرتجعًا)
CREATE OR ALTER VIEW dbo.vw_fact_sales_clean AS
SELECT order_id, order_line_id, order_date,
       CASE WHEN delivery_date < order_date THEN NULL ELSE delivery_date END AS delivery_date,
       promised_date, customer_id, product_id, branch_id, rep_id,
       quantity, unit_price,
       ISNULL(discount_pct, 0) AS discount_pct,
       unit_cost, order_status,
       CASE WHEN discount_pct IS NULL       THEN 1 ELSE 0 END AS flag_discount_missing,
       CASE WHEN delivery_date < order_date THEN 1 ELSE 0 END AS flag_bad_delivery_date,
       CASE WHEN quantity < 0               THEN 1 ELSE 0 END AS flag_negative_qty
FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY order_line_id ORDER BY (SELECT NULL)) AS rn
    FROM dbo.fact_sales
) x
WHERE rn = 1;
GO

-- الطبقة 2: للتحليل بـ SQL فقط (في Power BI نستخدم النموذج المنفصل)
CREATE OR ALTER VIEW dbo.vw_sales_enriched AS
SELECT s.order_id, s.order_line_id, s.order_date, s.delivery_date, s.promised_date,
       s.customer_id, s.rep_id, s.branch_id, b.branch_name,
       r.region_id, r.region_name_en AS region,
       cat.category_name, sub.subcategory_name, p.product_id, p.product_name,
       d.year, d.quarter, d.year_month,
       s.quantity, s.unit_price, s.discount_pct, s.unit_cost, s.order_status,
       s.unit_price * (1 - s.discount_pct)                  AS net_unit_price,
       s.quantity * s.unit_price * (1 - s.discount_pct)     AS net_revenue,
       s.quantity * s.unit_cost                             AS cost,
       CASE WHEN s.order_status <> 'Cancelled' AND s.quantity > 0
            THEN 1 ELSE 0 END                               AS is_valid_sale,
       CASE WHEN s.unit_price * (1 - s.discount_pct) < s.unit_cost
            THEN 1 ELSE 0 END                               AS is_below_cost
FROM dbo.vw_fact_sales_clean s
JOIN dbo.dim_product     p   ON p.product_id       = s.product_id
JOIN dbo.dim_subcategory sub ON sub.subcategory_id = p.subcategory_id
JOIN dbo.dim_category    cat ON cat.category_id    = sub.category_id
JOIN dbo.dim_branch      b   ON b.branch_id        = s.branch_id
JOIN dbo.dim_region      r   ON r.region_id        = b.region_id
JOIN dbo.dim_date        d   ON d.date_key         = s.order_date;
GO

-- تحقق: الرقمان يجب أن يكونا 35225
SELECT (SELECT COUNT(*) FROM dbo.vw_fact_sales_clean) AS clean_rows,
       (SELECT COUNT(*) FROM dbo.vw_sales_enriched)   AS enriched_rows;
GO


/* =====================================================================
   Q1. هل نحقق الهدف وهل ننمو؟   [CTE + JOIN + LAG]
   ===================================================================== */
WITH rev AS (
    SELECT year, quarter, SUM(net_revenue) AS revenue
    FROM dbo.vw_sales_enriched
    WHERE is_valid_sale = 1
    GROUP BY year, quarter
),
tgt AS (
    SELECT d.year, d.quarter, SUM(t.target_net_revenue) AS target
    FROM dbo.fact_target_monthly t
    JOIN dbo.dim_date d ON d.date_key = t.month_start
    GROUP BY d.year, d.quarter
)
SELECT r.year, r.quarter,
       CAST(r.revenue / 1e6 AS DECIMAL(8,2))              AS revenue_m,
       CAST(t.target  / 1e6 AS DECIMAL(8,2))              AS target_m,
       CAST(100.0 * r.revenue / t.target AS DECIMAL(5,1)) AS attainment_pct,
       CAST(100.0 * (r.revenue / LAG(r.revenue, 4) OVER (ORDER BY r.year, r.quarter) - 1)
            AS DECIMAL(5,1))                              AS yoy_growth_pct
FROM rev r
JOIN tgt t ON t.year = r.year AND t.quarter = r.quarter
ORDER BY r.year, r.quarter;
/* الإجابة:
   - الإيراد ينمو: ربع 3 2026 = 214.2 مليون، أي +21% عن الربع نفسه قبل سنة.
   - الهدف لم يتحقق في أي ربع من الثمانية (96% - 99%)، وأقربها ربع 3 2026 (98.9%).
   - الخلاصة: الإيراد جيد لكنه لا يكشف تسرب الربحية والخدمة (الأسئلة التالية).
   (أرقام هذا الاستعلام محسوبة من الملفات الأصلية: قارنها بنتيجتك) */
GO


/* =====================================================================
   Q2. أي فئة تآكل هامشها؟   [View + تجميع]
   ===================================================================== */
SELECT category_name, year, quarter,
       CAST(SUM(net_revenue) / 1e6 AS DECIMAL(8,2))                        AS net_rev_m,
       CAST(100.0 * AVG(discount_pct) AS DECIMAL(5,1))                     AS avg_discount_pct,
       CAST(100.0 * (SUM(net_revenue) - SUM(cost)) / SUM(net_revenue) AS DECIMAL(5,1)) AS gross_margin_pct
FROM dbo.vw_sales_enriched
WHERE is_valid_sale = 1
GROUP BY category_name, year, quarter
ORDER BY category_name, year, quarter;
/* الإجابة:
   - Networking وحدها: الخصم من ~5% إلى ~17%، والهامش من ~17.7% إلى ~5.7% (ربعا 2 و3 من 2026).
   - البداية في مارس 2026 (ربع 1 مختلط: خصم 9.0% وهامش 13.9%).
   - الفئات الأخرى مستقرة: Hardware ~17.5% ، Managed Services ~40% ، Software ~40%.
   - الخصم تضاعف 3.4 مرة والإيراد لم يتحرك (55.5 مقابل 53.8 قبل سنة، +3%): الخصم لم يشترِ حجمًا. */
GO


/* =====================================================================
   Q3. هل بعنا بأقل من التكلفة؟   [View + HAVING]
   ===================================================================== */
SELECT category_name, year, quarter,
       COUNT(*)                                                  AS total_lines,
       SUM(is_below_cost)                                        AS below_cost_lines,
       CAST(100.0 * SUM(is_below_cost) / COUNT(*) AS DECIMAL(5,1)) AS pct_below_cost,
       CAST(SUM(CASE WHEN is_below_cost = 1
                     THEN (unit_cost - net_unit_price) * quantity ELSE 0 END) / 1e6
            AS DECIMAL(8,2))                                     AS loss_m
FROM dbo.vw_sales_enriched
WHERE is_valid_sale = 1
GROUP BY category_name, year, quarter
HAVING SUM(is_below_cost) > 0
ORDER BY category_name, year, quarter;
/* الإجابة:
   - Networking: لا سطور خاسرة قبل 2026، ثم ~25% من سطورها في الربعين الأخيرين تُباع تحت التكلفة.
   - الخسارة الفعلية ~1.07 مليون في الربعين الأخيرين (1.26 مليون منذ مارس).
   - Hardware < 1% وخسارة 0.00: ضوضاء طبيعية بسبب هامشها الضيق.
   - الصياغة الدقيقة: السطور الخاسرة (~0.5 مليون/ربع) رأس الجبل؛ الأثر الأكبر هو تنازل الهامش
     عن كل السطور (12 نقطة على ~55 مليون). التكلفة معيارية ولا تشمل الشحن أو الضمان. */
GO


/* =====================================================================
   Q4. أين ومتى انهار التسليم؟   [View + نسب]
   ===================================================================== */
SELECT year_month,
       COUNT(*)                                                       AS delivered_lines,
       CAST(100.0 * SUM(CASE WHEN delivery_date <= promised_date THEN 1 ELSE 0 END)
            / COUNT(*) AS DECIMAL(5,1))                               AS on_time_pct,
       CAST(AVG(1.0 * DATEDIFF(DAY, order_date, delivery_date)) AS DECIMAL(4,1)) AS avg_delivery_days
FROM dbo.vw_sales_enriched
WHERE region = 'Eastern'
  AND delivery_date IS NOT NULL
GROUP BY year_month
ORDER BY year_month;
/* الإجابة:
   - المنطقة الشرقية في مارس 2026: التسليم في الموعد من 83.4% (فبراير) إلى 8.1%،
     ومتوسط الأيام من 3.6 إلى 8.5.
   - قفزة مفاجئة (-75 نقطة بينما التذبذب الطبيعي ±10) وبقيت 7 أشهر بلا تعافٍ.
   - الحجم ثابت (ليس ضغط طلب). الفرعان انهارا معًا (Dammam 88.2 -> 7.8 ، Khobar 89.5 -> 11.5)،
     فالسبب مشترك على مستوى المنطقة (لوجستيات إقليمية) لا إدارة فرع.
   - البيانات تقول أين ومتى؛ لماذا تحتاج بيانات الشحن. */
GO


/* =====================================================================
   Q5. أين تدهورت خدمة الدعم؟   [CTE + JOIN + SLA + CSAT]
   ===================================================================== */
WITH t AS (
    SELECT tk.*, b.region_id,
           DATEDIFF(MINUTE, tk.created_at, tk.resolved_at) / 60.0 AS res_hours
    FROM dbo.fact_support_ticket tk
    JOIN dbo.dim_branch b ON b.branch_id = tk.branch_id
)
SELECT r.region_name_en AS region, d.year, d.quarter,
       COUNT(*)                                                  AS tickets,
       CAST(100.0 * SUM(CASE WHEN t.res_hours <= t.sla_hours THEN 1 ELSE 0 END)
            / NULLIF(COUNT(t.resolved_at), 0) AS DECIMAL(5,1))   AS sla_pct,
       CAST(AVG(t.res_hours)  AS DECIMAL(6,1))                   AS avg_res_hours,
       CAST(AVG(t.csat_score) AS DECIMAL(3,2))                   AS avg_csat
FROM t
JOIN dbo.dim_region r ON r.region_id = t.region_id
JOIN dbo.dim_date   d ON d.date_key  = CAST(t.created_at AS DATE)
GROUP BY r.region_name_en, d.year, d.quarter
ORDER BY r.region_name_en, d.year, d.quarter;
/* الإجابة:
   - المنطقة الغربية من مارس 2026: الالتزام بالـ SLA من ~82-90% إلى 45.6% ثم 43.8%.
   - زمن الحل من 20-24 ساعة إلى 43.5 ثم 36.4 ساعة؛ رضا العملاء من ~4.0 إلى 3.54 ثم 3.41.
   - عدد التذاكر ثابت (233-258): المشكلة في سرعة المعالجة لا في الحجم.
   - المناطق الأخرى مستقرة (Southern ربع 1 2026 = 78.4% ضمن التذبذب الطبيعي). */
GO


/* =====================================================================
   Q6. هل تغير نوع شكاوى المنطقة الشرقية؟   [CTE + Window SUM OVER PARTITION]
   ===================================================================== */
WITH t AS (
    SELECT tk.ticket_category,
           CASE WHEN tk.created_at >= '2026-03-01' THEN 'After' ELSE 'Before' END AS period
    FROM dbo.fact_support_ticket tk
    JOIN dbo.dim_branch b ON b.branch_id = tk.branch_id
    WHERE b.region_id = 3                      -- Eastern
),
agg AS (
    SELECT period, ticket_category, COUNT(*) AS n FROM t GROUP BY period, ticket_category
)
SELECT period, ticket_category, n,
       CAST(100.0 * n / SUM(n) OVER (PARTITION BY period) AS DECIMAL(5,1)) AS pct_of_period
FROM agg
ORDER BY period DESC, n DESC;
/* الإجابة:
   - حصة Delivery Delay قفزت من 20.4% إلى 40.2%.
   - الفترتان مختلفتا الطول (17 شهرًا قبل و7 بعد)، فبالمعدل الشهري:
     233/17 = 13.7  ->  225/7 = 32.1 تذكرة/شهر (x2.3)، والفئات الأخرى شبه ثابتة.
   - الخلاصة: انهيار التسليم في الشرقية ظهر مباشرة في شكاوى العملاء. */
GO


/* =====================================================================
   Q7. هل يشتكي العميل الذي تأخر طلبه فعلًا؟   [CTE + EXISTS + اختبار ارتباط]
   ===================================================================== */
WITH orders AS (
    SELECT order_id, customer_id, region,
           MAX(delivery_date) AS delivery_date,
           MAX(promised_date) AS promised_date
    FROM dbo.vw_sales_enriched
    WHERE delivery_date IS NOT NULL AND order_status <> 'Cancelled'
    GROUP BY order_id, customer_id, region
),
flagged AS (
    SELECT o.*,
           CASE WHEN o.delivery_date > o.promised_date THEN 'Late' ELSE 'On-time' END AS delivery_status,
           CASE WHEN EXISTS (
                    SELECT 1 FROM dbo.fact_support_ticket t
                    WHERE t.customer_id = o.customer_id
                      AND t.ticket_category = 'Delivery Delay'
                      AND CAST(t.created_at AS DATE)
                          BETWEEN o.delivery_date AND DATEADD(DAY, 14, o.delivery_date)
                ) THEN 1 ELSE 0 END AS had_ticket
    FROM orders o
)
SELECT region, delivery_status,
       COUNT(*)          AS orders,
       SUM(had_ticket)   AS orders_with_ticket,
       CAST(100.0 * SUM(had_ticket) / COUNT(*) AS DECIMAL(5,2)) AS pct_with_ticket
FROM flagged
GROUP BY region, delivery_status
ORDER BY region, delivery_status;
/* الإجابة (بحذر مقصود):
   - Central: 8.20% مقابل 8.17% ، Western: 7.52% مقابل 8.81%  -> لا فرق.
   - Eastern: 15.5% مقابل 10.3% لكنه قد يكون أثر الفترة الزمنية لا الطلب نفسه
     (الطلبات المتأخرة تقع بعد مارس حين تضاعفت الشكاوى للمنطقة كلها = متغير مُربِك).
   - جملة المقابلة: "أثبتُّ ارتباطًا زمنيًا على مستوى المنطقة، أما السببية على مستوى الطلب
     الواحد فلم تتأكد، وتحتاج ربط التذكرة برقم الطلب."
   - تمرين: كرر الاستعلام للشرقية فقط بعد 2026-03-01 وقارن. */
GO


/* =====================================================================
   Q8. ما حجم مشاكل البيانات وكيف عالجتها؟   [فحوص جودة على الجداول الخام]
   ===================================================================== */
SELECT '1. discount_pct NULL' AS check_name, COUNT(*) AS rows_found
FROM dbo.fact_sales WHERE discount_pct IS NULL
UNION ALL SELECT '2. delivery_date < order_date', COUNT(*) FROM dbo.fact_sales WHERE delivery_date < order_date
UNION ALL SELECT '3. quantity < 0', COUNT(*) FROM dbo.fact_sales WHERE quantity < 0
UNION ALL SELECT '4. duplicate rows (extra copies)', COUNT(*) - COUNT(DISTINCT order_line_id) FROM dbo.fact_sales
UNION ALL SELECT '5. city spelling not standard', COUNT(*)
FROM dbo.dim_customer
WHERE city COLLATE Latin1_General_BIN NOT IN
 ('Riyadh','Buraydah','Jeddah','Makkah','Taif','Dammam','Khobar','Hofuf','Abha','Jazan','Khamis Mushait')
UNION ALL SELECT '6. segment NULL', COUNT(*) FROM dbo.dim_customer WHERE segment IS NULL;

-- بعد المعالجة (من طبقة التنظيف):
SELECT COUNT(*)                    AS total_rows,
       SUM(flag_discount_missing)  AS discount_missing,
       SUM(flag_bad_delivery_date) AS bad_delivery_date,
       SUM(flag_negative_qty)      AS negative_qty
FROM dbo.vw_fact_sales_clean;
/* الإجابة:
   - 6 أنواع: خصم فارغ (707) ، تاريخ تسليم قبل الطلب (103) ، كمية سالبة (142) ،
     176 صفًا مكررًا ، 12 تهجئة مدينة غير موحدة ، 3 عملاء بلا segment.
   - المعالجة في vw_fact_sales_clean: 35,401 -> 35,225 صفًا ، والعلامات: 704 / 101 / 141.
   - القواعد: مكرر = حذف النسخ الزائدة | خصم فارغ = 0 + وسم | تاريخ تسليم خاطئ = NULL + وسم
              كمية سالبة = وسم دون حذف (قد تكون مرتجعًا).
   - المدن والـ segment تُعالج في Power Query (ETL). */
GO


/* =====================================================================
   قصة المشروع في 30 ثانية
   "بنيت تحليلًا كاملًا على بيانات اصطناعية لشركة تقنية في أربع مناطق. الإيراد ينمو 21%
   سنويًا، لكن ثلاث مشاكل بدأت معًا في مارس 2026: انهيار التسليم في الشرقية، وتآكل هامش
   Networking بسبب خصومات تضاعفت 3.4 مرة، وتدهور خدمة الدعم في الغربية. ربطت تأخر التسليم
   بزيادة الشكاوى على مستوى المنطقة، وأقررتُ بأن الربط على مستوى الطلب غير مثبت. وعالجتُ
   جودة البيانات بقواعد موثقة."

   نقاط الضعف (قلها قبل أن تُسأل): البيانات اصطناعية ، التكلفة معيارية ،
   الأسباب الجذرية تحتاج بيانات غير متوفرة (الشحن، قرارات التسعير) ، الأهداف اصطناعية.
   ===================================================================== */
