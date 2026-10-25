# مقاييس DAX لمشروع MIS (جدول `_Measures`)

> عدد المقاييس: 46. كل مقياس: نوعه، السؤال الذي يجيب عنه، تنسيق العرض، والكود.
> أسماء الجداول: `vw_fact_sales_clean` (المبيعات) و`fact_support_ticket` (التذاكر) و`fact_target_monthly` (الأهداف) و`dim_date` (التواريخ).

## كيف تُنشئ مقياسًا
1. Report view ثم اضغط على الجدول `_Measures` في لوحة Data.
2. **Home ← New measure** (أو بزر الماوس الأيمن على الجدول ← New measure).
3. الصق كود مقياس واحد ثم Enter.
4. من **Measure tools** اختر **Format** حسب "التنسيق"، واكتب اسم المجلد في **Display folder**.
5. أنشئ المقاييس **بهذا الترتيب** (كل قسم يعتمد على ما قبله). بعد الانتهاء أخفِ العمود `Column1` من `_Measures`.

## أنواع المقاييس
| النوع | المعنى |
|---|---|
| KPI رئيسي | يظهر في بطاقات الصفحة التنفيذية ويُقاس به الأداء |
| KPI داعم | يفسّر أو يكمّل مؤشرًا رئيسيًا |
| أساسي (Base) | لبنة حساب يُبنى عليها غيره |
| مساعد (Helper) | وسيط لحساب مقياس آخر |
| تشخيصي | يكشف سببًا أو مشكلة (للتحليل لا للمتابعة اليومية) |
| حوكمة | يراقب جودة البيانات |

## أرقام للتحقق (قارنها بنتائج SQL التي تعرفها)
| المقياس | السياق (فلاتر) | القيمة المتوقعة |
|---|---|---|
| Net Revenue | 2026 ربع 3 | 214.22 مليون |
| Target Revenue | 2026 ربع 3 | 216.60 مليون |
| Target Attainment % | 2026 ربع 3 | 98.9% |
| Net Revenue YoY % | 2026 ربع 3 | +21.0% |
| Gross Margin % | Networking، 2026 ربع 3 | 5.7% |
| Below-Cost Loss | Networking، 2026 ربع 3 | 0.55 مليون |
| On-Time Delivery % | Eastern، شهر 2026-03 | 8.1% |
| SLA Compliance % | Western، 2026 ربع 2 | 45.6% |
| Avg CSAT | Western، 2026 ربع 2 | 3.54 |
| Lines Missing Discount / Bad Delivery Date Lines / Negative Qty Lines | بلا فلاتر | 704 / 101 / 141 |

> لم أستطع تشغيل DAX هنا (لا يوجد Power BI)، فهذه الأرقام ضمانتك: إن تطابقت فالمقاييس سليمة، وإن اختلف واحد فأرسل لي اسمه وقيمته.
> `Avg Discount %` موزون بالإيراد، فقد يختلف كسرًا بسيطًا عن متوسط SQL البسيط (17.0%).


---

## 1 Sales

### Gross Revenue
- **النوع:** أساسي (Base)
- **السؤال:** كم كان الإيراد قبل الخصم؟ (يُستخدم لحساب قيمة الخصم)
- **التنسيق:** `#,0`  |  **Display folder:** `1 Sales`

```dax
Gross Revenue =
CALCULATE(
    SUMX('vw_fact_sales_clean', 'vw_fact_sales_clean'[quantity] * 'vw_fact_sales_clean'[unit_price]),
    'vw_fact_sales_clean'[order_status] <> "Cancelled",
    'vw_fact_sales_clean'[quantity] > 0
)
```

### Net Revenue
- **النوع:** KPI رئيسي
- **السؤال:** كم صافي الإيراد بعد الخصم؟ (مؤشر النجاح الأول للإدارة)
- **التنسيق:** `#,0`  |  **Display folder:** `1 Sales`

```dax
Net Revenue =
CALCULATE(
    SUMX('vw_fact_sales_clean', 'vw_fact_sales_clean'[quantity] * 'vw_fact_sales_clean'[unit_price] * (1 - 'vw_fact_sales_clean'[discount_pct])),
    'vw_fact_sales_clean'[order_status] <> "Cancelled",
    'vw_fact_sales_clean'[quantity] > 0
)
```

### Total Cost
- **النوع:** أساسي (Base)
- **السؤال:** كم كلفت البضاعة المباعة؟
- **التنسيق:** `#,0`  |  **Display folder:** `1 Sales`

```dax
Total Cost =
CALCULATE(
    SUMX('vw_fact_sales_clean', 'vw_fact_sales_clean'[quantity] * 'vw_fact_sales_clean'[unit_cost]),
    'vw_fact_sales_clean'[order_status] <> "Cancelled",
    'vw_fact_sales_clean'[quantity] > 0
)
```

### Gross Profit
- **النوع:** KPI رئيسي
- **السؤال:** كم الربح الإجمالي؟
- **التنسيق:** `#,0`  |  **Display folder:** `1 Sales`

```dax
Gross Profit = [Net Revenue] - [Total Cost]
```

### Gross Margin %
- **النوع:** KPI رئيسي
- **السؤال:** هل نحتفظ بهامشنا؟ أي فئة أو منطقة يتآكل هامشها؟ (كشف Networking)
- **التنسيق:** `0.0%`  |  **Display folder:** `1 Sales`

```dax
Gross Margin % = DIVIDE([Gross Profit], [Net Revenue])
```

### Discount Amount
- **النوع:** مساعد (Helper)
- **السؤال:** كم قيمة الخصومات الممنوحة؟
- **التنسيق:** `#,0`  |  **Display folder:** `1 Sales`

```dax
Discount Amount = [Gross Revenue] - [Net Revenue]
```

### Avg Discount %
- **النوع:** KPI رئيسي
- **السؤال:** كم نمنح من خصم؟ هل يوجد تسرّب خصومات؟ (موزون بالإيراد، فقد يختلف كسرًا بسيطًا عن متوسط SQL البسيط)
- **التنسيق:** `0.0%`  |  **Display folder:** `1 Sales`

```dax
Avg Discount % = DIVIDE([Discount Amount], [Gross Revenue])
```

### Orders
- **النوع:** أساسي (Base)
- **السؤال:** كم عدد الطلبات الصحيحة؟
- **التنسيق:** `#,0`  |  **Display folder:** `1 Sales`

```dax
Orders =
CALCULATE(
    DISTINCTCOUNT('vw_fact_sales_clean'[order_id]),
    'vw_fact_sales_clean'[order_status] <> "Cancelled",
    'vw_fact_sales_clean'[quantity] > 0
)
```

### Order Lines
- **النوع:** أساسي (Base)
- **السؤال:** كم عدد سطور المبيعات الصحيحة؟
- **التنسيق:** `#,0`  |  **Display folder:** `1 Sales`

```dax
Order Lines =
CALCULATE(
    COUNTROWS('vw_fact_sales_clean'),
    'vw_fact_sales_clean'[order_status] <> "Cancelled",
    'vw_fact_sales_clean'[quantity] > 0
)
```

### Units Sold
- **النوع:** أساسي (Base)
- **السؤال:** كم وحدة بعنا؟
- **التنسيق:** `#,0`  |  **Display folder:** `1 Sales`

```dax
Units Sold =
CALCULATE(
    SUM('vw_fact_sales_clean'[quantity]),
    'vw_fact_sales_clean'[order_status] <> "Cancelled",
    'vw_fact_sales_clean'[quantity] > 0
)
```

### AOV
- **النوع:** KPI رئيسي
- **السؤال:** كم متوسط قيمة الطلب الواحد؟
- **التنسيق:** `#,0`  |  **Display folder:** `1 Sales`

```dax
AOV = DIVIDE([Net Revenue], [Orders])
```

### Active Customers
- **النوع:** أساسي (Base)
- **السؤال:** كم عميلًا اشترى في الفترة؟
- **التنسيق:** `#,0`  |  **Display folder:** `1 Sales`

```dax
Active Customers =
CALCULATE(
    DISTINCTCOUNT('vw_fact_sales_clean'[customer_id]),
    'vw_fact_sales_clean'[order_status] <> "Cancelled",
    'vw_fact_sales_clean'[quantity] > 0
)
```

### Revenue per Customer
- **النوع:** KPI داعم
- **السؤال:** كم يدفع العميل في المتوسط؟
- **التنسيق:** `#,0`  |  **Display folder:** `1 Sales`

```dax
Revenue per Customer = DIVIDE([Net Revenue], [Active Customers])
```


---

## 2 Target

### Target Revenue
- **النوع:** أساسي (Base)
- **السؤال:** كم الهدف المعتمد؟ (الهدف شهري: اعرضه على مستوى شهر أو ربع أو سنة فقط، لا يوم)
- **التنسيق:** `#,0`  |  **Display folder:** `2 Target`

```dax
Target Revenue = SUM('fact_target_monthly'[target_net_revenue])
```

### Target Attainment %
- **النوع:** KPI رئيسي
- **السؤال:** هل نحقق الهدف؟ أي فرع أو منطقة أبعد عنه؟
- **التنسيق:** `0.0%`  |  **Display folder:** `2 Target`

```dax
Target Attainment % = DIVIDE([Net Revenue], [Target Revenue])
```

### Revenue Gap vs Target
- **النوع:** KPI داعم
- **السؤال:** كم الفجوة المطلقة عن الهدف؟
- **التنسيق:** `#,0;-#,0`  |  **Display folder:** `2 Target`

```dax
Revenue Gap vs Target = [Net Revenue] - [Target Revenue]
```


---

## 3 Time Intelligence

### Net Revenue PY
- **النوع:** مساعد (Helper)
- **السؤال:** كم كان الإيراد في الفترة نفسها قبل سنة؟
- **التنسيق:** `#,0`  |  **Display folder:** `3 Time Intelligence`

```dax
Net Revenue PY =
CALCULATE([Net Revenue], SAMEPERIODLASTYEAR('dim_date'[date_key]))
```

### Net Revenue YoY %
- **النوع:** KPI رئيسي
- **السؤال:** هل ننمو مقارنة بالعام الماضي؟
- **التنسيق:** `0.0%`  |  **Display folder:** `3 Time Intelligence`

```dax
Net Revenue YoY % =
DIVIDE([Net Revenue] - [Net Revenue PY], [Net Revenue PY])
```

### Net Revenue PM
- **النوع:** مساعد (Helper)
- **السؤال:** كم كان الإيراد في الشهر السابق؟
- **التنسيق:** `#,0`  |  **Display folder:** `3 Time Intelligence`

```dax
Net Revenue PM =
CALCULATE([Net Revenue], DATEADD('dim_date'[date_key], -1, MONTH))
```

### Net Revenue MoM %
- **النوع:** KPI داعم
- **السؤال:** هل الاتجاه الشهري صاعد أم هابط؟
- **التنسيق:** `0.0%`  |  **Display folder:** `3 Time Intelligence`

```dax
Net Revenue MoM % =
DIVIDE([Net Revenue] - [Net Revenue PM], [Net Revenue PM])
```

### Net Revenue YTD
- **النوع:** KPI داعم
- **السؤال:** كم إيراد السنة حتى اليوم؟
- **التنسيق:** `#,0`  |  **Display folder:** `3 Time Intelligence`

```dax
Net Revenue YTD = TOTALYTD([Net Revenue], 'dim_date'[date_key])
```

### Net Revenue by Delivery Date
- **النوع:** تشخيصي (مثال USERELATIONSHIP)
- **السؤال:** كم إيراد ما سُلّم في الفترة (لا ما طُلب)؟ يستعمل العلاقة غير النشطة delivery_date
- **التنسيق:** `#,0`  |  **Display folder:** `3 Time Intelligence`

```dax
Net Revenue by Delivery Date =
CALCULATE(
    [Net Revenue],
    USERELATIONSHIP('vw_fact_sales_clean'[delivery_date], 'dim_date'[date_key])
)
```


---

## 4 Operations

### Delivered Lines
- **النوع:** أساسي (Base)
- **السؤال:** كم سطرًا سُلّم فعلًا بتاريخ صحيح؟
- **التنسيق:** `#,0`  |  **Display folder:** `4 Operations`

```dax
Delivered Lines =
CALCULATE(
    COUNTROWS('vw_fact_sales_clean'),
    FILTER('vw_fact_sales_clean', NOT ISBLANK('vw_fact_sales_clean'[delivery_date]))
)
```

### On-Time Lines
- **النوع:** أساسي (Base)
- **السؤال:** كم سطرًا سُلّم في الموعد أو قبله؟
- **التنسيق:** `#,0`  |  **Display folder:** `4 Operations`

```dax
On-Time Lines =
CALCULATE(
    COUNTROWS('vw_fact_sales_clean'),
    FILTER('vw_fact_sales_clean', NOT ISBLANK('vw_fact_sales_clean'[delivery_date]) && 'vw_fact_sales_clean'[delivery_date] <= 'vw_fact_sales_clean'[promised_date])
)
```

### On-Time Delivery %
- **النوع:** KPI رئيسي
- **السؤال:** هل نسلّم في الموعد؟ أين ومتى انهار التسليم؟ (كشف المنطقة الشرقية)
- **التنسيق:** `0.0%`  |  **Display folder:** `4 Operations`

```dax
On-Time Delivery % = DIVIDE([On-Time Lines], [Delivered Lines])
```

### Avg Delivery Days
- **النوع:** KPI رئيسي
- **السؤال:** كم يومًا يستغرق التسليم في المتوسط؟
- **التنسيق:** `0.0`  |  **Display folder:** `4 Operations`

```dax
Avg Delivery Days =
CALCULATE(
    AVERAGEX('vw_fact_sales_clean', DATEDIFF('vw_fact_sales_clean'[order_date], 'vw_fact_sales_clean'[delivery_date], DAY)),
    FILTER('vw_fact_sales_clean', NOT ISBLANK('vw_fact_sales_clean'[delivery_date]))
)
```

### Cancelled Lines %
- **النوع:** KPI داعم
- **السؤال:** كم نسبة السطور الملغاة؟
- **التنسيق:** `0.0%`  |  **Display folder:** `4 Operations`

```dax
Cancelled Lines % =
DIVIDE(
    CALCULATE(COUNTROWS('vw_fact_sales_clean'), 'vw_fact_sales_clean'[order_status] = "Cancelled"),
    COUNTROWS('vw_fact_sales_clean')
)
```

### Returned Lines %
- **النوع:** KPI داعم
- **السؤال:** كم نسبة السطور المرتجعة؟
- **التنسيق:** `0.0%`  |  **Display folder:** `4 Operations`

```dax
Returned Lines % =
DIVIDE(
    CALCULATE(COUNTROWS('vw_fact_sales_clean'), 'vw_fact_sales_clean'[order_status] = "Returned"),
    COUNTROWS('vw_fact_sales_clean')
)
```


---

## 5 Profitability Risk

### Below-Cost Lines
- **النوع:** تشخيصي (Diagnostic)
- **السؤال:** كم سطرًا بيع بأقل من التكلفة؟
- **التنسيق:** `#,0`  |  **Display folder:** `5 Profitability Risk`

```dax
Below-Cost Lines =
CALCULATE(
    COUNTROWS('vw_fact_sales_clean'),
    FILTER('vw_fact_sales_clean', 'vw_fact_sales_clean'[unit_price] * (1 - 'vw_fact_sales_clean'[discount_pct]) < 'vw_fact_sales_clean'[unit_cost] && 'vw_fact_sales_clean'[order_status] <> "Cancelled" && 'vw_fact_sales_clean'[quantity] > 0)
)
```

### Below-Cost Lines %
- **النوع:** KPI داعم
- **السؤال:** كم نسبة السطور الخاسرة من الإجمالي؟
- **التنسيق:** `0.0%`  |  **Display folder:** `5 Profitability Risk`

```dax
Below-Cost Lines % = DIVIDE([Below-Cost Lines], [Order Lines])
```

### Below-Cost Loss
- **النوع:** تشخيصي (Diagnostic)
- **السؤال:** كم الخسارة الفعلية من البيع بأقل من التكلفة؟
- **التنسيق:** `#,0`  |  **Display folder:** `5 Profitability Risk`

```dax
Below-Cost Loss =
SUMX(
    FILTER('vw_fact_sales_clean', 'vw_fact_sales_clean'[unit_price] * (1 - 'vw_fact_sales_clean'[discount_pct]) < 'vw_fact_sales_clean'[unit_cost] && 'vw_fact_sales_clean'[order_status] <> "Cancelled" && 'vw_fact_sales_clean'[quantity] > 0),
    ('vw_fact_sales_clean'[unit_cost] - 'vw_fact_sales_clean'[unit_price] * (1 - 'vw_fact_sales_clean'[discount_pct])) * 'vw_fact_sales_clean'[quantity]
)
```


---

## 6 Support

### Tickets
- **النوع:** أساسي (Base)
- **السؤال:** كم عدد التذاكر؟
- **التنسيق:** `#,0`  |  **Display folder:** `6 Support`

```dax
Tickets = COUNTROWS('fact_support_ticket')
```

### Resolved Tickets
- **النوع:** أساسي (Base)
- **السؤال:** كم تذكرة حُلّت؟
- **التنسيق:** `#,0`  |  **Display folder:** `6 Support`

```dax
Resolved Tickets =
CALCULATE(
    COUNTROWS('fact_support_ticket'),
    FILTER('fact_support_ticket', NOT ISBLANK('fact_support_ticket'[resolved_at]))
)
```

### Open Backlog
- **النوع:** KPI داعم
- **السؤال:** كم تذكرة ما زالت مفتوحة؟
- **التنسيق:** `#,0`  |  **Display folder:** `6 Support`

```dax
Open Backlog =
CALCULATE(
    COUNTROWS('fact_support_ticket'),
    FILTER('fact_support_ticket', ISBLANK('fact_support_ticket'[resolved_at]))
)
```

### Avg Resolution Hours
- **النوع:** KPI رئيسي
- **السؤال:** كم ساعة نحتاج لحل التذكرة؟
- **التنسيق:** `0.0`  |  **Display folder:** `6 Support`

```dax
Avg Resolution Hours =
AVERAGEX(
    FILTER('fact_support_ticket', NOT ISBLANK('fact_support_ticket'[resolved_at])),
    DATEDIFF('fact_support_ticket'[created_at], 'fact_support_ticket'[resolved_at], MINUTE) / 60
)
```

### SLA Compliant Tickets
- **النوع:** أساسي (Base)
- **السؤال:** كم تذكرة حُلّت ضمن وقت الاتفاقية؟
- **التنسيق:** `#,0`  |  **Display folder:** `6 Support`

```dax
SLA Compliant Tickets =
COUNTROWS(
    FILTER(
        'fact_support_ticket',
        NOT ISBLANK('fact_support_ticket'[resolved_at]) &&
        DATEDIFF('fact_support_ticket'[created_at], 'fact_support_ticket'[resolved_at], MINUTE) / 60 <= 'fact_support_ticket'[sla_hours]
    )
)
```

### SLA Compliance %
- **النوع:** KPI رئيسي
- **السؤال:** هل نلتزم بوقت الخدمة؟ أين تدهورت الخدمة؟ (كشف المنطقة الغربية)
- **التنسيق:** `0.0%`  |  **Display folder:** `6 Support`

```dax
SLA Compliance % = DIVIDE([SLA Compliant Tickets], [Resolved Tickets])
```

### Avg CSAT
- **النوع:** KPI رئيسي
- **السؤال:** هل العملاء راضون؟ (الفراغات تُتجاهل تلقائيًا ولا تُملأ بصفر)
- **التنسيق:** `0.00`  |  **Display folder:** `6 Support`

```dax
Avg CSAT = AVERAGE('fact_support_ticket'[csat_score])
```

### CSAT Response Rate %
- **النوع:** KPI داعم
- **السؤال:** كم نسبة من ردّ على استبيان الرضا؟ (تحويل الفراغات إلى مؤشر مفيد)
- **التنسيق:** `0.0%`  |  **Display folder:** `6 Support`

```dax
CSAT Response Rate % = DIVIDE(COUNT('fact_support_ticket'[csat_score]), [Tickets])
```

### Delivery Delay Tickets
- **النوع:** تشخيصي (Diagnostic)
- **السؤال:** كم شكوى تأخير تسليم؟
- **التنسيق:** `#,0`  |  **Display folder:** `6 Support`

```dax
Delivery Delay Tickets =
CALCULATE([Tickets], 'fact_support_ticket'[ticket_category] = "Delivery Delay")
```

### Delivery Delay Share %
- **النوع:** تشخيصي (Diagnostic)
- **السؤال:** كم حصة شكاوى التأخير من كل الشكاوى؟ (يربط التسليم بالدعم)
- **التنسيق:** `0.0%`  |  **Display folder:** `6 Support`

```dax
Delivery Delay Share % = DIVIDE([Delivery Delay Tickets], [Tickets])
```


---

## 7 Data Quality

### Lines Missing Discount
- **النوع:** حوكمة (Governance)
- **السؤال:** كم سطرًا كان خصمه فارغًا؟
- **التنسيق:** `#,0`  |  **Display folder:** `7 Data Quality`

```dax
Lines Missing Discount = SUM('vw_fact_sales_clean'[flag_discount_missing])
```

### Bad Delivery Date Lines
- **النوع:** حوكمة (Governance)
- **السؤال:** كم سطرًا تاريخ تسليمه قبل تاريخ الطلب؟
- **التنسيق:** `#,0`  |  **Display folder:** `7 Data Quality`

```dax
Bad Delivery Date Lines = SUM('vw_fact_sales_clean'[flag_bad_delivery_date])
```

### Negative Qty Lines
- **النوع:** حوكمة (Governance)
- **السؤال:** كم سطرًا كميته سالبة؟
- **التنسيق:** `#,0`  |  **Display folder:** `7 Data Quality`

```dax
Negative Qty Lines = SUM('vw_fact_sales_clean'[flag_negative_qty])
```

### Lines With Any Issue
- **النوع:** حوكمة (Governance)
- **السؤال:** كم سطرًا فيه مشكلة جودة واحدة أو أكثر؟
- **التنسيق:** `#,0`  |  **Display folder:** `7 Data Quality`

```dax
Lines With Any Issue =
CALCULATE(
    COUNTROWS('vw_fact_sales_clean'),
    FILTER('vw_fact_sales_clean', 'vw_fact_sales_clean'[flag_discount_missing] + 'vw_fact_sales_clean'[flag_bad_delivery_date] + 'vw_fact_sales_clean'[flag_negative_qty] > 0)
)
```

### Data Quality Issue Rate %
- **النوع:** KPI حوكمة
- **السؤال:** ما نسبة البيانات التي تحتاج معالجة؟
- **التنسيق:** `0.00%`  |  **Display folder:** `7 Data Quality`

```dax
Data Quality Issue Rate % = DIVIDE([Lines With Any Issue], COUNTROWS('vw_fact_sales_clean'))
```
