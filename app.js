(function () {
  const $ = s => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  const settings = Object.assign({
    showClock: true, showDate: true, showTimer: true, showStopwatch: true,
    hour12: false, seconds: true, unit: 'c', timerMin: 25,
    city: { name: 'Waterloo', region: 'Ontario, Canada', lat: 43.4643, lon: -80.5204 },
  }, store.get('focus.settings', {}));
  const saveSettings = () => store.set('focus.settings', settings);

  let sessions = store.get('focus.sessions', []);
  const saveSessions = () => store.set('focus.sessions', sessions);

  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function fmtDur(ms) {
    const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return h ? `${h}h ${pad(m)}m` : m ? `${m}m` : `${s}s`;
  }
  function fmtClock(ms, forceHours) {
    const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return (h || forceHours ? pad(h) + ':' : '') + pad(m) + ':' + pad(s % 60);
  }
  const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: settings.hour12 });

  // ---------- visibility ----------
  function applyVisibility() {
    $('#clock').hidden = !settings.showClock;
    $('#date').hidden = !settings.showDate;
    $('#timer').hidden = !settings.showTimer;
    $('#stopwatch').hidden = !settings.showStopwatch;
    $('#tClock').classList.toggle('on', settings.showClock);
    $('#tTimer').classList.toggle('on', settings.showTimer);
    $('#tStopwatch').classList.toggle('on', settings.showStopwatch);
    $('#optClock').checked = settings.showClock;
    $('#optTimer').checked = settings.showTimer;
    $('#optStopwatch').checked = settings.showStopwatch;
    $('#optDate').checked = settings.showDate;
    $('#optSeconds').checked = settings.seconds;
    $('#optHour').value = settings.hour12 ? '12' : '24';
    $('#optUnit').value = settings.unit;
  }
  function bindToggle(sel, key) {
    $(sel).addEventListener(sel.startsWith('#opt') ? 'change' : 'click', () => {
      settings[key] = !settings[key]; saveSettings(); applyVisibility(); tick();
    });
  }
  bindToggle('#tClock', 'showClock'); bindToggle('#tTimer', 'showTimer'); bindToggle('#tStopwatch', 'showStopwatch');
  bindToggle('#optClock', 'showClock'); bindToggle('#optTimer', 'showTimer'); bindToggle('#optStopwatch', 'showStopwatch');
  bindToggle('#optDate', 'showDate'); bindToggle('#optSeconds', 'seconds');
  $('#optHour').addEventListener('change', e => { settings.hour12 = e.target.value === '12'; saveSettings(); tick(); });
  $('#optUnit').addEventListener('change', e => { settings.unit = e.target.value; saveSettings(); renderPlace(); });

  // ---------- runs (timer + stopwatch share this) ----------
  function makeRun(key) {
    const s = store.get(key, { acc: 0, at: null, first: null, last: null });
    const save = () => store.set(key, s);
    return {
      get running() { return s.at != null; },
      get started() { return s.first != null; },
      get first() { return s.first; },
      get last() { return s.at != null ? Date.now() : s.last; },
      elapsed() { return s.acc + (s.at != null ? Date.now() - s.at : 0); },
      start() { if (s.first == null) s.first = Date.now(); s.at = Date.now(); save(); },
      pause() { s.acc = this.elapsed(); s.at = null; s.last = Date.now(); save(); },
      reset() { s.acc = 0; s.at = null; s.first = null; s.last = null; save(); },
    };
  }
  const timer = makeRun('focus.run.timer');
  const sw = makeRun('focus.run.stopwatch');
  const timerMs = () => settings.timerMin * 60000;

  function finish(run, source, capMs) {
    const ms = capMs != null ? Math.min(run.elapsed(), capMs) : run.elapsed();
    const start = run.first, end = run.last || Date.now();
    run.reset();
    if (ms >= 1000) askTask({ ms, start, end, source });
    tick();
  }

  $('#timerToggle').addEventListener('click', () => { timer.running ? timer.pause() : timer.start(); tick(); });
  $('#timerStop').addEventListener('click', () => finish(timer, 'timer', timerMs()));
  $('#swToggle').addEventListener('click', () => { sw.running ? sw.pause() : sw.start(); tick(); });
  $('#swStop').addEventListener('click', () => finish(sw, 'stopwatch'));

  function setTimerMin(m) {
    m = Math.round(Number(m));
    if (!m || m < 1) return;
    settings.timerMin = Math.min(m, 600); saveSettings(); tick();
  }
  $('#timerPresets').addEventListener('click', e => { if (e.target.dataset.min) { $('#timerCustom').value = ''; setTimerMin(e.target.dataset.min); } });
  $('#timerCustom').addEventListener('input', e => setTimerMin(e.target.value));

  function chime() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      [523.25, 659.25, 783.99].forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * .22;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.18, t + .03); g.gain.exponentialRampToValueAtTime(.001, t + 1.2);
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 1.3);
      });
    } catch { /* no audio */ }
  }

  // ---------- tick ----------
  function tick() {
    const now = new Date();
    if (settings.showClock) {
      let h = now.getHours(), suffix = '';
      if (settings.hour12) { suffix = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12; }
      const text = (settings.hour12 ? h : pad(h)) + ':' + pad(now.getMinutes()) + (settings.seconds ? ':' + pad(now.getSeconds()) : '');
      const el = $('#time');
      if (el.dataset.t !== text + suffix) {
        el.dataset.t = text + suffix;
        el.textContent = text;
        if (suffix) { const s = document.createElement('small'); s.textContent = suffix; el.append(s); }
      }
      $('#date').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    }

    if (timer.running && timer.elapsed() >= timerMs()) { chime(); finish(timer, 'timer', timerMs()); return; }
    const left = timerMs() - timer.elapsed();
    $('#timerDisplay').textContent = fmtClock(Math.ceil(left / 1000) * 1000);
    $('#timerToggle').textContent = timer.running ? 'Pause' : timer.started ? 'Resume' : 'Start';
    $('#timerStop').hidden = !timer.started;
    $('#timerPresets').hidden = timer.started;
    let preset = false;
    document.querySelectorAll('#timerPresets button').forEach(b => {
      const on = Number(b.dataset.min) === settings.timerMin; b.classList.toggle('on', on); preset = preset || on;
    });
    const custom = $('#timerCustom');
    if (!preset && document.activeElement !== custom) custom.value = settings.timerMin;
    custom.placeholder = '…';

    $('#swDisplay').textContent = fmtClock(sw.elapsed(), true);
    $('#swToggle').textContent = sw.running ? 'Pause' : sw.started ? 'Resume' : 'Start';
    $('#swStop').hidden = !sw.started;

    document.title = timer.running ? `${fmtClock(left)} · Focus` : sw.running ? `${fmtClock(sw.elapsed(), true)} · Focus` : 'Focus';
  }
  setInterval(tick, 250);

  // ---------- "what did you do?" ----------
  const logDialog = $('#logDialog');
  const queue = [];
  let pending = null;
  function askTask(entry) {
    queue.push(entry);
    if (!logDialog.open) nextTask();
  }
  function nextTask() {
    pending = queue.shift();
    if (!pending) return;
    $('#logTitle').textContent = `${fmtDur(pending.ms)} of focus`;
    $('#logMeta').textContent = `${fmtTime(pending.start)} – ${fmtTime(pending.end)} · ${pending.source}`;
    $('#logTask').value = '';
    const recent = [...new Set(sessions.slice().reverse().map(s => s.task))].slice(0, 8);
    $('#recentTasks').replaceChildren(...recent.map(t => Object.assign(document.createElement('option'), { value: t })));
    logDialog.showModal();
    $('#logTask').focus();
  }
  function closeLog(save) {
    if (save && pending) {
      sessions.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        task: $('#logTask').value.trim() || 'Focus session', ...pending });
      saveSessions();
      if ($('#calDialog').open) renderCal();
    }
    pending = null;
    logDialog.close();
    nextTask();
  }
  $('#logForm').addEventListener('submit', e => { e.preventDefault(); closeLog(true); });
  $('#logSkip').addEventListener('click', () => closeLog(false));
  logDialog.addEventListener('cancel', e => e.preventDefault()); // Esc shouldn't silently drop a session

  // ---------- calendar ----------
  const calDialog = $('#calDialog');
  let view = new Date(), selected = dayKey(new Date());
  function renderCal() {
    const y = view.getFullYear(), m = view.getMonth();
    const totals = {};
    for (const s of sessions) { const k = dayKey(new Date(s.start)); totals[k] = (totals[k] || 0) + s.ms; }
    const prefix = `${y}-${pad(m + 1)}-`;
    const monthTotal = Object.entries(totals).reduce((a, [k, v]) => a + (k.startsWith(prefix) ? v : 0), 0);
    $('#calTitle').textContent = view.toLocaleDateString([], { month: 'long', year: 'numeric' });
    $('#calTotal').textContent = monthTotal ? `${fmtDur(monthTotal)} focused` : 'No focus time yet';

    const grid = $('#calGrid'); grid.replaceChildren();
    const lead = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    const today = dayKey(new Date());
    for (let i = 0; i < lead; i++) grid.append(Object.assign(document.createElement('span'), { className: 'blank' }));
    for (let d = 1; d <= days; d++) {
      const k = prefix + pad(d), ms = totals[k] || 0;
      const b = document.createElement('button');
      b.className = (k === today ? 'today ' : '') + (k === selected ? 'sel' : '');
      if (ms) b.style.background = `rgba(255, 213, 138, ${(.14 + Math.min(ms / 144e5, 1) * .5).toFixed(2)})`;
      b.append(Object.assign(document.createElement('span'), { className: 'n', textContent: d }),
        Object.assign(document.createElement('span'), { className: 'd', textContent: ms ? fmtDur(ms) : '' }));
      b.addEventListener('click', () => { selected = k; renderCal(); });
      grid.append(b);
    }

    const [sy, sm, sd] = selected.split('-').map(Number);
    const list = sessions.filter(s => dayKey(new Date(s.start)) === selected).sort((a, b) => a.start - b.start);
    const label = new Date(sy, sm - 1, sd).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    $('#dayTitle').textContent = list.length ? `${label} · ${fmtDur(list.reduce((a, s) => a + s.ms, 0))}` : label;
    const ul = $('#dayList'); ul.replaceChildren();
    if (!list.length) ul.append(Object.assign(document.createElement('li'), { className: 'empty', textContent: 'Nothing logged this day.' }));
    for (const s of list) {
      const li = document.createElement('li');
      const del = Object.assign(document.createElement('button'), { className: 'del', textContent: '×', title: 'Delete' });
      del.setAttribute('aria-label', 'Delete session');
      del.addEventListener('click', () => {
        if (!confirm(`Delete "${s.task}" (${fmtDur(s.ms)})?`)) return;
        sessions = sessions.filter(x => x.id !== s.id); saveSessions(); renderCal();
      });
      li.append(
        Object.assign(document.createElement('span'), { className: 'when', textContent: `${fmtTime(s.start)} – ${fmtTime(s.end)}` }),
        Object.assign(document.createElement('span'), { className: 'task', textContent: s.task, title: s.task }),
        Object.assign(document.createElement('span'), { className: 'dur', textContent: fmtDur(s.ms) }),
        del);
      ul.append(li);
    }
  }
  $('#openCal').addEventListener('click', () => { view = new Date(); selected = dayKey(view); renderCal(); calDialog.showModal(); });
  $('#calPrev').addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderCal(); });
  $('#calNext').addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderCal(); });

  // ---------- settings + city + weather ----------
  const setDialog = $('#setDialog');
  const openSettings = () => { $('#cityResults').replaceChildren(); $('#cityInput').value = ''; renderPlace(); setDialog.showModal(); };
  $('#openSet').addEventListener('click', openSettings);
  $('#place').addEventListener('click', () => { openSettings(); $('#cityInput').focus(); });
  for (const d of [calDialog, setDialog]) {
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  }

  const WX = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Drizzle',
    56: 'Freezing drizzle', 57: 'Freezing drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
    85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
  let current = null;
  function renderPlace() {
    const c = settings.city;
    let text = c.name;
    if (current) {
      const t = settings.unit === 'f' ? current.temp * 9 / 5 + 32 : current.temp;
      text += ` · ${Math.round(t)}° · ${WX[current.code] || ''}`;
    }
    $('#place').textContent = text;
    $('#cityCurrent').textContent = `Showing ${c.name}${c.region ? ', ' + c.region : ''}`;
  }

  async function loadWeather() {
    const c = settings.city;
    Scene.set({ lat: c.lat, lon: c.lon });
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m`);
      const j = (await r.json()).current;
      current = { temp: j.temperature_2m, code: j.weather_code };
      Scene.set({ code: j.weather_code, cloud: j.cloud_cover, temp: j.temperature_2m, wind: j.wind_speed_10m });
    } catch { current = null; /* offline: keep the sky, skip the weather */ }
    renderPlace();
  }
  setInterval(loadWeather, 10 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadWeather(); });

  $('#cityForm').addEventListener('submit', async e => {
    e.preventDefault();
    const q = $('#cityInput').value.trim(), ul = $('#cityResults');
    if (!q) return;
    const note = t => ul.replaceChildren(Object.assign(document.createElement('li'), { className: 'muted', textContent: t }));
    note('Searching…');
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&name=${encodeURIComponent(q)}`);
      const list = (await r.json()).results || [];
      if (!list.length) return note('No city found.');
      ul.replaceChildren(...list.map(p => {
        const region = [p.admin1, p.country].filter(Boolean).join(', ');
        const b = Object.assign(document.createElement('button'), { type: 'button', textContent: `${p.name}${region ? ' — ' + region : ''}` });
        b.addEventListener('click', () => {
          settings.city = { name: p.name, region, lat: p.latitude, lon: p.longitude };
          saveSettings(); current = null; ul.replaceChildren(); $('#cityInput').value = '';
          renderPlace(); loadWeather();
        });
        const li = document.createElement('li'); li.append(b); return li;
      }));
    } catch { note('Could not search right now.'); }
  });

  applyVisibility();
  tick();
  renderPlace();
  loadWeather();
})();
