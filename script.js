(function () {
  'use strict';

  var html = document.documentElement;
  html.classList.add('js');

  var slides = [].slice.call(document.querySelectorAll('.slide'));
  var N = slides.length;
  var nav = document.getElementById('nav');
  var prevBtn = document.getElementById('prev');
  var nextBtn = document.getElementById('next');
  var dots = [].slice.call(document.querySelectorAll('#dots i'));
  var live = document.getElementById('live');
  var music = document.getElementById('bgm');
  var bMusic = document.getElementById('b-music');
  var bSfx = document.getElementById('b-sfx');
  var fx = document.getElementById('fx');
  var TRANS = 440;
  var WA_MSG = 'Sayangkuhh aku suka maacihh\uD83D\uDE2D\uD83D\uDC97';

  var cur = 0;
  var busy = false;

  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e0) {}

  /* ---------- Efek adaptif: kurangi dekorasi di perangkat terbatas (deteksi fitur, bukan nama perangkat) ---------- */
  var lite = false;
  try {
    var dm = navigator.deviceMemory, hc = navigator.hardwareConcurrency, cn = navigator.connection;
    lite = !!((dm && dm <= 2) || (hc && hc <= 4) || (cn && cn.saveData));
  } catch (e1) {}
  if (lite) html.classList.add('lite');

  /* ---------- Preferensi suara (localStorage boleh gagal) ---------- */
  var PREF_KEY = 'simungil.audio.v1';
  var prefs = { sfx: true, music: true };
  try {
    var raw = window.localStorage.getItem(PREF_KEY);
    if (raw) {
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') { prefs.sfx = o.sfx !== false; prefs.music = o.music !== false; }
    }
  } catch (e2) {}
  function savePrefs() {
    try { window.localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e3) {}
  }

  /* =====================================================================
     AUDIO ENGINE — Web Audio, tanpa file suara tambahan.
     Satu AudioContext, satu kompresor (anti-kaget), osilator dibuat sekali
     pakai lalu dilepas. Tidak ada audio yang dibuat ulang per klik.
     ===================================================================== */
  var AC = null, comp = null, sfxBus = null, noiseBuf = null;
  var voices = 0, lastAt = {}, lastAny = 0;

  function ensureCtx() {
    if (AC) return AC;
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try {
      AC = new C();
      comp = AC.createDynamicsCompressor();
      comp.threshold.value = -20; comp.knee.value = 24; comp.ratio.value = 6;
      comp.attack.value = 0.004; comp.release.value = 0.22;
      var out = AC.createGain(); out.gain.value = 0.9;
      comp.connect(out); out.connect(AC.destination);
      sfxBus = AC.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(comp);
    } catch (e4) { AC = null; }
    return AC;
  }
  function wake() {
    var a = ensureCtx();
    if (a && a.state === 'suspended') {
      try { var p = a.resume(); if (p && p.catch) p.catch(function () {}); } catch (e5) {}
    }
    return a;
  }

  // satu suara: sinus dengan envelope lembut (attack singkat, peluruhan eksponensial)
  function voice(dest, f, t, d, v) {
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + d + 0.04);
    voices++;
    o.onended = function () { voices--; try { g.disconnect(); } catch (e6) {} };
  }
  // 'box' = kotak musik, 'bell' = lonceng kecil, 'soft' = sinus polos
  function tone(dest, f, t, d, v, kind) {
    voice(dest, f, t, d, v);
    if (kind === 'box') voice(dest, f * 2, t, d * 0.45, v * 0.22);
    else if (kind === 'bell') { voice(dest, f * 2.76, t, d * 0.4, v * 0.18); voice(dest, f * 4.1, t, d * 0.2, v * 0.07); }
  }
  function sweep(dest, f0, f1, t, d, v) {
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.03);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + d + 0.07);
    voices++;
    o.onended = function () { voices--; try { g.disconnect(); } catch (e7) {} };
  }
  function puff(dest, t, d, v, freq) {
    if (!noiseBuf) {
      var len = Math.floor(AC.sampleRate * 0.3);
      noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
      var ch = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    }
    var s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    s.buffer = noiseBuf;
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + d * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t); s.stop(t + d + 0.03);
    voices++;
    s.onended = function () { voices--; try { g.disconnect(); f.disconnect(); } catch (e8) {} };
  }
  function arp(b, notes, t, gap, d, v, kind) {
    for (var i = 0; i < notes.length; i++) tone(b, notes[i], t + i * gap, d, v, kind);
  }

  // Nada (Hz) selaras dengan musik latar: tangga nada C mayor pentatonik
  var C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880,
      C6 = 1046.5, D6 = 1174.66, E6 = 1318.51, G6 = 1567.98, A6 = 1760, C7 = 2093;

  var SFX = {
    click:   function (t, b) { sweep(b, 1500, 950, t, 0.06, 0.10); },
    pop:     function (t, b) { sweep(b, 380, 1000, t, 0.09, 0.20); },
    open:    function (t, b) { arp(b, [C5, E5, G5, C6, E6], t, 0.10, 0.5, 0.15, 'box'); tone(b, C7, t + 0.5, 0.7, 0.05, 'bell'); },
    next:    function (t, b) { tone(b, G5, t, 0.2, 0.12, 'box'); tone(b, C6, t + 0.07, 0.26, 0.10, 'box'); },
    back:    function (t, b) { tone(b, C6, t, 0.18, 0.10, 'box'); tone(b, G5, t + 0.07, 0.26, 0.10, 'box'); },
    // satu motif "pesan muncul" per halaman supaya tiap halaman punya suasana sendiri
    arrive1: function (t, b) { arp(b, [C6, E6, G6], t, 0.09, 0.55, 0.12, 'bell'); },
    arrive2: function (t, b) { arp(b, [D6, G6, A6], t, 0.10, 0.55, 0.12, 'bell'); },
    arrive3: function (t, b) { arp(b, [E6, A6, G6, E6], t, 0.11, 0.6, 0.11, 'bell'); },
    arrive4: function (t, b) { puff(b, t, 0.16, 0.05, 2400); arp(b, [G5, C6, E6], t + 0.12, 0.13, 0.7, 0.12, 'box'); },
    arrive5: function (t, b) { arp(b, [C6, E6, G6, C7], t, 0.07, 0.5, 0.10, 'bell'); },
    sparkle: function (t, b) { arp(b, [G6, C7, A6, C7], t, 0.055, 0.35, 0.07, 'bell'); },
    secret:  function (t, b) { sweep(b, 500, 1200, t, 0.08, 0.14); arp(b, [E6, G6, C7], t + 0.07, 0.07, 0.4, 0.08, 'bell'); },
    blow:    function (t, b) { puff(b, t, 0.28, 0.12, 1400); arp(b, [C7, G6], t + 0.22, 0.09, 0.4, 0.05, 'bell'); },
    light:   function (t, b) { sweep(b, 300, 800, t, 0.07, 0.14); tone(b, G6, t + 0.06, 0.25, 0.06, 'bell'); },
    finale:  function (t, b) {
      arp(b, [C5, E5, G5, C6, E6, G6], t, 0.12, 0.8, 0.13, 'box');
      var c = [C5, E5, G5, C6];
      for (var i = 0; i < c.length; i++) tone(b, c[i], t + 0.8, 1.6, 0.08, 'bell');
      arp(b, [C7, G6, E6, C7], t + 1.0, 0.1, 0.5, 0.05, 'bell');
    },
    send:    function (t, b) { sweep(b, 420, 1100, t, 0.08, 0.16); arp(b, [G5, 987.77, D6, G6], t + 0.08, 0.075, 0.5, 0.11, 'box'); },
    on:      function (t, b) { tone(b, E6, t, 0.14, 0.08, 'soft'); tone(b, A6, t + 0.06, 0.18, 0.08, 'soft'); },
    off:     function (t, b) { tone(b, A6, t, 0.12, 0.07, 'soft'); tone(b, E6, t + 0.06, 0.16, 0.07, 'soft'); }
  };

  // Putar efek: tahan spam, batasi jumlah suara bersamaan, gagal dengan tenang
  function sfx(name) {
    if (!prefs.sfx || !SFX[name]) return;
    var now = Date.now();
    if (now - lastAny < 45) return;
    if (lastAt[name] && now - lastAt[name] < 120) return;
    if (voices > 18) return;
    var a = wake();
    if (!a || !sfxBus) return;
    lastAny = now; lastAt[name] = now;
    try { SFX[name](a.currentTime + 0.01, sfxBus); } catch (e9) {}
  }
  // nada xylophone untuk ketukan pada janji (urut sesuai posisi)
  var XYLO = [C6, D6, E6, G6, A6];
  function xylo(i) {
    if (!prefs.sfx) return;
    var now = Date.now();
    if (now - lastAny < 45) return;
    var a = wake();
    if (!a || !sfxBus || voices > 18) return;
    lastAny = now;
    try { tone(sfxBus, XYLO[i % XYLO.length], a.currentTime + 0.01, 0.6, 0.13, 'box'); } catch (e10) {}
  }

  /* ---------- Musik latar ---------- */
  // Jika assets/music.mp3 ada, itu yang diputar. Jika tidak ada,
  // dipakai kotak musik buatan (sintesis) agar website tidak sunyi.
  var MUS_VOL = 0.7;
  var BPM = 74, BEAT = 60 / BPM, BAR = BEAT * 4;
  var BASS = [130.81, 110, 87.31, 98, 130.81, 82.41, 87.31, 98];
  var CH = [
    [261.63, 329.63, 392, 523.25], [261.63, 329.63, 440, 523.25],
    [261.63, 349.23, 440, 523.25], [246.94, 293.66, 392, 493.88],
    [261.63, 329.63, 392, 523.25], [246.94, 329.63, 392, 493.88],
    [261.63, 349.23, 440, 523.25], [246.94, 293.66, 392, 493.88]
  ];
  var ARP = [0, 1, 2, 3, 2, 1, 2, 1];
  var MEL = [
    [E5, 0, G5, 0], [A5, 0, G5, E5], [A5, 0, 698.46, 0], [G5, 0, D5, 0],
    [E5, 0, G5, A5], [G5, 0, E5, 0], [698.46, 0, A5, 0], [G5, 0, D5, C5]
  ];

  var mus = { on: false, mode: '', bus: null, timer: 0, nextT: 0, bar: 0, fade: 0, resumeFile: false };
  var fileBad = false;

  function fadeFile(to, ms, done) {
    clearInterval(mus.fade);
    var from = music.volume, steps = Math.max(1, Math.round(ms / 40)), i = 0;
    mus.fade = setInterval(function () {
      i++;
      try { music.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps))); } catch (e11) {}
      if (i >= steps) { clearInterval(mus.fade); if (done) done(); }
    }, 40);
  }

  function playBar(i, t, bus) {
    var k = i % 8, c = CH[k], m = MEL[k], j;
    tone(bus, BASS[k], t, BEAT * 3.2, 0.15, 'soft');
    for (j = 0; j < 8; j++) tone(bus, c[ARP[j]], t + j * BEAT / 2, 0.9, j === 0 ? 0.085 : 0.06, 'box');
    for (j = 0; j < 4; j++) if (m[j]) tone(bus, m[j], t + j * BEAT, 1.3, 0.12, 'box');
  }
  function scheduleMusic() {
    if (!mus.on || mus.mode !== 'synth' || !AC || !mus.bus) return;
    var guard = 0;
    while (mus.nextT < AC.currentTime + 2.4 && guard++ < 3) {
      playBar(mus.bar++, mus.nextT, mus.bus);
      mus.nextT += BAR;
    }
    mus.timer = setTimeout(scheduleMusic, 900);
  }
  function startSynth() {
    var a = wake();
    if (!a) { mus.on = false; return; }
    mus.mode = 'synth';
    try {
      mus.bus = a.createGain();
      mus.bus.gain.setValueAtTime(0.0001, a.currentTime);
      mus.bus.gain.linearRampToValueAtTime(MUS_VOL, a.currentTime + 2);
      mus.bus.connect(comp);
      mus.nextT = a.currentTime + 0.15;
      mus.bar = 0;
      clearTimeout(mus.timer);
      scheduleMusic();
    } catch (e12) { mus.on = false; }
  }
  function startMusic() {
    if (!prefs.music || mus.on) return;
    mus.on = true;
    if (fileBad || !music) { startSynth(); return; }
    mus.mode = 'file';
    try {
      music.volume = 0;
      var p = music.play();
      var ok = function () { if (mus.on && mus.mode === 'file') fadeFile(0.5, 1800); };
      if (p && typeof p.then === 'function') {
        p.then(ok).catch(function (e) {
          if (e && e.name === 'NotAllowedError') { mus.on = false; mus.mode = ''; }   // coba lagi di ketukan berikutnya
          else { fileBad = true; if (mus.on) startSynth(); }                           // file hilang / tidak didukung
        });
      } else ok();
    } catch (e13) { fileBad = true; startSynth(); }
  }
  function stopMusic() {
    mus.on = false;
    clearTimeout(mus.timer);
    if (mus.mode === 'synth' && AC && mus.bus) {
      var bus = mus.bus; mus.bus = null;
      try {
        bus.gain.cancelScheduledValues(AC.currentTime);
        bus.gain.setValueAtTime(bus.gain.value, AC.currentTime);
        bus.gain.linearRampToValueAtTime(0.0001, AC.currentTime + 0.6);
      } catch (e14) {}
      setTimeout(function () { try { bus.disconnect(); } catch (e15) {} }, 900);
    } else if (mus.mode === 'file' && music) {
      fadeFile(0, 600, function () { try { music.pause(); } catch (e16) {} });
    }
  }
  if (music) {
    var srcs = [].slice.call(music.querySelectorAll('source'));
    srcs.forEach(function (s, idx) {
      s.addEventListener('error', function () {
        if (idx === srcs.length - 1) {
          fileBad = true;
          if (mus.on && mus.mode !== 'synth') startSynth();
        }
      });
    });
  }

  /* ---------- Tombol kontrol suara ---------- */
  function syncAudioUI() {
    bMusic.classList.toggle('off', !prefs.music);
    bMusic.setAttribute('aria-pressed', prefs.music ? 'true' : 'false');
    bSfx.classList.toggle('off', !prefs.sfx);
    bSfx.setAttribute('aria-pressed', prefs.sfx ? 'true' : 'false');
  }
  function toggleMusic() {
    if (prefs.music) { prefs.music = false; stopMusic(); }
    else { prefs.music = true; startMusic(); }
    savePrefs(); syncAudioUI();
  }
  function toggleSfx() {
    if (prefs.sfx) { sfx('off'); prefs.sfx = false; }
    else { prefs.sfx = true; sfx('on'); }
    savePrefs(); syncAudioUI();
  }

  // Hemat baterai: tab tersembunyi = audio dijeda, animasi dijeda
  document.addEventListener('visibilitychange', function () {
    var hidden = document.hidden;
    html.classList.toggle('is-hidden', hidden);
    try {
      if (hidden) {
        if (AC && AC.state === 'running') AC.suspend();
        if (mus.mode === 'file' && music && !music.paused) { mus.resumeFile = true; music.pause(); }
      } else {
        if (AC && AC.state === 'suspended' && (mus.on || prefs.sfx)) { var p = AC.resume(); if (p && p.catch) p.catch(function () {}); }
        if (mus.resumeFile && mus.on) { var q = music.play(); if (q && q.catch) q.catch(function () {}); }
        mus.resumeFile = false;
      }
    } catch (e17) {}
  });

  /* =====================================================================
     EFEK VISUAL RINGAN — kolam 8 hati yang dipakai ulang (tanpa DOM baru)
     ===================================================================== */
  var pool = [], pi = 0;
  function buildPool() {
    if (pool.length || !fx) return;
    var NS = 'http://www.w3.org/2000/svg';
    for (var i = 0; i < 8; i++) {
      var s = document.createElementNS(NS, 'svg');
      var u = document.createElementNS(NS, 'use');
      u.setAttribute('href', '#i-heart');
      s.appendChild(u);
      s.setAttribute('class', 'fxh ' + (i % 2 ? 'c-rose' : 'c-straw'));
      fx.appendChild(s);
      pool.push(s);
    }
  }
  function burst(x, y, n) {
    if (reduceMotion || !fx) return;
    buildPool();
    if (!pool.length) return;
    n = Math.min(n || (lite ? 4 : 6), pool.length);
    for (var i = 0; i < n; i++) {
      var el = pool[pi++ % pool.length];
      if (!el.animate) continue;
      var ang = (-Math.PI / 2) + (i - (n - 1) / 2) * 0.55 + (Math.random() - 0.5) * 0.3;
      var dist = 46 + Math.random() * 40;
      el.style.left = (x - 8) + 'px';
      el.style.top = (y - 8) + 'px';
      if (el._a) el._a.cancel();
      el._a = el.animate([
        { transform: 'translate3d(0,0,0) scale(.4)', opacity: 1 },
        { transform: 'translate3d(' + Math.cos(ang) * dist + 'px,' + (Math.sin(ang) * dist - 14) + 'px,0) scale(1.15)', opacity: 0 }
      ], { duration: 650 + Math.random() * 250, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
    }
  }
  function burstAt(el, n) {
    var r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, n);
  }

  /* ---------- Navigasi slide ---------- */
  function sync() {
    for (var i = 0; i < dots.length; i++) dots[i].className = i === cur ? 'on' : '';
    nav.hidden = cur === 0;
    prevBtn.disabled = cur === 0;
    nextBtn.disabled = cur === N - 1;
    live.textContent = 'Halaman ' + (cur + 1) + ' dari ' + N;
  }

  var arriveTimer = 0;
  function arrive(idx) {
    clearTimeout(arriveTimer);
    arriveTimer = setTimeout(function () {
      if (idx === N - 1) { sfx('finale'); burst(window.innerWidth / 2, window.innerHeight * 0.38, 7); }
      else sfx('arrive' + idx);
    }, 360);
  }

  function go(to, sound, reveal) {
    if (busy || to < 0 || to >= N || to === cur) return false;
    var fwd = to > cur;
    var from = slides[cur];
    var target = slides[to];
    busy = true;

    sfx(sound || (fwd ? 'next' : 'back'));
    if (reveal) arrive(to); else clearTimeout(arriveTimer);

    from.classList.add(fwd ? 'out-l' : 'out-r');
    target.classList.add('active', fwd ? 'in-r' : 'in-l');
    target.scrollTop = 0;
    cur = to;
    sync();

    setTimeout(function () {
      from.classList.remove('active', 'out-l', 'out-r');
      target.classList.remove('in-r', 'in-l');
      busy = false;
    }, TRANS);
    return true;
  }

  function afterGo() {
    if (cur === 0) {
      var open = document.querySelector('[data-action="open"]');
      if (open) open.focus({ preventScroll: true });
    } else if (document.activeElement === document.body || document.activeElement.hidden) {
      nextBtn.focus({ preventScroll: true });
    }
  }

  /* ---------- WhatsApp ---------- */
  var waLock = false, waTimer = 0;
  var waFb = document.getElementById('wa-fb');
  var waCopy = document.getElementById('wa-copy');
  function copyMsg() {
    var done = function () { if (waCopy) waCopy.textContent = 'tersalin \u2661'; };
    var legacy = function () {
      try {
        var ta = document.createElement('textarea');
        ta.value = WA_MSG; ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, 99);
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) done();
      } catch (e18) {}
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(WA_MSG).then(done, legacy);
      else legacy();
    } catch (e19) { legacy(); }
  }

  /* ---------- Satu listener untuk semua ketukan (event delegation) ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('#lk')) return;   // gerbang kunci: tidak pernah memicu musik / efek situs asli

    // Tombol balasan WhatsApp: link asli tetap bekerja tanpa JS
    var wa = t.closest('.btn-reply');
    if (wa) {
      if (waLock) { e.preventDefault(); return; }
      waLock = true;
      sfx('send');
      burstAt(wa, 6);
      clearTimeout(waTimer);
      waTimer = setTimeout(function () {
        waLock = false;
        if (!document.hidden && waFb) waFb.hidden = false;   // WhatsApp tidak membuka halaman lain -> tawarkan salin pesan
      }, 2400);
      return;
    }

    var el = t.closest('[data-action]');
    if (el) {
      var act = el.getAttribute('data-action');
      if (act === 'music') { toggleMusic(); return; }
      if (act === 'sfx') { toggleSfx(); return; }
      if (act === 'copywa') { sfx('click'); copyMsg(); return; }
      if (prefs.music && !mus.on) startMusic();   // interaksi pertama: musik boleh mulai (patuh aturan autoplay)
      if (act === 'open') { if (go(1, 'open', true)) afterGo(); else sfx('click'); }
      else if (act === 'next') { if (go(cur + 1, 'next', true)) afterGo(); }
      else if (act === 'prev') { if (go(cur - 1, 'back', false)) afterGo(); }
      else if (act === 'restart') { if (go(1, 'open', false)) afterGo(); }
      return;
    }

    // Kejutan kecil (opsional, tidak mengganggu cerita)
    var egg;
    if ((egg = t.closest('.cake'))) {
      var blown = egg.classList.toggle('blown');
      sfx(blown ? 'blow' : 'light');
      burstAt(egg, blown ? 5 : 3);
    } else if ((egg = t.closest('.char'))) {
      sfx('pop'); burstAt(egg, 5);
    } else if ((egg = t.closest('.seal'))) {
      sfx('secret'); burstAt(egg, 5);
    } else if ((egg = t.closest('.promises li'))) {
      var items = [].slice.call(egg.parentNode.children);
      xylo(items.indexOf(egg)); burstAt(egg.querySelector('.ic') || egg, 3);
    } else if ((egg = t.closest('.polaroid, .frame-soft, .frame-love'))) {
      sfx('sparkle'); burstAt(egg, 4);
    }
  });

  /* ---------- Keyboard ---------- */
  document.addEventListener('keydown', function (e) {
    if (cur === 0) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1, 'next', true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1, 'back', false); }
  });

  /* ---------- Swipe sentuh (pasif, ringan) ---------- */
  var sx = 0, sy = 0, tracking = false;
  var app = document.getElementById('app');
  app.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { tracking = false; return; }
    tracking = true;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  app.addEventListener('touchend', function (e) {
    if (!tracking || cur === 0) return;
    tracking = false;
    var t = e.changedTouches[0];
    var dx = t.clientX - sx;
    var dy = t.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      if (dx < 0) go(cur + 1, 'next', true); else go(cur - 1, 'back', false);
    }
  }, { passive: true });

  syncAudioUI();
  sync();
})();
