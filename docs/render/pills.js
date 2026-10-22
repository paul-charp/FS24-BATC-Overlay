// Pill markup for the doc renders, matching pill.js view().
var BP = (function () {
  var LAMP = '<span class="bp-lamp"></span>';
  var DOTS = '<span class="bp-dots"><i></i><i></i><i></i></span>';
  var BARS = '<span class="bp-bars"><i></i><i></i><i></i><i></i></span>';
  var RADIO = '<svg class="bp-ico bp-radio" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round"><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/>' +
    '<path d="M5.2 5.2a4 4 0 0 0 0 5.6M10.8 5.2a4 4 0 0 1 0 5.6M3.1 3.1a7 7 0 0 0 0 9.8M12.9 3.1a7 7 0 0 1 0 9.8"/></svg>';
  var FREQ = '<span class="bp-freq">121.955</span>';
  var STATES = [
    ["dot", "is-dot", LAMP, "Idle", "Connected, nothing on the radio"],
    ["queued", "s-proc", LAMP + "<span>Queued</span><span class=\"bp-sep\">·</span><span>Wind Check</span>", "Queued", "Toolbar request waiting"],
    ["processing", "s-proc", DOTS + "<span>Processing</span>", "Processing", "Speech or request being processed"],
    ["awaiting", "s-proc is-pulse", LAMP + "<span>Awaiting ATC</span>", "Awaiting ATC", "Request sent"],
    ["atc", "s-atc", BARS + '<span class="bp-who">Ground</span>' + FREQ, "ATC talking", "Controller speaking"],
    ["you", "s-you", BARS + '<span class="bp-who">Transmitting</span>', "Transmitting", "Your readback or request"],
    ["tune", "s-tune", RADIO + '<span class="bp-who">Tower</span><span class="bp-freq">118.700</span>', "Radio change", "New station on COM1 or COM2"],
    ["linger", "", LAMP + '<span>Ground</span>' + FREQ, "Exchange ended", "Station for 3 s, then the dot"],
    ["offline", "is-ghost", LAMP + "<span>BATC offline</span>", "Offline", "BeyondATC not running"],
  ];
  function pill(key, unit) {
    for (var i = 0; i < STATES.length; i++) {
      if (STATES[i][0] === key) {
        return '<div id="batc-pill" class="' + STATES[i][1] + '" style="--u:' + unit + 'px"><div class="bp-bg"></div><div class="bp-body">' +
          STATES[i][2] + "</div></div>";
      }
    }
    return "";
  }
  return { STATES: STATES, pill: pill };
})();
