// Backdrop for the doc renders: a radar screen in the dark, a few glowing marks on deep blue. Rings and a compass rose
// around runway 30R (just below the frame), its centreline, ours climbing out on squawk 1000, two other targets.
// BD.draw(el) fills el with a 1920x1080 SVG, or with the page's ?bg=<file> (a sim screenshot).
var BD = (function () {
  var W = 1920, H = 1080;
  var CX = 760, CY = 1130; // runway 30R
  var LINE = "#93b9da", TXT = "#afc8df", OWN = "#ffb547";
  var MONO = 'font-family="Roboto Mono, Consolas, monospace"';

  function grad(id, stops, attrs) {
    var tag = attrs.r ? "radialGradient" : "linearGradient";
    return "<" + tag + ' id="' + id + '"' +
      Object.keys(attrs).map(function (k) { return " " + k + '="' + attrs[k] + '"'; }).join("") + ">" +
      stops.map(function (st) {
        return '<stop offset="' + st[0] + '" stop-color="' + st[1] + '" stop-opacity="' + (st[2] === undefined ? 1 : st[2]) + '"/>';
      }).join("") + "</" + tag + ">";
  }

  // what the scope draws; drawn twice, blurred under itself for the glow
  function marks() {
    var s = [];
    [240, 480, 720, 960, 1200].forEach(function (r, i) {
      s.push('<circle cx="' + CX + '" cy="' + CY + '" r="' + r + '" fill="none" stroke="' + LINE + '" stroke-opacity="' +
        (0.16 - i * 0.02).toFixed(2) + '" stroke-width="1.5"/>');
    });
    // the compass rose on the 20 NM ring, labelled on the left only (the others would sit under the pill's buttons)
    for (var d = 0; d < 360; d += 10) {
      var a = (d - 90) * Math.PI / 180, r0 = d % 30 ? 950 : 935;
      s.push('<path d="M' + (CX + r0 * Math.cos(a)).toFixed(1) + " " + (CY + r0 * Math.sin(a)).toFixed(1) + "L" +
        (CX + 960 * Math.cos(a)).toFixed(1) + " " + (CY + 960 * Math.sin(a)).toFixed(1) + '" stroke="' + LINE +
        '" stroke-opacity="0.22" stroke-width="1.5"/>');
      if (d === 300 || d === 330 || d === 0) {
        s.push('<text x="' + (CX + 905 * Math.cos(a)).toFixed(1) + '" y="' + (CY + 905 * Math.sin(a) + 6).toFixed(1) +
          '" text-anchor="middle" fill="' + TXT + '" fill-opacity="0.32" ' + MONO + ' font-size="16">' + ("00" + d).slice(-3) + "</text>");
      }
    }
    // runway 30R's centreline out of the frame
    var h = (300 - 90) * Math.PI / 180, ux = Math.cos(h), uy = Math.sin(h);
    s.push('<path d="M' + CX + " " + CY + "L" + (CX + ux * 900).toFixed(1) + " " + (CY + uy * 900).toFixed(1) + '" stroke="' + LINE +
      '" stroke-opacity="0.24" stroke-width="1" stroke-dasharray="4 10"/>');
    // traffic: [x, y, heading, callsign, level and speed, squawk, ours]: history dots, one-minute speed line, data block
    [[604, 1040, 300, "AFR1234", "012↑ 16", "1000", true], [300, 150, 120, "EZY46TW", "110↓ 28", "5221"],
      [1700, 250, 250, "RYR8QK", "240 41", "4613"]].forEach(function (p) {
      var col = p[6] ? OWN : TXT, op = p[6] ? 0.9 : 0.42, k = (p[2] - 90) * Math.PI / 180, hx = Math.cos(k), hy = Math.sin(k);
      for (var i = 1; i <= 4; i++) {
        s.push('<rect x="' + (p[0] - hx * i * 18 - 2).toFixed(1) + '" y="' + (p[1] - hy * i * 18 - 2).toFixed(1) +
          '" width="4" height="4" fill="' + col + '" fill-opacity="' + (op * (1 - i * 0.2)).toFixed(2) + '"/>');
      }
      s.push('<g stroke="' + col + '" stroke-opacity="' + op + '" fill="none">' +
        '<path d="M' + p[0] + " " + p[1] + "l" + (hx * 50).toFixed(1) + " " + (hy * 50).toFixed(1) + '" stroke-width="1.5"/>' +
        '<rect x="' + (p[0] - 6) + '" y="' + (p[1] - 6) + '" width="12" height="12" stroke-width="2"/>' +
        '<path d="M' + (p[0] + 7) + " " + (p[1] - 7) + "L" + (p[0] + 40) + " " + (p[1] - 40) + '" stroke-width="1"/></g>');
      var bx = p[0] + 46, by = p[1] - 46;
      s.push('<text fill="' + col + '" fill-opacity="' + op + '" ' + MONO + ' font-size="16">' +
        '<tspan x="' + bx + '" y="' + (by - 20) + '">' + p[3] + '</tspan><tspan x="' + bx + '" y="' + by + '">' + p[4] +
        '</tspan><tspan x="' + bx + '" y="' + (by + 20) + '">' + p[5] + "</tspan></text>");
    });
    return s.join("");
  }

  function svg() {
    var m = marks();
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">' +
      "<defs>" +
      grad("bd-base", [[0, "#04070b"], [0.6, "#0a121c"], [1, "#030508"]], { x1: 0, y1: 0, x2: 1, y2: 1 }) +
      // the screen's phosphor: brightest where the pill sits and around the runway
      grad("bd-glow", [[0, "#335881", 0.32], [1, "#335881", 0]], { cx: 0.72, cy: 0.4, r: 0.55 }) +
      grad("bd-low", [[0, "#3a648f", 0.17], [1, "#3a648f", 0]], { cx: 0.4, cy: 1, r: 0.5 }) +
      grad("bd-vig", [[0.5, "#000", 0], [1, "#000", 0.65]], { cx: 0.5, cy: 0.5, r: 0.72 }) +
      '<filter id="bd-bloom" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2"/></filter>' +
      '<filter id="bd-halo" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="4"/></filter>' +
      // a pool of light around ours
      grad("bd-own", [[0, "#ffb547", 0.16], [1, "#ffb547", 0]], { cx: 0.33, cy: 0.94, r: 0.05 }) +
      // faint scanlines
      '<pattern id="bd-scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#000" fill-opacity="0.07"/></pattern>' +
      "</defs>" +
      '<rect width="100%" height="100%" fill="url(#bd-base)"/>' +
      '<rect width="100%" height="100%" fill="url(#bd-glow)"/><rect width="100%" height="100%" fill="url(#bd-low)"/>' +
      '<rect width="100%" height="100%" fill="url(#bd-own)"/>' +
      // the marks' light: a wide halo, a tight bloom, then the marks
      '<g filter="url(#bd-halo)">' + m + m + "</g>" + '<g filter="url(#bd-bloom)">' + m + "</g>" + m +
      '<rect width="100%" height="100%" fill="url(#bd-scan)"/><rect width="100%" height="100%" fill="url(#bd-vig)"/></svg>';
  }

  function draw(el) {
    var bg = new URLSearchParams(location.search).get("bg");
    if (bg) {
      el.classList.add("photo");
      el.style.backgroundImage = "url('" + bg + "')";
    } else {
      el.innerHTML = svg();
    }
  }

  return { draw: draw, svg: svg };
})();
