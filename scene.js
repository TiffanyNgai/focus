/* Live city scene: sky follows the real sun position for the chosen city,
   clouds / rain / snow / fog follow the current weather, trees follow the season. */
(function () {
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  const city = document.createElement('canvas');
  const cctx = city.getContext('2d');

  const params = new URLSearchParams(location.search); // preview overrides: ?hour=21&weather=snow&month=1
  const env = { lat: 43.4643, lon: -80.5204, code: 0, cloud: 20, temp: 10, wind: 8 };

  let W = 0, H = 0, DPR = 1, ground = 0, U = 60;
  let layers = [], trees = [], stars = [], clouds = [], sprites = [], drops = [];
  let light = null, lastPaint = 0, flash = 0;

  // ---------- helpers ----------
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ---------- time, sun, season, weather ----------
  function now() {
    if (params.has('hour')) { // pretend it is this local solar hour in the city
      const d = new Date(); d.setUTCHours(0, 0, 0, 0);
      return new Date(d.getTime() + (parseFloat(params.get('hour')) - env.lon / 15) * 3600e3);
    }
    return new Date();
  }

  function sunPos(date, lat, lon) {
    const rad = Math.PI / 180;
    const d = date.getTime() / 86400000 - 10957.5;
    const g = (357.528 + 0.9856003 * d) * rad;
    const lam = (280.460 + 0.9856474 * d + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
    const eps = (23.439 - 4e-7 * d) * rad;
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
    const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    const gmst = (18.697374558 + 24.06570982441908 * d) * 15 * rad;
    let ha = gmst + lon * rad - ra;
    ha = Math.atan2(Math.sin(ha), Math.cos(ha));
    const elev = Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha));
    return { elev: elev / rad, ha: ha / rad };
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
    const w = { cloud, rain: 0, snow: 0, fog: 0, storm: false };
    if (c === 45 || c === 48) { w.fog = 1; w.cloud = Math.max(cloud, .8); }
    else if (c >= 51 && c <= 57) w.rain = .3;
    else if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) w.rain = c === 61 || c === 80 ? .5 : c === 63 || c === 81 ? .75 : 1;
    else if ((c >= 71 && c <= 77) || c === 85 || c === 86) w.snow = c === 71 || c === 77 ? .4 : c === 73 || c === 85 ? .7 : 1;
    else if (c >= 95) { w.rain = 1; w.storm = true; }
    if (w.rain || w.snow) w.cloud = Math.max(w.cloud, .9);
    return w;
  }

  // ---------- lighting ----------
  const SKY = [ // sun elevation → [top, middle, horizon]
    [-18, '#04060e', '#080d1c', '#111a30'],
    [-9,  '#0a1026', '#1a2247', '#3b3a66'],
    [-4,  '#131d47', '#4a4479', '#c4707a'],
    [0,   '#27407c', '#8d7fa6', '#f79a63'],
    [5,   '#3d6fb0', '#9fb4d6', '#ffd09a'],
    [14,  '#3f84cc', '#84b6e3', '#d5e6f3'],
    [50,  '#2c7bd0', '#6aaeea', '#c2e1f8'],
  ].map(k => [k[0], hex(k[1]), hex(k[2]), hex(k[3])]);

  function computeLight() {
    const sun = sunPos(now(), env.lat, env.lon);
    const wx = weather();
    const e = sun.elev;
    let i = 0;
    while (i < SKY.length - 2 && e > SKY[i + 1][0]) i++;
    const a = SKY[i], b = SKY[i + 1], t = clamp((e - a[0]) / (b[0] - a[0]));
    let sky = [mix(a[1], b[1], t), mix(a[2], b[2], t), mix(a[3], b[3], t)];

    // overcast: pull the sky toward a flat grey of similar brightness
    const grey = clamp(wx.cloud * .8 + wx.fog * .3 - .15) * (wx.rain || wx.snow ? 1 : .85);
    sky = sky.map(c => {
      const l = (c[0] * .3 + c[1] * .5 + c[2] * .2) * (wx.storm ? .55 : wx.rain ? .75 : .92);
      return mix(c, [l * .95, l, l * 1.08], grey);
    });

    const day = smooth(-6, 8, e);
    const dusk = clamp(1 - Math.abs(e - 1) / 8) * (1 - grey);
    const snowy = wx.snow > 0 || (season() === 'winter' && env.temp <= 0 && !params.has('weather')) ||
      (params.get('weather') === 'snow');
    return { sun, wx, e, sky, day, night: 1 - day, dusk, grey, snowy, season: season() };
  }

  // ---------- geometry ----------
  function build() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    if (!W || !H) { light = null; return; }
    canvas.width = city.width = Math.round(W * DPR);
    canvas.height = city.height = Math.round(H * DPR);
    const portrait = H > W;
    ground = H * (portrait ? .9 : .87);
    U = clamp(Math.max(W / 14, H / 16), 34, 110);

    const r = rng(11);
    const spec = portrait
      ? [[.26, .56, 1.15], [.16, .40, 1], [.07, .24, 1.1]]
      : [[.22, .52, 1.1], [.13, .36, 1], [.06, .21, 1.15]];
    layers = spec.map(([lo, hi, wm], li) => {
      const list = [];
      let x = -U * r();
      while (x < W) {
        const w = U * (.6 + r() * 1.1) * wm;
        const h = Math.min(H * (lo + Math.pow(r(), 1.7) * (hi - lo)), w * 6.5);
        list.push({ x, w, h, roof: r(), seed: (r() * 1e9) | 0 });
        x += w + (r() < .3 ? U * r() * .6 : -U * .04);
      }
      if (li === 0 && list.length > 2) { // one landmark tower
        const b = list[Math.floor(list.length * .62)];
        b.h = Math.min(H * (hi + .06), b.w * 8); b.roof = 2;
      }
      return list;
    });

    trees = [];
    let tx = U * .2 * r();
    while (tx < W) {
      trees.push({ x: tx, s: U * (.38 + r() * .3), seed: (r() * 1e9) | 0 });
      tx += U * (.45 + r() * 1.4);
    }

    const sr = rng(5);
    stars = Array.from({ length: Math.round(clamp(W * H / 7000, 80, 320)) }, () =>
      ({ x: sr(), y: Math.pow(sr(), 1.4), r: .4 + sr() * 1.1, p: sr() * 6.28, s: .4 + sr() * 1.6 }));

    const cr = rng(23);
    clouds = Array.from({ length: 14 }, (_, i) => ({
      x: cr() * 1.4 - .2, y: .04 + cr() * .5, s: .7 + cr() * 1.1, k: i % 4, v: .5 + cr(),
    }));
    drops = [];
    paint();
  }

  // ---------- cached layers (repainted when the light changes) ----------
  function makeSprites(col) {
    sprites = [0, 1, 2, 3].map(k => {
      const c = document.createElement('canvas'); c.width = 360; c.height = 150;
      const x = c.getContext('2d'), r = rng(40 + k);
      for (let i = 0; i < 9; i++) {
        const px = 70 + r() * 220, py = 62 + r() * 42, pr = 34 + r() * 36;
        const g = x.createRadialGradient(px, py, 0, px, py, pr);
        g.addColorStop(0, rgb(col, .5)); g.addColorStop(1, rgb(col, 0));
        x.fillStyle = g; x.fillRect(0, 0, 360, 150);
      }
      return c;
    });
  }

  function paint() {
    light = computeLight();
    lastPaint = performance.now();
    const L = light, horizon = L.sky[2];

    // clouds
    let cc = mix([40, 48, 68], [250, 250, 252], L.day);
    cc = mix(cc, mix(horizon, [255, 190, 150], .4), L.dusk * .55);
    cc = mix(cc, mix([24, 28, 40], [150, 158, 170], L.day), L.grey * (L.wx.rain ? .75 : .5));
    makeSprites(cc);

    // city
    const c = cctx;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, W, H);
    const body = mix([9, 12, 24], [86, 98, 124], L.day);
    const snow = mix([70, 84, 120], [240, 244, 250], clamp(L.day + .1));
    const late = Math.abs(L.sun.ha) > 150 ? .3 : Math.abs(L.sun.ha) > 125 ? .5 : .68; // fewer lights late at night

    layers.forEach((list, li) => {
      const haze = [.62, .38, .14][li] + L.wx.fog * .25;
      const col = mix(body, horizon, clamp(haze));
      const cw = U * (.13 - li * .005), ch = U * .17;
      for (const b of list) {
        const top = ground - b.h, r = rng(b.seed);
        c.fillStyle = rgb(col);
        c.fillRect(b.x, top, b.w, b.h + 2);
        if (b.roof === 2) { // spire
          c.fillRect(b.x + b.w * .3, top - b.w * .35, b.w * .4, b.w * .35);
          c.fillRect(b.x + b.w * .48, top - b.w * 1.3, b.w * .04, b.w);
        } else if (b.roof < .28) c.fillRect(b.x + b.w * .2, top - U * .12, b.w * .6, U * .12);
        else if (b.roof < .42) c.fillRect(b.x + b.w * .7, top - U * .3, 1.5, U * .3);
        else if (b.roof < .5) c.fillRect(b.x + b.w * .12, top - U * .07, b.w * .25, U * .07);

        if (L.snowy && li > 0) { c.fillStyle = rgb(snow, .9); c.fillRect(b.x - 1, top - 2, b.w + 2, 3.5); }

        // windows
        const cols = Math.floor((b.w - cw * .8) / cw), rows = Math.floor((b.h - ch) / ch);
        const ox = b.x + (b.w - cols * cw) / 2, warm = r() < .8;
        const litCol = warm ? [255, 208 + r() * 30, 140] : [208, 228, 255];
        const lit = late * (.55 + r() * .6);
        const dim = [1, .8, .55][2 - li];
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const v = r(), wx = ox + x * cw + cw * .2, wy = top + ch * .6 + y * ch;
          if (L.night > .05 && v < lit) {
            c.fillStyle = rgb(litCol, L.night * dim * (.45 + v / lit * .5));
          } else {
            c.fillStyle = L.day > .5 ? rgb([20, 32, 56], .22 * L.day * dim) : rgb([255, 255, 255], .03);
          }
          c.fillRect(wx, wy, cw * .6, ch * .55);
        }
      }
    });

    // ground
    const gcol = L.snowy ? mix(snow, horizon, .15) : mix([7, 9, 16], [74, 84, 92], L.day);
    c.fillStyle = rgb(gcol);
    c.fillRect(0, ground, W, H - ground);

    // trees
    const pal = {
      spring: ['#8fc774', '#a6d48a', '#f3b6c8', '#9ccf80'],
      summer: ['#3f8a4a', '#4c9a55', '#357a43', '#458f4e'],
      autumn: ['#d9792b', '#c94f2a', '#e0a530', '#a8452a'],
    }[L.season];
    const shade = col => mix(mix([8, 11, 20], col, clamp(.16 + L.day * .84)), horizon, .12 + L.grey * .1);
    const trunk = rgb(shade([58, 44, 38]));
    for (const t of trees) {
      const r = rng(t.seed), s = t.s, x = t.x, y = ground + 1;
      c.strokeStyle = trunk; c.lineCap = 'round';
      c.lineWidth = Math.max(1.5, s * .09);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - s * .75); c.stroke();
      if (!pal) { // bare winter branches
        c.lineWidth = Math.max(1, s * .045);
        for (let i = 0; i < 7; i++) {
          const by = y - s * (.4 + r() * .4), a = -Math.PI / 2 + (r() - .5) * 2.2, len = s * (.3 + r() * .4);
          const ex = x + Math.cos(a) * len, ey = by + Math.sin(a) * len;
          c.beginPath(); c.moveTo(x, by); c.lineTo(ex, ey); c.stroke();
          if (L.snowy) { c.fillStyle = rgb(snow, .85); c.beginPath(); c.arc(ex, ey, s * .06, 0, 7); c.fill(); }
        }
      } else {
        for (let i = 0; i < 6; i++) {
          c.fillStyle = rgb(shade(hex(pal[(r() * pal.length) | 0])));
          c.beginPath();
          c.arc(x + (r() - .5) * s * .7, y - s * (.7 + r() * .55), s * (.26 + r() * .16), 0, 7);
          c.fill();
        }
      }
    }
  }

  // ---------- per-frame ----------
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!light || !city.width || !city.height) return;
    if (ts - lastPaint > 20000) paint();
    const L = light, t = ts / 1000;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // sky
    const g = ctx.createLinearGradient(0, 0, 0, ground);
    g.addColorStop(0, rgb(L.sky[0])); g.addColorStop(.55, rgb(L.sky[1])); g.addColorStop(1, rgb(L.sky[2]));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // stars
    const sa = clamp((-L.e - 3) / 9) * (1 - L.wx.cloud * .92);
    if (sa > .01) {
      ctx.fillStyle = '#fff';
      for (const s of stars) {
        ctx.globalAlpha = sa * (.45 + .55 * Math.sin(t * s.s + s.p) ** 2) * (1 - s.y * .7);
        ctx.beginPath(); ctx.arc(s.x * W, s.y * ground * .9, s.r, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // sun & moon
    const flip = env.lat < 0 ? -1 : 1;
    const veil = 1 - L.wx.cloud * .82;
    if (L.e > -5) {
      const x = W * (.5 + flip * clamp(L.sun.ha / 125, -1, 1) * .44);
      const y = ground - Math.sin(L.e * Math.PI / 180) * ground * .92;
      const col = mix([255, 150, 90], [255, 250, 235], smooth(0, 18, L.e));
      const R = Math.min(W, H) * .045;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, R * 9);
      glow.addColorStop(0, rgb(col, .55 * veil + .08)); glow.addColorStop(.25, rgb(col, .16 * veil + .03)); glow.addColorStop(1, rgb(col, 0));
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, ground);
      ctx.fillStyle = rgb(col, veil); ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
    }
    if (L.e < 0) {
      const a = clamp(-L.e / 8) * veil;
      const x = W * (.5 + flip * (.3 - clamp(L.sun.ha / 180, -1, 1) * .1));
      const y = ground * (.1 + .1 * clamp(1 + L.e / 60));
      const R = Math.min(W, H) * .032;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, R * 6);
      glow.addColorStop(0, `rgba(210,222,255,${.3 * a})`); glow.addColorStop(1, 'rgba(210,222,255,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, ground);
      ctx.fillStyle = `rgba(236,240,250,${a})`; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
    }

    // clouds
    const n = L.wx.cloud < .08 ? 0 : Math.ceil(L.wx.cloud * clouds.length);
    const drift = t * (.0015 + env.wind * .00012);
    for (let i = 0; i < n; i++) {
      const c = clouds[i], w = U * 5.2 * c.s, h = w * .42;
      const x = (((c.x + drift * c.v) % 1.5) + 1.5) % 1.5 - .3;
      ctx.globalAlpha = .55 + L.wx.cloud * .4;
      ctx.drawImage(sprites[c.k], x * W - w / 4, c.y * ground - h / 2, w, h);
    }
    ctx.globalAlpha = 1;

    // city
    ctx.drawImage(city, 0, 0, W, H);

    // fog / haze
    if (L.wx.fog || L.wx.rain || L.wx.snow) {
      const f = ctx.createLinearGradient(0, 0, 0, H);
      const a = L.wx.fog ? .5 : .16;
      f.addColorStop(0, rgb(L.sky[1], a * .5)); f.addColorStop(.8, rgb(L.sky[2], a)); f.addColorStop(1, rgb(L.sky[2], a * .7));
      ctx.fillStyle = f; ctx.fillRect(0, 0, W, H);
    }

    // rain / snow
    const amt = L.wx.rain || L.wx.snow;
    const want = amt ? Math.round(amt * (L.wx.rain ? 260 : 200) * clamp(W * H / 9e5, .5, 2)) : 0;
    while (drops.length < want) drops.push({ x: Math.random(), y: Math.random(), z: .4 + Math.random() * .6, p: Math.random() * 6.28 });
    drops.length = Math.min(drops.length, want);
    if (want) {
      const slant = clamp(env.wind / 60, 0, .5);
      if (L.wx.rain) {
        ctx.strokeStyle = rgb(mix([150, 170, 200], [225, 235, 245], L.day), .38);
        ctx.lineWidth = 1; ctx.beginPath();
        for (const d of drops) {
          d.y += .022 * d.z; d.x += .022 * d.z * slant * H / W;
          if (d.y > 1) { d.y = -.05; d.x = Math.random() * 1.2 - .2; }
          const len = 16 * d.z;
          ctx.moveTo(d.x * W, d.y * H); ctx.lineTo(d.x * W - slant * len, d.y * H - len);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = rgb(mix([170, 185, 215], [255, 255, 255], L.day), .85);
        for (const d of drops) {
          d.y += .0022 * d.z; d.x += (Math.sin(t * .8 + d.p) * .0006 + slant * .002) * d.z;
          if (d.y > 1) { d.y = -.02; d.x = Math.random() * 1.2 - .2; }
          ctx.globalAlpha = .35 + d.z * .55;
          ctx.beginPath(); ctx.arc(d.x * W, d.y * H, 1 + d.z * 1.8, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    // lightning
    if (L.wx.storm && Math.random() < .0025) flash = 1;
    if (flash > .02) { ctx.fillStyle = `rgba(235,240,255,${flash * .35})`; ctx.fillRect(0, 0, W, H); flash *= .86; }
  }

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(build, 80); });
  build();
  requestAnimationFrame(frame);

  window.Scene = {
    set(update) { Object.assign(env, update); paint(); },
  };
})();
