# Phuket Living on Cloudflare

[Live website](https://phuketliving.aleroy953.workers.dev/). The `cloudflare-migration` branch builds the Worker for this site. The original Netlify source remains on `main`, and `backup/pre-cloudflare-migration-20261126` preserves the last Supabase-backed Worker source.

Run `npm ci` and `npm run build` with Node 24. The build tests the browser client, search, media boundaries, and listing and inquiry workflows, and emits the Worker in `release/`. Deploy with Wrangler from the Cloudflare account owning the configured bindings.

The Worker hosts the existing public site and serves its APIs. D1 stores listings, owner contacts, inquiries, and the administrator identity mapping. The private Standard R2 bucket stores photos and MP4s. Photo paths and listing IDs match the originals; public listing and video links retain their previous routes. Cloudflare Access protects `/studio` and its API. Approved administrators use the emailed one-time code. The Worker checks the signed application token and the D1 administrator mapping independently.

Apply `cloudflare/schema.sql` when provisioning a new database. To move data, copy every source media object to R2 with the same relative key under `images/` or `videos/`. Preserve and compare object checksums, and import database rows with the same IDs and timestamps. Store arrays and JSON details as serialized JSON and PostgreSQL booleans as SQLite integers. Keep private records out of static assets and GitHub. The pre-migration archive includes all application tables, file checksums and the deployed Worker source. Provider-managed credentials and sessions stay in their original services.

Admins can upload one MP4 up to 100 MB per listing. The browser uploads in 8 MiB parts so a retry can resume without resending completed parts. A listing is updated after all uploads finish. Older attached media is removed only after the save succeeds or the listing is deleted. Video playback supports byte ranges and serves published listings only. A signed-in administrator can preview draft videos via Access.

The staging Worker uses the same copied data with `STAGING_READ_ONLY=1`, which blocks contact, listing, and media writes. It excludes previews from indexing and analytics. Keep this flag out of the production Worker deployment.
