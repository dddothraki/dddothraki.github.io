// DDD Games: winkel voor Polder Dash en Ditch Jumper. Je punten (elke run je score) koop je kleding mee.
// Spaarpot en outfit staan bij je naam op de server (wallet.js). Het spel tekent wat er in look.wear staat;
// in de winkel zet deze code daar wat je aan het passen bent, en look.shop = true (de 3D-camera kijkt dan naar je poppetje).
(function () {
  'use strict';
  var CSS = '' +
    '#shop { justify-content:space-between; gap:8px; padding:calc(14px + env(safe-area-inset-top)) 12px 16px;' +
    '  background:linear-gradient(180deg, rgba(4,7,11,.65) 0, rgba(4,7,11,0) 16%, rgba(4,7,11,0) 40%, rgba(4,7,11,.9) 56%); }' +
    '#shop .shopHead { width:100%; display:flex; align-items:center; justify-content:space-between; }' +
    '#shop .shopHead h2 { text-shadow:0 2px 0 #000; }' +
    '#shop .shopPts { font-weight:900; font-size:20px; color:var(--gold); text-shadow:0 2px 0 #000; }' +
    '#shop .shopSpace { flex:1; width:100%; min-height:150px; display:flex; align-items:center; justify-content:center; }' +
    '#shop canvas.shopPrev { position:static; width:200px; height:200px; }' +
    '#shop .shopPanel { width:100%; display:flex; flex-direction:column; align-items:center; gap:8px; }' +
    '#shop .shopTabs { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; }' +
    '#shop .shopTabs button { font-size:14px; padding:8px 12px; background:rgba(255,255,255,.1); color:#cfd6da; box-shadow:none; }' +
    '#shop .shopTabs button.on { background:var(--gold); color:#111; }' +
    '#shop .shopItems { display:flex; gap:8px; width:100%; overflow-x:auto; padding:4px 2px 8px; touch-action:pan-x; -webkit-overflow-scrolling:touch; scrollbar-width:none; }' +
    '#shop .shopItems::-webkit-scrollbar { display:none; }' +
    '#shop .shopItem { flex:0 0 auto; width:80px; padding:8px 4px 6px; border-radius:12px; background:rgba(255,255,255,.08); color:#e9ecef;' +
    '  font-size:13px; font-weight:700; border:2px solid transparent; display:flex; flex-direction:column; align-items:center; gap:3px; box-shadow:none; line-height:1.15; }' +
    '#shop .shopItem.on { border-color:var(--gold); background:rgba(242,193,78,.14); }' +
    '#shop .shopItem .ic { width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:24px; line-height:1; }' +
    '#shop .shopItem .ic svg { width:30px; height:30px; }' +
    '#shop .shopItem small { font-size:11px; font-weight:800; color:var(--gold); }' +
    '#shop .shopItem.worn small { color:var(--green, #57c26a); }' +
    '#shop .shopItem.locked .ic { opacity:.85; }' +
    '#shop .shopMsg { min-height:20px; }' +
    '#shop .shopRow { display:flex; gap:10px; align-items:center; justify-content:center; }' +
    '#shop .shopAct { font-size:19px; padding:13px 22px; }' +
    '#shop .shopAct:disabled { opacity:.55; }' +
    '.shopOpenBtn { white-space:nowrap; }';

  function fmt(n) { return String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }

  // opt: { wallet, look:{SLOTS, wear, shop}, root, screens:[ids], openBtns:[ids], unit, preview2d(ctx,w,h,wear)|null, is3d(), sound(name) }
  function init(opt) {
    var W = opt.wallet, look = opt.look, SLOTS = look.SLOTS, unit = opt.unit || '⭐';
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var box = el('div', 'screen hidden'); box.id = 'shop';
    var head = el('div', 'shopHead'), h2 = el('h2', '', '👕 Shop'), pts = el('div', 'shopPts');
    head.appendChild(h2); head.appendChild(pts);
    var space = el('div', 'shopSpace'), cv = el('canvas', 'shopPrev hidden');
    space.appendChild(cv);
    var panel = el('div', 'shopPanel'), tabs = el('div', 'shopTabs'), items = el('div', 'shopItems'), msg = el('p', 'how shopMsg');
    var row = el('div', 'shopRow'), act = el('button', 'big shopAct', 'BUY'), done = el('button', 'ghostbtn shopDone', 'Done');
    row.appendChild(act); row.appendChild(done);
    panel.appendChild(tabs); panel.appendChild(items); panel.appendChild(msg); panel.appendChild(row);
    box.appendChild(head); box.appendChild(space); box.appendChild(panel);
    opt.root.appendChild(box);

    var S = { open: false, tab: SLOTS[0].key, trying: null, busy: false, back: [], note: '', noteCls: '' };
    function slot(k) { for (var i = 0; i < SLOTS.length; i++) if (SLOTS[i].key === k) return SLOTS[i]; return null; }
    function item(s, k) { var sl = slot(s); if (!sl) return null; for (var i = 0; i < sl.items.length; i++) if (sl.items[i].key === k) return sl.items[i]; return null; }
    function free() { var w = {}; SLOTS.forEach(function (s) { w[s.key] = s.items[0].key; }); return w; }
    // wat je echt draagt (van de server, of de gratis spullen)
    function worn() {
      var w = free(), sw = W.state && W.state.wear;
      if (sw) for (var k in w) if (item(k, sw[k])) w[k] = sw[k];
      return w;
    }
    function owns(s, k) { var it = item(s, k); return !!it && (it.price === 0 || !!(W.state && W.state.own && W.state.own.indexOf(s + '.' + k) >= 0)); }
    function copy(o) { var c = {}; for (var k in o) c[k] = o[k]; return c; }
    function setLook(w) { look.wear = copy(w); }

    function draw() {
      var named = !!W.who(), have = W.state ? W.state.pts : 0;
      pts.textContent = named && W.state ? unit + ' ' + fmt(have) : '';
      tabs.textContent = '';
      SLOTS.forEach(function (s) {
        var b = el('button', s.key === S.tab ? 'on' : '', s.label);
        b.addEventListener('click', function () { S.tab = s.key; S.note = ''; draw(); scrollToOn(); });
        tabs.appendChild(b);
      });
      items.textContent = '';
      var sl = slot(S.tab), w = worn();
      sl.items.forEach(function (it) {
        var mine = owns(S.tab, it.key), on = S.trying[S.tab] === it.key, wearing = w[S.tab] === it.key;
        var b = el('button', 'shopItem' + (on ? ' on' : '') + (wearing ? ' worn' : '') + (mine ? '' : ' locked'));
        var ic = el('span', 'ic');
        if (it.svg) ic.innerHTML = it.svg;
        else if (it.icon) ic.textContent = it.icon;
        else { ic.style.background = it.sw; ic.style.boxShadow = 'inset 0 -6px 0 rgba(0,0,0,.18), 0 0 0 2px rgba(255,255,255,.15)'; }
        b.appendChild(ic);
        b.appendChild(el('span', '', it.name));
        b.appendChild(el('small', '', wearing ? 'On' : mine ? (it.price === 0 ? 'Free' : 'Yours') : unit + ' ' + fmt(it.price)));
        b.addEventListener('click', function () { pick(S.tab, it.key); });
        items.appendChild(b);
      });
      // grote knop: kopen wat je past
      var k = S.trying[S.tab], it2 = item(S.tab, k);
      act.dataset.do = '';
      if (owns(S.tab, k)) { act.textContent = '✓ WEARING'; act.disabled = true; }
      else if (!named) { act.textContent = unit + ' ' + fmt(it2.price); act.disabled = true; }
      else if (S.busy) { act.textContent = 'BUYING…'; act.disabled = true; }
      else if (!W.state) { act.textContent = unit + ' ' + fmt(it2.price); act.disabled = true; }
      else if (have < it2.price) { act.textContent = 'NEED ' + unit + ' ' + fmt(it2.price); act.disabled = true; }
      else { act.textContent = 'BUY ' + unit + ' ' + fmt(it2.price); act.disabled = false; act.dataset.do = 'buy'; }
      // uitleg
      var t = S.note, cls = S.noteCls;
      if (!t) {
        cls = '';
        if (!named) t = 'Put a score on the high scores with your name to start saving ' + unit + '. Then every run counts!';
        else if (!W.state) t = W.offline ? "Can't reach the shop. Check your internet." : 'Loading your ' + unit + '…';
        else if (!owns(S.tab, k) && have < it2.price) t = 'Every run adds your score. ' + fmt(it2.price - have) + ' ' + unit + ' to go!';
        else t = 'Your ' + unit + ' and outfit are saved with your name, on every phone or PC.';
      }
      msg.textContent = t; msg.className = 'how shopMsg' + (cls ? ' ' + cls : '');
      if (S.preview) S.preview();
    }
    function scrollToOn() {
      var on = items.querySelector('.on');
      if (on) items.scrollLeft = Math.max(0, on.offsetLeft - items.offsetLeft - (items.clientWidth - on.offsetWidth) / 2);
    }
    function pick(s, k) {
      S.trying[s] = k; S.note = '';
      if (owns(s, k) && W.who() && W.state) { var o = {}; o[s] = k; W.wear(o); }
      setLook(S.trying);
      if (opt.sound) opt.sound('tap');
      draw();
    }
    act.addEventListener('click', function () {
      if (act.dataset.do !== 'buy' || S.busy) return;
      var s = S.tab, k = S.trying[s], it = item(s, k);
      S.busy = true; S.note = ''; draw();
      W.buy(s + '.' + k).then(function (j) {
        S.busy = false;
        if (j.ok) { S.note = it.name + ' is yours!'; S.noteCls = 'lbgood'; if (opt.sound) opt.sound('buy'); }
        else if (j.error === 'poor') { S.note = 'Not enough ' + unit + ' yet.'; S.noteCls = 'lbbad'; }
        else if (j.error === 'offline') { S.note = "Can't reach the shop. Check your internet."; S.noteCls = 'lbbad'; }
        else if (j.error === 'taken' || j.error === 'noname') { S.note = 'Your name code does not match. Check it under 🏆 High scores.'; S.noteCls = 'lbbad'; }
        else { S.note = 'Something went wrong. Try again.'; S.noteCls = 'lbbad'; }
        S.trying[s] = owns(s, k) ? k : S.trying[s];
        setLook(S.trying);
        draw();
      });
    });

    function open() {
      if (S.open) return;
      S.back = opt.screens.filter(function (id) { var e = document.getElementById(id); return e && !e.classList.contains('hidden'); });
      S.back.forEach(function (id) { document.getElementById(id).classList.add('hidden'); });
      box.classList.remove('hidden');
      S.open = true; api.open = true; look.shop = true;
      S.trying = worn(); S.note = '';
      // past dit vak niet meer (andere naam): eerste vak
      if (!slot(S.tab)) S.tab = SLOTS[0].key;
      var two = !!opt.preview2d && !(opt.is3d && opt.is3d());
      cv.classList.toggle('hidden', !two);
      S.preview = two ? function () {
        var r = Math.min(2, window.devicePixelRatio || 1) * 2;
        if (cv.width !== 200 * r) { cv.width = 200 * r; cv.height = 200 * r; }
        var c = cv.getContext('2d'); c.setTransform(r, 0, 0, r, 0, 0); c.clearRect(0, 0, 200, 200);
        opt.preview2d(c, 200, 200, S.trying);
      } : null;
      setLook(S.trying);
      draw(); scrollToOn();
      if (W.who()) W.sync().then(function () { if (S.open) { S.trying = mergeTry(); setLook(S.trying); draw(); } });
      done.focus();
    }
    // na het ophalen: wat je paste blijft, behalve wat je niet hebt in vakken waar je niet naar keek
    function mergeTry() { var w = worn(); w[S.tab] = S.trying[S.tab]; return w; }
    function close() {
      if (!S.open) return;
      box.classList.add('hidden');
      S.open = false; api.open = false; look.shop = false;
      setLook(worn());
      S.back.forEach(function (id) { document.getElementById(id).classList.remove('hidden'); });
      if (opt.onClose) opt.onClose();
    }
    done.addEventListener('click', close);
    // toont het spel intussen een scherm (bv. klaar met laden), dan wacht dat tot de winkel dicht is
    if (window.MutationObserver) opt.screens.forEach(function (id) {
      var e = document.getElementById(id);
      if (!e) return;
      new MutationObserver(function () {
        if (S.open && !e.classList.contains('hidden')) { e.classList.add('hidden'); if (S.back.indexOf(id) < 0) S.back.push(id); }
      }).observe(e, { attributes: true, attributeFilter: ['class'] });
    });
    (opt.openBtns || []).forEach(function (id) { var b = document.getElementById(id); if (b) b.addEventListener('click', function (e) { e.currentTarget.blur(); open(); }); });
    window.addEventListener('keydown', function (e) {
      if (!S.open) return;
      if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
      else if (e.code === 'Space' || e.code === 'Enter') { e.stopImmediatePropagation(); } // de knoppen werken nog, het spel start niet
    }, true);
    // spaarpot veranderd (na een run, of opgehaald): poppetje en winkel bijwerken
    W.on(function () { if (S.open) draw(); else setLook(worn()); });
    setLook(worn());
    var api = { open: false, show: open, hide: close, worn: worn };
    return api;
  }
  window.DDDShop = { init: init, fmt: fmt };
})();
