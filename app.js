(function () {
  const $ = s => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  const settings = Object.assign({
    showClock: true, showDate: true, showTimer: true, showStopwatch: true,
    hour12: false, seconds: true, unit: 'c', alarm: 'gentle', timerMin: 30, view: 'city', motion: true,
    sound: true, hyperfocus: false, askStatus: true,
    city: { name: 'Waterloo', region: 'Ontario, Canada', lat: 43.4643, lon: -80.5204 },
  }, store.get('focus.settings', {}));
  if (!settings.v) { if (settings.timerMin === 25) settings.timerMin = 30; settings.v = 2; } // presets changed to 15 / 30 / 60
  if (settings.alarm === 'off') { settings.alarm = 'gentle'; settings.sound = false; } // "off" became the sound switch
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
    $('#optLandscape').checked = settings.view === 'nature';
    $('#optAlarm').value = settings.alarm;
    $('#optMotion').checked = settings.motion;
    $('#optSound').checked = settings.sound;
    $('#optHyper').checked = settings.hyperfocus;
    $('#optAsk').checked = settings.askStatus;
    document.querySelectorAll('#viewSeg button').forEach(b => {
      const on = b.dataset.view === settings.view;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    });
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
  $('#optLandscape').addEventListener('change', e => setView(e.target.checked ? 'nature' : 'city'));
  $('#optMotion').addEventListener('change', e => setMotion(e.target.checked));
  $('#optSound').addEventListener('change', e => setSound(e.target.checked));
  $('#optHyper').addEventListener('change', e => setHyper(e.target.checked));
  $('#optAsk').addEventListener('change', e => { settings.askStatus = e.target.checked; saveSettings(); });
  $('#optAlarm').addEventListener('change', e => { settings.alarm = e.target.value; saveSettings(); playAlarm(); });
  $('#viewSeg').addEventListener('click', e => { if (e.target.dataset.view) setView(e.target.dataset.view); });
  function pushScene() { Scene.set({ view: settings.view, motion: settings.motion }); }

  // one place per setting, so the settings panel, the top toggle and the keys all stay in step
  function setView(v) { settings.view = v; saveSettings(); applyVisibility(); pushScene(); toast(v === 'nature' ? 'Landscape view' : 'City view'); }
  function setMotion(on) { settings.motion = on; saveSettings(); applyVisibility(); pushScene(); toast(on ? 'Moving video on' : 'Moving video off'); }
  function setSound(on) { settings.sound = on; saveSettings(); applyVisibility(); toast(on ? 'Sound effects on' : 'Sound effects off'); }
  function setHyper(on) {
    settings.hyperfocus = on; saveSettings(); applyVisibility();
    toast(on ? 'Hyperfocus on · lounge cheers wait until your session ends' : 'Hyperfocus off');
    checkInbox(); // switching it off may release cheers that were held
  }
  $('#optUnit').addEventListener('change', e => { settings.unit = e.target.value; saveSettings(); renderPlace(); });

  // ---------- runs (timer + stopwatch share this) ----------
  function makeRun(key) {
    const s = store.get(key, { acc: 0, at: null, first: null, last: null, status: null });
    const save = () => store.set(key, s);
    return {
      get running() { return s.at != null; },
      get started() { return s.first != null; },
      get first() { return s.first; },
      get last() { return s.at != null ? Date.now() : s.last; },
      get status() { return s.status || null; },
      elapsed() { return s.acc + (s.at != null ? Date.now() - s.at : 0); },
      setStatus(text) { s.status = text || null; save(); },
      start() { if (s.first == null) { s.first = Date.now(); noteSessionStart(s.first); } s.at = Date.now(); save(); },
      pause() { s.acc = this.elapsed(); s.at = null; s.last = Date.now(); save(); },
      reset() { s.acc = 0; s.at = null; s.first = null; s.last = null; s.status = null; save(); },
    };
  }
  const timer = makeRun('focus.run.timer');
  const sw = makeRun('focus.run.stopwatch');
  const timerMs = () => settings.timerMin * 60000;
  const inSession = () => timer.started || sw.started; // a session lasts until its timer or stopwatch is finished
  const currentStatus = () => (timer.running ? timer.status : sw.running ? sw.status : null);
  // the first session started today is remembered by its start time, so it still counts after a reload
  function noteSessionStart(at) {
    const today = dayKey(new Date()), d = store.get('focus.dayStart', null);
    if (!d || d.day !== today) store.set('focus.dayStart', { day: today, at });
  }
  function isFirstSessionToday() {
    const d = store.get('focus.dayStart', null);
    return !!d && d.day === dayKey(new Date()) && [timer, sw].some(r => r.started && r.first === d.at);
  }

  function finish(run, source, capMs) {
    const ms = capMs != null ? Math.min(run.elapsed(), capMs) : run.elapsed();
    const start = run.first, end = run.last || Date.now();
    run.reset();
    if (ms >= 1000) askTask({ ms, start, end, source });
    tick();
    checkInbox(); // a finished session releases cheers that were held for it
  }

  $('#timerToggle').addEventListener('click', () => {
    if (timer.running) { timer.pause(); tick(); return; }
    beginRun(timer, () => { audioCtx(); toast(settings.sound ? ALARM_TEXT[settings.alarm] : 'Sound effects are off · the timer will end silently'); });
  });
  $('#toast').addEventListener('click', () => { $('#toast').classList.remove('show'); openSettings(); });
  $('#timerStop').addEventListener('click', () => finish(timer, 'timer', timerMs()));
  $('#swToggle').addEventListener('click', () => { if (sw.running) { sw.pause(); tick(); } else beginRun(sw); });
  $('#swStop').addEventListener('click', () => finish(sw, 'stopwatch'));

  // ---------- session status: asked when a fresh timer or stopwatch starts ----------
  const cleanStatus = v => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || null;
  const statusDialog = $('#statusDialog');
  let pendingStart = null;
  function beginRun(run, after) {
    if (run.started || !settings.askStatus) { run.start(); if (after) after(); tick(); return; } // resuming keeps the old status
    pendingStart = { run, after };
    $('#statusInput').value = '';
    statusDialog.showModal();
    $('#statusInput').focus();
  }
  statusDialog.addEventListener('close', () => { pendingStart = null; }); // Esc or Cancel: nothing starts
  $('#statusCancel').addEventListener('click', () => statusDialog.close());
  $('#statusForm').addEventListener('submit', e => {
    e.preventDefault();
    const p = pendingStart;
    if (!p) return;
    statusDialog.close();
    p.run.setStatus(cleanStatus($('#statusInput').value));
    p.run.start();
    if (p.after) p.after();
    tick();
  });
  function setLine(node, text) { node.hidden = !text; node.textContent = text || ''; }

  function setTimerMin(m) {
    m = Math.round(Number(m));
    if (!m || m < 1) return;
    settings.timerMin = Math.min(m, 600); saveSettings(); tick();
  }
  $('#timerPresets').addEventListener('click', e => { if (e.target.dataset.min) { $('#timerCustom').value = ''; setTimerMin(e.target.dataset.min); } });
  $('#timerCustom').addEventListener('input', e => setTimerMin(e.target.value));

  // ---------- alarm ----------
  let audio = null;
  function audioCtx() { // created on a click so the browser lets it play later, when the timer runs out
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch { audio = null; }
    return audio;
  }
  function tone(ac, type, freq, at, len, peak, soft) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + (soft ? .03 : .005));
    if (soft) g.gain.exponentialRampToValueAtTime(.001, at + len);
    else { g.gain.setValueAtTime(peak, at + len - .01); g.gain.linearRampToValueAtTime(0, at + len); }
    o.connect(g).connect(ac.destination); o.start(at); o.stop(at + len + .05);
  }
  function playAlarm(kind = settings.alarm) {
    const ac = settings.sound ? audioCtx() : null;
    if (!ac) return;
    const t = ac.currentTime + .05;
    if (kind === 'abrupt') { // classic alarm clock: four quick beeps, repeated
      for (let set = 0; set < 4; set++) for (let i = 0; i < 4; i++) tone(ac, 'square', 1960, t + set * 1 + i * .14, .08, .16, false);
    } else { // two soft rising chimes
      for (let rep = 0; rep < 2; rep++) [523.25, 659.25, 783.99].forEach((f, i) => tone(ac, 'sine', f, t + rep * 1.6 + i * .24, 1.4, .2, true));
    }
  }

  const ALARM_TEXT = { gentle: 'Alarm on · gentle chime', abrupt: 'Alarm on · abrupt beeps' };
  let toastTimer;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text; t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => { t.hidden = true; }, 400); }, 4500);
  }

  // fixed-width digits so the serif numerals don't jitter as they change
  function setDigits(node, text, suffix) {
    const key = text + '|' + (suffix || '');
    if (node.dataset.t === key) return;
    node.dataset.t = key;
    node.replaceChildren(...[...text].map(ch => /\d/.test(ch)
      ? Object.assign(document.createElement('span'), { className: 'dg', textContent: ch }) : ch));
    if (suffix) node.append(Object.assign(document.createElement('small'), { textContent: suffix }));
  }

  // ---------- tick ----------
  function tick() {
    const now = new Date();
    if (settings.showClock) {
      let h = now.getHours(), suffix = '';
      if (settings.hour12) { suffix = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12; }
      const text = (settings.hour12 ? h : pad(h)) + ':' + pad(now.getMinutes()) + (settings.seconds ? ':' + pad(now.getSeconds()) : '');
      setDigits($('#time'), text, suffix);
      $('#date').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    }

    if (timer.running && timer.elapsed() >= timerMs()) { playAlarm(); finish(timer, 'timer', timerMs()); return; }
    const left = timerMs() - timer.elapsed();
    setDigits($('#timerDisplay'), fmtClock(Math.ceil(left / 1000) * 1000));
    $('#timerToggle').textContent = timer.running ? 'Pause' : timer.started ? 'Resume' : 'Start';
    $('#timerStop').hidden = !timer.started;
    setLine($('#timerStatus'), timer.started ? timer.status : null);
    $('#timerPresets').hidden = timer.started;
    let preset = false;
    document.querySelectorAll('#timerPresets button').forEach(b => {
      const on = Number(b.dataset.min) === settings.timerMin; b.classList.toggle('on', on); preset = preset || on;
    });
    const custom = $('#timerCustom');
    if (!preset && document.activeElement !== custom) custom.value = settings.timerMin;
    custom.placeholder = '…';

    setDigits($('#swDisplay'), fmtClock(sw.elapsed(), true));
    $('#swToggle').textContent = sw.running ? 'Pause' : sw.started ? 'Resume' : 'Start';
    $('#swStop').hidden = !sw.started;
    setLine($('#swStatus'), sw.started ? sw.status : null);

    const focusing = timer.running || sw.running; // focus mode = a timer or stopwatch is actually running
    if (focusing !== wasFocusing) { wasFocusing = focusing; beat(); }

    document.title = timer.running ? `${fmtClock(Math.ceil(left / 1000) * 1000)} · Focus` : sw.running ? `${fmtClock(sw.elapsed(), true)} · Focus` : 'Focus';
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
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      sessions.push({ id, task: $('#logTask').value.trim() || 'Focus session', ...pending });
      saveSessions();
      queueSync({ add: [id] });
      if ($('#calDialog').open) renderCal(true);
    }
    pending = null;
    logDialog.close();
    nextTask();
  }
  $('#logForm').addEventListener('submit', e => { e.preventDefault(); closeLog(true); });
  $('#logSkip').addEventListener('click', () => closeLog(false));
  logDialog.addEventListener('cancel', e => e.preventDefault()); // Esc shouldn't silently drop a session

  // ---------- calendar ----------
  // Sessions only ever come from the timer or stopwatch; they can be removed here but not added or edited.
  const calDialog = $('#calDialog');
  const el = (tag, props, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
  let mode = 'month', selected = dayKey(new Date()), yearShown = new Date().getFullYear();

  function totalsByDay() {
    const t = {};
    for (const s of sessions) { const k = dayKey(new Date(s.start)); t[k] = (t[k] || 0) + s.ms; }
    return t;
  }
  const firstLogged = () => sessions.length ? new Date(Math.min(...sessions.map(s => s.start))) : new Date();

  function renderCal(keepScroll) {
    const totals = totalsByDay();
    $('#monthView').hidden = mode !== 'month';
    $('#yearView').hidden = mode !== 'year';
    document.querySelectorAll('#calMode button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    if (mode === 'month') renderMonths(totals, keepScroll); else renderYear(totals);
    renderDay();
  }

  function select(k) {
    selected = k;
    calDialog.querySelectorAll('[data-k]').forEach(b => b.classList.toggle('sel', b.dataset.k === k));
    renderDay();
  }

  function renderMonths(totals, keepScroll) {
    const box = $('#months'), top = box.scrollTop;
    const now = new Date(), today = dayKey(now);
    const back = new Date(now.getFullYear(), now.getMonth() - 11, 1), first = firstLogged();
    let cur = first < back ? new Date(first.getFullYear(), first.getMonth(), 1) : back;
    box.replaceChildren();
    while (cur <= now) {
      const y = cur.getFullYear(), m = cur.getMonth(), prefix = `${y}-${pad(m + 1)}-`;
      const lead = (cur.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
      const grid = el('div', { className: 'cal-grid' });
      let sum = 0;
      for (let i = 0; i < lead; i++) grid.append(el('span', { className: 'blank' }));
      for (let d = 1; d <= days; d++) {
        const k = prefix + pad(d), ms = totals[k] || 0;
        sum += ms;
        const b = el('button', { className: (k === today ? 'today ' : '') + (k === selected ? 'sel' : ''), disabled: k > today },
          el('span', { className: 'n', textContent: d }), el('span', { className: 'd', textContent: ms ? fmtDur(ms) : '' }));
        b.dataset.k = k;
        if (ms) b.style.background = `rgba(255, 213, 138, ${(.14 + Math.min(ms / 144e5, 1) * .5).toFixed(2)})`;
        b.addEventListener('click', () => select(k));
        grid.append(b);
      }
      box.append(el('section', { className: 'month' },
        el('div', { className: 'month-head' },
          el('b', { textContent: cur.toLocaleDateString([], { month: 'long', year: 'numeric' }) }),
          el('span', { textContent: sum ? `${fmtDur(sum)} focused` : '' })),
        grid));
      cur = new Date(y, m + 1, 1);
    }
    box.scrollTop = keepScroll ? top : box.scrollHeight; // open on the current month; scroll up for earlier ones
  }

  function renderYear(totals) {
    const y = yearShown, now = new Date(), today = dayKey(now);
    const lead = (new Date(y, 0, 1).getDay() + 6) % 7;
    const heat = $('#heat'), labels = $('#heatMonths');
    heat.replaceChildren(); labels.replaceChildren();
    for (let i = 0; i < lead; i++) heat.append(el('span'));
    let n = 0, sum = 0, active = 0, best = 0, streak = 0, longest = 0;
    for (let m = 0; m < 12; m++) {
      labels.append(el('span', { textContent: new Date(y, m, 1).toLocaleDateString([], { month: 'short' }), style: `grid-column:${Math.floor((lead + n) / 7) + 1}` }));
      const days = new Date(y, m + 1, 0).getDate();
      for (let d = 1; d <= days; d++, n++) {
        const k = `${y}-${pad(m + 1)}-${pad(d)}`, ms = totals[k] || 0;
        sum += ms; best = Math.max(best, ms);
        if (ms) { active++; streak++; longest = Math.max(longest, streak); } else streak = 0;
        const level = Math.min(ms / 144e5, 1); // 4 hours = full glow
        const b = el('button', { className: [ms ? '' : 'none', k > today ? 'future' : '', level > .8 ? 'hot' : '', k === today ? 'today' : '', k === selected ? 'sel' : ''].join(' '), disabled: k > today });
        b.title = `${new Date(y, m, d).toLocaleDateString([], { month: 'short', day: 'numeric' })}${ms ? ' · ' + fmtDur(ms) : ''}`;
        b.dataset.k = k;
        if (ms) b.style.setProperty('--a', (.22 + level * .78).toFixed(2));
        b.addEventListener('click', () => select(k));
        heat.append(b);
      }
    }
    const weeks = Math.ceil((lead + n) / 7);
    heat.style.setProperty('--weeks', weeks); labels.style.setProperty('--weeks', weeks);
    $('#yearTitle').textContent = y;
    $('#yearTotal').textContent = sum
      ? `${fmtDur(sum)} focused · ${active} day${active > 1 ? 's' : ''} · best day ${fmtDur(best)} · longest streak ${longest} day${longest > 1 ? 's' : ''}`
      : 'No focus time logged this year';
    $('#yearNext').disabled = y >= now.getFullYear();
    $('#yearPrev').disabled = y <= firstLogged().getFullYear();
  }

  function renderDay() {
    const [sy, sm, sd] = selected.split('-').map(Number);
    const list = sessions.filter(s => dayKey(new Date(s.start)) === selected).sort((a, b) => a.start - b.start);
    const label = new Date(sy, sm - 1, sd).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    $('#dayTitle').textContent = list.length ? `${label} · ${fmtDur(list.reduce((a, s) => a + s.ms, 0))}` : label;
    const ul = $('#dayList'); ul.replaceChildren();
    if (!list.length) ul.append(el('li', { className: 'empty', textContent: 'Nothing logged this day.' }));
    for (const s of list) {
      const li = el('li', {});
      const normal = () => {
        const del = el('button', { className: 'del', textContent: '×', title: 'Remove' });
        del.setAttribute('aria-label', 'Remove session');
        del.addEventListener('click', ask);
        li.className = '';
        li.replaceChildren(
          el('span', { className: 'when', textContent: `${fmtTime(s.start)} – ${fmtTime(s.end)}` }),
          el('span', { className: 'task', textContent: s.task, title: s.task }),
          el('span', { className: 'dur', textContent: fmtDur(s.ms) }), del);
      };
      const ask = () => { // second step: nothing is removed until this is confirmed
        const cancel = el('button', { className: 'mini', textContent: 'Keep' });
        const yes = el('button', { className: 'mini danger', textContent: 'Remove' });
        cancel.addEventListener('click', normal);
        yes.addEventListener('click', () => {
          sessions = sessions.filter(x => x.id !== s.id); saveSessions(); renderCal(true); queueSync({ remove: [s.id] });
        });
        li.className = 'confirm';
        li.replaceChildren(el('span', { className: 'task', textContent: `Remove “${s.task}” (${fmtDur(s.ms)})? This can’t be undone.` }), cancel, yes);
        cancel.focus();
      };
      normal();
      ul.append(li);
    }
  }

  $('#openCal').addEventListener('click', () => {
    selected = dayKey(new Date()); yearShown = new Date().getFullYear();
    calDialog.showModal(); renderCal();
  });
  $('#calMode').addEventListener('click', e => { if (e.target.dataset.mode) { mode = e.target.dataset.mode; renderCal(); } });
  $('#yearPrev').addEventListener('click', () => { yearShown--; renderCal(); });
  $('#yearNext').addEventListener('click', () => { yearShown++; renderCal(); });

  // ---------- settings + city + weather ----------
  const setDialog = $('#setDialog');
  const openSettings = () => { $('#cityResults').replaceChildren(); $('#cityInput').value = ''; $('#profMsg').textContent = ''; renderPlace(); renderProfile(); setDialog.showModal(); };
  $('#openSet').addEventListener('click', openSettings);
  $('#place').addEventListener('click', () => { openSettings(); $('#cityInput').focus(); });
  for (const d of [calDialog, setDialog, $('#loungeDialog')]) {
    d.addEventListener('click', e => {
      const r = d.getBoundingClientRect();
      const outside = e.target === d && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
      if (outside || e.target.closest('[data-close]')) d.close();
    });
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
    Scene.set({ lat: c.lat, lon: c.lon, view: settings.view, motion: settings.motion });
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

  // ---------- profile, sync across devices, focusing together ----------
  // Local testing: open the page with ?api=http://localhost:8787 (wrangler dev). Only localhost is accepted,
  // so a shared link can never send a profile's sync code to another server.
  const devApi = new URLSearchParams(location.search).get('api');
  const API = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(devApi || '') && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? devApi : 'https://focus-api.tiffanyngai817.workers.dev';
  let clientId = store.get('focus.client', null);
  if (!clientId) { clientId = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); store.set('focus.client', clientId); }

  async function api(path, method = 'GET', body) {
    const p = settings.profile, headers = {};
    if (p) headers.authorization = `Bearer ${encodeURIComponent(p.name)}|${p.code}`;
    if (body) headers['content-type'] = 'application/json';
    const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong. Try again.'), { status: r.status });
    return j;
  }

  // Sessions: changes made here are queued, sent, and then the profile's full list replaces the local one.
  const outbox = store.get('focus.outbox', { add: [], remove: [] });
  let syncing = Promise.resolve();
  function queueSync(change = {}) {
    if (!settings.profile) return;
    outbox.add.push(...(change.add || [])); outbox.remove.push(...(change.remove || []));
    store.set('focus.outbox', outbox);
    syncing = syncing.then(syncNow);
  }
  async function syncNow() {
    if (!settings.profile) return;
    const state = t => { $('#syncState').textContent = t; };
    try {
      for (const id of [...outbox.remove]) { await api('/sessions/' + id, 'DELETE'); outbox.remove.splice(outbox.remove.indexOf(id), 1); }
      const sending = sessions.filter(s => outbox.add.includes(s.id));
      if (sending.length) await api('/sessions', 'POST', { sessions: sending });
      outbox.add = outbox.add.filter(id => !sending.some(s => s.id === id));
      store.set('focus.outbox', outbox);
      const remote = (await api('/sessions')).sessions;
      const pending = sessions.filter(s => outbox.add.includes(s.id) && !remote.some(r => r.id === s.id)); // logged while this was in flight
      sessions = [...remote, ...pending]; saveSessions();
      if (calDialog.open) renderCal(true);
      state(`Synced · ${sessions.length} session${sessions.length === 1 ? '' : 's'}`);
    } catch (e) {
      store.set('focus.outbox', outbox);
      if (e.status === 401) { state('This device is no longer linked. Sign out and link again.'); }
      else state('Offline. Changes will sync when you are back online.');
    }
  }

  function renderProfile() {
    const p = settings.profile;
    $('#profileOut').hidden = !!p; $('#profileIn').hidden = !p; $('#deviceBox').hidden = !p;
    if (!p) return;
    $('#profWho').textContent = p.name;
    $('#profCode').textContent = '••••-••••-••••-••••';
    $('#profShow').textContent = 'Show';
    renderPicker($('#charPick'));
  }

  // Character picker, used in Settings and in the lounge. The choice shows at once and is saved in the background.
  const DICE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.3"/><circle cx="15" cy="15" r="1.3"/><circle cx="15" cy="9" r="1.3"/><circle cx="9" cy="15" r="1.3"/><circle cx="12" cy="12" r="1.3"/></svg>';
  function renderPicker(box) {
    const p = settings.profile;
    if (!box || !p) return;
    const picked = Avatars.resolve(p.character, p.name).id;
    const tile = (label, art, on, onClick, extra = '') => {
      const b = el('button', { type: 'button', className: 'char' + (on ? ' on' : '') + extra, title: label });
      b.setAttribute('aria-pressed', String(on));
      b.innerHTML = `<span class="char-art">${art}</span>`;
      b.append(el('span', { className: 'char-name', textContent: label }));
      b.addEventListener('click', onClick);
      return b;
    };
    box.replaceChildren(
      tile('Random', DICE, false, () => {
        const others = Avatars.list.filter(c => c.id !== picked);
        setCharacter(others[Math.floor(Math.random() * others.length)].id);
      }, ' random'),
      ...Avatars.list.map(ch => tile(ch.name, Avatars.svg(ch), ch.id === picked, () => setCharacter(ch.id))));
  }
  let charSave = Promise.resolve();
  function setCharacter(id) {
    const p = settings.profile;
    if (!p || p.character === id) return;
    const before = p.character;
    p.character = id; saveSettings();
    if (lastSnap && lastSnap.people) lastSnap.people.forEach(x => { if (x.me) x.character = id; });
    renderPicker($('#charPick')); renderPicker($('#loungePick')); renderLounge();
    const name = Avatars.list.find(c => c.id === id).name;
    $('#profMsg').textContent = `${name} is your character in the lounge.`;
    charSave = charSave.then(async () => {
      if (settings.profile !== p || p.character !== id) return; // a newer pick or a sign-out replaced this one
      try { await api('/profile', 'PATCH', { character: id }); beat(); }
      catch (err) {
        if (settings.profile === p && p.character === id) { p.character = before; saveSettings(); }
        renderPicker($('#charPick')); renderPicker($('#loungePick')); renderLounge();
        $('#profMsg').textContent = $('#loungeNote').textContent = `Could not save your character: ${err.message}`;
      }
    });
  }
  function signedIn(name, code, msg, character = null) {
    settings.profile = { name, code, character }; saveSettings();
    renderProfile();
    $('#profMsg').textContent = msg;
    queueSync({ add: sessions.map(s => s.id) }); // bring what is already on this device into the profile
    beat();
  }
  $('#profileForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#profName').value.trim();
    if (!name) return;
    $('#profMsg').textContent = 'Creating…';
    try {
      const r = await api('/profile', 'POST', { name });
      signedIn(r.name, r.code, 'Profile created. Note your sync code somewhere safe: it is the only way to link another device.');
      $('#profCode').textContent = r.code; $('#profShow').textContent = 'Hide';
      $('#profName').value = '';
    } catch (err) { $('#profMsg').textContent = err.message; }
  });
  $('#linkForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#linkName').value.trim(), code = $('#linkCode').value.trim().toUpperCase();
    if (!name || !code) return;
    $('#profMsg').textContent = 'Linking…';
    settings.profile = { name, code };
    try {
      const r = await api('/profile');
      signedIn(r.name, code, 'This device is linked.', r.character);
      $('#linkName').value = ''; $('#linkCode').value = '';
    } catch (err) { settings.profile = null; $('#profMsg').textContent = err.message; }
  });
  $('#profShow').addEventListener('click', () => {
    const hidden = $('#profShow').textContent === 'Show';
    $('#profCode').textContent = hidden ? settings.profile.code : '••••-••••-••••-••••';
    $('#profShow').textContent = hidden ? 'Hide' : 'Show';
  });
  $('#profSignOut').addEventListener('click', () => {
    settings.profile = null; saveSettings();
    outbox.add = []; outbox.remove = []; store.set('focus.outbox', outbox);
    renderProfile(); beat();
    $('#profMsg').textContent = 'Signed out. Your log stays in your profile, and a copy stays on this device.';
  });

  // Focusing together: ping while a timer or stopwatch runs; everyone (named or not) can see the count.
  let wasFocusing = null, lastSnap = null;
  async function beat() {
    const focusing = timer.running || sw.running;
    try {
      lastSnap = focusing || wasFocusing === false && lastSnap && lastSnap.self
        ? await api('/presence', 'POST', { client: clientId, focusing, status: focusing ? currentStatus() : null })
        : await api('/presence?client=' + clientId);
      lastSnap.self = focusing;
    } catch { lastSnap = null; }
    renderTogether(); renderLounge();
  }
  function renderTogether() {
    const chip = $('#together'), s = lastSnap;
    const others = s ? s.others : 0;
    chip.hidden = !s || (!s.self && !others);
    if (chip.hidden) { $('#togetherList').hidden = true; return; }
    const people = n => `${n} ${n === 1 ? 'person' : 'people'}`;
    $('#togetherText').textContent = s.self
      ? (others ? `You + ${others} other${others === 1 ? '' : 's'} focusing` : 'You’re focusing')
      : `${people(others)} focusing now`;
    const list = $('#togetherList'), anon = others - s.names.length;
    list.replaceChildren(Object.assign(document.createElement('b'), { textContent: 'Focusing now' }));
    if (s.self) list.append(Object.assign(document.createElement('div'), { textContent: settings.profile ? `${settings.profile.name} (you)` : 'You' }));
    for (const n of s.names) list.append(Object.assign(document.createElement('div'), { textContent: n }));
    if (anon > 0) list.append(Object.assign(document.createElement('div'), { className: 'anon', textContent: `${s.names.length || s.self ? '+ ' : ''}${people(anon)} without a name` }));
  }
  $('#together').addEventListener('click', () => {
    const list = $('#togetherList'); list.hidden = !list.hidden;
    $('#together').setAttribute('aria-expanded', String(!list.hidden));
  });
  document.addEventListener('click', e => { if (!e.target.closest('.together-wrap')) $('#togetherList').hidden = true; });
  setInterval(() => { if (!document.hidden || timer.running || sw.running) beat(); }, 25000);
  window.addEventListener('pagehide', () => { // closing the tab ends your focus for everyone else straight away
    if (timer.running || sw.running) navigator.sendBeacon(API + '/presence', JSON.stringify({ client: clientId, focusing: false }));
  });
  setInterval(() => queueSync(), 5 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { queueSync(); beat(); checkInbox(); } });

  // ---------- lounge: a table where everyone focusing right now sits ----------
  // Seats fill in the order people started. Anyone after the sixth waits in line.
  const CHEERS = {
    hello: { label: 'Hello!!', line: 'says hello!!' },
    luck: { label: 'Good luck to your work', line: 'says good luck to your work' },
    gotThis: { label: 'You got this!!', line: 'says you got this!!' },
  };
  const SEAT_X = [8.5, 25, 41.5, 58, 74.5, 91]; // six chairs along the table, left offset in %
  let loungeSig = '', seatedBefore = new Set();
  const loungeDialog = $('#loungeDialog');
  const sentLog = [];
  let cheerTo = null;

  async function loadPresence() {
    const focusing = timer.running || sw.running;
    try { lastSnap = await api('/presence?client=' + clientId); lastSnap.self = focusing; }
    catch { lastSnap = null; }
    renderTogether(); renderLounge();
  }
  setInterval(() => { if (loungeDialog.open) loadPresence(); }, 6000);

  function renderLounge() {
    if (!loungeDialog.open) return;
    const s = lastSnap || { people: [], guests: 0 };
    const signed = !!settings.profile, running = timer.running || sw.running;
    const all = [...(s.people || []), ...Array.from({ length: s.guests || 0 }, (_, i) => ({ guest: true, n: i }))];
    const sig = JSON.stringify([all, signed, running, settings.profile && settings.profile.character]);
    if (sig === loungeSig) return; // nothing changed: leave the scene alone so the animations keep going
    loungeSig = sig;

    renderMine();
    $('#loungeCount').textContent = all.length ? `${all.length} ${all.length === 1 ? 'person' : 'people'} focusing right now` : 'The room is quiet right now.';
    const myIdx = all.findIndex(p => p.me), ahead = myIdx - SEAT_X.length + 1;
    $('#loungeNote').textContent = !signed ? 'Create a profile in Settings to join the lounge and send cheers.'
      : !running ? 'Start a timer or stopwatch to take a seat. Pick your character in Settings.'
      : myIdx >= SEAT_X.length ? `The table is full. You are number ${ahead} in line, and you take the next free seat.`
      : 'Tap someone to send a cheer.';

    const scene = $('#loungeScene'), now = new Set();
    scene.replaceChildren(decor());
    SEAT_X.forEach((x, i) => {
      const p = all[i];
      const seat = el('div', { className: 'seat' }, el('span', { className: 'chair' }));
      seat.style.left = x + '%'; seat.style.setProperty('--d', (i * -.7) + 's');
      if (!p) { seat.classList.add('empty'); seat.title = 'Empty chair'; scene.append(seat); return; }
      const key = p.guest ? 'guest' + p.n : p.name;
      now.add(key);
      if (!seatedBefore.has(key)) seat.style.animation = 'settle .5s ease-out backwards';
      scene.append(seatContent(seat, p, signed));
    });
    scene.append(el('div', { className: 'lounge-table' }));
    seatedBefore = now;

    const line = all.slice(SEAT_X.length), q = $('#loungeQueue');
    q.hidden = !line.length;
    const row = el('div', { className: 'queue-row' });
    line.slice(0, 12).forEach(p => {
      const av = el('span', { className: 'queue-av' + (p.me ? ' me' : ''), title: p.guest ? 'Guest' : p.me ? 'You' : p.name });
      av.innerHTML = p.guest ? Avatars.guest() : Avatars.svg(Avatars.resolve(p.character, p.name));
      if (!p.guest && !p.me && signed) { av.classList.add('clickable'); av.addEventListener('click', () => openCheer(p.name)); }
      row.append(av);
    });
    if (line.length > 12) row.append(el('span', { className: 'queue-more', textContent: `+${line.length - 12}` }));
    q.replaceChildren(el('span', { className: 'queue-label', textContent: `Waiting for a seat · ${line.length}` }), row);
  }

  const DECOR = '<span class="win"><i></i></span><span class="lamp" style="left:30%"></span><span class="lamp" style="left:70%"></span>'
    + '<span class="shelf"><i></i><i></i></span><span class="plant"><i></i></span>';
  const decor = () => Object.assign(el('div', { className: 'decor' }), { innerHTML: DECOR });
  function renderDecor() {
    const h = new Date().getHours();
    $('#loungeScene').dataset.sky = h >= 8 && h < 17 ? 'day' : (h >= 17 && h < 20) || (h >= 6 && h < 8) ? 'dusk' : 'night';
  }
  function renderMine() {
    const p = settings.profile, row = $('#loungeMine');
    row.hidden = !p;
    if (!p) { $('#loungePick').hidden = true; return; }
    const ch = Avatars.resolve(p.character, p.name);
    $('#mineArt').innerHTML = Avatars.svg(ch);
    $('#mineName').textContent = `You are ${ch.name}`;
  }
  $('#mineChange').addEventListener('click', () => {
    const box = $('#loungePick'), open = box.hidden;
    box.hidden = !open;
    $('#mineChange').textContent = open ? 'Done' : 'Change';
    $('#mineChange').setAttribute('aria-expanded', String(open));
    if (open) renderPicker(box);
  });

  function seatContent(seat, p, signed) {
    const art = el('span', { className: 'figure' });
    if (p.guest) { seat.classList.add('guest'); art.innerHTML = Avatars.guest(); }
    else art.innerHTML = Avatars.svg(Avatars.resolve(p.character, p.name));
    if (p.me) seat.classList.add('me');
    if (!p.guest) seat.style.setProperty('--acc', Avatars.resolve(p.character, p.name).accent);
    const kids = [art, el('div', { className: 'gear' }, el('span', { className: 'laptop' }), el('span', { className: 'mug' }))];
    if (p.status) kids.push(el('span', { className: 'bubble', textContent: p.status, title: p.status }));
    kids.push(el('span', { className: 'who-tag', textContent: p.guest ? 'Guest' : p.me ? 'You' : p.name, title: p.guest ? '' : p.name }));
    seat.append(...kids);
    if (!p.guest && !p.me && signed) {
      seat.classList.add('clickable');
      seat.tabIndex = 0;
      seat.setAttribute('role', 'button');
      seat.setAttribute('aria-label', `Send ${p.name} a cheer`);
      seat.addEventListener('click', () => openCheer(p.name));
      seat.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCheer(p.name); } });
    }
    return seat;
  }

  function openCheer(name) {
    cheerTo = name;
    $('#cheerTo').textContent = `Send ${name} a cheer`;
    $('#cheerBar').hidden = false;
  }
  $('#cheerBar').addEventListener('click', e => {
    if (e.target.id === 'cheerCancel') { cheerTo = null; $('#cheerBar').hidden = true; return; }
    if (e.target.dataset.cheer && cheerTo) sendCheer(e.target.dataset.cheer);
  });
  async function sendCheer(kind) {
    const to = cheerTo;
    cheerTo = null; $('#cheerBar').hidden = true;
    try {
      const r = await api('/messages', 'POST', { to, kind });
      sentLog.unshift({ at: r.at, to: r.to, kind });
      sentLog.length = Math.min(sentLog.length, 5);
      renderSent();
    } catch (err) { $('#loungeNote').textContent = err.message; }
  }
  function renderSent() {
    $('#loungeLog').replaceChildren(...sentLog.map(s => el('li', {},
      el('span', { className: 'when', textContent: fmtWhen(s.at) }),
      el('span', { textContent: `Sent to ${s.to}: “${CHEERS[s.kind].label}”` }))));
  }
  $('#openLounge').addEventListener('click', () => {
    cheerTo = null; $('#cheerBar').hidden = true;
    $('#loungePick').hidden = true; $('#mineChange').textContent = 'Change'; $('#mineChange').setAttribute('aria-expanded', 'false');
    loungeSig = ''; seatedBefore = new Set();
    renderDecor();
    loungeDialog.showModal();
    renderSent(); loadPresence();
  });

  // ---------- cheers received ----------
  // Held while hyperfocus is on and a session is running. Released when the session ends or hyperfocus is switched off.
  const shownNotes = new Set();
  let inboxBusy = false;
  async function checkInbox() {
    if (!settings.profile || inboxBusy || document.hidden) return;
    if (settings.hyperfocus && inSession()) return;
    inboxBusy = true;
    try {
      const { messages } = await api('/inbox');
      const fresh = messages.filter(m => !shownNotes.has(m.id));
      fresh.forEach(showNote);
      const today = dayKey(new Date());
      if (fresh.length && inSession() && isFirstSessionToday() && store.get('focus.hintDay', null) !== today) {
        store.set('focus.hintDay', today); // once a day
        toast('Press H for hyperfocus to hold cheers until you finish.');
      }
      if (messages.length) await api('/inbox/ack', 'POST', { ids: messages.map(m => m.id) });
    } catch { /* offline: the next check picks them up */ }
    finally { inboxBusy = false; }
  }
  setInterval(checkInbox, 15000);

  // send time of a cheer; held ones can be from yesterday, so those get the day too
  const fmtWhen = at => dayKey(new Date(at)) === dayKey(new Date()) ? fmtTime(at)
    : `${new Date(at).toLocaleDateString([], { weekday: 'short' })} ${fmtTime(at)}`;
  function showNote(m) {
    shownNotes.add(m.id);
    const art = el('span', { className: 'note-av' });
    art.innerHTML = Avatars.svg(Avatars.resolve(m.character, m.from));
    const x = el('button', { className: 'icon note-x', textContent: '×' });
    x.title = 'Dismiss'; x.setAttribute('aria-label', 'Dismiss');
    const card = el('div', { className: 'notice', role: 'status' }, art,
      el('div', { className: 'note-text' },
        el('b', { textContent: `${m.from} ${CHEERS[m.kind] ? CHEERS[m.kind].line : 'says hi'}` }),
        el('time', { textContent: fmtWhen(m.at), dateTime: new Date(m.at).toISOString() })),
      x);
    x.addEventListener('click', () => card.remove());
    const box = $('#notices');
    box.prepend(card);
    while (box.children.length > 6) box.lastElementChild.remove();
  }

  // ---------- keyboard shortcuts: ignored while typing or while a dialog is open ----------
  document.addEventListener('keydown', e => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (document.querySelector('dialog[open]')) return;
    const act = { s: openSettings, t: () => setView(settings.view === 'nature' ? 'city' : 'nature'),
      m: () => setSound(!settings.sound), v: () => setMotion(!settings.motion), h: () => setHyper(!settings.hyperfocus) }[e.key.toLowerCase()];
    if (act) { e.preventDefault(); act(); }
  });

  applyVisibility();
  queueSync();
  tick();
  renderPlace();
  loadWeather();
  checkInbox();
})();
