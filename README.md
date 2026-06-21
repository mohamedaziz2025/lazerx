# LazerX Calendar — New Center Setup Guide

## Overview

This is a template for creating a booking calendar for a new LazerX center. Each center gets its own standalone web app deployed on Netlify with a shared Supabase backend.

**Tech stack:** Pure HTML/CSS/JavaScript (no build step, no framework)
**Backend:** Supabase (shared instance — all centers use the same database)
**Hosting:** Netlify (static site)

## What's Included

```
lazerx-calendar-template/
├── index.html          # Main booking calendar (weekly view)
├── dashboard.html      # Analytics dashboard (PIN-protected)
├── suivi.html          # Client follow-up & revenue tracking (PIN-protected)
├── app.js              # Calendar logic
├── dashboard.js        # Dashboard logic
├── suivi.js            # Follow-up/revenue logic
├── styles.css          # Shared styles (do NOT modify)
├── netlify.toml        # Netlify deployment config
├── assets/
│   └── logo.png        # LazerX logo
└── vendor/
    └── supabase.min.js # Supabase client library
```

## Step-by-Step: Create a Calendar for a New Center

### 1. Copy This Template

```bash
cp -r lazerx-calendar-template/ <center-name>
# Example:
cp -r lazerx-calendar-template/ cairo
```

### 2. Choose Your Configuration Values

You need these 7 values:

| Variable | Description | Examples |
|----------|-------------|----------|
| `{{CENTER_ID}}` | Unique lowercase ID (no spaces) | `cairo`, `dubai`, `abidjan` |
| `{{CITY}}` | Display name of the city | `Cairo`, `Dubai`, `Abidjan` |
| `{{COUNTRY}}` | Country name (for subtitle) | `Egypt`, `UAE`, `Cote d'Ivoire` |
| `{{TIMEZONE}}` | IANA timezone | `Africa/Cairo`, `Asia/Dubai`, `Africa/Abidjan` |
| `{{LOCALE}}` | Locale code for date formatting | `ar-EG`, `ar-AE`, `fr-CI` |
| `{{CURRENCY}}` | Currency code | `EGP`, `AED`, `XOF` |
| `{{AUTH_PIN}}` | 6-digit PIN for dashboard/suivi access | Any 6-digit number |

**Common timezone/locale combinations:**

| Country | Timezone | Locale |
|---------|----------|--------|
| Morocco | `Africa/Casablanca` | `fr-MA` |
| Tunisia | `Africa/Tunis` | `fr-TN` |
| Egypt | `Africa/Cairo` | `ar-EG` |
| UAE | `Asia/Dubai` | `ar-AE` |
| South Africa | `Africa/Johannesburg` | `en-ZA` |
| Cote d'Ivoire | `Africa/Abidjan` | `fr-CI` |
| Turkey | `Europe/Istanbul` | `tr-TR` |

### 3. Find & Replace All Placeholders

Replace every `{{PLACEHOLDER}}` in these files:

**app.js** (lines 1-7 + line ~687):
```
{{TIMEZONE}}    → your timezone
{{LOCALE}}      → your locale
{{CITY}}        → your city name
{{CENTER_ID}}   → your center ID
{{CURRENCY}}    → your currency code
{{AUTH_PIN}}     → your 6-digit PIN
```

**dashboard.js** (lines 5-11):
```
{{CENTER_ID}}   → your center ID
{{CITY}}        → your city name
{{CURRENCY}}    → your currency code
{{TIMEZONE}}    → your timezone
{{LOCALE}}      → your locale
{{AUTH_PIN}}     → your 6-digit PIN
```

**suivi.js** (lines 5-11):
```
Same as dashboard.js
```

**index.html**: `{{CITY}}` in page title and header
**dashboard.html**: `{{CITY}}`, `{{COUNTRY}}`, `{{CURRENCY}}`
**suivi.html**: `{{CITY}}`, `{{COUNTRY}}`, `{{CURRENCY}}`

**Quick way (from terminal):**

```bash
cd <center-name>

# Set your values
CENTER_ID="cairo"
CITY="Cairo"
COUNTRY="Egypt"
TIMEZONE="Africa/Cairo"
LOCALE="ar-EG"
CURRENCY="EGP"
AUTH_PIN="123456"

# Replace in all files
for f in app.js dashboard.js suivi.js index.html dashboard.html suivi.html; do
  sed -i '' "s|{{CENTER_ID}}|$CENTER_ID|g" "$f"
  sed -i '' "s|{{CITY}}|$CITY|g" "$f"
  sed -i '' "s|{{COUNTRY}}|$COUNTRY|g" "$f"
  sed -i '' "s|{{TIMEZONE}}|$TIMEZONE|g" "$f"
  sed -i '' "s|{{LOCALE}}|$LOCALE|g" "$f"
  sed -i '' "s|{{CURRENCY}}|$CURRENCY|g" "$f"
  sed -i '' "s|{{AUTH_PIN}}|$AUTH_PIN|g" "$f"
done
```

### 4. Verify Locally

Open `index.html` in a browser. You should see the calendar with:
- Your center name in the header
- Week navigation working
- Time slots from 08:00 to 20:00, Monday-Saturday

The dashboard and suivi pages will ask for the PIN you configured.

### 5. Deploy to Netlify

**Option A: Netlify CLI**

```bash
# Install Netlify CLI (if not installed)
npm install -g netlify-cli

# Login to Netlify
netlify login

# Create new site and deploy
cd <center-name>
netlify deploy --prod --dir=.
# Follow prompts to create a new site
```

**Option B: Netlify Dashboard**

1. Go to https://app.netlify.com
2. Click "Add new site" > "Deploy manually"
3. Drag and drop the center folder
4. Rename the site to `lazerx-<center-id>` (e.g. `lazerx-cairo`)

**Custom domain (optional):**

To set up a subdomain like `cairo.lazer-x.com`:
1. Go to the Netlify site settings > Domain management
2. Add custom domain: `cairo.lazer-x.com`
3. Add a CNAME record in your DNS: `cairo` → `lazerx-cairo.netlify.app`

### 6. Update the Global Dashboard

The global dashboard at `/global-dashboard/` needs to know about the new center. In `global-dashboard/dashboard.js`, add the new center to the `CENTERS` array:

```javascript
{ id: 'cairo', name: 'LazerX Cairo', currency: 'EGP', timezone: 'Africa/Cairo' }
```

Redeploy the global dashboard after this change.

### 7. Update the Main Website

If the new center should appear on the main LazerX website (lazer-x.com):

1. Add the location to `src/data/locations.ts` in the laserx project
2. Add testimonials to locale files if needed
3. Rebuild and redeploy the affected sites

## Architecture Notes

### How the Backend Works

All centers share one Supabase instance. The `center` field in each booking record identifies which center it belongs to. When you use a new `CENTER_ID`, the backend automatically accepts bookings for it — no backend changes needed.

**Supabase credentials (shared, do NOT change):**
- URL: `https://llhwtsklaakhfblxxoxn.supabase.co`
- Anon Key: already embedded in the JS files

**API endpoints (all via Supabase Edge Functions):**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/week?start=YYYY-MM-DD&center=ID` | GET | Fetch bookings for a week |
| `/create-booking` | POST | Create new booking |
| `/cancel-booking` | POST | Cancel a booking |
| `/move-booking` | POST | Move a booking (drag & drop) |
| `/update-booking` | POST | Edit booking details |
| `/stats?center=ID` | GET | Get center statistics |
| `/export?center=ID` | GET | Export data as CSV |

### Session Categories & Pricing

These are the same for all centers (hardcoded in JS):

| Category | Label | Price |
|----------|-------|-------|
| `tabac` | Arret du tabac | 500 |
| `drogue` | Sevrage drogue | 750 |
| `drogue_dure` | Sevrage drogues dures | 1000 |
| `drogue_douce` | Sevrage drogues douces | 600 |
| `renforcement` | Renforcement (gratuit) | 0 |

If you need different pricing for a center, modify the `PRICES` object in `dashboard.js` and `suivi.js`.

### Operating Hours

All centers: Monday-Saturday, 08:00-20:00, 30-minute slots. To change this, modify the `generateTimeSlots()` function in `app.js`.

### Real-time Updates

The calendar subscribes to Supabase real-time changes filtered by center ID. When someone books on another device, the calendar updates automatically.

### Files You Should NOT Modify

- `styles.css` — shared across all centers, changes break consistency
- `vendor/supabase.min.js` — Supabase client library
- `netlify.toml` — security headers config
- `assets/logo.png` — shared brand logo

## Existing Centers (Reference)

| Center | ID | Timezone | Currency | PIN | Netlify Site | URL |
|--------|-----|----------|----------|-----|-------------|-----|
| Casablanca | `casablanca` | Africa/Casablanca | MAD | 145628 | lazerx-casablanca | casablanca.lazer-x.com |
| Rabat | `rabat` | Africa/Casablanca | MAD | 547991 | lazerx-rabat | rabat.lazer-x.com |
| Sahloul Sousse | `sahloul` | Africa/Tunis | DT | 637922 | lazerx-sahloul | sahloul.lazer-x.com |
| Mourouj 6 | `mourouj` | Africa/Tunis | DT | 944472 | lazerx-mourouj | mourouj.lazer-x.com |

## Troubleshooting

**Calendar shows no bookings:** Check browser console for API errors. Verify the `CURRENT_CENTER` value matches what the backend expects.

**Dashboard shows wrong currency:** Check `{{CURRENCY}}` was replaced in both the JS config AND the HTML `<span>` tags.

**Real-time not working:** The Supabase anon key might be expired (current expiry: 2035). Check `vendor/supabase.min.js` is present.

**PIN not working:** The PIN is checked client-side. Verify `{{AUTH_PIN}}` was replaced in `app.js` (line ~687), `dashboard.js` (line 11), and `suivi.js` (line 11).
