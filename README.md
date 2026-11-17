# Focus

A calm focus page: real city or landscape photographs and video clips chosen to match the sun position, weather and season of your city
(default Waterloo, Canada), with a clock, timer, stopwatch and a calendar of your focus sessions.

Plain HTML/CSS/JS, no build step. Open `index.html` or serve the folder with any static server.
Weather and city search use the free Open-Meteo API; photos are loaded from Unsplash and video clips from Mixkit. Sessions and settings are stored in your browser (localStorage).

Preview any conditions with URL parameters, e.g. `?hour=21&weather=snow&month=1`
(`weather`: clear, cloudy, fog, drizzle, rain, snow, storm).

## Profiles and focusing together

`worker/` holds a small Cloudflare Worker (with a D1 database) that stores profiles and synced sessions and
counts who is focusing right now. A profile is a username plus a private sync code; there is no password or email.
Deploy changes with `npx wrangler deploy` from `worker/` (needs Node 22+).

The lounge shows everyone focusing at one table (first come, first seated; the rest wait in line). People with a profile
pick a character, can add an optional status when a session starts, and can send each other one of three fixed cheers.
Statuses are only shown to people who are signed in, and cheers can only go to someone in the lounge right now.
Hyperfocus (`H`) holds incoming cheers until the session ends. Other keys: `S` settings, `T` city / landscape, `M` sound, `V` video.

Database changes live in `worker/migrations/`. Back up first (`npx wrangler d1 export focus --remote --output=backup.sql`),
then apply with `npx wrangler d1 execute focus --remote --file=migrations/<file>.sql` before deploying the worker.

To test locally: `npx wrangler d1 execute focus --local --file=schema.sql`, then `npx wrangler dev` in `worker/`,
serve the site on port 4173, and open `http://localhost:4173/?api=http://localhost:8787`.
