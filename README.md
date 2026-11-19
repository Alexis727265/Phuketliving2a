# Phuket Living — Coastal Modern

Live Cloudflare deployment: https://phuketliving.aleroy953.workers.dev/

The existing Netlify deployment and its `main` branch remain in place. The redesign is maintained on `coastal-modern`. This is the existing Phuketliving2a application, with the same Supabase project, listing IDs, images, administrator membership and submission endpoint.

## Run and deploy

Requires Node 22+ (Node 24 recommended).

```sh
npm ci
npm run build
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
- `phuketliving2-videos`: private MP4 bucket with a 50 MB file limit. The Worker can play only the video attached to a published listing.
- `pl2-submit`: existing validated, rate-limited owner/message submission Edge Function.

The additive SQL in `migrations/20261117_coastal_details.sql` adds optional `featured`, `details` and `updated_at` fields, an update timestamp trigger, administrator photo insertion and contact insertion policies, the matching contact privilege, and a search index. It does not modify existing listing values, IDs, contacts or image paths. Do not reapply the policy/trigger creation blindly; these changes have already been applied to the production project.

Administrator access requires both a valid Auth session and membership in `pl2_admins`; database and storage RLS independently enforce it. No public administrator registration is exposed. Sessions refresh during use and are retained in tab-scoped sessionStorage. After a reload, the Auth user and admin membership are reverified before restoring dashboard access. Logout clears the cached session. Logout also calls Supabase to revoke the current refresh session. Editing uses `updated_at` to prevent silently overwriting a concurrent edit.

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

## Admin photo and video workflow

Photos are converted to JPEG and resized without upscaling to fit 1920×1080 landscape or 1080×1920 portrait. At most ten images can be saved. Desktop drop support, Android-compatible selection, duplicate selection detection, cover selection, drag reordering and accessible reorder buttons are included. Upload progress is per image.

Admins can attach one optional MP4 under **Video**. Clips over 6 MB use resumable uploads, and previews work for drafts. `migrations/20261119034325_listing_videos.sql` adds the video field, bucket and access policies.

New objects use unique names. The row saves only after uploads finish. Old objects are removed only after the database save succeeds and only when they are no longer referenced by the current listing. Listing deletion requires an explicit confirmation; cleanup failures are reported. Upload errors keep selections available for retry. Unsaved changes warn before closing/reloading.

## Verification

`node build.mjs` runs the existing backend, image-sizing and sharing tests plus the redesign's search/metadata/security tests. GitHub Actions runs this build on pushes and pull requests.

Live public checks cover published reads, filtering/counts, property HTTP responses, old-link redirects, image URLs, sitemap, robots, unauthorized property edits/private reads, and mobile/desktop UI. The existing administrator login, membership and access to all 27 records were verified through the real authentication API. The dedicated hero upload through authenticated Storage was also verified. Full create/edit/delete browser checks remain unperformed; no real listing was changed or deleted for testing. No demo data was inserted into production and no real property was deleted for testing.

Supabase's existing advisory notes that leaked-password protection is disabled. It also reports no policies on the service-only rate-limit table; that table intentionally has no browser access. The redesign does not weaken either table permissions or admin membership.

## Homepage hero

The homepage uses one original pool-facing Villa Jardin photograph, sourced from https://villajardin.lamaisoncoral.com/images/cover.jpg and stored as the dedicated branding object `branding/pool-villa-hero-20261117.jpg` in the existing bucket. It is 1500×1000, has no advertising text or collage, and is independent of property-card cover selection. It does not modify any listing record or gallery. Desktop and mobile focal positions retain the pool and villa in view.

Area discovery uses location-verified Wikimedia Commons photos; lifestyle collections use Pexels photography. `discovery.mjs` records original sources and licenses, surfaced through Photo credits. These promotional images are independent of listing galleries. Admin email is prefilled; pasted passwords have surrounding whitespace/invisible copy characters removed.
