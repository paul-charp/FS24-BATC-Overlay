// Pill markup for the doc renders, matching pill.js view().
var BP = (function () {
  var LAMP = '<span class="bp-lamp"></span>';
  var DOTS = '<span class="bp-dots"><i></i><i></i><i></i></span>';
  var BARS = '<span class="bp-bars"><i></i><i></i><i></i><i></i></span>';
  var RADIO = '<svg class="bp-ico bp-radio" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round"><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/>' +
    '<path d="M5.2 5.2a4 4 0 0 0 0 5.6M10.8 5.2a4 4 0 0 1 0 5.6M3.1 3.1a7 7 0 0 0 0 9.8M12.9 3.1a7 7 0 0 1 0 9.8"/></svg>';
  var MIC = '<svg class="bp-ico bp-mic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round"><rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" fill="currentColor" stroke="none"/>' +
    '<path d="M3 8a5 5 0 0 0 10 0M8 13v2"/></svg>';
  var MUTE = '<svg class="bp-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h2l3-2.5v9L5 10H3z"/><path d="M11 6l3.5 4M14.5 6L11 10"/></svg>';
  var CHECK = '<svg class="bp-ico bp-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-6.5"/></svg>';
  var KEPT = '<span class="bp-unpin"><svg class="bp-clip" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
    'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3" width="9" height="11" rx="1.5"/>' +
    '<path d="M6 3V2h4v1M6 7h4M6 10h3"/></svg></span>';
  var FREQ = '<span class="bp-freq">121.955</span>';
  var ARROW = '<svg class="bp-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8h10M9 4.5L12.5 8 9 11.5"/></svg>';
  var ERROR_X = '<span class="bp-unpin is-x"><svg class="bp-x" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg></span>';
  function head(html) { return '<span class="bp-head">' + html + "</span>"; }
  function box(t, v) { return '<span class="bp-box"><span class="bp-box-t">' + t + '</span><span class="bp-box-v">' + v + "</span></span>"; }
  function note(t) { return '<span class="bp-note">' + t + "</span>"; }
  var SEP = '<span class="bp-sep">·</span>';
  var STATES = [
    ["dot", "is-dot", LAMP, "Idle", "Connected, nothing on the radio"],
    ["processing", "s-proc", DOTS + "<span>Processing</span>", "Processing", "Speech or request being processed"],
    ["awaiting", "s-proc is-pulse", LAMP + "<span>Awaiting ATC</span>", "Awaiting ATC", "Request sent"],
    ["atc", "s-atc", BARS + '<span class="bp-who">Ground</span>' + FREQ, "ATC talking", "Controller speaking"],
    ["you", "s-you", BARS + '<span class="bp-who">Transmitting</span>', "Transmitting", "Your readback or request plays"],
    ["ptt", "s-you", MIC + '<span class="bp-who">Transmitting</span>', "PTT held", "Optional: your PTT button"],
    ["readback", "s-atc is-pulse", LAMP + '<span class="bp-who">Awaiting readback</span>' + SEP + "<span>Taxi 12L</span>",
      "Awaiting readback", "ATC waits for your reply"],
    ["boxes", "s-atc is-pulse is-msg", head(LAMP + '<span class="bp-who">Awaiting readback</span>') +
      '<span class="bp-boxes">' + box("Taxi to Runway", "12L") + box("SID", "KELA8L") + box("Altitude Clearance", "FL060") +
      box("Squawk", "1000") + "</span>", "Clearance boxes", "With the Boxes readback detail"],
    ["insist", "s-insist is-pulse", LAMP + '<span class="bp-who">Awaiting readback ×2</span>', "ATC calls again", "Still no reply"],
    ["negative", "s-insist is-pulse", LAMP + '<span class="bp-who">Negative</span>' + SEP + "<span>QNH 1013</span>",
      "Negative", "ATC corrects your readback"],
    ["ok", "s-ok", CHECK + '<span class="bp-who">Readback OK</span>' + SEP + "<span>Taxi 12L</span>",
      "Readback OK", "ATC took your reply"],
    ["unable", "s-insist", LAMP + '<span class="bp-who">Unable</span>' + SEP + "<span>15,000</span>",
      "Unable", "ATC turned down your request"],
    ["kept", "s-pin", KEPT + "<span>Taxi 12L</span>", "Last clearance", "Optional: kept until the next one"],
    ["missed", "s-insist", LAMP + '<span class="bp-who">No readback</span>' + SEP + "<span>Taxi 12L</span>",
      "No readback", "BeyondATC stopped waiting"],
    ["tune", "s-tune", RADIO + '<span class="bp-who">Tower</span><span class="bp-freq">118.700</span>', "Radio change", "New station on COM1 or COM2"],
    ["contact", "s-tune", RADIO + '<span class="bp-who">Contact</span><span>Approach</span><span class="bp-freq">120.100</span>',
      "Contact", "Auto Tune off: tune this station"],
    ["checkin", "s-atc is-pulse", LAMP + '<span class="bp-who">Check in</span><span>Centre</span><span class="bp-freq">134.400</span>',
      "Check in", "New station waits for you"],
    ["atis", "s-atis", LAMP + '<span class="bp-who">ATIS</span>' + SEP + "<span>Z</span>", "ATIS change", "New ATIS letter"],
    ["muted", "s-insist is-muted", BARS + '<span class="bp-who">Ground</span>' + FREQ + MUTE, "ATC calls, COM1 muted", "You won't hear it"],
    ["linger", "", LAMP + "<span>Ground</span>" + FREQ, "Exchange ended", "Station for 3 s, then the dot"],
    ["offline", "is-ghost", LAMP + "<span>BATC offline</span>", "Offline", "BeyondATC not running"],
    ["loading", "s-proc has-track", DOTS + '<span class="bp-who">Loading flight</span>' + SEP + "<span>Alpine 68ML</span>",
      "Loading flight", "BeyondATC loads your flight", 60],
    ["loaded", "s-ok", CHECK + '<span class="bp-who">Alpine 68ML</span>' + SEP + '<span class="bp-route"><span>LFBD</span>' +
      ARROW + "<span>LPPT</span></span>", "Flight loaded", "Callsign and route, for 8 s"],
    ["error", "s-err", ERROR_X + '<span class="bp-who">Speech service unavailable</span>', "Error", "BeyondATC error; ✕ dismisses it"],
    ["loadedBoxes", "s-ok is-msg", head(CHECK + '<span class="bp-who">Flight loaded</span>') +
      '<span class="bp-boxes">' + box("Callsign", "Alpine 68ML") + box("From", "LFBD") + box("To", "LPPT") + "</span>",
      "Flight loaded, Boxes", "With the Boxes readback detail"],
    ["prompt", "s-atc is-pulse is-msg", head(LAMP + '<span class="bp-who">Live Traffic Enabled</span>') +
      note("Live traffic is on, but your sim clock doesn't match real-world time. Continue anyway, or choose No to " +
        "disable live traffic for this session."), "BeyondATC question", "Its answers open under the pill"],
    ["longError", "s-err is-msg", head(ERROR_X + '<span class="bp-who">BeyondATC error</span>') +
      note("Ensure you have generated your next planned leg in Simbrief. Your departure and destination are currently " +
        "the same as the previous leg."), "Long error", "Shown in full, for 10 s"],
  ];
  function pill(key, unit) {
    for (var i = 0; i < STATES.length; i++) {
      if (STATES[i][0] === key) {
        var track = STATES[i][5] ? '<div class="bp-track"><i style="width:' + STATES[i][5] + '%"></i></div>' : "";
        return '<div id="batc-pill" class="' + STATES[i][1] + '" style="--u:' + unit + 'px"><div class="bp-bg"></div>' + track +
          '<div class="bp-body">' + STATES[i][2] + "</div></div>";
      }
    }
    return "";
  }
  return { STATES: STATES, pill: pill };
})();
