// Ditch Jumper: kleding uit de winkel. Zelfde lijst en prijzen als de server (GamesNotes leaderboard: SHOP.jump).
// JumpLook.wear = wat het poppetje nu draagt (of past in de winkel). game.js (2D) en jump3d.js (3D) tekenen dat.
(function () {
  'use strict';
  var SLOTS = [
    { key: 'shirt', label: 'Shirt', items: [
      { key: 'red', name: 'Red', price: 0, sw: '#e8413a' },
      { key: 'blue', name: 'Sky blue', price: 30, sw: '#5ab4ee' },
      { key: 'green', name: 'Green', price: 30, sw: '#3caa4a' },
      { key: 'black', name: 'Black', price: 60, sw: '#2a2a2e' },
      { key: 'gold', name: 'Gold', price: 300, sw: 'linear-gradient(135deg,#fff1a8,#d99a1c)' },
    ] },
    { key: 'hat', label: 'Hat', items: [
      { key: 'cap', name: 'Cap', price: 0, icon: '🧢' },
      { key: 'straw', name: 'Straw hat', price: 50, icon: '👒' },
      { key: 'tophat', name: 'Top hat', price: 100, icon: '🎩' },
      { key: 'cowboy', name: 'Cowboy', price: 100, icon: '🤠' },
      { key: 'crown', name: 'Crown', price: 500, icon: '👑' },
    ] },
    { key: 'pole', label: 'Pole', items: [
      { key: 'wood', name: 'Wood', price: 0, sw: '#9a6a35' },
      { key: 'silver', name: 'Silver', price: 150, sw: 'linear-gradient(135deg,#f4f7fa,#8f99a3)' },
      { key: 'gold', name: 'Gold', price: 400, sw: 'linear-gradient(135deg,#fff1a8,#d99a1c)' },
      { key: 'diamond', name: 'Diamond', price: 1000, icon: '💎' },
    ] },
  ];
  var SHIRT = { red: '#e8413a', blue: '#5ab4ee', green: '#3caa4a', black: '#2a2a2e', gold: '#f2c14e' };
  var POLE = { wood: '#8a5a2b', silver: '#c9d1d9', gold: '#f2c14e', diamond: '#a8f0ff' };

  // hoed in 2D (zijaanzicht, kijkt naar rechts). (x, y) = midden van het hoofd, hoofd heeft straal 6.5
  function hat2d(ctx, key, x, y) {
    switch (key) {
      case 'straw':
        ctx.fillStyle = '#e8c96a'; ctx.beginPath(); ctx.ellipse(x + 1, y - 5, 12, 2.6, 0, 0, 7); ctx.fill();
        ctx.fillRect(x - 5, y - 12, 10, 7);
        ctx.fillStyle = '#d8413a'; ctx.fillRect(x - 5, y - 8, 10, 2);
        break;
      case 'tophat':
        ctx.fillStyle = '#1b1b1f'; ctx.fillRect(x - 9, y - 7.5, 19, 2.6);
        ctx.fillRect(x - 5.5, y - 20, 11, 13);
        ctx.fillStyle = '#c0322a'; ctx.fillRect(x - 5.5, y - 10.5, 11, 2.2);
        break;
      case 'cowboy':
        ctx.fillStyle = '#8a5a2b';
        ctx.beginPath(); ctx.moveTo(x - 13, y - 9); ctx.quadraticCurveTo(x, y - 3, x + 14, y - 9); ctx.lineTo(x + 13, y - 5.5); ctx.quadraticCurveTo(x, y - 0.5, x - 12, y - 5.5); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x - 5, y - 15); ctx.quadraticCurveTo(x, y - 12, x + 5, y - 15); ctx.lineTo(x + 6, y - 6); ctx.fill();
        ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x - 6, y - 8.5, 12, 2);
        break;
      case 'crown':
        ctx.fillStyle = '#f2c14e';
        ctx.beginPath(); ctx.moveTo(x - 6.5, y - 5); ctx.lineTo(x - 6.5, y - 15); ctx.lineTo(x - 3, y - 10); ctx.lineTo(x, y - 17); ctx.lineTo(x + 3, y - 10);
        ctx.lineTo(x + 6.5, y - 15); ctx.lineTo(x + 6.5, y - 5); ctx.fill();
        ctx.fillStyle = '#e8413a'; ctx.beginPath(); ctx.arc(x, y - 8, 1.6, 0, 7); ctx.fill();
        ctx.fillStyle = '#5ab4ee'; ctx.beginPath(); ctx.arc(x - 4, y - 7.5, 1.1, 0, 7); ctx.arc(x + 4, y - 7.5, 1.1, 0, 7); ctx.fill();
        break;
      default: // pet
        ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(x, y - 3, 6.6, Math.PI, 0); ctx.fill();
        ctx.fillRect(x + 3, y - 4, 7, 2.2);
    }
  }
  // stok in 2D: lijn van (x1,y1) naar (x2,y2)
  function pole2d(ctx, key, x1, y1, x2, y2) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = POLE[key] || POLE.wood; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    if (key === 'silver' || key === 'gold' || key === 'diamond') {
      // glans
      ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x1, y1 - 0.8); ctx.lineTo(x2, y2 - 0.8); ctx.stroke();
    }
    if (key === 'diamond') {
      var t = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
      ctx.fillStyle = '#fff';
      for (var i = 0; i < 3; i++) {
        var u = ((t * 0.5 + i / 3) % 1), px = x1 + (x2 - x1) * u, py = y1 + (y2 - y1) * u, s = 1.6 * Math.sin(u * Math.PI);
        ctx.fillRect(px - s, py - 0.4, s * 2, 0.8); ctx.fillRect(px - 0.4, py - s, 0.8, s * 2);
      }
    }
  }
  // poppetje voor de winkel (alleen in de 2D-versie): staand, met stok
  function preview2d(ctx, w, h, wear) {
    var c = Look.colors(wear);
    ctx.save();
    ctx.translate(w / 2 - 6, h * 0.93); ctx.scale(3, 3);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 2.5, 0, 0, 7); ctx.fill();
    pole2d(ctx, wear.pole, -18, -14, 24, -42);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2f6fd1'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(-4, -2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(4, -2); ctx.stroke();
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath(); ctx.ellipse(-2, -1, 4.5, 2.4, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(6, -1, 4.5, 2.4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = c.shirt; ctx.fillRect(-6, -32, 12, 10);
    ctx.fillStyle = '#2f6fd1'; ctx.fillRect(-6, -26, 12, 11); ctx.fillRect(-5, -32, 2.5, 7); ctx.fillRect(2.5, -32, 2.5, 7);
    ctx.strokeStyle = c.shirt; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(6, -24); ctx.stroke();
    ctx.fillStyle = '#f2c9a0'; ctx.beginPath(); ctx.arc(1, -38, 6.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#000'; ctx.fillRect(3.5, -40, 1.6, 1.6); ctx.fillRect(2.5, -35.5, 3, 1);
    ctx.fillStyle = '#c98a5a'; ctx.fillRect(6.5, -38.5, 2, 2);
    hat2d(ctx, wear.hat, 1, -38);
    ctx.restore();
  }
  var Look = {
    SLOTS: SLOTS,
    wear: { shirt: 'red', hat: 'cap', pole: 'wood' },
    shop: false,
    colors: function (w) { w = w || Look.wear; return { shirt: SHIRT[w.shirt] || SHIRT.red, pole: POLE[w.pole] || POLE.wood }; },
    hat2d: hat2d, pole2d: pole2d, preview2d: preview2d,
    // hoe ver de bovenkant van de hoed boven het midden van het hoofd zit (2D)
    hatTop: function (k) { return { straw: 12, tophat: 20, cowboy: 15, crown: 17 }[k] || 9.6; },
  };
  window.JumpLook = Look;
})();
