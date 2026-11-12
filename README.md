# Phuket Living

Live website: https://phuketliving2.netlify.app/

Static website hosted by Netlify, with Supabase database, authentication and image storage. Visitors can submit properties with up to ten photos; photos are prepared at up to 1080p and checked by the submission endpoint. Submitted properties await administrator publication. Contact messages are delivered to the admin dashboard inbox, not email notifications.

The admin login is in the website footer. Administrators can review and publish or reject pending submissions, read contact messages, review images and change their password.

Run `node build.mjs` to run tests and prepare `dist/`. Netlify builds main automatically using netlify.toml. Source contains public client keys only; privileged credentials stay in the Supabase environment. Never add administrator credentials to this repository.

The deployed Edge Function pl2-submit uses backend/handler.mjs and backend/validation.mjs with an entrypoint that calls handle with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and fetch. backend/schema.sql is the initial database schema; further media administration policies were applied to the new Supabase project.
