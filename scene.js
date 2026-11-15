/* Backdrop: picks the real photograph or video that best matches the sun position,
   current weather and season of the chosen city, and layers live rain / snow / fog on top. */
(function () {
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  const layerEls = [...document.querySelectorAll('#bg .layer')];
  const videoEl = document.querySelector('#bg video');

  const params = new URLSearchParams(location.search); // preview overrides: ?hour=21&weather=snow&month=1
  const env = { lat: 43.4643, lon: -80.5204, code: 0, cloud: 20, temp: 10, wind: 8, view: 'city', motion: true };

  // "time weather[,weather] [season,season] id"
  //   time: day | gold (sunrise, sunset) | blue (twilight) | night
  const parse = list => list.trim().split('\n').map(line => {
    const [t, w, a, b] = line.trim().split(/\s+/);
    return { t, w: w.split(','), s: b ? a.split(',') : null, id: b || a };
  });

  const MEDIA = {
    city: {
      photos: parse(`
        day clear summer,spring 1637738297006-40bd0dc8fee0
        day clear,cloud summer,spring 1789561664830-81e65d3d098a
        day clear autumn 1656638706997-11ec84e134d9
        day clear autumn 1764824765900-4ff640d69225
        day clear spring 1784984861912-22ac746e766d
        day cloud spring 1775127493560-6d23cfe56ddb
        day clear winter 1736512642636-423ec6799e76
        day cloud,snow winter 1644803188464-0f0f66823a95
        day snow,cloud winter 1641186539288-9c3f26725b12
        day snow winter 1769698821841-964dbcf5f72b
        day cloud 1502905704466-2690947baeee
        day cloud 1716611342057-ed83a6fa814b
        day rain 1557219525-f4dd82164027
        day rain 1518983682921-e8a9e4177988
        day fog 1664309761060-f6522c0616c9
        day fog 1792103151280-55c23174d0c4
        gold clear 1756828791052-5cd529e650b5
        gold clear 1670813347701-352337009210
        gold fog,cloud 1768324678501-82940ccabb91
        gold clear,cloud winter 1733514719927-0a469f44ed42
        blue clear 1546447208-9d7b923c0204
        blue clear 1759222973482-3c0d90dd8549
        blue clear,cloud 1741711333479-72849315b098
        blue clear winter 1706950973451-fee757fdff40
        blue snow,cloud winter 1740151012774-2a9a839bb844
        night clear,cloud 1664353655151-9d94a9170eb0
        night clear,cloud 1611323340350-bdcc0e6cfae5
        night rain 1725072318216-1a56e31a3049
        night rain 1752486345389-ed3b299f34af
        night snow winter 1763393434899-bd2837aab221`),
      videos: parse(`
        night clear,cloud 49878
        night clear,cloud 41161
        night clear,cloud 34562
        night rain 4331
        night rain 4332
        night fog 9678
        day snow winter 3323
        blue clear,cloud 41375
        blue clear,cloud 49845
        gold clear 4308
        day clear,cloud 2034
        day clear 4000`),
    },
    nature: {
      photos: parse(`
        day clear summer 1559310589-2673bfe16970
        day clear summer 1571502297375-0fe3ea2d1d48
        day clear spring 1713439340151-6f1e7f6fb9c9
        day clear,cloud spring 1651915745310-a9e32a61cf53
        day clear autumn 1727911295427-f7e0df078895
        day clear autumn 1559153668-469d592824a2
        day cloud autumn 1635250164981-8205b58b11b0
        day clear winter 1465220183275-1faa863377e3
        day clear winter 1418985991508-e47386d96a71
        day cloud winter 1483921020237-2ff51e8e4b22
        day cloud 1506260408121-e353d10b87c7
        day cloud 1464131065363-9e30e13470f6
        day rain 1511884642898-4c92249e20b6
        day rain,fog 1542273917363-3b1817f69a2d
        day rain,fog 1692877380682-978925c2195d
        day fog 1758023822490-d67991c886ca
        day fog 1634729609790-4655c1b7a94d
        day fog autumn 1636169419376-fcc395450370
        day snow winter 1660605483431-60ab69c6fdfb
        day snow winter 1732183940953-4fabd045d5e3
        day snow winter 1644256196117-3b2a94686f63
        gold clear 1500964757637-c85e8a162699
        gold clear,cloud 1629482472125-a8a8faae4dd6
        gold clear,cloud 1625465004402-d16eb1e01960
        blue clear 1604856420566-576ba98b53cd
        blue clear 1552845108-5f775a2ccb9b
        blue clear,cloud 1489183988443-b37b7e119ba6
        blue fog,rain 1644307559162-4aa2eb0d0c8c
        blue rain,fog 1552486289-7a93ac6d69a5
        blue clear,snow winter 1610011722905-a2d4b5fca8c0
        night clear 1519681393784-d120267933ba
        night clear 1515705576963-95cad62945b6
        night clear winter 1574610758891-5b809b6e6e2e
        night snow,cloud winter 1641743442450-702a2dfee4fa`),
      videos: parse(`
        day clear summer,spring 5016
        day clear summer,spring 4078
        day clear,cloud 1954
        day clear summer 4366
        day clear 51791
        day cloud 4132
        day cloud summer,spring 41545
        day clear autumn 9598
        day clear,cloud autumn 17746
        day clear autumn 14911
        day clear winter 4283
        day rain 22729
        day rain,fog 22728
        day fog 47655
        day fog autumn 35013
        day fog,cloud winter 3308
        day snow winter 3352
        day snow,fog winter 35040
        gold clear 4119
        gold clear,cloud 15169
        gold clear 25163
        gold clear 5002
        gold clear summer 40657
        gold clear winter 28844
        blue clear 3100
        blue clear 2168
        blue clear,cloud 4695
        blue fog 34841
        blue clear winter 3350
        night clear 1704
        night clear 4148
        night rain 4422`),
    },
  };

  const PHASES = ['day', 'gold', 'blue', 'night'];
  const NEAR = { 'clear|cloud': 10, 'cloud|rain': 18, 'cloud|fog': 14, 'cloud|snow': 12, 'fog|rain': 8, 'fog|snow': 8 };

  let W = 0, H = 0, DPR = 1;
  let state = null, shown = null, shownVideo = null, front = 0, drops = [], flash = 0, running = false;

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

  // ---------- choosing what to show ----------
  function hash(str) { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; }

  function choose(pool, phase, wx, seas) {
    const day = Math.floor(Date.now() / 864e5);
    let best = null, top = -Infinity;
    for (const p of pool) {
      let score = [100, 45, 10, 0][Math.abs(PHASES.indexOf(p.t) - PHASES.indexOf(phase))];
      score += Math.max(...p.w.map(k => k === wx.kind ? 30 : NEAR[[k, wx.kind].sort().join('|')] || 0));
      if (!p.s) score += 7;
      else if (p.s.includes(seas)) score += 14;
      else if (p.s.includes('winter') && !wx.snow) score -= 60; // no snowy scenes in July
      const fit = score;
      score += hash(p.id + day) * 5; // rotate between equally good picks from day to day
      if (score > top) { top = score; best = { ...p, fit }; }
    }
    return best;
  }

  function update() {
    const e = sunElevation(now(), env.lat, env.lon);
    const phase = e > 6 ? 'day' : e > -1.5 ? 'gold' : e > -8 ? 'blue' : 'night';
    const wx = weather(), seas = season();
    const set = MEDIA[env.view] || MEDIA.city;
    const photo = choose(set.photos, phase, wx, seas);
    let video = env.motion ? choose(set.videos, phase, wx, seas) : null;
    if (video && video.fit < 118) video = null; // only when it truly matches the time and weather
    const media = video || photo;

    // colour grade for whatever the picture itself can't show
    const tints = [];
    const gap = PHASES.indexOf(phase) - PHASES.indexOf(media.t);
    if (gap > 0) tints.push(`rgba(8,12,30,${Math.min(.3 * gap, .6)})`);
    if (phase === 'day' && e < 14 && wx.kind === 'clear') tints.push(`rgba(255,170,90,${(.1 * (14 - e) / 8).toFixed(3)})`);
    if (wx.kind !== 'clear' && !media.w.some(k => k !== 'clear')) tints.push(phase === 'night' ? 'rgba(40,46,60,.3)' : 'rgba(120,128,140,.32)');
    if (wx.storm) tints.push('rgba(10,14,26,.3)');
    const showsIt = !!video && media.w.includes(wx.kind); // footage already has its own rain or snow
    state = {
      e, phase, wx, tints, amount: showsIt ? .35 : 1,
      fog: wx.fog ? (media.w.includes('fog') ? .12 : .42) : wx.rain || wx.snow ? .1 : 0,
    };

    // brighter scenes get a stronger shade behind the clock
    const bright = media.t === 'day' ? (media.w.some(k => k === 'fog' || k === 'snow' || k === 'cloud') ? .5 : .42)
      : media.t === 'gold' ? .36 : media.t === 'blue' ? .26 : .2;
    document.documentElement.style.setProperty('--scrim', bright);

    showPhoto(photo);
    showVideo(video);
    draw();
    if ((wx.rain || wx.snow) && !running) { running = true; requestAnimationFrame(loop); }
  }

  function showPhoto(photo) {
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

  function showVideo(video) {
    const id = video ? video.id : null;
    if (id === shownVideo) return;
    shownVideo = id;
    videoEl.classList.remove('on');
    if (!id) { setTimeout(() => { if (!shownVideo) { videoEl.removeAttribute('src'); videoEl.load(); } }, 2600); return; }
    videoEl.src = `https://assets.mixkit.co/videos/${id}/${id}-720.mp4`;
    videoEl.play().catch(() => { /* autoplay blocked: the photo stays */ });
  }
  videoEl.addEventListener('playing', () => { if (shownVideo) videoEl.classList.add('on'); });
  videoEl.addEventListener('error', () => { videoEl.classList.remove('on'); });

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

    const wx = state.wx, amt = (wx.rain || wx.snow) * state.amount;
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
