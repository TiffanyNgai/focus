/* Photo backdrop: picks the real city photograph that best matches the sun position,
   current weather and season of the chosen city, and layers live rain / snow / fog on top. */
(function () {
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  const layerEls = [...document.querySelectorAll('#bg .layer')];

  const params = new URLSearchParams(location.search); // preview overrides: ?hour=21&weather=snow&month=1
  const env = { lat: 43.4643, lon: -80.5204, code: 0, cloud: 20, temp: 10, wind: 8 };

  // t: day | gold (sunrise, sunset) | blue (twilight) | night      w: weather the photo shows      s: seasons it suits
  const PHOTOS = [
    { id: '1637738297006-40bd0dc8fee0', t: 'day', w: ['clear'], s: ['summer', 'spring'] },
    { id: '1789561664830-81e65d3d098a', t: 'day', w: ['clear', 'cloud'], s: ['summer', 'spring'] },
    { id: '1656638706997-11ec84e134d9', t: 'day', w: ['clear'], s: ['autumn'] },
    { id: '1764824765900-4ff640d69225', t: 'day', w: ['clear'], s: ['autumn'] },
    { id: '1784984861912-22ac746e766d', t: 'day', w: ['clear'], s: ['spring'] },
    { id: '1775127493560-6d23cfe56ddb', t: 'day', w: ['cloud'], s: ['spring'] },
    { id: '1736512642636-423ec6799e76', t: 'day', w: ['clear'], s: ['winter'] },
    { id: '1644803188464-0f0f66823a95', t: 'day', w: ['cloud', 'snow'], s: ['winter'] },
    { id: '1641186539288-9c3f26725b12', t: 'day', w: ['snow', 'cloud'], s: ['winter'] },
    { id: '1769698821841-964dbcf5f72b', t: 'day', w: ['snow'], s: ['winter'] },
    { id: '1502905704466-2690947baeee', t: 'day', w: ['cloud'] },
    { id: '1716611342057-ed83a6fa814b', t: 'day', w: ['cloud'] },
    { id: '1557219525-f4dd82164027', t: 'day', w: ['rain'] },
    { id: '1518983682921-e8a9e4177988', t: 'day', w: ['rain'] },
    { id: '1664309761060-f6522c0616c9', t: 'day', w: ['fog'] },
    { id: '1792103151280-55c23174d0c4', t: 'day', w: ['fog'] },
    { id: '1756828791052-5cd529e650b5', t: 'gold', w: ['clear'] },
    { id: '1670813347701-352337009210', t: 'gold', w: ['clear'] },
    { id: '1768324678501-82940ccabb91', t: 'gold', w: ['fog', 'cloud'] },
    { id: '1733514719927-0a469f44ed42', t: 'gold', w: ['clear', 'cloud'], s: ['winter'] },
    { id: '1546447208-9d7b923c0204', t: 'blue', w: ['clear'] },
    { id: '1759222973482-3c0d90dd8549', t: 'blue', w: ['clear'] },
    { id: '1741711333479-72849315b098', t: 'blue', w: ['clear', 'cloud'] },
    { id: '1706950973451-fee757fdff40', t: 'blue', w: ['clear'], s: ['winter'] },
    { id: '1740151012774-2a9a839bb844', t: 'blue', w: ['snow', 'cloud'], s: ['winter'] },
    { id: '1664353655151-9d94a9170eb0', t: 'night', w: ['clear', 'cloud'] },
    { id: '1611323340350-bdcc0e6cfae5', t: 'night', w: ['clear', 'cloud'] },
    { id: '1725072318216-1a56e31a3049', t: 'night', w: ['rain'] },
    { id: '1752486345389-ed3b299f34af', t: 'night', w: ['rain'] },
    { id: '1763393434899-bd2837aab221', t: 'night', w: ['snow'], s: ['winter'] },
  ];
  const PHASES = ['day', 'gold', 'blue', 'night'];
  const NEAR = { 'clear|cloud': 10, 'cloud|rain': 18, 'cloud|fog': 14, 'cloud|snow': 12, 'fog|rain': 8, 'fog|snow': 8 };

  let W = 0, H = 0, DPR = 1;
  let state = null, shown = null, front = 0, drops = [], flash = 0, running = false;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  // ---------- time, sun, season, weather ----------
  function now() {
    if (params.has('hour')) { // pretend it is this local solar hour in the city
      const d = new Date(); d.setUTCHours(0, 0, 0, 0);
      return new Date(d.getTime() + (parseFloat(params.get('hour')) - env.lon / 15) * 3600e3);
    }
    return new Date();
  }

  function sunElevation(date, lat, lon) {
    const rad = Math.PI / 180;
    const d = date.getTime() / 86400000 - 10957.5;
    const g = (357.528 + 0.9856003 * d) * rad;
    const lam = (280.460 + 0.9856474 * d + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
    const eps = (23.439 - 4e-7 * d) * rad;
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
    const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    const ha = (18.697374558 + 24.06570982441908 * d) * 15 * rad + lon * rad - ra;
    return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha)) / rad;
  }

  function season() {
    let m = params.has('month') ? parseInt(params.get('month'), 10) - 1 : new Date().getMonth();
    if (env.lat < 0) m = (m + 6) % 12;
    return m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
  }

  function weather() {
    const o = params.get('weather');
    let c = env.code, cloud = env.cloud / 100;
    if (o) {
      c = { clear: 0, cloudy: 3, fog: 45, drizzle: 53, rain: 63, snow: 73, storm: 95 }[o] ?? c;
      cloud = c === 0 ? 0.05 : 1;
    }
    const w = { kind: cloud > .65 ? 'cloud' : 'clear', rain: 0, snow: 0, fog: 0, storm: false };
    if (c === 45 || c === 48) { w.fog = 1; w.kind = 'fog'; }
    else if (c >= 51 && c <= 57) w.rain = .3;
    else if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) w.rain = c === 61 || c === 80 ? .5 : c === 63 || c === 81 ? .75 : 1;
    else if ((c >= 71 && c <= 77) || c === 85 || c === 86) w.snow = c === 71 || c === 77 ? .4 : c === 73 || c === 85 ? .7 : 1;
    else if (c >= 95) { w.rain = 1; w.storm = true; }
    if (w.rain) w.kind = 'rain';
    if (w.snow) w.kind = 'snow';
    return w;
  }

  // ---------- choosing a photo ----------
  function hash(str) { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; }

  function choose(phase, wx, seas) {
    const day = Math.floor(Date.now() / 864e5);
    let best = null, top = -Infinity;
    for (const p of PHOTOS) {
      let score = [100, 45, 10, 0][Math.abs(PHASES.indexOf(p.t) - PHASES.indexOf(phase))];
      score += Math.max(...p.w.map(k => k === wx.kind ? 30 : NEAR[[k, wx.kind].sort().join('|')] || 0));
      if (!p.s) score += 7;
      else if (p.s.includes(seas)) score += 14;
      else if (p.s.includes('winter') && !wx.snow) score -= 60; // no snowy streets in July
      score += hash(p.id + day) * 5; // rotate between equally good photos from day to day
      if (score > top) { top = score; best = p; }
    }
    return best;
  }

  function update() {
    const e = sunElevation(now(), env.lat, env.lon);
    const phase = e > 6 ? 'day' : e > -1.5 ? 'gold' : e > -8 ? 'blue' : 'night';
    const wx = weather();
    const photo = choose(phase, wx, season());

    // colour grade for whatever the photo itself can't show
    const tints = [];
    const gap = PHASES.indexOf(phase) - PHASES.indexOf(photo.t);
    if (gap > 0) tints.push(`rgba(8,12,30,${Math.min(.3 * gap, .6)})`);
    if (phase === 'day' && e < 14 && wx.kind === 'clear') tints.push(`rgba(255,170,90,${(.1 * (14 - e) / 8).toFixed(3)})`);
    if (wx.kind !== 'clear' && !photo.w.some(k => k !== 'clear')) tints.push(phase === 'night' ? 'rgba(40,46,60,.3)' : 'rgba(120,128,140,.32)');
    if (wx.storm) tints.push('rgba(10,14,26,.3)');
    state = { e, phase, wx, photo, tints, fog: wx.fog ? (photo.w.includes('fog') ? .12 : .42) : wx.rain || wx.snow ? .1 : 0 };

    show(photo);
    draw();
    if ((wx.rain || wx.snow) && !running) { running = true; requestAnimationFrame(loop); }
  }

  function show(photo) {
    const step = 320; // request a size close to the screen so both orientations get a proper crop
    const w = Math.min(3840, Math.ceil(W * DPR / step) * step), h = Math.min(3840, Math.ceil(H * DPR / step) * step);
    const url = `https://images.unsplash.com/photo-${photo.id}?auto=format&fit=crop&q=80&w=${w}&h=${h}`;
    if (url === shown) return;
    shown = url;
    const img = new Image();
    img.onload = () => {
      if (shown !== url) return; // something newer was requested meanwhile
      front = 1 - front;
      layerEls[front].style.backgroundImage = `url("${url}")`;
      layerEls[front].classList.add('on');
      layerEls[1 - front].classList.remove('on');
    };
    img.onerror = () => { if (shown === url) shown = null; };
    img.src = url;
  }

  // ---------- weather overlay ----------
  function draw(t = 0) {
    if (!state || !W || !H) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const c of state.tints) { ctx.fillStyle = c; ctx.fillRect(0, 0, W, H); }

    const dark = state.phase === 'night' || state.phase === 'blue';
    if (state.fog) {
      const g = ctx.createLinearGradient(0, 0, 0, H), c = dark ? '70,78,96' : '214,220,226';
      g.addColorStop(0, `rgba(${c},${state.fog * .55})`); g.addColorStop(.7, `rgba(${c},${state.fog})`); g.addColorStop(1, `rgba(${c},${state.fog * .8})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    const wx = state.wx, amt = wx.rain || wx.snow;
    const want = amt ? Math.round(amt * (wx.rain ? 240 : 190) * clamp(W * H / 9e5, .5, 2.2)) : 0;
    while (drops.length < want) drops.push({ x: Math.random() * 1.2 - .1, y: Math.random(), z: .35 + Math.random() * .65, p: Math.random() * 6.28 });
    drops.length = Math.min(drops.length, want);
    if (want) {
      const slant = clamp(env.wind / 60, 0, .5);
      if (wx.rain) {
        ctx.strokeStyle = dark ? 'rgba(170,190,220,.3)' : 'rgba(235,240,248,.36)';
        ctx.lineWidth = 1; ctx.beginPath();
        for (const d of drops) {
          d.y += .024 * d.z; d.x += .024 * d.z * slant * H / W;
          if (d.y > 1.05) { d.y = -.05; d.x = Math.random() * 1.3 - .3; }
          const len = 18 * d.z;
          ctx.moveTo(d.x * W, d.y * H); ctx.lineTo(d.x * W - slant * len, d.y * H - len);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = dark ? '#dfe6f5' : '#fff';
        for (const d of drops) {
          d.y += .0022 * d.z; d.x += (Math.sin(t * .8 + d.p) * .0006 + slant * .002) * d.z;
          if (d.y > 1.02) { d.y = -.02; d.x = Math.random() * 1.3 - .3; }
          ctx.globalAlpha = .3 + d.z * .55;
          ctx.beginPath(); ctx.arc(d.x * W, d.y * H, .8 + d.z * 1.9, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    if (wx.storm && Math.random() < .0025) flash = 1;
    if (flash > .02) { ctx.fillStyle = `rgba(235,240,255,${flash * .35})`; ctx.fillRect(0, 0, W, H); flash *= .86; }
  }

  function loop(ts) {
    if (!state || !(state.wx.rain || state.wx.snow)) { running = false; draw(); return; }
    draw(ts / 1000);
    requestAnimationFrame(loop);
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    if (!W || !H) return;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    update();
  }

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); });
  setInterval(update, 60000);
  resize();

  window.Scene = { set(u) { Object.assign(env, u); if (W && H) update(); } };
})();
