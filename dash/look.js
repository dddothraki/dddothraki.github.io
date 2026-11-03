// Polder Dash: kleding uit de winkel. Zelfde lijst en prijzen als de server (GamesNotes leaderboard: SHOP.dash).
// DashLook.wear = wat de boer nu draagt (of past in de winkel). game3d.js (3D) en classic.js (2D, van bovenaf) tekenen dat.
(function () {
  'use strict';
  var STICK = '<svg viewBox="0 0 24 24"><path d="M9 6a3 3 0 0 1 6 0v16" fill="none" stroke="#8a5a2b" stroke-width="2.6" stroke-linecap="round"/></svg>';
  var SLOTS = [
    { key: 'coat', label: 'Coat', items: [
      { key: 'classic', name: 'Classic', price: 0, sw: '#d9a46c' },
      { key: 'red', name: 'Red', price: 2000, sw: '#d23a30' },
      { key: 'green', name: 'Green', price: 2000, sw: '#3f8f4a' },
      { key: 'blue', name: 'Blue', price: 2500, sw: '#3a6fd0' },
      { key: 'black', name: 'Black', price: 4000, sw: '#2a2a2e' },
      { key: 'ghost', name: 'Ghost white', price: 6000, sw: '#eef2fa' },
      { key: 'gold', name: 'Gold', price: 15000, sw: 'linear-gradient(135deg,#fff1a8,#d99a1c)' },
    ] },
    { key: 'hat', label: 'Hat', items: [
      { key: 'none', name: 'Hood', price: 0, icon: '🧥' },
      { key: 'cap', name: 'Cap', price: 3000, icon: '🧢' },
      { key: 'tophat', name: 'Top hat', price: 6000, icon: '🎩' },
      { key: 'cowboy', name: 'Cowboy', price: 6000, icon: '🤠' },
      { key: 'pumpkin', name: 'Pumpkin', price: 10000, icon: '🎃' },
      { key: 'crown', name: 'Crown', price: 30000, icon: '👑' },
    ] },
    { key: 'boots', label: 'Boots', items: [
      { key: 'classic', name: 'Classic', price: 0, sw: '#3a3634' },
      { key: 'red', name: 'Red', price: 2000, sw: '#d23a30' },
      { key: 'yellow', name: 'Yellow', price: 2000, sw: '#f2c81e' },
      { key: 'gold', name: 'Gold', price: 12000, sw: 'linear-gradient(135deg,#fff1a8,#d99a1c)' },
    ] },
    { key: 'hand', label: 'Hand', items: [
      { key: 'none', name: 'Nothing', price: 0, icon: '✋' },
      { key: 'cane', name: 'Walking stick', price: 5000, svg: STICK },
      { key: 'fork', name: 'Pitchfork', price: 8000, icon: '🔱' },
    ] },
  ];
  // kleuren: 2D (classic.js) en 3D (game3d.js; null = de echte textuur)
  var COAT = { classic: '#e2b23a', red: '#d23a30', green: '#3f8f4a', blue: '#3a6fd0', black: '#2e2e33', ghost: '#eef2fa', gold: '#ffcc33' };
  var COAT3 = { classic: null, red: 0xc8302a, green: 0x3f8f4a, blue: 0x3466c8, black: 0x34343a, ghost: 0xe8eef8, gold: 0xf6c431 };
  var BOOTS = { classic: '#1b1f22', red: '#c8302a', yellow: '#f2c81e', gold: '#f6c431' };
  var BOOTS3 = { classic: null, red: 0xc8302a, yellow: 0xf2c81e, gold: 0xf6c431 };

  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var f = function (v) { return Math.max(0, Math.min(255, Math.round(v * k))); };
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }
  // hoed van bovenaf (2D). (x, y) = midden van de capuchon, straal 6.5; voorkant = boven (-y)
  function hat2d(ctx, key, x, y) {
    switch (key) {
      case 'cap':
        ctx.fillStyle = '#2f5a3a'; ctx.beginPath(); ctx.ellipse(x, y - 6.5, 5, 3, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 6.6, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(x - 2, y - 1, 2.5, 0, 7); ctx.fill();
        break;
      case 'tophat':
        ctx.fillStyle = '#16161a'; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
        ctx.fillStyle = '#c0322a'; ctx.beginPath(); ctx.arc(x, y, 6.2, 0, 7); ctx.fill();
        ctx.fillStyle = '#26262b'; ctx.beginPath(); ctx.arc(x, y, 5.2, 0, 7); ctx.fill();
        break;
      case 'cowboy':
        ctx.fillStyle = '#8a5a2b'; ctx.beginPath(); ctx.ellipse(x, y, 12, 10, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#a8743c'; ctx.beginPath(); ctx.ellipse(x, y, 6, 5.2, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#6a4220'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.stroke();
        break;
      case 'pumpkin':
        ctx.fillStyle = '#e8741a'; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
        ctx.strokeStyle = '#b8540e'; ctx.lineWidth = 1.2;
        for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.ellipse(x + i * 3.6, y, 2.6, 8.5, 0, 0, 7); ctx.stroke(); }
        ctx.fillStyle = '#3f7a2a'; ctx.fillRect(x - 1.3, y - 1.3, 2.6, 2.6);
        break;
      case 'crown':
        ctx.fillStyle = '#c99528'; ctx.beginPath(); ctx.arc(x, y, 6.5, 0, 7); ctx.fill();
        ctx.strokeStyle = '#f6c431'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.stroke();
        ctx.fillStyle = '#f6c431';
        for (var k = 0; k < 5; k++) {
          var a = k / 5 * Math.PI * 2 - Math.PI / 2;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(a - 0.3) * 7, y + Math.sin(a - 0.3) * 7); ctx.lineTo(x + Math.cos(a) * 11, y + Math.sin(a) * 11);
          ctx.lineTo(x + Math.cos(a + 0.3) * 7, y + Math.sin(a + 0.3) * 7); ctx.fill();
        }
        ctx.fillStyle = '#e8413a'; ctx.beginPath(); ctx.arc(x, y - 6, 1.5, 0, 7); ctx.fill();
        break;
      default: break; // capuchon (tekent classic.js zelf)
    }
  }
  // iets in de linkerhand (2D, van bovenaf). (x, y) = de hand
  function hand2d(ctx, key, x, y) {
    if (key === 'cane') {
      ctx.strokeStyle = '#6a4220'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 1, y - 2); ctx.lineTo(x - 2, y + 12); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 1, y - 2, 2, Math.PI, 0); ctx.stroke();
    } else if (key === 'fork') {
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 1, y + 12); ctx.lineTo(x - 1, y - 14); ctx.stroke();
      ctx.strokeStyle = '#b8bec4'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x - 5, y - 14); ctx.lineTo(x + 3, y - 14); ctx.stroke();
      for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x - 1 + i * 4, y - 14); ctx.lineTo(x - 1 + i * 4, y - 20); ctx.stroke(); }
    }
  }
  // de boer van bovenaf (zelfde tekening als classic.js), voor in de winkel en in het spel
  function farmer2d(ctx, wear, ph) {
    var c = COAT[wear.coat] || COAT.classic, bt = BOOTS[wear.boots] || BOOTS.classic;
    ctx.fillStyle = bt;
    ctx.fillRect(-6, 4 + ph * 5, 4, 7);
    ctx.fillRect(2, 4 - ph * 5, 4, 7);
    var arm = shade(c, 0.88);
    ctx.fillStyle = arm;
    ctx.beginPath(); ctx.ellipse(-10, -1 - ph * 4, 3, 5, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10, -3 + ph * 2, 3, 5, -0.2, 0, Math.PI * 2); ctx.fill();
    hand2d(ctx, wear.hand, -10, -1 - ph * 4);
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.ellipse(0, 0, 9.5, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.ellipse(-3, -3, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(c, 0.86);
    ctx.beginPath(); ctx.arc(0, -6, 6.5, 0, Math.PI * 2); ctx.fill();
    hat2d(ctx, wear.hat, 0, -6);
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(8, -14, 4, 7);
    ctx.fillStyle = '#fff6cc'; ctx.fillRect(8, -16, 4, 2.5);
  }
  function preview2d(ctx, w, h, wear) {
    ctx.save();
    ctx.translate(w / 2, h / 2 + 8); ctx.scale(5, 5);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 6, 12, 7, 0, 0, 7); ctx.fill();
    farmer2d(ctx, wear, 0);
    ctx.restore();
  }
  var Look = {
    SLOTS: SLOTS,
    wear: { coat: 'classic', hat: 'none', boots: 'classic', hand: 'none' },
    shop: false,
    COAT3: COAT3, BOOTS3: BOOTS3,
    farmer2d: farmer2d, preview2d: preview2d,
  };
  window.DashLook = Look;
})();
