// BATC comms pill: shows BeyondATC's comms state in a screen corner during flight.
// Reads BeyondATC's toolbar socket (the same one its in-sim panel uses); never sends anything.
(function () {
  "use strict";

  // Defaults. Click the pill in flight to change the user settings (saved in the sim's localStorage);
  // edit here for the rest, then `python tools/build.py build` and restart (or `inspect_ui.py --push`).
  var CONFIG = {
    corner: "top-right", // "top-right" | "top-left" | "bottom-right" | "bottom-left"
    x: 24,               // distance from the corner's side edge, in 1080p pixels (scales with resolution)
    y: 86,               // distance from the corner's top/bottom edge, in 1080p pixels
    scale: 1,            // overall size
    lingerMs: 3000,      // label stays after an exchange ends, then shrinks to the dot
    tuneMs: 3000,        // how long a radio change is shown
    errorMs: 5000,
    missedMs: 5000,
    atisMs: 6000,        // how long a new ATIS letter is shown
    demoMs: 4000,        // settings card: how long the sample shows the last change before going back      // "No readback" stays this long when BeyondATC stops waiting without your reply
    showReadback: true,  // while BeyondATC waits for your readback, hint what it is ("Taxi 30R")
    readbackDetail: "hint", // with a readback pending: "none" (status only), "short" (the boxes' values:
                            // "30R · T1"), "hint" ("Taxi via T1"), "boxes" (the toolbar's clearance boxes)
    showTuning: true,    // show the new station when COM1/COM2 changes
    showContact: true,   // Auto Tune off: after "contact <station> <freq>", remind you until COM1 is on it
    showAtis: true,      // show a new ATIS letter
    warnMuted: true,     // ATC calling you while COM1 is muted: red-orange instead of amber
    showPtt: false,      // show "Transmitting" while your PTT button is held. Needs that button also bound to
                         // the sim's Communications > TOGGLE SPEAKER (BeyondATC's own PTT stays as it is)
    pttEvent: "TOGGLE_SPEAKER", // the sim event that binding sends
    pttBlock: false,     // also stop the sim acting on it
    hideOffline: false,  // true: no pill at all while BeyondATC isn't running
    showTraffic: true,   // show a neutral "Traffic" pill while AI traffic talks
    facility: "short",   // "short": "Ground", "full": "Montpellier Ground"
    url: "ws://127.0.0.1:41716",
    reconnectMs: 5000,
    host: 'ui-resource-element[name="MasterPage_InGame"]', // only mounted in flight
  };
  var FADE_MS = 140;

  // What the settings card changes. Saved in localStorage, which every sim UI view shares.
  var USER_KEYS = ["corner", "x", "y", "scale", "showTuning", "showContact", "showAtis", "showReadback", "readbackDetail",
    "warnMuted", "showPtt", "hideOffline",
    "showTraffic", "facility"];
  var STORE_KEY = "batcpill.settings";
  var DEFAULTS = {};
  USER_KEYS.forEach(function (k) { DEFAULTS[k] = CONFIG[k]; });

  function loadSettings() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { /* ignore */ }
    if (!saved) return;
    USER_KEYS.forEach(function (k) { if (k in saved) CONFIG[k] = saved[k]; });
  }

  function saveSettings() {
    var out = {};
    USER_KEYS.forEach(function (k) { if (CONFIG[k] !== DEFAULTS[k]) out[k] = CONFIG[k]; });
    try { localStorage.setItem(STORE_KEY, JSON.stringify(out)); } catch (e) { /* ignore */ }
  }

  loadSettings();

  if (window.batcPill) window.batcPill.destroy();

  var state = {
    inFlight: false,
    stage: "",           // LoadState.stage: "menu", "loading", "ready", ...
    connected: false,
    mode: "ready",
    text: "",
    speaker: null,       // "atc" | "player" | "traffic", from the line sent just before `speaking`
    facility: { name: "", freq: "" },
    muted: false,
    error: "",
    errorUntil: 0,
    lingerUntil: 0,
    tune: null,          // { label, facility } shown until tuneUntil after a radio change
    tuneUntil: 0,
    com2: null,          // last Com2 label|frequency, to detect changes
    atcText: "",         // last ATC: line
    replies: [],         // the toolbar's replies while ATC waits for you ("Readback IFR Clearance", "Runway 12L")
    repliesKey: "",
    menuFresh: false,    // the toolbar re-sent its menu since the last transmission (it always does)
    readback: null,      // { text, facility, calls }: the instruction it replies to, and how often ATC said it
    answered: false,     // you spoke since ATC last did (the toolbar keeps the reply until ATC confirms)
    replied: false,      // you spoke at all since the reply was asked for
    missed: null,        // { label, detail } after BeyondATC stopped waiting without a reply, until missedUntil
    missedUntil: 0,
    infoBoxes: [],       // the toolbar's clearance boxes: [{ title: "SID", info: "KELA8L" }, ...]
    seenFacility: false, // the first Facility after connecting is the snapshot, not a change
    editing: false,      // settings card open: the pill shows a sample so size/position are visible
    ptt: false,          // PTT held (its key event keeps repeating)
    pttRepeating: false,
    demo: "",            // the setting changed last in the card; the sample shows its effect
    autoTune: true,      // BeyondATC tunes the radios itself ("AutoTune: true")
    contact: null,       // { name, freq } ATC told you to contact, until COM1 is on it (Auto Tune off)
    atis: "",            // new ATIS letter, shown until atisUntil
    atisUntil: 0,
    atisLetter: "",      // last "ATIS Current" box seen
    seenInfo: false,     // the first InfoBoxes after connecting is the snapshot, not a change
  };
  var socket = null;
  var timers = { reconnect: 0, linger: 0, error: 0, tune: 0, missed: 0, atis: 0, demo: 0, ptt: 0, swap: 0, poll: 0 };
  var destroyed = false;
  var current = null;    // last rendered view signature

  // ---- DOM -------------------------------------------------------------

  var style;
  if (window.batcPillInlineCss) {
    style = document.createElement("style");
    style.textContent = window.batcPillInlineCss;
  } else {
    style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = "/paul-batc-pill/pill.css";
    // sizes are measured from computed styles: nothing renders until the sheet applies (see poll),
    // since Coherent doesn't reliably fire onload for <link>
  }
  style.setAttribute("data-batc-pill", "");
  document.head.appendChild(style);

  var root = document.createElement("div");
  root.id = "batc-pill";
  root.className = "is-hidden";
  var body = document.createElement("div");
  body.className = "bp-body";
  var bg = document.createElement("div");
  bg.className = "bp-bg";
  root.appendChild(bg);
  root.appendChild(body);
  document.body.appendChild(root);

  // Clicks only reach elements that carry data-input-group; the sim takes all others (see openCard).
  var card = document.createElement("div");
  card.id = "batc-pill-cfg";
  card.className = "is-closed";
  card.innerHTML =
    '<div class="bc-head"><span>BATC Comms Pill</span><span class="bc-btn bc-x" data-act="close">✕</span></div>' +
    '<div class="bc-row"><span class="bc-label">Corner</span><span class="bc-corners">' +
      ["top-left", "top-right", "bottom-left", "bottom-right"].map(function (c) {
        return '<span class="bc-btn bc-corner" data-corner="' + c + '"><i></i></span>';
      }).join("") + "</span></div>" +
    stepRow("Side offset", "x") + stepRow("Edge offset", "y") + stepRow("Size", "scale") +
    toggleRow("Radio changes", "showTuning") + toggleRow("Contact reminders", "showContact") +
    toggleRow("ATIS changes", "showAtis") +
    toggleRow("Readback hints", "showReadback") +
    choiceRow("readbackDetail", [["none", "None"], ["short", "Short"], ["hint", "Hint"],
      ["boxes", "Boxes"]]) +
    toggleRow("Muted ATC calls", "warnMuted") + toggleRow("PTT (bind Toggle Speaker)", "showPtt") +
    toggleRow("AI traffic", "showTraffic") +
    toggleRow("Full station names", "fullNames") + toggleRow("Hide when BATC is off", "hideOffline") +
    '<div class="bc-foot"><span class="bc-btn bc-reset" data-act="reset">Reset</span></div>';
  document.body.appendChild(card);
  var cardEls = card.querySelectorAll("*");

  function stepRow(label, key) {
    return '<div class="bc-row"><span class="bc-label">' + label + '</span><span class="bc-step">' +
      '<span class="bc-btn" data-act="' + key + '-">−</span><span class="bc-val" data-val="' + key + '"></span>' +
      '<span class="bc-btn" data-act="' + key + '+">+</span></span></div>';
  }

  // a sub-setting of the row above it: its choices fill the row, no label
  function choiceRow(key, options) {
    return '<div class="bc-row bc-choice" data-for="' + key + '"><span class="bc-seg">' + options.map(function (o) {
        return '<span class="bc-btn" data-choice="' + key + ":" + o[0] + '">' + o[1] + "</span>";
      }).join("") + "</span></div>";
  }

  function toggleRow(label, key) {
    return '<div class="bc-row bc-btn bc-toggle" data-toggle="' + key + '"><span class="bc-label">' + label +
      '</span><span class="bc-sw"><i></i></span></div>';
  }

  var cardShift = 0;

  function place() {
    var c = String(CONFIG.corner).split("-");
    var v = c[0] === "bottom" ? "bottom" : "top";
    var h = c[1] === "left" ? "left" : "right";
    var st = root.style;
    st.top = st.bottom = st.left = st.right = "";
    // offsets stay in 1080p pixels whatever the scale (var(--u) on the pill is scaled)
    st[v] = "calc(" + Number(CONFIG.y) + " * 0.0926vh)";
    st[h] = "calc(" + Number(CONFIG.x) + " * 0.0926vh)";
    st.setProperty("--u", (0.0926 * Number(CONFIG.scale || 1)) + "vh");
    root.setAttribute("data-side", h);

    // the card opens beside the pill, away from the screen edge (card units stay at scale 1)
    var cs = card.style;
    cs.top = cs.bottom = cs.left = cs.right = "";
    // cardShift: how much taller than usual the pill is (the clearance boxes sample)
    cs[v] = "calc(" + (Number(CONFIG.y) + 26 * Number(CONFIG.scale || 1) + 10) + " * 0.0926vh + " + cardShift + "px)";
    cs[h] = "calc(" + Number(CONFIG.x) + " * 0.0926vh)";
    card.setAttribute("data-side", h);
    card.setAttribute("data-edge", v);
  }
  place();

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

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

  function facilityHtml(whoClass, f, empty) {
    f = f || state.facility;
    if (!f.name) return '<span class="' + whoClass + '">' + (empty || "ATC") + "</span>";
    var name = f.name;
    if (CONFIG.facility === "short") {
      var words = name.split(" ");
      name = words[words.length - 1];
    }
    var html = '<span class="' + whoClass + '">' + esc(name) + "</span>";
    if (f.freq) html += '<span class="bp-freq">' + esc(f.freq) + "</span>";
    return html;
  }

  // ---- state -> view ---------------------------------------------------

  function readbackView() {
    var rb = state.readback;
    if (!CONFIG.showReadback || !rb || state.answered || !state.menuFresh) return null;
    // what ATC waits for: "Readback IFR Clearance" -> "Awaiting readback" + "IFR Clearance";
    // "Acknowledge Instruction" -> "Awaiting response"; a question -> its answers ("Runway 12L / Runway 12R")
    var w = waitingFor();
    var detail = readbackHint(rb.text) || w.choices.slice(0, 3).join(" / ") || w.kind;
    // a question's answers beat the clearance boxes
    return readbackLook(w.readback, rb.calls, detail, w.choices.length ? [] : state.infoBoxes);
  }

  function readbackLook(readback, calls, detail, boxes) {
    var label = readback ? "Awaiting readback" : "Awaiting response";
    // ATC called again for it: louder color, faster pulse, "Awaiting readback ×2"
    var cls = calls > 1 ? "s-insist is-pulse" : "s-atc is-pulse";
    if (calls > 1) label += " ×" + calls;
    detail = detailFor(detail, boxes);
    if (CONFIG.readbackDetail === "boxes" && boxes.length) {
      // "Awaiting readback" over the boxes, as in the toolbar; their titles say what it's about
      return { cls: cls + " is-msg", html: LAMP + '<span class="bp-who">' + label + "</span>",
        extra: '<span class="bp-boxes">' + boxes.map(function (b) {
          return '<span class="bp-box"><span class="bp-box-t">' + esc(b.title) + '</span><span class="bp-box-v">' +
            esc(b.info) + "</span></span>";
        }).join("") + "</span>" };
    }
    return { cls: cls, html: LAMP + '<span class="bp-who">' + label + "</span>" +
      (detail ? '<span class="bp-sep">·</span><span>' + esc(detail) + "</span>" : "") };
  }

  // the one-line detail for the chosen mode: the hint, or just the boxes' values ("30R · T1 · T1")
  function detailFor(hint, boxes) {
    if (CONFIG.readbackDetail === "none") return "";
    if (CONFIG.readbackDetail === "short" && boxes.length) {
      return boxes.map(function (b) { return b.info; }).join(" · ");
    }
    return hint;
  }

  // "Readback Taxi Instruction" -> readback, kind "Taxi Instruction"; "Acknowledge Takeoff Clearance" ->
  // kind "Takeoff Clearance" ("Instruction" alone says nothing); "Runway 12L", "Runway 12R" -> choices
  function waitingFor() {
    var w = { readback: false, kind: "", choices: [] };
    state.replies.forEach(function (r) {
      var m = /^(read ?back|acknowledge)\s*(.*)$/i.exec(r);
      if (!m) { w.choices.push(r); return; }
      if (/^read/i.test(m[1])) w.readback = true;
      if (!/^instruction$/i.test(m[2])) w.kind = m[2];
    });
    return w;
  }

  function tuneLook(t) {
    return { cls: "s-tune", html: RADIO + (t.label ? '<span class="bp-sep">' + t.label + "</span>" : "") +
      facilityHtml("bp-who", t.facility, "No station") };
  }

  function pttLook() {
    return { cls: "s-you", html: MIC + '<span class="bp-who">Transmitting</span>' };
  }

  function mutedLook() {
    // ATC calls you but COM1 is muted: you won't hear it. The speaker icon takes the warning color.
    return { cls: "s-insist is-muted", html: BARS + facilityHtml("bp-who") };
  }

  function atisLook(letter) {
    return { cls: "s-atis", html: LAMP + '<span class="bp-who">ATIS</span><span class="bp-sep">·</span><span>' +
      esc(letter) + "</span>" };
  }

  function contactLook(c) {
    return { cls: "s-tune", html: RADIO + '<span class="bp-who">Contact</span>' +
      facilityHtml("", { name: c.name, freq: c.freq }) };
  }

  // Settings card open: a sample of what the setting changed last does (the ATC pill otherwise)
  var DEMO_BOXES = [{ title: "Taxi to Runway", info: "12L" }, { title: "Taxi Via 1", info: "T1" },
    { title: "Hold Short", info: "12L" }];

  function demoView() {
    switch (state.demo) {
      case "showTuning":
        if (CONFIG.showTuning) return tuneLook({ label: "", facility: { name: "Montpellier Tower", freq: "118.700" } });
        break;
      case "showReadback":
      case "readbackDetail":
        if (CONFIG.showReadback) return readbackLook(true, 1, "Taxi via T1 · Hold short 12L", DEMO_BOXES);
        break;
      case "showAtis":
        if (CONFIG.showAtis) return atisLook("Z");
        break;
      case "showPtt":
        if (CONFIG.showPtt) return pttLook();
        break;
      case "warnMuted":
        if (CONFIG.warnMuted) { var mv = mutedLook(); mv.html += MUTE; return mv; }
        break;
      case "showContact":
        if (CONFIG.showContact) return contactLook({ name: "Marseille Approach", freq: "120.100" });
        break;
      case "showTraffic":
        if (CONFIG.showTraffic) return { cls: "", html: BARS + "<span>Traffic</span>" };
        break;
      case "hideOffline":
        if (!CONFIG.hideOffline) return { cls: "is-ghost", html: LAMP + "<span>BATC offline</span>" };
        break;
    }
    return { cls: "s-atc", html: BARS + facilityHtml("bp-who", { name: "Montpellier Ground", freq: "121.955" }) };
  }

  function view() {
    var now = Date.now();
    if (!state.inFlight || state.stage === "menu") return { hidden: true };
    if (state.editing) return withExtra(demoView());
    if (!state.connected) {
      if (CONFIG.hideOffline) return { hidden: true };
      return { cls: "is-ghost", html: LAMP + "<span>BATC offline</span>" };
    }
    if (state.error && now < state.errorUntil) {
      return { cls: "s-err", html: LAMP + '<span class="bp-who">' + esc(state.error) + "</span>" };
    }
    if (state.ptt && CONFIG.showPtt) return pttLook();

    var v;
    switch (state.mode) {
      case "processing":
      case "request":
        v = { cls: "s-proc", html: DOTS + "<span>Processing</span>" };
        break;
      case "queued":
        v = { cls: "s-proc", html: LAMP + "<span>Queued</span>" +
          (state.text ? '<span class="bp-sep">·</span><span>' + esc(state.text) + "</span>" : "") };
        break;
      case "awaiting":
        v = { cls: "s-proc is-pulse", html: LAMP + "<span>Awaiting ATC</span>" };
        break;
      case "speaking":
        // the reply BeyondATC speaks for you (toolbar or Auto Respond); your own voice is pttLook (mic icon)
        if (state.speaker === "player") v = { cls: "s-you", html: BARS + '<span class="bp-who">Transmitting</span>' };
        else if (state.speaker === "traffic") {
          v = CONFIG.showTraffic ? { cls: "", html: BARS + "<span>Traffic</span>" } : readbackView();
        }
        else if (state.speaker === "atc" && state.muted && CONFIG.warnMuted) v = mutedLook();
        else v = { cls: "s-atc", html: BARS + facilityHtml("bp-who") };
        break;
      case "traffic":
        if (/^atis/i.test(state.text)) {
          // COM1 on an ATIS frequency: "ATIS Generating", then "ATIS Transmitting" while it plays
          v = { cls: "s-atis", html: (/generat/i.test(state.text) ? DOTS : BARS) + facilityHtml("bp-who") };
        } else {
          // ATC to other aircraft or all stations ("ATC Generating", then "ATC Transmitting")
          v = CONFIG.showTraffic ? { cls: "", html: BARS + "<span>Traffic</span>" } : readbackView();
        }
        break;
      case "ready":
        if (state.tune && now < state.tuneUntil) {
          v = tuneLook(state.tune);
        } else if ((v = readbackView())) {
          // waiting for your readback
        } else if (state.missed && now < state.missedUntil) {
          var md = detailFor(state.missed.detail, state.missed.boxes);
          v = { cls: "s-insist", html: LAMP + '<span class="bp-who">' + state.missed.label + "</span>" +
            (md ? '<span class="bp-sep">·</span><span>' + esc(md) + "</span>" : "") };
        } else if (state.atis && now < state.atisUntil) {
          v = atisLook(state.atis);
        } else if (state.contact && !state.autoTune && CONFIG.showContact) {
          v = contactLook(state.contact);
        } else if (now < state.lingerUntil) {
          v = { cls: "", html: LAMP + facilityHtml("") };
        }
        break;
      default:
        // modes seen in the app but not yet observed live (waiting, controller, loading, ...)
        v = state.text ? { cls: "", html: LAMP + "<span>" + esc(state.text) + "</span>" } : null;
    }
    if (!v) v = { cls: "is-dot", html: LAMP };
    if (state.muted && v.cls !== "is-dot") v.html += MUTE;
    return withExtra(v);
  }

  function withExtra(v) {
    // a second block (the clearance boxes) goes under a header row
    if (v.extra) v.html = '<span class="bp-head">' + v.html + "</span>" + v.extra;
    return v;
  }

  // ---- render with transitions ----------------------------------------

  function measure() {
    // .bp-body is flex: none, so its width is the content's natural width.
    var border = root.offsetWidth - root.clientWidth;
    return body.offsetWidth + border;
  }

  function measureH() {
    // only the clearance boxes grow; the others keep the CSS height
    if (root.className.indexOf("is-msg") < 0) return "";
    return body.offsetHeight + root.offsetHeight - root.clientHeight + "px";
  }

  function resize() {
    if (destroyed || current === "hidden") return;
    var w = measure() + "px";
    if (root.style.width !== w) root.style.width = w;
    var h = measureH();
    if (root.style.height !== h) root.style.height = h;
    // keep the settings card clear of a taller pill
    var shift = h ? Math.max(0, Math.round(parseFloat(h) - 26 * 0.000926 * window.innerHeight * Number(CONFIG.scale || 1))) : 0;
    if (shift !== cardShift) { cardShift = shift; place(); }
  }

  function cssReady() {
    return window.getComputedStyle(root).position === "absolute";
  }

  function render() {
    if (destroyed || !cssReady()) return;
    var v = view();
    var sig = v.hidden ? "hidden" : v.cls + "|" + v.html;
    if (sig === current) return;
    var wasHidden = current === null || current === "hidden";
    current = sig;

    clearTimeout(timers.swap);
    if (v.hidden) {
      root.className += root.className.indexOf("is-hidden") < 0 ? " is-hidden" : "";
      root.removeAttribute("data-input-group");
      if (state.editing) openCard(false);
      return;
    }
    root.setAttribute("data-input-group", "BATC-PILL");

    function apply() {
      root.className = v.cls;
      body.innerHTML = v.html;
      root.style.width = measure() + "px";
      root.style.height = measureH();
      // next frame, so the fade-in starts from the faded-out state
      requestAnimationFrame(function () { body.className = "bp-body"; resize(); });
    }

    if (wasHidden) {
      // appear in place: size it while invisible, then fade/slide in
      body.className = "bp-body";
      root.className = v.cls + " is-hidden";
      body.innerHTML = v.html;
      root.style.width = measure() + "px";
      root.style.height = measureH();
      requestAnimationFrame(function () { root.className = v.cls; resize(); });
      return;
    }
    body.className = "bp-body is-out";
    timers.swap = setTimeout(apply, FADE_MS);
  }

  // ---- socket ----------------------------------------------------------

  function parseJson(s) {
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  function stationName(s) {
    // "Montpellier Ground (30R, 30L)" -> "Montpellier Ground";
    // "Montpellier Mediterranee Automated Terminal Information Service" -> "Montpellier Mediterranee ATIS"
    return String(s || "").replace(/\s*\(.*?\)/g, "").replace(/automated terminal information service/i, "ATIS").trim();
  }

  // Short hints from the instruction's text: [pattern, hint]. Only the label depends on wording; whether
  // a readback is pending comes from the toolbar's Actions. $1/$2 are the pattern's groups. Each match
  // uses up its words, so "climb and maintain FL120" is one hint; the first two hints are shown.
  var RWY = "runway\\s+(\\d{1,2}\\s?[LRC]?)\\b";
  var LEVEL = "(flight level\\s*\\d{2,3}|FL\\s?\\d{2,3}|\\d{1,3},?\\d{3}\\s*(?:feet|ft))";
  var READBACKS = [
    [RWY + "[^.]*?cleared (?:to land|for (?:the )?(?:option|touch and go))", "Land $1"],
    ["cleared (?:to land|for (?:the )?(?:option|touch and go))[^.]*?" + RWY, "Land $1"],
    ["cleared (?:to land|for (?:the )?(?:option|touch and go))", "Land"],
    [RWY + "[^.]*?cleared (?:for )?take ?off", "Takeoff $1"],
    ["cleared (?:for )?take ?off[^.]*?" + RWY, "Takeoff $1"],
    ["cleared (?:for )?take ?off", "Takeoff"],
    ["line up[^.]*?" + RWY, "Line up $1"],
    ["cleared[^.]*?approach[^.]*?" + RWY, "Approach $1"],
    ["cleared to (?!land)\\w[^.]*?(?:via|squawk|departure|climb|route)", "IFR clearance"],
    ["push(?:back)?(?: and start(?:up)?)? approved", "Pushback"],
    ["face\\s+(north|south|east|west)\\b", "Face $1"],
    ["taxi(?:(?!hold (?:short|position))[^.])*?" + RWY, "Taxi $1"],
    ["taxi\\s+via\\s+([A-Z]{1,2}\\d{0,2})\\b", "Taxi via $1"],
    ["taxi", "Taxi"],
    ["hold short[^.]*?" + RWY, "Hold short $1"],
    ["hold (?:short|position)", "Hold"],
    ["cross[^.]*?" + RWY, "Cross $1"],
    ["backtrack[^.]*?" + RWY, "Backtrack $1"],
    ["(climb|descend)[^.]*?" + LEVEL, "$1 $2"],
    ["maintain[^.]*?" + LEVEL, "Maintain $1"],
    ["heading\\s+(\\d{3})", "Heading $1"],
    ["(?:speed|reduce|increase)[^.]*?(\\d{3})\\s*knots", "Speed $1"],
    ["squawk\\s+(\\d{4})", "Squawk $1"],
    ["(?:contact|monitor)[^.]*?(1\\d{2}\\.\\d{1,3})", "Contact $1"],
    ["(?:qnh|altimeter)\\s+(\\d{3,4}(?:\\.\\d{2})?)", "QNH $1"],
    ["(?:proceed )?direct(?: to)?\\s+([A-Z]{2,5})\\b", "Direct $1"],
  ].map(function (r) { return [new RegExp("\\b" + r[0], "i"), r[1]]; });

  function readbackHint(text) {
    var hints = [];
    text = String(text);
    for (var i = 0; i < READBACKS.length && hints.length < 2; i++) {
      var m = READBACKS[i][0].exec(text);
      if (!m) continue;
      text = text.slice(0, m.index) + "~" + text.slice(m.index + m[0].length);
      var h = READBACKS[i][1].replace(/\$(\d)/g, function (_, n) {
        return String(m[n] || "").replace(/(flight level|FL)\s*/i, "FL").replace(/(\d),(\d)/, "$1$2")
          .replace(/\s*(feet|ft)$/i, " ft").replace(/\s+/g, " ");
      });
      hints.push(h.charAt(0).toUpperCase() + h.slice(1));
    }
    return hints.join(" · ");
  }

  function clip(t) {
    return t.length > 240 ? t.slice(0, 239) + "…" : t;
  }

  // "Actions: [Readback IFR Clearance¬Say Again¬]": the toolbar's menu. It offers "Say Again" only while
  // ATC waits for you (a readback, an acknowledgement, an answer like "Runway 12L"), and keeps it until
  // ATC confirms or moves on; the request menu ("Request Push and Start¬Wind Check¬...") never has it.
  function onActions(payload) {
    var list = payload.replace(/^\[|\]$/g, "").split("¬").map(function (s) { return s.trim(); });
    var waiting = list.some(function (s) { return /^say again$/i.test(s); });
    var replies = waiting ? list.filter(function (s) { return s && !/^(say again|cancel\b)/i.test(s); }) : [];
    var key = "¬" + replies.join("¬"); // never "", which means not waiting
    if (waiting && key !== state.repliesKey) {
      // the instruction or question is the last ATC line (empty when we connected mid-exchange)
      state.readback = { text: clip(state.atcText), facility: state.facility, calls: 1 };
      state.answered = state.replied = false;
      state.missed = null;
    } else if (!waiting) {
      if (state.readback && !state.replied) {
        // BeyondATC stopped waiting on its own (after ~18 s for taxi or acknowledge replies)
        var w = waitingFor();
        state.missed = { label: w.readback ? "No readback" : "No response",
          detail: readbackHint(state.readback.text) || w.kind, boxes: w.choices.length ? [] : state.infoBoxes };
        state.missedUntil = Date.now() + CONFIG.missedMs;
        clearTimeout(timers.missed);
        timers.missed = setTimeout(render, CONFIG.missedMs + 20);
      }
      state.readback = null;
    }
    state.replies = replies;
    state.repliesKey = waiting ? key : "";
    state.menuFresh = true;
  }

  // "contact Marseille Approach on 120.100" -> { name: "Marseille Approach", freq: "120.100" };
  // "contact Tower when at runway hold point" -> { name: "Tower", freq: "" }
  // A name is words split by single spaces, each Capitalized ("Montpellier") or an acronym ("UNICOM",
  // "ATIS"): one way to read any text, so no runaway backtracking (an earlier "[A-Z][\w-]*\s?" form hung
  // on long runs of capitals).
  var WORD = "(?:[A-Z][a-z]+|[A-Z]{2,6}\\b)";
  var STATION = "((?:" + WORD + " )*" + WORD + ")";
  var CONTACT_FREQ = new RegExp("\\b(?:[Cc]ontact|[Mm]onitor) " + STATION + ",? (?:on )?(1\\d{2}\\.\\d{1,3})\\b");
  var CONTACT_NAME = new RegExp("\\b[Cc]ontact " + STATION);

  function contactIn(text) {
    var m = CONTACT_FREQ.exec(text) || CONTACT_NAME.exec(text);
    return m ? { name: m[1].trim(), freq: m[2] || "" } : null;
  }

  function onContact(c) {
    // COM1 is on it: by frequency, or by station name when ATC gave none
    var f = state.facility;
    if (c.freq) return f.freq && Number(f.freq).toFixed(3) === Number(c.freq).toFixed(3);
    var word = c.name.split(" ").pop().toLowerCase();
    return f.name.toLowerCase().split(" ").indexOf(word) >= 0;
  }

  function tuned(label, facility) {
    // flight loading tunes the radios too (UNICOM, COM2 off): only show changes once loaded
    if (!CONFIG.showTuning || (state.stage && state.stage !== "ready")) return;
    state.tune = { label: label, facility: facility };
    state.tuneUntil = Date.now() + CONFIG.tuneMs;
    clearTimeout(timers.tune);
    timers.tune = setTimeout(render, CONFIG.tuneMs + 20);
  }

  function onMessage(msg) {
    var i = msg.indexOf(":");
    if (i < 0) return;
    var type = msg.slice(0, i);
    var payload = msg.slice(i + 1).trim();

    switch (type) {
      case "CommsState": {
        var cs = parseJson(payload);
        if (!cs) return;
        var mode = cs.mode || "ready";
        // you're talking (a voice reply gives processing then ready, with no Player: line)
        if (mode === "processing" || mode === "request" || mode === "queued") state.answered = state.replied = true;
        if (cs.mode === "ready" && state.mode !== "ready") {
          state.lingerUntil = Date.now() + CONFIG.lingerMs;
          clearTimeout(timers.linger);
          timers.linger = setTimeout(render, CONFIG.lingerMs + 20);
        }
        state.mode = cs.mode || "ready";
        state.text = cs.text || "";
        break;
      }
      case "ATC":
        state.speaker = "atc";
        state.atcText = payload;
        var c = contactIn(payload);
        if (c && !state.autoTune && !onContact(c)) state.contact = c;
        state.menuFresh = false; // ATC may close the exchange: wait for the menu sent after it
        state.missed = null;
        if (state.readback) {
          // ATC calls you again before you replied: "Airfrans 1234, Montpellier Tower?" or the clearance
          // again (the toolbar's "Say Again" would have sent a Player: line first)
          if (!state.answered) state.readback.calls++;
          if (readbackHint(payload)) state.readback.text = clip(payload);
          state.answered = false;
        }
        return;
      case "ATCTraffic":
        state.speaker = "atcTraffic"; // ATC talking to another aircraft: your pending readback stays
        return;
      case "Player":
        state.speaker = "player"; // your readback (or "say again") is starting
        state.answered = state.replied = true;
        state.missed = null;
        state.menuFresh = false;
        return;
      case "Traffic":
        state.speaker = "traffic";
        return;
      case "Facility": {
        // "Montpellier Ground (30R, 30L)|121.955", or "Nothing Tuned" without a frequency
        var parts = payload.split("|");
        var freq = (parts[1] || "").trim();
        var prev = state.facility;
        state.facility = freq ? { name: stationName(parts[0]), freq: freq } : { name: "", freq: "" };
        if (state.seenFacility && (prev.name !== state.facility.name || prev.freq !== state.facility.freq)) {
          tuned("", state.facility);
        }
        if (state.contact && onContact(state.contact)) state.contact = null;
        state.seenFacility = true;
        break;
      }
      case "Com2": {
        // {"label":"Marseille Approach","frequency":"120.100","monitor":true}, {"label":"Radio Off",...}, or empty
        var c2 = parseJson(payload) || {};
        if (/^\(/.test(c2.label || "")) break; // "(Generating LFMT ATIS)": wait for the final label
        var key = (c2.label || "") + "|" + (c2.frequency || "");
        if (state.com2 !== null && key !== state.com2) {
          tuned("COM2", c2.frequency ? { name: stationName(c2.label), freq: c2.frequency } : { name: "", freq: "" });
        }
        state.com2 = key;
        break;
      }
      case "LoadState": {
        var ls = parseJson(payload);
        if (ls) state.stage = ls.stage || "";
        break;
      }
      case "RadioMute": {
        var rm = parseJson(payload);
        if (rm) state.muted = !!rm.com1;
        break;
      }
      case "InfoBoxes": {
        // [{"title":"Taxi to Runway","info":"12L"},{"title":"SID","info":"KELA8L"},...]
        var ib = parseJson(payload);
        state.infoBoxes = (ib && ib.length ? ib : []).map(function (b) {
          return { title: String(b.title || ""), info: String(b.info || "").replace(/<br\s*\/?>/gi, " ") };
        });
        // {"title":"ATIS Current","info":"Z"} appears or changes after "information Z now current"
        state.infoBoxes.forEach(function (b) {
          if (!/^atis/i.test(b.title) || !b.info || b.info === state.atisLetter) return;
          if (state.seenInfo && CONFIG.showAtis) {
            state.atis = b.info;
            state.atisUntil = Date.now() + CONFIG.atisMs;
            clearTimeout(timers.atis);
            timers.atis = setTimeout(render, CONFIG.atisMs + 20);
          }
          state.atisLetter = b.info;
        });
        state.seenInfo = true;
        break;
      }
      case "AutoTune":
        state.autoTune = payload !== "false";
        if (state.autoTune) state.contact = null;
        break;
      case "Actions":
        onActions(payload);
        break;
      case "AppError": {
        // {"text":"No traffic liveries found, ...\nYou must ...","fatal":false,"kicked":false}, or plain text
        var ae = parseJson(payload);
        var et = String(ae && typeof ae === "object" ? ae.text || "" : payload).split("\n")[0].trim();
        if (!et) return;
        state.error = et.length > 48 ? et.slice(0, 47) + "…" : et;
        state.errorUntil = Date.now() + CONFIG.errorMs;
        clearTimeout(timers.error);
        timers.error = setTimeout(render, CONFIG.errorMs + 20);
        break;
      }
      default:
        return;
    }
    render();
  }

  function connect() {
    if (destroyed) return;
    try {
      socket = new WebSocket(CONFIG.url);
    } catch (e) {
      timers.reconnect = setTimeout(connect, CONFIG.reconnectMs);
      return;
    }
    socket.onopen = function () {
      state.connected = true;
      state.seenFacility = false;
      state.seenInfo = false;
      state.contact = null;
      state.com2 = null;
      render();
    };
    socket.onmessage = function (ev) {
      if (typeof ev.data === "string") onMessage(ev.data);
    };
    socket.onclose = function () {
      socket = null;
      state.connected = false;
      state.mode = "ready";
      state.speaker = null;
      state.stage = "";
      state.replies = [];
      state.repliesKey = "";
      state.infoBoxes = [];
      state.readback = null;
      render();
      if (!destroyed) timers.reconnect = setTimeout(connect, CONFIG.reconnectMs);
    };
    socket.onerror = function () { /* onclose follows */ };
  }

  // ---- settings card ---------------------------------------------------

  var STEPS = { x: [8, 0, 1600], y: [8, 0, 1000], scale: [0.1, 0.6, 2.5] };

  function updateCard() {
    var vals = card.querySelectorAll("[data-val]");
    for (var i = 0; i < vals.length; i++) {
      var k = vals[i].getAttribute("data-val");
      vals[i].textContent = k === "scale" ? Math.round(CONFIG.scale * 100) + "%" : String(CONFIG[k]);
    }
    var corners = card.querySelectorAll("[data-corner]");
    for (i = 0; i < corners.length; i++) {
      corners[i].className = "bc-btn bc-corner" + (corners[i].getAttribute("data-corner") === CONFIG.corner ? " is-on" : "");
    }
    var toggles = card.querySelectorAll("[data-toggle]");
    for (i = 0; i < toggles.length; i++) {
      var t = toggles[i].getAttribute("data-toggle");
      var on = t === "fullNames" ? CONFIG.facility === "full" : !!CONFIG[t];
      toggles[i].className = "bc-row bc-btn bc-toggle" + (on ? " is-on" : "");
    }
    var choices = card.querySelectorAll("[data-choice]");
    for (i = 0; i < choices.length; i++) {
      var c = choices[i].getAttribute("data-choice").split(":");
      choices[i].className = "bc-btn" + (String(CONFIG[c[0]]) === c[1] ? " is-on" : "");
    }
    // the detail only matters with readback hints on
    var detailRow = card.querySelector('[data-for="readbackDetail"]');
    detailRow.className = "bc-row bc-choice" + (CONFIG.showReadback ? "" : " is-off");
  }

  function openCard(open) {
    state.editing = open;
    card.className = open ? "" : "is-closed";
    // the sim checks data-input-group on the exact element under the cursor, so tag every element
    var els = [card].concat([].slice.call(cardEls));
    for (var i = 0; i < els.length; i++) {
      if (open) els[i].setAttribute("data-input-group", "BATC-PILL");
      else els[i].removeAttribute("data-input-group");
    }
    if (open) updateCard();
    state.demo = "";
    render();
  }

  root.addEventListener("click", function () { openCard(!state.editing); });

  card.addEventListener("click", function (e) {
    var el = e.target;
    while (el && el !== card && !el.hasAttribute("data-act") && !el.hasAttribute("data-corner") &&
           !el.hasAttribute("data-toggle") && !el.hasAttribute("data-choice")) el = el.parentNode;
    if (!el || el === card) return;

    var act = el.getAttribute("data-act");
    var patch = {};
    if (el.hasAttribute("data-corner")) {
      patch.corner = el.getAttribute("data-corner");
    } else if (el.hasAttribute("data-choice")) {
      var ch = el.getAttribute("data-choice").split(":");
      patch[ch[0]] = ch[1];
    } else if (el.hasAttribute("data-toggle")) {
      var t = el.getAttribute("data-toggle");
      if (t === "fullNames") patch.facility = CONFIG.facility === "full" ? "short" : "full";
      else patch[t] = !CONFIG[t];
    } else if (act === "close") {
      openCard(false);
      return;
    } else if (act === "reset") {
      patch = DEFAULTS;
    } else if (act) {
      var k = act.slice(0, -1);
      var st = STEPS[k];
      var n = Number(CONFIG[k]) + (act.slice(-1) === "+" ? st[0] : -st[0]);
      patch[k] = Math.round(Math.min(st[2], Math.max(st[1], n)) * 100) / 100;
    }
    // the sample pill shows what the change does ("facility" covers Full station names) for demoMs
    state.demo = act === "reset" ? "" : Object.keys(patch)[0] || "";
    clearTimeout(timers.demo);
    timers.demo = setTimeout(function () { state.demo = ""; render(); }, CONFIG.demoMs);
    set(patch);
  });

  // ---- flight detection -----------------------------------------------

  function poll() {
    var inFlight = !!document.querySelector(CONFIG.host);
    state.inFlight = inFlight;
    // also catches the first render once the stylesheet applies, and re-measures in case a
    // measurement ran before layout settled
    render();
    resize();
  }

  // ---- PTT ----------------------------------------------------------------
  // The sim reports key events to any view that asks (the way its own instruments do). A binding sends its
  // event once on press, then again every ~33 ms after ~0.4 s while held, and nothing on release; so PTT is
  // "held" until the repeats stop. mainUi has no Coherent/SimVar, but its `engine` handles the listener.

  var PTT_FIRST_MS = 450, PTT_REPEAT_MS = 120;
  var keyHandler = null;

  function onKeyEvent(name) {
    if (name !== CONFIG.pttEvent || !CONFIG.showPtt) return;
    var held = state.ptt;
    state.pttRepeating = held;
    state.ptt = true;
    clearTimeout(timers.ptt);
    timers.ptt = setTimeout(function () { state.ptt = state.pttRepeating = false; render(); },
      state.pttRepeating ? PTT_REPEAT_MS : PTT_FIRST_MS);
    if (!held) render();
  }

  function listenPtt() {
    var eng = window.engine;
    if (!CONFIG.showPtt || !eng || typeof eng.on !== "function") return;
    // speech-recognition actions (Quick Reply is SR_COM_QUICK_REPLY) froze the sim when intercepted: never
    if (/^SR_/i.test(CONFIG.pttEvent)) return;
    // once per view and event: hot reloads (inspect_ui.py --push) keep the view, and its intercepts
    var reg = window.batcPillKeys = window.batcPillKeys || { attached: false, intercepted: {} };
    if (!reg.attached) {
      eng.trigger("ADD_VIEW_LISTENER", "JS_LISTENER_KEYEVENT", "/Global/mainUI.html");
      reg.attached = true;
    }
    if (!keyHandler) {
      keyHandler = function (name) { onKeyEvent(name); };
      eng.on("keyIntercepted", keyHandler);
    }
    var id = CONFIG.pttEvent + (CONFIG.pttBlock ? ":block" : "");
    if (!reg.intercepted[id]) {
      eng.call("INTERCEPT_KEY_EVENT", CONFIG.pttEvent, CONFIG.pttBlock ? 1 : 0);
      reg.intercepted[id] = true;
    }
  }

  // ---- lifecycle -------------------------------------------------------

  function destroy() {
    destroyed = true;
    for (var k in timers) { clearTimeout(timers[k]); clearInterval(timers[k]); }
    if (socket) { socket.onclose = null; socket.close(); socket = null; }
    if (keyHandler && window.engine && typeof window.engine.off === "function") window.engine.off("keyIntercepted", keyHandler);
    if (root.parentNode) root.parentNode.removeChild(root);
    if (card.parentNode) card.parentNode.removeChild(card);
    if (style.parentNode) style.parentNode.removeChild(style);
    if (window.batcPill && window.batcPill.destroy === destroy) delete window.batcPill;
  }

  // Same as the settings card, e.g. batcPill.set({ corner: "top-left", x: 40, y: 120 }). Saved.
  function set(patch) {
    var moved = "corner" in patch;
    for (var k in patch) CONFIG[k] = patch[k];
    saveSettings();
    listenPtt(); // turning PTT on starts listening (off just ignores the events)
    place();
    updateCard();
    if (moved) current = null; // re-enter from the new side
    render();
    resize(); // same content at a new scale keeps its old pixel width otherwise
    return CONFIG;
  }

  window.batcPill = {
    destroy: destroy,
    set: set,
    state: state,
    config: CONFIG,
    feed: onMessage, // test hook: batcPill.feed('CommsState: {"mode":"awaiting","text":""}')
  };

  poll();
  timers.poll = setInterval(poll, 1000);
  connect();
  try { listenPtt(); } catch (e) { /* no key events in this view: no PTT */ }
})();
