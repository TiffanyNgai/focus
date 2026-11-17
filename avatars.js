/* Lounge characters: flat, calm illustrations (animals and a few objects) drawn in SVG.
   Every character is a bust in a 80×80 box: the lower part sits behind the lounge table.
   Eyes are half-lidded on purpose, so everyone looks quietly focused rather than cute. */
(function () {
  const INK = '#2b2730';

  // calm, half-closed eye with a flat lid
  const eye = (x, y, r = 2.6) => `<path d="M${x - r} ${y}a${r} ${r} 0 0 0 ${2 * r} 0Z" fill="${INK}"/>`
    + `<path d="M${x - r - .2} ${y}h${2 * r + .4}" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/>`
    + `<circle cx="${x + r * .35}" cy="${y + r * .45}" r=".6" fill="#fff" opacity=".8"/>`;
  const eyes = (a, b, y, r) => `<g class="blink">${eye(a, y, r)}${eye(b, y, r)}</g>`;
  const shoulders = (fill, y = 57) => `<path d="M9 80C9 ${y + 8} 21 ${y} 40 ${y}S71 ${y + 8} 71 80Z" fill="${fill}"/>`;
  const collar = (fill, y = 57) => `<path d="M30 ${y + 1}Q40 ${y + 8} 50 ${y + 1}" stroke="${fill}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  const mouth = (y, w = 3) => `<path d="M${40 - w} ${y}Q40 ${y + 2} ${40 + w} ${y}" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;

  const DRAW = {
    fox: () => shoulders('#c9a24a') + collar('#a8842f')
      + '<path d="M20 31L18 6L37 20Z" fill="#d9733a"/><path d="M60 31L62 6L43 20Z" fill="#d9733a"/>'
      + '<path d="M18.7 14L18 6L25 11Z" fill="#3a2a24"/><path d="M61.3 14L62 6L55 11Z" fill="#3a2a24"/>'
      + '<path d="M17 31Q18 17 40 17Q62 17 63 31L58 45Q50 57 40 58Q30 57 22 45Z" fill="#e0803f"/>'
      + '<path d="M23 42Q32 40 40 50Q48 40 57 42Q50 57 40 58Q30 57 23 42Z" fill="#f4ece2"/>'
      + eyes(31, 49, 36) + '<ellipse cx="40" cy="49.5" rx="2.7" ry="2" fill="#2b2730"/>',
    bear: () => shoulders('#4f7a5a') + collar('#3b5f45')
      + '<circle cx="24" cy="21" r="7.5" fill="#8a5e3c"/><circle cx="56" cy="21" r="7.5" fill="#8a5e3c"/>'
      + '<circle cx="24" cy="21" r="3.6" fill="#6d4729"/><circle cx="56" cy="21" r="3.6" fill="#6d4729"/>'
      + '<circle cx="40" cy="37" r="20" fill="#8a5e3c"/><ellipse cx="40" cy="46" rx="9" ry="6.8" fill="#c9a07a"/>'
      + eyes(31.5, 48.5, 35) + '<ellipse cx="40" cy="43" rx="3.2" ry="2.3" fill="#2b2730"/>' + mouth(48, 2.2),
    cat: () => shoulders('#34405e') + collar('#26304a')
      + '<path d="M22 30L21 9L36 21Z" fill="#8e96a3"/><path d="M58 30L59 9L44 21Z" fill="#8e96a3"/>'
      + '<path d="M23.5 25L23 14L31 21Z" fill="#c4a7a7"/><path d="M56.5 25L57 14L49 21Z" fill="#c4a7a7"/>'
      + '<ellipse cx="40" cy="38" rx="20" ry="18" fill="#8e96a3"/>'
      + '<path d="M36 22.5v5M40 21.5v6M44 22.5v5" stroke="#6a717d" stroke-width="1.8" stroke-linecap="round"/>'
      + eyes(31.5, 48.5, 38) + '<path d="M38.2 44.5h3.6L40 46.6Z" fill="#b98585"/>'
      + '<path d="M22 45l9 .8M22 49l9-.6M58 45l-9 .8M58 49l-9-.6" stroke="#dfe3ea" stroke-width=".9" stroke-linecap="round"/>',
    owl: () => '<path d="M14 80C12 50 18 18 40 16C62 18 68 50 66 80Z" fill="#7a6248"/>'
      + '<path d="M18 22L24 10L30 19ZM62 22L56 10L50 19Z" fill="#7a6248"/>'
      + '<path d="M14 80C12 62 16 52 22 50C24 62 22 72 24 80ZM66 80C68 62 64 52 58 50C56 62 58 72 56 80Z" fill="#5f4a35"/>'
      + '<path d="M28 58Q40 54 52 58Q50 72 40 74Q30 72 28 58Z" fill="#cdb894"/>'
      + '<circle cx="31" cy="36" r="9.5" fill="#e8dcc6"/><circle cx="49" cy="36" r="9.5" fill="#e8dcc6"/>'
      + '<circle cx="31" cy="36" r="5.2" fill="#d99a3a"/><circle cx="49" cy="36" r="5.2" fill="#d99a3a"/>'
      + '<g class="blink"><circle cx="31" cy="36.6" r="2.7" fill="#2b2730"/><circle cx="49" cy="36.6" r="2.7" fill="#2b2730"/>'
      + '<path d="M25.6 34.4A5.4 5.4 0 0 1 36.4 34.4ZM43.6 34.4A5.4 5.4 0 0 1 54.4 34.4Z" fill="#e8dcc6"/></g>'
      + '<path d="M37.5 43h5L40 48Z" fill="#d99a3a"/>',
    frog: () => shoulders('#e2b23c') + '<path d="M40 57v23" stroke="#c8962a" stroke-width="1.6"/>'
      + '<circle cx="28" cy="29" r="8.5" fill="#6f9f58"/><circle cx="52" cy="29" r="8.5" fill="#6f9f58"/>'
      + '<ellipse cx="40" cy="43" rx="22" ry="15" fill="#6f9f58"/>'
      + '<circle cx="28" cy="29" r="5" fill="#f4f1e6"/><circle cx="52" cy="29" r="5" fill="#f4f1e6"/>'
      + eyes(28, 52, 29.5, 2.8) + '<path d="M30 48Q40 52 50 48" stroke="#2b2730" stroke-width="1.4" fill="none" stroke-linecap="round"/>'
      + '<circle cx="36" cy="42" r=".9" fill="#4d7a3c"/><circle cx="44" cy="42" r=".9" fill="#4d7a3c"/>',
    panda: () => shoulders('#5a6b7d') + collar('#46566a')
      + '<circle cx="23.5" cy="21" r="7.5" fill="#2b2730"/><circle cx="56.5" cy="21" r="7.5" fill="#2b2730"/>'
      + '<circle cx="40" cy="37" r="20" fill="#f4f2ee"/>'
      + '<ellipse cx="31" cy="37" rx="6" ry="7.5" transform="rotate(25 31 37)" fill="#2b2730"/>'
      + '<ellipse cx="49" cy="37" rx="6" ry="7.5" transform="rotate(-25 49 37)" fill="#2b2730"/>'
      + '<g class="blink"><path d="M28.6 37a2.4 2.4 0 0 0 4.8 0Z" fill="#f4f2ee"/><path d="M46.6 37a2.4 2.4 0 0 0 4.8 0Z" fill="#f4f2ee"/>'
      + '<path d="M27.8 37h6.4M45.8 37h6.4" stroke="#f4f2ee" stroke-width="1.3" stroke-linecap="round"/></g>'
      + '<ellipse cx="40" cy="45" rx="3" ry="2.2" fill="#2b2730"/>' + mouth(49.5, 2.2),
    penguin: () => '<path d="M13 80C11 48 18 14 40 14C62 14 69 48 67 80Z" fill="#2c3446"/>'
      + '<path d="M23 35Q23 21 33 22Q40 27 47 22Q57 21 57 35Q57 54 40 56Q23 54 23 35Z" fill="#f2f0ea"/>'
      + '<path d="M26 58Q40 66 54 58L56 65Q40 74 24 65Z" fill="#b5524b"/><path d="M48 64l5 14h-8z" fill="#b5524b"/>'
      + eyes(32, 48, 36) + '<path d="M36.5 42h7L40 47Z" fill="#e3a23e"/>',
    raccoon: () => shoulders('#4a6a8e') + collar('#39577a')
      + '<path d="M21 30Q18 14 29 16L33 24ZM59 30Q62 14 51 16L47 24Z" fill="#7b766f"/>'
      + '<ellipse cx="40" cy="38" rx="20" ry="18.5" fill="#9a948c"/>'
      + '<path d="M20 36Q30 29 40 34Q50 29 60 36Q56 44 48 42Q44 40 40 41Q36 40 32 42Q24 44 20 36Z" fill="#3b3740"/>'
      + '<path d="M30 46Q40 42 50 46Q48 56 40 57Q32 56 30 46Z" fill="#ece8e1"/>'
      + '<g class="blink"><path d="M28.4 36.6a2.6 2.6 0 0 0 5.2 0Z" fill="#f4f1ea"/><path d="M46.4 36.6a2.6 2.6 0 0 0 5.2 0Z" fill="#f4f1ea"/></g>'
      + '<ellipse cx="40" cy="47.5" rx="2.6" ry="1.9" fill="#2b2730"/>',
    shiba: () => shoulders('#a8463d') + '<path d="M28 58L40 70L52 58Z" fill="#c25a4e"/>'
      + '<path d="M20 31L22 9L35 20Z" fill="#d48f52"/><path d="M60 31L58 9L45 20Z" fill="#d48f52"/>'
      + '<path d="M23 26L24 15L31 21Z" fill="#f1dcc0"/><path d="M57 26L56 15L49 21Z" fill="#f1dcc0"/>'
      + '<path d="M19 34Q19 18 40 18Q61 18 61 34Q61 55 40 57Q19 55 19 34Z" fill="#d99a5b"/>'
      + '<path d="M24 43Q32 41 40 47Q48 41 56 43Q53 56 40 57Q27 56 24 43Z" fill="#f4e6d2"/>'
      + '<ellipse cx="32" cy="30.5" rx="2.4" ry="1.4" fill="#f4e6d2"/><ellipse cx="48" cy="30.5" rx="2.4" ry="1.4" fill="#f4e6d2"/>'
      + eyes(32, 48, 36.5) + '<ellipse cx="40" cy="46" rx="2.7" ry="2" fill="#2b2730"/>' + mouth(50, 2.4),
    rabbit: () => shoulders('#8f86b8') + collar('#766da0')
      + '<ellipse cx="31" cy="14" rx="5.5" ry="14" transform="rotate(-8 31 14)" fill="#ebe5da"/>'
      + '<ellipse cx="49" cy="14" rx="5.5" ry="14" transform="rotate(8 49 14)" fill="#ebe5da"/>'
      + '<ellipse cx="31" cy="15" rx="2.6" ry="10" transform="rotate(-8 31 15)" fill="#d6b4ae"/>'
      + '<ellipse cx="49" cy="15" rx="2.6" ry="10" transform="rotate(8 49 15)" fill="#d6b4ae"/>'
      + '<ellipse cx="40" cy="40" rx="18.5" ry="17" fill="#ebe5da"/>'
      + eyes(32, 48, 39) + '<path d="M38.4 45h3.2L40 46.8Z" fill="#c99a96"/>' + mouth(48.6, 2),
    avocado: () => '<path d="M40 8C26 8 18 26 15 44C12 64 24 80 40 80S68 64 65 44C62 26 54 8 40 8Z" fill="#3f6b35"/>'
      + '<path d="M40 13C29 13 23 28 20.5 45C18 61 28 75 40 75S62 61 59.5 45C57 28 51 13 40 13Z" fill="#cfe08f"/>'
      + '<circle cx="40" cy="55" r="9.5" fill="#8a5a3a"/><circle cx="37" cy="52" r="2.4" fill="#a8744f"/>'
      + eyes(33.5, 46.5, 33, 2.4) + mouth(39.5, 2.2),
    mushroom: () => '<path d="M27 30H53V80H27Z" fill="#eee3cd"/><path d="M27 30H31V80H27Z" fill="#dccdb0"/>'
      + '<path d="M10 36Q11 7 40 7Q69 7 70 36Q40 42 10 36Z" fill="#b8553f"/>'
      + '<circle cx="27" cy="20" r="4" fill="#f2e7d4"/><circle cx="45" cy="14" r="3" fill="#f2e7d4"/><circle cx="57" cy="26" r="3.6" fill="#f2e7d4"/><circle cx="36" cy="28" r="2.2" fill="#f2e7d4"/>'
      + eyes(34, 46, 47, 2.4) + mouth(53, 2.2),
    cactus: () => '<path d="M26 26Q26 12 40 12Q54 12 54 26V80H26Z" fill="#5f9a6b"/>'
      + '<path d="M26 48H18Q13 48 13 43V34Q13 30 17 30Q21 30 21 34V41H26Z" fill="#5f9a6b"/>'
      + '<path d="M54 54H62Q67 54 67 49V38Q67 34 63 34Q59 34 59 38V47H54Z" fill="#5f9a6b"/>'
      + '<path d="M33 16v56M47 16v56" stroke="#4f8459" stroke-width="1.2"/>'
      + '<g fill="#e9efd8"><circle cx="30" cy="22" r=".9"/><circle cx="50" cy="24" r=".9"/><circle cx="29" cy="56" r=".9"/><circle cx="51" cy="60" r=".9"/><circle cx="16" cy="38" r=".8"/><circle cx="64" cy="42" r=".8"/></g>'
      + '<circle cx="40" cy="11" r="3.4" fill="#e48aa0"/><circle cx="36.5" cy="12.5" r="2.6" fill="#e48aa0"/><circle cx="43.5" cy="12.5" r="2.6" fill="#e48aa0"/><circle cx="40" cy="12" r="1.5" fill="#f4d36a"/>'
      + eyes(34.5, 45.5, 34, 2.4) + mouth(40.5, 2),
    coffee: () => '<path d="M33 4q-3 4 0 8t0 8M40 2q-3 4 0 8t0 8M47 4q-3 4 0 8t0 8" stroke="#fff" stroke-opacity=".35" stroke-width="1.8" fill="none" stroke-linecap="round"/>'
      + '<path d="M19 30H61L57 80H23Z" fill="#f2ece2"/><path d="M21 48H59L58 62H22Z" fill="#9a6a45"/>'
      + '<rect x="16" y="22" width="48" height="9" rx="3" fill="#4a3a32"/><rect x="22" y="18" width="36" height="6" rx="2" fill="#5c4a40"/>'
      + eyes(34, 46, 38, 2.4) + mouth(43.5, 2.2)
      + '<path d="M36 55h8" stroke="#f2ece2" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>',
    robot: () => shoulders('#6d7d92') + '<rect x="33" y="52" width="14" height="8" fill="#56657a"/>'
      + '<path d="M40 16V8" stroke="#56657a" stroke-width="2"/><circle cx="40" cy="7" r="3" fill="#e2a23c"/>'
      + '<rect x="14" y="30" width="6" height="12" rx="2" fill="#56657a"/><rect x="60" y="30" width="6" height="12" rx="2" fill="#56657a"/>'
      + '<rect x="19" y="15" width="42" height="40" rx="10" fill="#a9b7c8"/>'
      + '<rect x="24" y="23" width="32" height="22" rx="6" fill="#26303f"/>'
      + '<g class="blink"><rect x="29" y="31.5" width="7" height="3" rx="1.5" fill="#7fe0d0"/><rect x="44" y="31.5" width="7" height="3" rx="1.5" fill="#7fe0d0"/></g>'
      + '<path d="M36 40h8" stroke="#7fe0d0" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>',
    astronaut: () => shoulders('#e9ebef') + '<rect x="47" y="63" width="9" height="6" rx="1.5" fill="#d9773e"/>'
      + '<path d="M30 58Q40 64 50 58" stroke="#c4c8d0" stroke-width="2" fill="none"/>'
      + '<circle cx="40" cy="34" r="22" fill="#f1f2f5"/><circle cx="40" cy="34" r="22" fill="none" stroke="#c4c8d0" stroke-width="1.5"/>'
      + '<rect x="24" y="23" width="32" height="24" rx="11" fill="#22314f"/>'
      + '<path d="M28 31Q31 26 37 25.5" stroke="#9fb6e0" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>'
      + '<circle cx="50" cy="40" r="1.6" fill="#9fb6e0" opacity=".6"/>',
  };

  const CHARS = [
    ['fox', 'Fox', '#e0803f'], ['bear', 'Bear', '#8a5e3c'], ['cat', 'Cat', '#8e96a3'], ['owl', 'Owl', '#d99a3a'],
    ['frog', 'Frog', '#6f9f58'], ['panda', 'Panda', '#5a6b7d'], ['penguin', 'Penguin', '#b5524b'], ['raccoon', 'Raccoon', '#4a6a8e'],
    ['shiba', 'Shiba', '#d99a5b'], ['rabbit', 'Rabbit', '#8f86b8'], ['avocado', 'Avocado', '#7fa04a'], ['mushroom', 'Mushroom', '#b8553f'],
    ['cactus', 'Cactus', '#5f9a6b'], ['coffee', 'Coffee', '#9a6a45'], ['robot', 'Robot', '#7fe0d0'], ['astronaut', 'Astronaut', '#d9773e'],
  ].map(([id, name, accent]) => ({ id, name, accent }));

  const svg = c => `<svg viewBox="0 0 80 80" aria-hidden="true" focusable="false">${(DRAW[c.id] || DRAW.fox)()}</svg>`;

  // someone focusing without a profile: a plain, faceless silhouette
  const GUEST = '<svg viewBox="0 0 80 80" aria-hidden="true" focusable="false">'
    + '<path d="M9 80C9 65 21 57 40 57S71 65 71 80Z" fill="rgba(255,255,255,.22)"/>'
    + '<circle cx="40" cy="36" r="17" fill="rgba(255,255,255,.3)"/></svg>';

  const hash = s => { let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; };
  // the character a person shows: their pick, or a stable default based on their name
  const resolve = (id, name) => CHARS.find(c => c.id === id) || CHARS[hash(name) % CHARS.length];

  window.Avatars = { list: CHARS, resolve, svg, guest: () => GUEST };
})();
