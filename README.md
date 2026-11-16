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
