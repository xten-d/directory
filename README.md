# XTen Directory & People Portal (`xten-d/directory`)

A clean, cool-white modern twin-portal web platform for:
1. **`directory.xten.au`**: Australian Commercial Entities (Pty Ltd, Public Companies, Trusts, Gov, Non-Profit — 2.5M+ records).
2. **`people.xten.au`**: Australian Sole Traders, Licensed Professionals, and Individual Practitioners (1.16M+ records).

---

## Features

- **Twin-Portal Tab Switcher:** Seamless segmented control allowing users to switch between Commercial Entities and Individual Professionals without losing search context.
- **Subdomain-Aware Routing:** Automatically detects whether the visitor arrives via `directory.xten.au` or `people.xten.au` and selects the corresponding view mode.
- **Fast Filtered Search:** Instant search by name, ABN, ACN, suburb, state (NSW, VIC, QLD, WA, SA, TAS, ACT, NT), and ANZSIC / profession category.
- **Statutory Detail Modals:** Displays official ABR registration dates, GST status, ATO Modulo-89 checksum verification badges, and monthly view counts.
- **Claim Listing Workflow:** Integrated claim submission modal routing verification challenges to `directory@xten.au`.
- **Australian Privacy Act Compliance:** Built-in Privacy Act notice and one-click takedown / opt-out modal for sole traders on `people.xten.au`.
- **Zero-Dependency Architecture:** Pure HTML5, Vanilla CSS3, and modern JavaScript. Requires no node builds or compiler steps.

---

## Shared Hosting Deployment Guide (cPanel / Apache / LiteSpeed)

### Option 1: Shared Web Root (Both Subdomains Point to the Same Folder)
If `directory.xten.au` and `people.xten.au` are pointed to the same document root (e.g. `public_html/xten-directory`):
1. Upload the files (`index.html`, `css/`, `js/`, `.htaccess`) to the document root.
2. The built-in JavaScript will automatically inspect `window.location.hostname`:
   - If accessed via `people.xten.au`, it automatically renders the **People & Professionals** portal.
   - If accessed via `directory.xten.au` (or default host), it automatically renders the **Companies & Entities** portal.

### Option 2: Separate Subdomain Folders
If your shared hosting creates separate folders (e.g. `public_html/directory` and `public_html/people`):
1. Upload the full package to both folders.
2. The automatic hostname detection will ensure the correct portal is activated immediately.

---

## Contact & Operations

- **Inquiries & Verification:** `directory@xten.au`
- **Managed by:** XTen Systems Pty Ltd (ABN 38 602 365 346)
