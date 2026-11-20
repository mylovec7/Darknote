/* =====================================================================
   SIMUNGIL — BLACK OPS CLASSIFIED ACCESS GATE
   Gerbang visual + teka-teki. Berjalan sepenuhnya lokal (tanpa jaringan).
   Catatan jujur: ini situs statis, jadi gerbang ini penghalang imersif,
   bukan keamanan sungguhan.

   Terpisah dari script.js:
   - Tidak memanggil / menyentuh sistem musik latar sama sekali.
   - AudioContext sendiri khusus efek gerbang, ditutup setelah buka.
   - Hanya MEMBACA kunci preferensi 'simungil.audio.v1' (menghormati
     efek suara yang dimatikan); tidak pernah menulisnya.
   - Tombol di sini tidak memakai atribut data-action.
   ===================================================================== */
(function () {
  'use strict';

  var root = document.getElementById('lk');
  if (!root) return;
  var html = document.documentElement;

  var GATED = ['app', 'actl', 'nav', 'fx', 'live'];
  function setGated(on) {
    for (var i = 0; i < GATED.length; i++) {
      var el = document.getElementById(GATED[i]);
      if (!el) continue;
      try { el.inert = on; } catch (e) {}
      if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert');
    }
    html.classList.toggle('lk-locked', on);
  }
  function restoreTheme() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m && m.getAttribute('data-orig')) m.setAttribute('content', m.getAttribute('data-orig'));
  }
  // Jika gerbang gagal karena bug tak terduga, jangan kunci pengunjung selamanya.
  function failOpen() {
    setGated(false); restoreTheme();
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  try { init(); } catch (err) { failOpen(); }

  function init() {
    var $ = function (id) { return document.getElementById(id); };
    var form = $('lk-form'), input = $('lk-key'), btnGo = $('lk-go'), btnShow = $('lk-show'), btnClear = $('lk-clear');
    var statusEl = $('lk-status'), termEl = $('lk-term'), plate = $('lk-plate');
    var sessionEl = $('lk-session'), sysEl = $('lk-sys'), chipEl = $('lk-chip');

    var reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

    setGated(true);

    /* ---------- Validasi: tepat enam varian, dicocokkan persis (tanpa trim / normalisasi) ---------- */
    var OK = ['5:d84d6dcc:9799bad0', '5:506746dc:1cbd7e9c', '7:ab4a68a2:378f01a7',
              '7:65a4084:e56183c1', '8:96f213a7:2026111c', '8:9dbca737:1ef8b163'];
    function h53(s) {
      var h1 = 0xdeadbeef, h2 = 0x41c6ce57, i, c;
      for (i = 0; i < s.length; i++) {
        c = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 2654435761);
        h2 = Math.imul(h2 ^ c, 1597334677);
      }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
      return s.length + ':' + (h2 >>> 0).toString(16) + ':' + (h1 >>> 0).toString(16);
    }
    function valid(v) { return OK.indexOf(h53(v)) !== -1; }

    /* ---------- State & timer ---------- */
    var state = 'locked';               // locked | verifying | denied | unlocking | unlocked
    var seq = 0;                        // token: callback usang tidak boleh mengubah state
    var timers = [];
    function later(fn, ms) {
      var id = setTimeout(function () {
        var k = timers.indexOf(id); if (k > -1) timers.splice(k, 1);
        fn();
      }, ms);
      timers.push(id); return id;
    }
    function clearTimers() { while (timers.length) clearTimeout(timers.pop()); }

    var LABEL = { locked: 'LOCKED', verifying: 'VERIFYING', denied: 'LOCKED', unlocking: 'AUTHORIZED', unlocked: 'UNLOCKED' };
    function setState(s) {
      state = s;
      root.setAttribute('data-state', s);
      chipEl.textContent = LABEL[s];
      btnGo.setAttribute('aria-disabled', (s === 'locked') ? 'false' : 'true');
      if (s === 'verifying' || s === 'unlocking') btnGo.setAttribute('aria-busy', 'true'); else btnGo.removeAttribute('aria-busy');
    }
    function status(t) { statusEl.textContent = t; }
    function retrigger(cls) {
      root.classList.remove(cls); void root.offsetWidth; root.classList.add(cls);
    }

    /* =================================================================
       SFX gerbang — Web Audio terpisah. Dibuat baru setelah gestur pertama.
       ================================================================= */
    var Snd = (function () {
      var ctx = null, master = null, noise = null, voices = 0, lastTap = 0, closed = false, enabled = true;
      try {
        var raw = window.localStorage.getItem('simungil.audio.v1');   // baca saja
        if (raw) { var o = JSON.parse(raw); if (o && typeof o === 'object' && o.sfx === false) enabled = false; }
      } catch (e) {}

      function arm() {
        if (!enabled || closed) return;
        if (!ctx) {
          var C = window.AudioContext || window.webkitAudioContext;
          if (!C) { enabled = false; return; }
          try {
            ctx = new C();
            var comp = ctx.createDynamicsCompressor();
            comp.threshold.value = -22; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.2;
            master = ctx.createGain(); master.gain.value = 0.55;
            master.connect(comp); comp.connect(ctx.destination);
          } catch (e) { ctx = null; enabled = false; return; }
        }
        if (ctx.state === 'suspended') { try { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
      }
      function ready() { return enabled && !closed && ctx && ctx.state === 'running' && voices < 14; }
      function done(node, extra) {
        voices++;
        node.onended = function () { voices--; try { extra.disconnect(); } catch (e) {} };
      }
      // nada: osilator + (opsional) lowpass, envelope cepat
      function tone(type, f0, f1, t, d, v, lp) {
        var o = ctx.createOscillator(), g = ctx.createGain(), tail = g;
        o.type = type; o.frequency.setValueAtTime(f0, t);
        if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + d);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(v, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        if (lp) { var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); f.connect(g); tail = f; }
        else o.connect(g);
        g.connect(master); o.start(t); o.stop(t + d + 0.03);
        done(o, g);
      }
      // klik / derak: noise singkat lewat filter
      function click(t, d, v, freq, q, type) {
        if (!noise) {
          var len = Math.floor(ctx.sampleRate * 0.15);
          noise = ctx.createBuffer(1, len, ctx.sampleRate);
          var ch = noise.getChannelData(0);
          for (var i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
        }
        var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = noise; f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 0.9;
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        s.connect(f); f.connect(g); g.connect(master);
        s.start(t); s.stop(t + d + 0.02);
        done(s, g);
      }
      function run(fn) { if (!ready()) return; try { fn(ctx.currentTime + 0.01); } catch (e) {} }

      return {
        arm: arm,
        tap: function () {
          var n = Date.now(); if (n - lastTap < 50) return; lastTap = n;
          run(function (t) { click(t, 0.022, 0.05, 2300 + Math.random() * 500, 1.2); });
        },
        pulse: function () { run(function (t) { tone('sine', 120, 96, t, 0.2, 0.2); tone('sine', 240, 190, t + 0.02, 0.12, 0.05); }); },
        relay: function () { run(function (t) { click(t, 0.035, 0.22, 1400, 1.1); tone('square', 95, 60, t, 0.05, 0.07, 420); click(t + 0.06, 0.03, 0.12, 1800, 1.1); }); },
        deny: function () {
          run(function (t) {
            tone('sawtooth', 150, 138, t, 0.3, 0.1, 480);
            tone('sawtooth', 112, 102, t + 0.12, 0.3, 0.1, 420);
            click(t, 0.03, 0.14, 1300, 1.1);
          });
        },
        release: function () {
          run(function (t) {
            tone('sine', 82, 48, t, 0.26, 0.34);
            click(t, 0.09, 0.3, 700, 0.7, 'lowpass');
            click(t + 0.02, 0.05, 0.12, 2100, 1.0);
            tone('triangle', 520, 260, t + 0.14, 0.2, 0.05, 1500);   // pegas / slide logam, lembut
            click(t + 0.34, 0.06, 0.16, 900, 0.9);                    // shackle sampai
          });
        },
        suspend: function () { if (ctx && ctx.state === 'running') { try { ctx.suspend(); } catch (e) {} } },
        resume: function () { if (ctx && ctx.state === 'suspended' && !closed) { try { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {} } },
        close: function () {
          closed = true;
          if (ctx) { try { var p = ctx.close(); if (p && p.catch) p.catch(function () {}); } catch (e) {} ctx = null; master = null; noise = null; }
        }
      };
    })();

    /* =================================================================
       Efek berkas: assets/lock.mp3 (gerbang tampil) & assets/buka.mp3 (gembok terbuka).
       Elemen <audio> disiapkan sekali di HTML dan dipakai ulang. Semua kegagalan
       (berkas hilang, autoplay diblokir) ditelan: tidak pernah menghalangi gerbang.
       ================================================================= */
    var Fx = (function () {
      var lockEl = $('lk-snd-lock'), bukaEl = $('lk-snd-buka');
      var sfxOn = true;
      try { var rw = window.localStorage.getItem('simungil.audio.v1'); if (rw) { var ob = JSON.parse(rw); if (ob && typeof ob === 'object' && ob.sfx === false) sfxOn = false; } } catch (e) {}
      var bad = { lock: false, buka: false };
      var lockDone = false, lockBusy = false, bukaStarted = false, primed = false, stopped = false;
      function watch(el, key) {
        if (!el) { bad[key] = true; return; }
        el.addEventListener('error', function () { bad[key] = true; });
      }
      watch(lockEl, 'lock'); watch(bukaEl, 'buka');
      function silent(p) { if (p && typeof p.catch === 'function') p.catch(function () {}); }

      // Putar lock.mp3 sekali. Jika autoplay diblokir, dicoba lagi pada gestur valid berikutnya.
      function tryLock() {
        if (!sfxOn || stopped || lockDone || lockBusy || bad.lock || !lockEl || document.hidden) return;
        lockBusy = true;
        try {
          var p = lockEl.play();
          if (p && typeof p.then === 'function') {
            p.then(function () { lockBusy = false; lockDone = true; },
                   function () { lockBusy = false; });          // diblokir / gagal: coba lagi di gestur berikutnya
          } else { lockBusy = false; lockDone = true; }
        } catch (e) { lockBusy = false; }
      }
      // Pemanasan buka.mp3 secara senyap pada gestur pertama (iOS/Safari mensyaratkan ini)
      function prime() {
        if (!sfxOn || primed || stopped || bad.buka || !bukaEl) return;
        primed = true;
        try {
          bukaEl.muted = true;
          var p = bukaEl.play();
          var undo = function () { if (!bukaStarted) { try { bukaEl.pause(); bukaEl.currentTime = 0; } catch (e) {} } bukaEl.muted = false; };
          if (p && typeof p.then === 'function') p.then(undo, function () { bukaEl.muted = false; primed = false; });
          else undo();
        } catch (e) { try { bukaEl.muted = false; } catch (e2) {} }
      }
      function gesture() { tryLock(); prime(); }

      return {
        gesture: gesture,
        start: tryLock,
        // Dipanggil TEPAT saat verifikasi sukses. Tidak menunggu audio; hanya sekali.
        unlock: function () {
          stopped = true;
          if (lockEl) { try { lockEl.pause(); } catch (e) {} }
          if (!sfxOn || bukaStarted || bad.buka || !bukaEl) return;
          bukaStarted = true;
          try { bukaEl.muted = false; bukaEl.currentTime = 0; } catch (e) {}
          try { silent(bukaEl.play()); } catch (e) {}
          bukaEl.addEventListener('ended', function () { try { bukaEl.removeAttribute('src'); bukaEl.load(); if (bukaEl.parentNode) bukaEl.parentNode.removeChild(bukaEl); } catch (e) {} }, { once: true });
        },
        // true bila berkas buka dipakai (sintesis relay/release dilewati agar tidak bertumpuk)
        usesBuka: function () { return sfxOn && !bad.buka && !!bukaEl; },
        pauseHidden: function () { if (lockEl && !lockEl.paused) { try { lockEl.pause(); } catch (e) {} lockBusy = false; } },
        dispose: function () {
          stopped = true;
          if (lockEl) { try { lockEl.pause(); lockEl.removeAttribute('src'); lockEl.load(); if (lockEl.parentNode) lockEl.parentNode.removeChild(lockEl); } catch (e) {} }
        }
      };
    })();

    function buzz(ms) {
      if (reduce) return;
      try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
    }

    // Gestur pertama di dalam gerbang -> boleh menyalakan audio efek gerbang
    function onGesture() { Snd.arm(); }
    root.addEventListener('pointerdown', onGesture, { passive: true });
    root.addEventListener('keydown', function (e) { if (e.key !== 'Tab' && e.key !== 'Shift') onGesture(); });
    // Gestur yang dianggap valid oleh kebijakan autoplay (pointerup/touchend/click/keydown)
    function onActivation() { Fx.gesture(); }
    ['pointerup', 'touchend', 'click', 'keydown'].forEach(function (ev) { root.addEventListener(ev, onActivation, { passive: true }); });
    function onVis() { if (document.hidden) { Snd.suspend(); Fx.pauseHidden(); } else { Snd.resume(); Fx.start(); } }
    document.addEventListener('visibilitychange', onVis);

    /* =================================================================
       Terminal diagnostik (fiksi, lokal). Antrean kecil & dibatasi.
       ================================================================= */
    var MAXLN = 6, queue = [], typingTimer = 0, curLine = null, curFull = '', curPos = 0;
    var CLUES = [
      'ACCESS IS RESERVED FOR SOMEONE SPECIAL.',
      'THE KEY IS NOT A RANDOM SEQUENCE.',
      'IDENTITY REFERENCE: PERSONAL.',
      'ONE WORD MAY BE ENOUGH.',
      'THE ANSWER IS CLOSER THAN YOU THINK.',
      'AUTHORIZATION REQUIRES A FAMILIAR TITLE.',
      'THIS SYSTEM RECOGNIZES A VERY PARTICULAR PERSON.'
    ];
    var LOGS = [
      ['t-sys', '[SECURITY LOG]', 'Personal identity reference detected.'],
      ['t-sys', '[CLASSIFIED]', 'Relationship verification required.'],
      ['t-sys', '[ACCESS CONTROL]', 'Designated visitor required.']
    ];
    var bag = [];
    function nextClue() {            // acak tanpa pengulangan sampai habis; tidak bergantung jumlah percobaan
      if (!bag.length) { bag = CLUES.map(function (_, i) { return i; }); }
      var k = Math.floor(Math.random() * bag.length);
      return CLUES[bag.splice(k, 1)[0]];
    }

    function mkLine(cls, tag, text) {
      var p = document.createElement('p'); p.className = 'lk-ln';
      var s = document.createElement('span'); s.className = cls; s.textContent = tag;
      p.appendChild(s); p.appendChild(document.createTextNode(' '));
      var tn = document.createTextNode(''); p.appendChild(tn);
      return { el: p, node: tn, text: text };
    }
    function finishLine() {
      clearTimeout(typingTimer); typingTimer = 0;
      if (curLine) { curLine.node.nodeValue = curFull; curLine.el.classList.remove('is-cur'); curLine = null; }
    }
    function pump() {
      if (curLine || !queue.length) return;
      var q = queue.shift();
      var L = mkLine(q.cls, q.tag, q.text);
      termEl.appendChild(L.el);
      while (termEl.children.length > MAXLN) termEl.removeChild(termEl.firstChild);
      if (reduce) { L.node.nodeValue = q.text; later(pump, 60); return; }
      curLine = L; curFull = q.text; curPos = 0; L.el.classList.add('is-cur');
      Snd.tap();
      (function step() {
        curPos = Math.min(curFull.length, curPos + 2);
        curLine.node.nodeValue = curFull.slice(0, curPos);
        if (curPos % 6 === 0) Snd.tap();
        if (curPos >= curFull.length) {
          var L2 = curLine; typingTimer = 0; curLine = null; L2.el.classList.remove('is-cur');
          later(pump, 150);
        } else typingTimer = setTimeout(step, 22);
      })();
    }
    function say(cls, tag, text, urgent) {
      if (urgent) { finishLine(); queue.length = 0; }
      else if (queue.length >= 4) queue.shift();     // antrean dibatasi
      queue.push({ cls: cls, tag: tag, text: text });
      pump();
    }

    /* ---------- Boot: beberapa baris saja ---------- */
    say('t-sys', '[SYS]', 'Local authentication sequence initialised.');
    say('t-ok', '[OK]', 'Interface integrity check complete.');
    say('t-sys', '[SYS]', 'Awaiting authorization key.');
    later(function () { if (state === 'locked') say('t-sys', LOGS[1][1], LOGS[1][2]); }, 3600);
    // Petunjuk samar, jarang, dibatasi 3 kali; bukan karena banyaknya percobaan
    [12000, 34000, 64000].forEach(function (ms) {
      later(function () { if (state === 'locked') say('t-sys', '[CLUE]', nextClue()); }, ms);
    });

    /* ---------- Interaksi ---------- */
    function submit(e) { if (e) e.preventDefault(); attempt(); }
    form.addEventListener('submit', submit);

    btnShow.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btnShow.setAttribute('aria-pressed', show ? 'true' : 'false');
      btnShow.setAttribute('aria-label', show ? 'Hide key' : 'Show key');
      try { input.focus({ preventScroll: true }); } catch (e) {}
    });
    btnClear.addEventListener('click', function () {
      input.value = '';
      try { input.focus({ preventScroll: true }); } catch (e) {}
    });

    function attempt() {
      if (state !== 'locked') return;                 // cegah kirim ganda
      Snd.arm();
      var val = input.value;
      if (val === '') {
        status('INPUT REQUIRED — ENTER AUTHORIZATION KEY');
        say('t-warn', '[WARN]', 'Empty credential rejected.', true);
        try { input.focus({ preventScroll: true }); } catch (e) {}
        return;
      }
      var tok = ++seq;
      setState('verifying');
      status('VERIFYING…');
      say('t-sys', '[AUTH]', 'Verifying credential…', true);
      Snd.pulse();
      later(function () {
        if (tok !== seq || state !== 'verifying') return;
        if (valid(val)) accept(tok); else deny(tok);
      }, 640);
    }

    /* ---------- Ditolak ---------- */
    function deny(tok) {
      setState('denied');
      status('ACCESS DENIED — KEY NOT RECOGNIZED');
      say('t-warn', '[WARNING]', 'Identity remains unverified.', true);
      later(function () { if (tok === seq && (state === 'denied' || state === 'locked')) say('t-sys', '[CLUE]', nextClue()); }, 900);
      input.value = '';
      if (!reduce) { retrigger('is-flash'); retrigger('is-shake'); }
      else root.classList.add('is-flash');
      Snd.deny(); buzz(40);
      later(function () {
        if (tok !== seq || state !== 'denied') return;
        root.classList.remove('is-flash', 'is-shake');
        setState('locked');
        try { input.focus({ preventScroll: true }); } catch (e) {}
      }, 700);
    }

    /* ---------- Diterima: urutan buka kunci ---------- */
    function accept(tok) {
      var live = function () { return tok === seq && (state === 'unlocking'); };
      setState('unlocking');
      Fx.unlock();                                    // buka.mp3: seketika setelah verifikasi sukses, tanpa menunggu
      input.value = ''; input.type = 'password';
      input.disabled = true; btnShow.disabled = true; btnClear.disabled = true;
      try { input.blur(); } catch (e) {}
      status('AUTHENTICATION ACCEPTED');
      say('t-ok', '[AUTH]', 'Authentication accepted.', true);
      root.classList.add('lk-ok');                    // indikator merah -> hijau
      Snd.pulse();

      later(function () { if (!live()) return; status('IDENTITY VERIFIED'); say('t-ok', '[AUTH]', 'Identity verified.', true); Snd.pulse(); }, 480);
      later(function () {
        if (!live()) return;
        status('ACCESS GRANTED'); say('t-ok', '[ACCESS]', 'Access granted.', true);
        if (!Fx.usesBuka()) Snd.relay(); retrigger('lk-jolt');
      }, 960);
      later(function () {
        if (!live()) return;
        root.classList.add('lk-open');                // shackle terangkat lalu berayun
        if (!Fx.usesBuka()) Snd.release(); buzz(30);
      }, 1380);
      later(function () {
        if (!live()) return;
        plate.textContent = 'RELEASED';
        sessionEl.textContent = 'UNLOCKED'; sysEl.textContent = 'UNLOCKED'; chipEl.textContent = 'UNLOCKED';
        status('SECURITY CLEARANCE ACCEPTED');
        say('t-ok', '[OK]', 'Security clearance accepted. Session unlocked.', true);
      }, 2150);
      later(function () {
        if (!live()) return;
        root.classList.add('lk-leaving');             // overlay memudar...
        setGated(false);                              // ...situs asli muncul di bawahnya (tanpa lompatan layout)
        restoreTheme();
      }, 2900);
      later(function () { if (live()) finish(); }, 3600);
    }

    function finish() {
      setState('unlocked');
      clearTimers(); clearTimeout(typingTimer);
      document.removeEventListener('visibilitychange', onVis);
      Snd.close(); Fx.dispose();
      if (root.parentNode) root.parentNode.removeChild(root);
      // Fokus ke tombol asli; TIDAK diklik otomatis, musik tetap menunggu ketukan pengunjung.
      var cta = document.querySelector('[data-action="open"]');
      if (cta) { try { cta.focus({ preventScroll: true }); } catch (e) {} }
    }

    setState('locked');
    Fx.start();                                       // lock.mp3: saat gerbang tampil (jika kebijakan browser mengizinkan)
    try {
      if (window.matchMedia && window.matchMedia('(pointer:fine)').matches) input.focus({ preventScroll: true });
    } catch (e) {}
  }
})();
