# FashionKiller Intake

Stock intake tool for FashionKiller, a South African fashion retailer. It turns supplier product screenshots into structured, priced product records, then exports them as a stock list, a WooCommerce import file, or a full backup.

Single-page app. Offline-first in the browser, with optional cloud sync through Supabase. Deployed as a static site on Vercel.

---

## What it does

**Three-slot AI extraction.** Each product has three image slots. Drop, paste or pick screenshots into each, then run the pipeline. All filled slots are sent to Claude in parallel.

| Slot | Screenshot of | Extracted |
|---|---|---|
| 1 · Product Image | Supplier product page with price visible | Name, short description, SEO keywords, tags, category, cost price, currency, colours, supplier URL |
| 2 · Sizing Chart | Size / measurement table | Per-size measurements with units |
| 3 · Product Details | Supplier specs table | Material, fit, style, season, sleeve, collar, pattern, length, feature, care instructions, model info |

Extraction fills the record; it does not finalise it. Sizes ordered and the full description are always entered by hand, and a product only turns green once it has been manually marked as reviewed.

**Pricing calculator.** Per product:

- Shipping per unit = shipment total ÷ items in shipment
- Landed cost = (cost + shipping per unit) × duty multiplier (default 1.34, overridable per product)
- Suggested retail from a target margin (default 60%), one click to apply
- Live margin %, markup and profit per unit

**Catalogue management.** Sidebar list plus a sortable table view with filters (category, status, colour) and a scorecard showing totals for stock, wholesale, landed cost, retail, profit and average margin. Category-aware size chips (shoes vs apparel), per-size stock, duplicate, bulk-add, and copy-from-previous for repeated fields. Duplicate records are cleaned up on load, keeping the more complete one.

**Product status.** `empty` → `partial` → `complete`. Complete means name, code, cost and retail price, stock above zero, and manual review done.

**Exports** (Export menu):

- **FK Stock List** — XLSX in FashionKiller's stock-list format with images embedded, plus a second sheet of structured sizing data
- **Detailed XLSX + images** — ZIP of a full data sheet, product images and sizing charts
- **WooCommerce CSV** — ZIP of a WooCommerce product CSV, images and sizing charts
- **Full Backup** — restorable ZIP of all products, images and settings (Settings → Restore from backup)

---

## How it works

```
Browser
 ├── IndexedDB (fashionkiller_db)   primary store — app always works offline
 ├── Anthropic Messages API         slot extraction, called directly from the browser
 └── Supabase (optional)
       ├── Auth       email + password
       ├── Postgres   profiles, products, user_settings (RLS: own rows only)
       └── Storage    product-images bucket, private, {user_id}/{image_id}.jpg
```

Boot order is strict: load local data first, show the app, then sync. If local is empty and a session exists, the app pulls from the cloud before rendering. Otherwise sync runs in the background. Edits are queued and pushed per product. If the Supabase library fails to load within about three seconds, the app boots offline.

Images are compressed client-side to JPEG (max 1200px, quality 0.82) before storage.

---

## Stack

- Vanilla HTML, CSS and JavaScript in one file, no build step
- [Supabase JS v2](https://github.com/supabase/supabase-js) (CDN) for auth, database and storage
- Anthropic API, `claude-sonnet-4-5`, vision input
- [ExcelJS](https://github.com/exceljs/exceljs) and [SheetJS](https://sheetjs.com/) for XLSX, [JSZip](https://stuk.github.io/jszip/) and [FileSaver.js](https://github.com/eligrey/FileSaver.js) for ZIP downloads
- Vercel static hosting

---

## Project structure

```
public/index.html                   The entire app (UI, storage, sync, extraction, exports)
supabase/migrations/001_initial.sql Schema, RLS policies, storage bucket and policies
vercel.json                         Serves public/, SPA rewrite, security headers
DEPLOY.md                           Deployment walkthrough
src/sync.js, src/supabase-config.js Legacy ES-module version of the sync layer — not loaded by the app
package.json                        Only lists supabase-js for the legacy src/ files
```

---

## Running it

**Locally:** open `public/index.html` in a browser, or serve the folder with any static server. Choose *Continue without account* to run fully offline.

**With cloud sync:**

1. Create a Supabase project and run `supabase/migrations/001_initial.sql` in the SQL Editor.
2. Enable the Email provider under Authentication. Turn off email confirmation if it is a single-user install.
3. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` at the top of the main `<script>` block in `public/index.html`.
4. Deploy to Vercel. `vercel.json` handles the rest — no build command.

**AI extraction:** open ⚙ Settings and paste an Anthropic API key.

---

## Notes

- **Supabase anon key** is in the page source by design. It is a public key; access control is enforced by row-level security on every table and on the storage bucket.
- **Anthropic API key** is stored in the browser and sent directly to the Anthropic API from the client. That suits a single trusted user. For multi-user or public use, route calls through a server-side function instead.
- **Backups include settings**, which means the API key is inside the backup ZIP. Treat backup files accordingly.
- **Sync is last-write-wins** at the product level; there is no per-field merge.
