// DDD Games: spaarpot en outfit bij je naam, zodat je op elk apparaat hetzelfde hebt (Polder Dash, Ditch Jumper, Stampede).
// De server (zelfde als de high scores) bewaart alles; hier staat een kopie zodat het spel meteen je outfit kan tekenen.
// Naam, naamcode en 'claimed' komen van de high scores (sleutels 'polderdash.'). Zonder geclaimde naam is er geen spaarpot.
(function () {
  'use strict';
  var API = 'https://polder-dash-scores.dddgames.workers.dev';
  // lokaal testen met een eigen server: localStorage 'ddd.devapi' (werkt alleen op 127.0.0.1 / localhost)
  try { if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname) && localStorage.getItem('ddd.devapi')) API = localStorage.getItem('ddd.devapi'); } catch (e) { /* */ }

  function mk(prefix) {
    return {
      get: function (k, d) { try { var v = localStorage.getItem(prefix + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
      set: function (k, v) { try { localStorage.setItem(prefix + k, JSON.stringify(v)); } catch (e) { /* privé-venster */ } },
    };
  }
  var shared = mk('polderdash.'), mine = mk('ddd.');

  function cleanKey(k) { var c = String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-HJ-NP-Z2-9]{8}$/.test(c) ? c : null; }
  // wie speelt er (naam + code), of null als er nog geen geclaimde naam is
  function who() {
    var name = shared.get('name', '');
    if (typeof name !== 'string' || !name || shared.get('claimed', false) !== true) return null;
    var keys = shared.get('keys', {});
    var k = keys && typeof keys === 'object' ? cleanKey(keys[name.toLowerCase()]) : null;
    k = k || cleanKey(shared.get('key', ''));
    return k ? { name: name, key: k } : null;
  }

  function req(path, body) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : 0;
    var opt = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    if (ctl) opt.signal = ctl.signal;
    return fetch(API + path, opt).then(function (r) {
      clearTimeout(timer);
      return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; });
    }, function (e) { clearTimeout(timer); throw e; });
  }

  function Wallet(game) {
    this.game = game;
    this.fns = [];
    this.busy = 0;
    var c = mine.get('wallet.' + game, null), u = who();
    // kopie van de vorige keer, maar alleen als die bij dezelfde naam hoort
    this.state = c && u && c.name === u.name.toLowerCase() && c.w && typeof c.w === 'object' ? c.w : null;
    this.offline = false;
  }
  Wallet.prototype.who = who;
  Wallet.prototype.on = function (fn) { this.fns.push(fn); };
  // wat je net aantrok maar de server nog niet bevestigde, blijft bovenop elk antwoord liggen (anders springt het terug)
  Wallet.prototype.overlay = function (w) {
    var p = this.pend;
    if (!p || !w) return w;
    if (this.game === 'stampede') {
      if (p.animal && w.animals && w.animals.indexOf(p.animal) >= 0) w.animal = p.animal;
      w.pick = w.pick || {};
      for (var a in p.pick) w.pick[a] = p.pick[a];
    } else {
      w.wear = w.wear || {};
      for (var s in p) w.wear[s] = p[s];
    }
    return w;
  };
  Wallet.prototype.set = function (w) {
    var u = who();
    this.state = w && u ? this.overlay(w) : null;
    mine.set('wallet.' + this.game, this.state ? { name: u.name.toLowerCase(), w: this.state } : null);
    for (var i = 0; i < this.fns.length; i++) { try { this.fns[i](this.state); } catch (e) { if (window.console) console.warn(e); } }
  };
  // ophalen bij de server. extra: velden voor /wallet (Stampede: local)
  Wallet.prototype.sync = function (extra) {
    var self = this, u = who();
    if (!u) { if (this.state) this.set(null); return Promise.resolve(null); }
    var body = { game: this.game, name: u.name, key: u.key };
    for (var k in extra || {}) body[k] = extra[k];
    return req('/wallet', body).then(function (j) {
      self.offline = false;
      if (j.ok && j.wallet) self.set(j.wallet);
      else if (j.error === 'noname' || j.error === 'taken') self.set(null);
      return j;
    }, function () { self.offline = true; return null; });
  };
  Wallet.prototype.buy = function (item) {
    var self = this, u = who();
    if (!u) return Promise.resolve({ ok: false, error: 'noname' });
    return req('/buy', { game: this.game, name: u.name, key: u.key, item: item }).then(function (j) {
      self.offline = false;
      if (j.wallet) self.set(j.wallet);
      return j;
    }, function () { self.offline = true; return { ok: false, error: 'offline' }; });
  };
  // aantrekken: meteen hier, de server krijgt het even later (bij snel wisselen maar één keer).
  // Tot de server het bevestigt staat het in 'pend' (steeds een nieuw object, zodat een ouder antwoord het niet wist).
  Wallet.prototype.wear = function (wear) {
    var self = this, u = who();
    if (!u || !this.state) return;
    var old = this.pend, p;
    if (this.game === 'stampede') {
      p = { animal: (wear.animal || (old && old.animal)) || null, pick: {} };
      for (var a in (old && old.pick) || {}) p.pick[a] = old.pick[a];
      for (var b in wear.pick || {}) p.pick[b] = wear.pick[b];
    } else {
      p = {};
      for (var s in old || {}) p[s] = old[s];
      for (var t in wear) p[t] = wear[t];
    }
    this.pend = p;
    this.set(this.state);
    clearTimeout(this.wearT);
    this.wearT = setTimeout(function () {
      var sent = self.pend, w = sent;
      if (self.game === 'stampede') w = { animal: sent.animal || self.state.animal, pick: sent.pick };
      req('/wear', { game: self.game, name: u.name, key: u.key, wear: w }).then(function (j) {
        if (self.pend === sent) self.pend = null;   // bevestigd (en niets nieuwers aangetrokken)
        if (j.ok && j.wallet) self.set(j.wallet);
      }, function () { self.offline = true; });   // geen internet: blijft hier staan, gaat mee met de volgende keer aantrekken
    }, 500);
  };

  // runs die niet aankwamen (geen internet): later nog eens insturen, zodat je punten niet kwijt zijn.
  // Het token van een run is 3 uur geldig vanaf het moment dat het werd uitgegeven (eerste stukje van het token).
  var TOKEN_MAX_AGE = 3 * 3600 * 1000 - 10 * 60 * 1000;
  function tokenTime(x) { var t = Number(String(x && x.body && x.body.token || '').split('.')[0]); return isFinite(t) && t > 0 ? t : (x && x.at) || 0; }
  function outbox() { var o = mine.get('outbox', []); return Array.isArray(o) ? o.filter(function (x) { return x && x.body && Date.now() - tokenTime(x) < TOKEN_MAX_AGE; }) : []; }
  var flushing = false;
  var api = {
    create: function (game) { return new Wallet(game); },
    who: who,
    url: function () { return API; },
    queue: function (body) {
      var o = outbox();
      if (!o.some(function (x) { return x.body.token === body.token; })) o.push({ at: Date.now(), body: body });
      mine.set('outbox', o.slice(-8));
    },
    // stuurt de wachtende runs; onWallet(game, wallet, body) krijgt de nieuwe spaarpot
    flush: function (onWallet) {
      if (flushing) return;
      var o = outbox();
      mine.set('outbox', o);
      if (!o.length) return;
      flushing = true;
      var x = o[0];
      req('/score', x.body).then(function (j) {
        flushing = false;
        // te druk of serverfout: later nog eens; elk ander antwoord (goed of fout): niet opnieuw
        if (j.status === 429 || j.status >= 500) return;
        mine.set('outbox', outbox().filter(function (y) { return y.body.token !== x.body.token; }));
        if (j.ok && j.wallet && onWallet) onWallet(x.body.game || 'dash', j.wallet, x.body);
        api.flush(onWallet);
      }, function () { flushing = false; });
    },
  };
  window.DDDWallet = api;
})();
