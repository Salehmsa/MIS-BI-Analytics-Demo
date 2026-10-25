# Data dictionary

Accepted tables, primary keys (used for upsert) and column types. Required columns must be present; blank optional values are allowed.

## dim_region

Primary key: `region_id`

| Column | Type | Required |
|---|---|:--:|
| region_id | int | yes |
| region_name_en | str | yes |
| region_name_ar | str | yes |
| manager_email | str | no |

## dim_branch

Primary key: `branch_id`

| Column | Type | Required |
|---|---|:--:|
| branch_id | int | yes |
| branch_name | str | yes |
| region_id | int | yes |
| city | str | no |

## dim_category

Primary key: `category_id`

| Column | Type | Required |
|---|---|:--:|
| category_id | int | yes |
| category_name | str | yes |

## dim_subcategory

Primary key: `subcategory_id`

| Column | Type | Required |
|---|---|:--:|
| subcategory_id | int | yes |
| subcategory_name | str | yes |
| category_id | int | yes |

## dim_product

Primary key: `product_id`

| Column | Type | Required |
|---|---|:--:|
| product_id | int | yes |
| product_name | str | yes |
| subcategory_id | int | yes |
| list_price | num | no |
| unit_cost | num | no |
| is_active | bool | no |

## dim_sales_rep

Primary key: `rep_id`

| Column | Type | Required |
|---|---|:--:|
| rep_id | int | yes |
| rep_name | str | yes |
| branch_id | int | yes |
| hire_date | date | no |

## dim_customer

Primary key: `customer_id`

| Column | Type | Required |
|---|---|:--:|
| customer_id | int | yes |
| customer_name | str | yes |
| segment | str | no |
| city | str | no |
| region_id | int | no |
| signup_date | date | no |

## dim_date (accepted, not used in calculations)

Primary key: `date`

| Column | Type | Required |
|---|---|:--:|
| date | date | yes |
| year | str | no |
| quarter | str | no |
| month | str | no |
| month_name | str | no |
| year_month | str | no |
| week_of_year | str | no |
| day_name | str | no |
| is_weekend | str | no |

## fact_sales

Primary key: `order_line_id`

| Column | Type | Required |
|---|---|:--:|
| order_id | int | yes |
| order_line_id | int | yes |
| order_date | date | yes |
| customer_id | int | yes |
| product_id | int | yes |
| branch_id | int | yes |
| rep_id | int | yes |
| quantity | int | yes |
| unit_price | num | yes |
| unit_cost | num | yes |
| order_status | str | yes |
| delivery_date | date | no |
| promised_date | date | no |
| discount_pct | num | no |

## fact_support_ticket

Primary key: `ticket_id`

| Column | Type | Required |
|---|---|:--:|
| ticket_id | int | yes |
| created_at | datetime | yes |
| branch_id | int | yes |
| ticket_category | str | yes |
| priority | str | yes |
| sla_hours | num | yes |
| resolved_at | datetime | no |
| customer_id | int | no |
| csat_score | num | no |

## fact_target_monthly

Primary key: `branch_id, month_start`

| Column | Type | Required |
|---|---|:--:|
| branch_id | int | yes |
| month_start | date | yes |
| target_net_revenue | num | yes |

## Cleaning rules applied when building the dashboard

- Duplicate order lines (same order_line_id): keep one.
- Missing discount_pct: treated as 0.
- delivery_date earlier than order_date: delivery date set to blank (excluded from delivery KPIs).
- Valid sale = status not Cancelled and quantity > 0; net revenue = quantity × unit_price × (1 − discount_pct).
- Below-cost line: net unit price below unit_cost.
- Rows with unknown foreign keys are skipped and counted on the Risks & data tab.
