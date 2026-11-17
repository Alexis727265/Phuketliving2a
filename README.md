# Phuket Living — Coastal Modern

Live Cloudflare deployment: https://phuketliving.aleroy953.workers.dev/

The existing Netlify deployment and its `main` branch remain in place. The redesign is maintained on `coastal-modern`. This is the existing Phuketliving2a application, with the same Supabase project, listing IDs, images, administrator membership and submission endpoint.

## Run and deploy

Requires Node 22+ (Node 24 recommended). No runtime npm dependencies.

```sh
node build.mjs
```

This runs the automated suite, emits Netlify-compatible files in `dist/`, and creates the Cloudflare Worker modules in `release/`. For Cloudflare deploy using the official Wrangler CLI, authenticated to the intended account:

```sh
npx wrangler deploy
```

`wrangler.jsonc` includes the build command. No Supabase secret/service-role key is needed for this Worker. The frontend deliberately uses only the existing publishable/anon API credentials. Secrets for the existing `pl2-submit` Edge Function remain in Supabase. A custom domain can be attached once its fully qualified name is registered and its DNS zone is connected to Cloudflare.

The current Worker serves its small static modules and HTML directly. Requests use the account's Workers allowance; this is not unlimited hosting. Supabase database, storage and egress quotas remain applicable. No paid resource, new database or external image transformation service was provisioned.

## Preserved backend and access model

- `pl2_properties`: existing public properties; public reads require `status = 'published'`.
- `pl2_admins`: unchanged administrator membership and Supabase Auth users.
- `pl2_property_contacts`: private contacts, available only to administrators.
- `pl2_messages`: private inquiries.
- `phuketliving2-images`: existing public JPEG image bucket, 3 MB maximum per object.
- `pl2-submit`: existing validated, rate-limited owner/message submission Edge Function.

The additive SQL in `migrations/20261117_coastal_details.sql` adds optional `featured`, `details` and `updated_at` fields, an update timestamp trigger, administrator photo insertion and contact insertion policies, the matching contact privilege, and a search index. It does not modify existing listing values, IDs, contacts or image paths. Do not reapply the policy/trigger creation blindly; these changes have already been applied to the production project.

Administrator access requires both a valid Auth session and membership in `pl2_admins`; database and storage RLS independently enforce it. No public administrator registration is exposed. Sessions remain in memory and refresh during use; a full reload requires sign-in again. Logout also calls Supabase to revoke the current refresh session. Editing uses `updated_at` to prevent silently overwriting a concurrent edit.

## Listings, search and sharing

- Stable detail URL: `/property/<existing-uuid>`.
- Legacy `/?property=<uuid>` URLs remain supported; Cloudflare redirects them to the detail page.
- Public listing detail HTML, canonical, Open Graph, JSON-LD and sitemap data are generated from published Supabase records.
- Search uses PostgREST filters, exact counts, stable ordering and 12 records per page.
- Multi-area and multi-amenity search, prices, bedrooms, bathrooms, interior size, text and reference search, URL state, saved properties, grid/list view and sorting.
- Optional land/guest/term/availability filters appear only when the records contain those structured details. Availability-now queries require confirmation within 30 days.
- Existing descriptions with explicit “price on request” and placeholder prices below THB 100 display “Price on request”. Source values are unchanged; budget searches and price sorting omit placeholder rates.
- WhatsApp inquiries include the listing title, reference, stable URL and optional dates/guests. Dates are an inquiry preference, not an availability/calendar filter. Nothing is instantly bookable.
- Native share is used when available, with clipboard and manual-copy fallbacks.

## Admin photo workflow

Photos are converted to JPEG and resized without upscaling to fit 1920×1080 landscape or 1080×1920 portrait. At most ten images can be saved. Desktop drop support, Android-compatible selection, duplicate selection detection, cover selection, drag reordering and accessible reorder buttons are included. Upload progress is per image.

New objects use unique names. The row saves only after uploads finish. Old objects are removed only after the database save succeeds and only when they are no longer referenced by the current listing. Listing deletion requires an explicit confirmation; cleanup failures are reported. Upload errors keep selections available for retry. Unsaved changes warn before closing/reloading.

## Verification

`node build.mjs` runs the existing backend, image-sizing and sharing tests plus the redesign's search/metadata/security tests. GitHub Actions runs this build on pushes and pull requests.

Live public checks cover published reads, filtering/counts, property HTTP responses, old-link redirects, image URLs, sitemap, robots, unauthorized property edits/private reads, and mobile/desktop UI. Full authenticated create/edit/upload/delete browser checks require the existing administrator to sign in. No demo data was inserted into production and no real property was deleted for testing.

Supabase's existing advisory notes that leaked-password protection is disabled. It also reports no policies on the service-only rate-limit table; that table intentionally has no browser access. The redesign does not weaken either table permissions or admin membership.
