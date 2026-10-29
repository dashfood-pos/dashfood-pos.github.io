# CLAUDE.md — Dash Food POS

## Project goal
Build Dash Food as a mobile-first POS and operations app for a home food business.

## Source of truth
1. Existing source files and their actual contracts.
2. `PRD_Dash_Food.md` for requirements and acceptance criteria.
3. `Index_DashFood_Prototype_v22_CompleteChannelIcons.html` for visual direction and interaction reference.
If they conflict, do not silently choose. Report the conflict and recommend a safe resolution.

## Stack constraints
- Keep Google Apps Script as backend/runtime.
- Keep Google Sheets as the V1 database.
- Keep the existing API/schema compatible unless a migration is explicitly approved.
- Do not introduce a new framework/build system without approval.
- Use `Asia/Makassar` and IDR formatting.

## Required first action
AUDIT BEFORE EDITING:
- List project files.
- Read `Config.gs`, `Api.gs`, `Setup.gs`, `Utils.gs`, `Orders.gs`, `Payments.gs`, `Products.gs`, `Inventory.gs`, `Expenses.gs`, `Reports.gs`, `Index.html`, and tests.
- Trace current order → payment → stock deduction.
- Run existing tests if available.
- Produce `AUDIT_REPORT.md` and an implementation plan before editing.

## UI rules
- Mobile-first. Never make a desktop dashboard and merely shrink it.
- Phone cashier layout: product catalog first, cart below.
- Phone dashboard KPI grid: 2 columns.
- App shell must use the full phone viewport; do not create a fixed 430px shell with black sidebars.
- Target body text 15–16px where practical; secondary labels must remain readable.
- Tap targets at least 44x44 CSS px for important actions.
- Five bottom-nav items: Beranda, Kasir, Order, Stok, Lainnya.
- Use consistent icon family and normalized icon boxes.
- Use actual brand marks/brand-specific treatment for WhatsApp, GoFood/Gojek, GrabFood, ShopeeFood, DANA, ShopeePay, QRIS; never substitute unrelated generic icons where a brand logo is required.
- Product images must preserve aspect ratio, crop intentionally, and have a fallback. Do not stretch.
- Every visible interactive control must work. No dead buttons.
- Do not claim a UI is verified unless you tested it in a real viewport or automated browser.

## Business rules
- Channels: OFFLINE, WHATSAPP, GOFOOD, GRABFOOD, SHOPEEFOOD.
- Payments: CASH, DANA, SHOPEEPAY, QRIS, BANK_TRANSFER.
- Initial product examples: Banana Bites, Sago, Es Teler.
- Initial Banana Bites toppings: Oreo, Cokelat, Keju. Sago and Es Teler have no toppings by default.
- Prices are channel-specific and must be sourced from backend data.
- Validate stock before payment; deduct stock only once after successful payment.
- Prevent duplicate payment/completion.
- Do not alter historic order values when master prices change.
- Never invent business prices/stock in production mode.

## Engineering rules
- Do not rewrite all files at once.
- Prefer small, reviewable changes by phase.
- Use Apps Script LockService where appropriate for concurrent money/stock operations.
- Avoid unnecessary per-row Spreadsheet calls; batch reads/writes when safe.
- Do not put secrets in frontend code.
- Do not remove existing tests.
- For schema changes, provide migration and rollback plan.
- Test the happy path and negative paths.

## Required report after each phase
1. Summary of changes.
2. Files changed.
3. Tests executed and exact results.
4. Known gaps/risks.
5. Rollback instructions.
6. Next phase proposal.

## Do not
- Do not only generate a static mockup and call it a working app.
- Do not invent API responses.
- Do not silently change schema/function contracts.
- Do not replace the provided design direction with unrelated design.
- Do not claim “done” without passing relevant tests.
