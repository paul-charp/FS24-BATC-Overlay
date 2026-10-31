// Pill markup for the doc renders' static pills (assist.html), matching pill.js view().
var BP = (function () {
  var LAMP = '<span class="bp-lamp"></span>';
  var BARS = '<span class="bp-bars"><i></i><i></i><i></i><i></i></span>';
  var RADIO = '<svg class="bp-ico bp-radio" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round"><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/>' +
    '<path d="M5.2 5.2a4 4 0 0 0 0 5.6M10.8 5.2a4 4 0 0 1 0 5.6M3.1 3.1a7 7 0 0 0 0 9.8M12.9 3.1a7 7 0 0 1 0 9.8"/></svg>';
  var MUTE = '<svg class="bp-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h2l3-2.5v9L5 10H3z"/><path d="M11 6l3.5 4M14.5 6L11 10"/></svg>';
  var CHECK = '<svg class="bp-ico bp-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-6.5"/></svg>';
  var SEP = '<span class="bp-sep">·</span>';
  // key: [classes, content]
  var STATES = {
    insist: ["s-insist is-pulse", LAMP + '<span class="bp-who">Awaiting readback ×2</span>'],
    negative: ["s-insist is-pulse", LAMP + '<span class="bp-who">Negative</span>' + SEP + "<span>QNH 1013</span>"],
    muted: ["s-insist is-muted", BARS + '<span class="bp-who">Ground</span><span class="bp-freq">121.955</span>' + MUTE],
    contact: ["s-tune", RADIO + '<span class="bp-who">Contact</span><span>Approach</span><span class="bp-freq">120.100</span>'],
    ok: ["s-ok", CHECK + '<span class="bp-who">Readback OK</span>' + SEP + "<span>Taxi 12L</span>"],
  };
  function pill(key, unit) {
    var s = STATES[key];
    return s ? '<div id="batc-overlay" class="' + s[0] + '" style="--u:' + unit + 'px"><div class="bp-bg"></div>' +
      '<div class="bp-body">' + s[1] + "</div></div>" : "";
  }
  return { pill: pill };
})();
