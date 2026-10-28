// BATC Overlay: shows BeyondATC's comms state in a screen corner during flight, with ATC's messages, their
// answers, the requests and a Frequencies / Log panel around it.
// Reads BeyondATC's toolbar socket (the same one its in-sim panel uses). It only sends, on a click, what the
// toolbar itself sends: "set_autotune: <bool>", "set_autorespond: <bool>", "set_action: <label>",
// "set_frequency: <freq>" and "frequencies"; and, from BeyondATC's own command set, "set_frequency_com2: <freq>",
// "start_flight: IFR", "turnaround", "prompt_reply: <id>:yes|no" and "ack_error".
(function () {
  "use strict";

  // Defaults. Click the pill in flight to change the user settings (saved in the sim's DataStorage);
  // edit here for the rest, then `python tools/build.py build` and restart (or `inspect_ui.py --push`).
  var CONFIG = {
    corner: "top-right", // "top-right" | "top-left" | "bottom-right" | "bottom-left"
    x: 24,               // distance from the corner's side edge, in 1080p pixels (scales with resolution)
    y: 86,               // distance from the corner's top/bottom edge, in 1080p pixels
    scale: 1,            // overall size
    lingerMs: 3000,      // label stays after an exchange ends, then shrinks to the dot
    tuneMs: 3000,        // how long a radio change is shown
    errorMs: 5000,       // how long a BeyondATC error is shown (unless it stops BeyondATC: then until dismissed)
    errorLongMs: 10000,  // the same, for one too long for a line (shown in full)
    missedMs: 5000,      // "No readback" stays this long when BeyondATC stops waiting without your reply
    atisMs: 6000,        // how long a new ATIS letter is shown
    loadedMs: 8000,      // how long the callsign and route show once BeyondATC has loaded the flight
    checkInMs: 10000,    // on a new station, "Check in" shows once you haven't announced yourself for this long,
    checkInWarnMs: 60000, // and turns into the "Not checked in" warning after this long
    demoMs: 4000,        // settings card: how long the sample shows the last change before going back
    showReadback: true,  // while BeyondATC waits for your readback, hint what it is ("Taxi 30R")
    readbackDetail: "hint", // with a readback pending: "none" (status only), "short" (the boxes' values:
                            // "30R · T1"), "hint" ("Taxi via T1"), "boxes" (the toolbar's clearance boxes)
    keepLast: false,     // after ATC took your reply, keep its hint on the pill (quiet) until the next instruction,
                         // a new station on COM1, or its ✕ (hover) instead of shrinking to the dot
    showTuning: true,    // show the new station when COM1/COM2 changes
    showContact: true,   // Auto Tune off: after "contact <station> <freq>", remind you until COM1 is on it; and
                         // "Check in" while the new station waits for your "Announce On Frequency"
    showAtis: true,      // show a new ATIS letter
    warnMuted: true,     // ATC calling you while COM1 is muted: red-orange instead of amber
    showPtt: false,      // show "Transmitting" while your PTT button is held. Needs that button also bound to
                         // the sim's Communications > TOGGLE SPEAKER (BeyondATC's own PTT stays as it is)
    pttEvent: "TOGGLE_SPEAKER", // the sim event that binding sends
    pttBlock: false,     // also stop the sim acting on it
    pttDelayMs: 250,     // PTT held this long before "Transmitting" shows. Under ~450 ms a click still shows briefly:
                         // the sim's first repeat comes at ~0.4 s, so a click looks held until then
    hideOffline: false,  // true: no pill at all while BeyondATC isn't running or has no flight
    devLog: false,       // stream what the pill gets, shows and does to tools/pill_log.py when it runs. tools/build.py
                         // turns it on in your own builds (build, install, inspect_ui.py --push), off in releases
    devLogUrl: "ws://127.0.0.1:41799",
    showTraffic: true,   // show a neutral "Traffic" pill while AI traffic talks (and its lines in the messages and Log)
    captions: "all",     // ATC's lines as messages under the pill: "off", "mine" (your exchanges), "all" (and AI traffic)
    exchangeMs: 5000,    // an exchange's messages leave together this long after it closes
    facility: "short",   // "short": "Ground", "full": "Montpellier Ground"
    url: "ws://127.0.0.1:41716",
    reconnectMs: 5000,
    host: 'ui-resource-element[name="MasterPage_InGame"]', // only mounted in flight
  };
  var FADE_MS = 140;
  var CONFIRM_MS = 1500;  // "Readback OK" shows this long after ATC took your reply

  // What the settings card changes. Saved in the sim's DataStorage (kept across sim restarts; localStorage
  // isn't) and in localStorage, which covers the seconds before DataStorage answers.
  var USER_KEYS = ["corner", "x", "y", "scale", "showTuning", "showContact", "showAtis", "showReadback", "readbackDetail", "keepLast",
    "warnMuted", "showPtt", "hideOffline",
    "showTraffic", "facility", "captions"];
  var STORE_KEY = "batcpill.settings";
  var DEFAULTS = {};
  USER_KEYS.forEach(function (k) { DEFAULTS[k] = CONFIG[k]; });

  var settingsChanged = false; // by the user, before DataStorage answered

  function savedPatch(json) {
    var saved = null, patch = {};
    try { saved = JSON.parse(json || "null"); } catch (e) { /* ignore */ }
    if (!saved) return null;
    USER_KEYS.forEach(function (k) { if (k in saved) patch[k] = saved[k]; });
    return patch;
  }

  // window.datastorage appears some time after the view asks for JS_LISTENER_DATASTORAGE (as dataStorage.js does)
  function dataStorage() {
    try { if (window.top && window.top.datastorage) return window.top.datastorage; } catch (e) { /* ignore */ }
    return window.datastorage || null;
  }

  function loadSettings() {
    var patch = null;
    try { patch = savedPatch(localStorage.getItem(STORE_KEY)); } catch (e) { /* ignore */ }
    for (var k in patch) CONFIG[k] = patch[k];
  }

  function saveSettings() {
    var out = {};
    USER_KEYS.forEach(function (k) { if (CONFIG[k] !== DEFAULTS[k]) out[k] = CONFIG[k]; });
    var json = JSON.stringify(out), ds = dataStorage();
    try { localStorage.setItem(STORE_KEY, json); } catch (e) { /* ignore */ }
    try { if (ds) ds.setData(STORE_KEY, json); } catch (e) { /* ignore */ }
  }

  loadSettings();

  if (window.batcPill) window.batcPill.destroy();

  var state = {
    inFlight: false,
    stage: "",           // LoadState.stage: "menu", "loading", "download", "ready", ...
    loadPct: -1,         // LoadState.pct while BeyondATC loads a flight (-1: not given)
    loadedUntil: 0,      // the flight just finished loading: callsign and route show until then
    callsign: "",        // "Callsign: {full,shortForm}": full ("Alpine 68ML")
    prompt: null,        // "Prompt: {id,title,text,yesLabel,noLabel}": BeyondATC's Yes/No question (it waits for it)
    errorFatal: false,   // the error stays until BeyondATC clears it or you dismiss it (its ✕)
    errorFull: "",       // its whole text (state.error is its first line, cut)
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
    atcAnswer: "",       // that line, when it came after you spoke ("unable 15,000 at this time")
    replies: [],         // the toolbar's replies while ATC waits for you ("Readback IFR Clearance", "Runway 12L")
    repliesKey: "",
    menuFresh: false,    // the toolbar re-sent its menu since the last transmission (it always does)
    readback: null,      // { text, facility, calls }: the instruction it replies to, and how often ATC said it
    answered: false,     // you spoke since ATC last did (the toolbar keeps the reply until ATC confirms)
    replied: false,      // you spoke at all since the reply was asked for
    missed: null,        // { label, detail } after BeyondATC stopped waiting without a reply, until missedUntil
    missedUntil: 0,
    confirmed: null,     // { readback, detail, boxes } after ATC took your reply, shown until confirmedUntil
    confirmedUntil: 0,
    kept: null,          // { detail, boxes } of the last reply ATC took, shown with keepLast   // 0 while your reply still plays: the confirmation starts once the radio is quiet
    infoBoxes: [],       // the toolbar's clearance boxes: [{ title: "SID", info: "KELA8L" }, ...]
    seenFacility: false, // the first Facility after connecting is the snapshot, not a change
    editing: false,      // settings card open: the pill shows a sample so size/position are visible
    cardTab: "display",  // settings card tab: "display" | "position"
    ptt: false,          // PTT held (its key event keeps repeating)
    pttShown: false,     // held for pttDelayMs: "Transmitting" shows
    pttRepeating: false,
    demo: "",            // the setting changed last in the card; the sample shows its effect
    autoTune: true,      // BeyondATC tunes the radios itself ("AutoTune: true")
    autoRespond: false,  // BeyondATC replies for you ("AutoRespond: true")
    contact: null,       // { name, freq } ATC told you to contact, until COM1 is on it (Auto Tune off)
    checkInSince: 0,     // when the menu started offering "Announce On Frequency" (0: it doesn't), or you last spoke
    atis: "",            // new ATIS letter, shown until atisUntil
    atisUntil: 0,
    atisLetter: "",      // last "ATIS Current" box seen
    seenInfo: false,     // the first InfoBoxes after connecting is the snapshot, not a change
    caps: [],            // messages under the pill: { id, who: "atc" | "you" | "traffic", label, text, born }
    log: [],             // every line since the sim started, for the panel's Log: { who, label, text, at }
    lastAtcCap: 0,       // id of the last ATC: line (the instruction a reply menu answers)
    closedAt: 0,         // when your exchange last closed: nothing pending, queued, playing or just sent
    menu: [],            // the toolbar's whole Actions list
    requests: [],        // the request menu (Actions while ATC isn't waiting for you)
    sentAt: 0,           // an answer or request was just sent: hide them until BeyondATC reacts
    panel: false,        // comms panel open (click the pill)
    com2Radio: { act: "", stby: "", shown: "" }, // COM2 from the sim's key events (see onCom2Event)
    com2Muted: false,    // COM2 not received (BeyondATC's Com2 monitor false, "Radio Off")
    com2Names: {},       // stations by frequency, from BeyondATC's Com2 labels: names the COM2 tune status
    cardBack: false,     // the settings card was opened from the panel: closing it reopens the panel
    logBase: 0,          // the last Log line already there when the Log opened (later ones slide in)
    boxesFor: null,      // the readback whose clearance boxes the pill showed (kept in every state, see keepBoxes)
    trafficSince: 0,     // when the Log's AI traffic switch was turned on (its lines slide in)
    trafficLeaving: false, // the switch was turned off: AI traffic lines fade out, then go
    logCut: 0,           // while the Log clears (COM1 changed): its last old line; those fade out
    panelTab: "freq",    // "freq" | "log"
    freqs: null,         // the last "Frequencies:": { rows: [{ name, type, freq }] }, or { raw } if it can't be read
    freqBook: {},        // each airport's stations by ICAO (see fileFreqs)
    freqEnroute: [],     // the Center rows of the last reply
    freqSide: "dep",     // the Frequencies tab shown: "dep" | "arr"
    progress: null,      // "Progress: {from,to,pct}": the flight's airports and how far along it is
    logReset: true,      // open the Log at its newest line
    cpdlcAsked: false,   // a CPDLC request is out (CPDLC_Pilot: REQUEST ...) until a CPDLC_ATC: line
  };
  var socket = null;
  var timers = { checkIn: 0, checkInWarn: 0, reconnect: 0, linger: 0, error: 0, loaded: 0, tune: 0, missed: 0, confirm: 0, swHide: 0, atis: 0, demo: 0, ptt: 0, pttShow: 0, swap: 0, poll: 0, log: 0, sent: 0, capHover: 0, logClear: 0, traffic: 0, store: 0 };
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
    style.href = "/paulcharp-batc-overlay/pill.css";
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
  // BeyondATC loading a flight: a progress line along the bottom edge (shown by .has-track, filled by render)
  var track = document.createElement("div");
  track.className = "bp-track";
  var trackFill = document.createElement("i");
  track.appendChild(trackFill);
  root.appendChild(track);
  root.appendChild(body);
  document.body.appendChild(root);

  // Clicks only reach elements that carry data-input-group; the sim takes all others (see openCard).
  var card = document.createElement("div");
  card.id = "batc-pill-cfg";
  card.className = "is-closed";
  card.innerHTML =
    '<div class="bc-head"><span>BATC Overlay</span><span class="bc-btn bc-x" data-act="close">' +
      // drawn, not the ✕ glyph: the sim's font set it off-center
      '<svg viewBox="0 0 10 10"><path d="M2 2l6 6M8 2l-6 6"/></svg></span></div>' +
    '<div class="bc-tabs"><span class="bc-btn bc-tab" data-tab="display">Display</span>' +
      '<span class="bc-btn bc-tab" data-tab="position">Position</span></div>' +
    '<div class="bc-pane" data-pane="display">' +
      toggleRow("Readback hints", "showReadback") +
      choiceRow("readbackDetail", [["none", "None"], ["short", "Short"], ["hint", "Hint"], ["boxes", "Boxes"]]) +
      toggleRow("Keep last clearance", "keepLast") +
      '<div class="bc-row"><span class="bc-label">Messages</span></div>' +
      choiceRow("captions", [["off", "Off"], ["mine", "Mine"], ["all", "All"]]) +
      toggleRow("Radio changes", "showTuning") + toggleRow("Contact reminders", "showContact") +
      toggleRow("ATIS changes", "showAtis") + toggleRow("Warn when COM1 muted", "warnMuted") +
      toggleRow("PTT indicator", "showPtt") +
      '<div class="bc-note">Also bind your PTT button to "Toggle Speaker"</div>' +
      toggleRow("AI traffic", "showTraffic") + toggleRow("Full station names", "fullNames") +
      toggleRow("Hide when BATC is off", "hideOffline") +
    "</div>" +
    '<div class="bc-pane" data-pane="position">' +
      '<div class="bc-row"><span class="bc-label">Corner</span><span class="bc-corners">' +
        ["top-left", "top-right", "bottom-left", "bottom-right"].map(function (c) {
          return '<span class="bc-btn bc-corner" data-corner="' + c + '"><i></i></span>';
        }).join("") + "</span></div>" +
      stepRow("Side offset", "x") + stepRow("Edge offset", "y") + stepRow("Size", "scale") +
    "</div>" +
    '<div class="bc-foot"><span class="bc-btn bc-reset" data-act="reset">Reset</span></div>';
  document.body.appendChild(card);
  var cardEls = card.querySelectorAll("*");

  // Auto Tune / Auto Respond buttons, beside the pill while the mouse is over it (see onMouseMove)
  var switches = document.createElement("div");
  switches.id = "batc-pill-sw";
  switches.className = "is-closed";
  // one icon button each, lit when on, dimmed and struck through when off
  var SLASH = '<path class="bs-slash" d="M2.5 2.5l11 11"/>';
  switches.innerHTML =
    '<span class="bs-btn" data-sw="autorespond"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/>' +
      '<path d="M5.5 7h5"/>' + SLASH + "</svg></span>" +
    '<span class="bs-btn" data-sw="autotune"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/>' +
      '<path d="M5.2 5.2a4 4 0 0 0 0 5.6M10.8 5.2a4 4 0 0 1 0 5.6M3.1 3.1a7 7 0 0 0 0 9.8M12.9 3.1a7 7 0 0 1 0 9.8"/>' +
      SLASH + "</svg></span>";
  document.body.appendChild(switches);
  var switchEls = [switches].concat([].slice.call(switches.querySelectorAll("*")));
  var switchesOpen = false;

  // ATC's messages, the answers/requests column and the comms panel (see "comms" below)
  var msgs = document.createElement("div");
  msgs.id = "batc-pill-msgs";
  document.body.appendChild(msgs);
  var list = document.createElement("div");
  list.id = "batc-pill-list";
  list.className = "is-closed";
  document.body.appendChild(list);
  var panel = document.createElement("div");
  panel.id = "batc-pill-panel";
  panel.className = "is-closed";
  document.body.appendChild(panel);

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
    switches.style.setProperty("--k", (0.0926 * Number(CONFIG.scale || 1)) + "vh"); // the hover buttons scale too
    root.setAttribute("data-side", h);

    // the card opens beside the pill, away from the screen edge (card units stay at scale 1)
    var cs = card.style;
    cs.top = cs.bottom = cs.left = cs.right = "";
    // cardShift: how much taller than usual the pill is (the clearance boxes sample)
    cs[v] = "calc(" + (Number(CONFIG.y) + 26 * Number(CONFIG.scale || 1) + 10) + " * 0.0926vh + " + cardShift + "px)";
    cs[h] = "calc(" + Number(CONFIG.x) + " * 0.0926vh)";
    card.setAttribute("data-side", h);
    card.setAttribute("data-edge", v);
    placeComms(v, h);
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
  var CHECK = '<svg class="bp-ico bp-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-6.5"/></svg>';
  var ARROW = '<svg class="bp-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8h10M9 4.5L12.5 8 9 11.5"/></svg>';
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

  // reply: { cls, lamp, label, who } while you answer it (Transmitting, Processing): same detail and layout
  // as "Awaiting readback", under your own label
  function readbackView(reply) {
    var rb = state.readback;
    if (!CONFIG.showReadback || !rb) return null;
    if (!reply && (state.answered || !state.menuFresh)) return null;
    // what ATC waits for: "Readback IFR Clearance" -> "Awaiting readback" + "IFR Clearance";
    // "Acknowledge Instruction" -> "Awaiting response"; a question -> its answers ("Runway 12L / Runway 12R")
    var w = waitingFor();
    if (rb.negative) {
      // "Negative, QNH 1013.": your readback was wrong; the correction is the hint, whatever the detail mode
      var fix = CONFIG.readbackDetail === "none" ? "" : readbackHint(rb.text) || correction(rb.text);
      return readbackLook(w.readback, 1, fix, [], reply ? { cls: reply.cls, lamp: reply.lamp, label: reply.label,
        who: reply.who, raw: true } : { cls: "s-insist is-pulse", label: "Negative", raw: true });
    }
    var detail = readbackHint(rb.text) || w.choices.slice(0, 3).join(" / ") || w.kind;
    // a question's answers beat the clearance boxes
    return readbackLook(w.readback, reply ? 1 : rb.calls, detail, w.choices.length ? [] : state.infoBoxes, reply);
  }

  // "Transmitting" / "Processing", with the pending readback's hint or boxes when you're answering one
  function replyLook(cls, lamp, label, who) {
    return readbackView({ cls: cls, lamp: lamp, label: label, who: who }) ||
      { cls: cls, html: lamp + '<span class="' + who + '">' + label + "</span>" };
  }

  // "Negative, Nantes Approach on 124.25." -> "Nantes Approach on 124.25"
  function correction(text) {
    var t = String(text).replace(/^negative\b[,.]?\s*/i, "").replace(/[.\s]+$/, "");
    return t.length > 40 ? t.slice(0, 39) + "…" : t;
  }

  // look: { cls, label, lamp, who, raw } overrides (who: the label's class; raw: detail as given, not the
  // detail mode's)
  function readbackLook(readback, calls, detail, boxes, look) {
    look = look || {};
    var label = look.label || (readback ? "Awaiting readback" : "Awaiting response");
    // ATC called again for it: louder color, faster pulse, "Awaiting readback ×2"
    var cls = look.cls || (calls > 1 ? "s-insist is-pulse" : "s-atc is-pulse");
    var lamp = look.lamp || LAMP;
    var who = '<span class="' + (look.who === undefined ? "bp-who" : look.who) + '">';
    if (calls > 1) label += " ×" + calls;
    if (!look.raw) detail = detailFor(detail, boxes);
    if (CONFIG.readbackDetail === "boxes" && boxes.length) {
      // "Awaiting readback" over the boxes, as in the toolbar; their titles say what it's about
      return { cls: cls + " is-msg", html: lamp + who + label + "</span>",
        extra: boxesHtml(boxes) };
    }
    return { cls: cls, html: lamp + who + label + "</span>" +
      (detail ? '<span class="bp-sep">·</span><span>' + esc(detail) + "</span>" : "") };
  }

  function boxesHtml(boxes) {
    return '<span class="bp-boxes">' + boxes.map(function (b) {
      return '<span class="bp-box"><span class="bp-box-t">' + esc(b.title) + '</span><span class="bp-box-v">' +
        esc(b.info) + "</span></span>";
    }).join("") + "</span>";
  }

  // The last reply ATC took, kept quiet in the pill. Its clipboard icon turns into a ✕ on hover (CSS); a click
  // there hides it (the rest of the pill still opens the settings). Returns null when there's nothing to show.
  var KEPT_ICON = '<span class="bp-unpin" data-input-group="BATC-PILL">' +
    '<svg class="bp-clip" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><rect x="3.5" y="3" width="9" height="11" rx="1.5"/><path d="M6 3V2h4v1M6 7h4M6 10h3"/></svg>' +
    '<svg class="bp-x" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
    '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg></span>';

  // BeyondATC's error: its ✕ dismisses it there too ("ack_error")
  var ERROR_X = '<span class="bp-unpin is-x" data-input-group="BATC-PILL" data-dismiss="error">' +
    '<svg class="bp-x" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
    '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg></span>';

  function keptLook(k) {
    if (CONFIG.readbackDetail === "none") return null;
    if (CONFIG.readbackDetail === "boxes" && k.boxes.length) {
      return { cls: "s-pin is-msg", html: KEPT_ICON + "<span>Last clearance</span>", extra: boxesHtml(k.boxes) };
    }
    var d = detailFor(k.detail, k.boxes);
    return d ? { cls: "s-pin", html: KEPT_ICON + "<span>" + esc(d) + "</span>" } : null;
  }

  // ATC took your reply (BeyondATC says nothing back to a correct one): green "Readback OK" with the hint
  function confirmLook(c) {
    return readbackLook(c.readback, 1, c.detail, c.boxes,
      { cls: "s-ok", lamp: CHECK, label: c.readback ? "Readback OK" : "Response OK" });
  }

  function confirming() {
    return state.confirmed && state.confirmedUntil && Date.now() < state.confirmedUntil &&
      CONFIG.showReadback;
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

  // the muted speaker as a warning: larger, in the look's color, pulsing; or a quiet note: orange, steady
  var MUTE_WARN = MUTE.replace('class="bp-ico"', 'class="bp-ico bp-warn"');
  var MUTE_NOTE = MUTE.replace('class="bp-ico"', 'class="bp-ico bp-note"');

  function tuneLook(t) {
    // COM2 tuned but not received: the usual tune status, the speaker saying so quietly
    if (t.label === "COM2" && state.com2Muted) {
      return { cls: "s-tune", muteShown: true, html: RADIO + '<span class="bp-sep">COM2</span>' +
        facilityHtml("bp-who", t.facility, "No station") + MUTE_NOTE };
    }
    return { cls: "s-tune", html: RADIO + (t.label ? '<span class="bp-sep">' + t.label + "</span>" : "") +
      facilityHtml("bp-who", t.facility, "No station") };
  }

  function pttLook() {
    // PTT held while someone else transmits: you're talking over them
    var busy = busyWith();
    if (busy) {
      return { cls: "s-insist is-pulse", html: MIC + '<span class="bp-who">Transmitting</span>' +
        '<span class="bp-sep">·</span><span>' + busy + "</span>" };
    }
    return replyLook("s-you", MIC, "Transmitting", "bp-who");
  }

  // CommsState text names who transmits: "ATC", "Traffic", or a weather station ("ATIS Transmitting"; AWOS,
  // ASOS, AWIS, AWIB in BeyondATC's code). A weather station isn't anyone talking.
  var WEATHER = /^(atis|awos|asos|awis|awib)\b/i;

  // who else is on the frequency right now: "ATC talking", "Traffic talking", or "" (an ATIS doesn't count)
  function busyWith() {
    if (state.mode === "speaking") {
      if (state.speaker === "atc" || state.speaker === "atcTraffic") return "ATC talking";
      if (state.speaker === "traffic") return "Traffic talking";
    }
    if (state.mode === "traffic" && /transmitting/i.test(state.text) && !WEATHER.test(state.text)) {
      return /^atc/i.test(state.text) ? "ATC talking" : "Traffic talking";
    }
    return "";
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
        if (CONFIG.showTuning) return tuneLook({ label: "", facility: { name: "Sample Tower", freq: "118.700" } });
        break;
      case "keepLast":
        if (CONFIG.showReadback && CONFIG.keepLast) {
          var kv = keptLook({ detail: "Taxi via T1 · Hold short 12L", boxes: DEMO_BOXES });
          if (kv) return kv;
        }
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
        if (CONFIG.showContact) return contactLook({ name: "Sample Approach", freq: "120.100" });
        break;
      case "showTraffic":
        if (CONFIG.showTraffic) return { cls: "", html: BARS + "<span>Traffic</span>" };
        break;
      case "hideOffline":
        if (!CONFIG.hideOffline) return { cls: "is-ghost", html: LAMP + "<span>BATC offline</span>" };
        break;
    }
    return { cls: "s-atc", html: BARS + facilityHtml("bp-who", { name: "Sample Ground", freq: "121.955" }) };
  }

  // BeyondATC not running, or in its menu (no flight there): nothing to show but a ghost pill
  function batcIdle() { return !state.connected || state.stage === "menu"; }

  // no comms panel: BeyondATC idle, or loading a flight (no stations or log yet); a click opens the settings
  function noComms() { return batcIdle() || loading(); }

  function view() {
    var now = Date.now();
    if (!state.inFlight) return { hidden: true };
    if (state.editing) return withExtra(demoView());
    // BeyondATC waits for your answer (its chips open under the pill)
    if (state.prompt && state.connected) return withExtra(promptLook(state.prompt));
    // an error can come from BeyondATC's menu too (Start flight without a SimBrief ID)
    // a short one on a line, a longer one whole under a title; it stays while hovered
    if (state.error && state.connected && (state.errorFatal || now < state.errorUntil || switchesOpen)) {
      if (state.errorFull !== state.error) {
        return withExtra({ cls: "s-err is-msg", html: ERROR_X + '<span class="bp-who">BeyondATC error</span>',
          extra: '<span class="bp-note">' + esc(state.errorFull) + "</span>" });
      }
      return withExtra(keepBoxes({ cls: "s-err", html: ERROR_X + '<span class="bp-who">' + esc(state.error) + "</span>" }));
    }
    if (batcIdle()) {
      if (CONFIG.hideOffline) return { hidden: true };
      return { cls: "is-ghost", html: LAMP + "<span>" + (state.connected ? "Waiting for BATC" : "BATC offline") + "</span>" };
    }
    if (loading()) return withExtra(loadingLook());
    if (state.pttShown && CONFIG.showPtt) return withExtra(keepBoxes(sendingMuted(pttLook()))); // the boxes too, in Boxes mode

    var v;
    switch (state.mode) {
      case "processing":
      case "request":
        v = replyLook("s-proc", DOTS, "Processing", "");
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
        if (state.speaker === "player") {
          v = sendingMuted(replyLook("s-you", BARS, "Transmitting", "bp-who"));
        }
        else if (state.speaker === "traffic") v = othersLook();
        else if (state.speaker === "atc" && state.muted && CONFIG.warnMuted) v = mutedLook();
        else v = { cls: "s-atc", html: BARS + facilityHtml("bp-who") };
        break;
      case "traffic":
        if (WEATHER.test(state.text)) {
          // COM1 on an ATIS (or AWOS, ASOS, ...) frequency: "ATIS Generating", then "ATIS Transmitting" while it plays
          v = { cls: "s-atis", html: (/generat/i.test(state.text) ? DOTS : BARS) + facilityHtml("bp-who") };
        } else {
          // ATC to other aircraft or all stations ("ATC Generating", then "ATC Transmitting")
          v = othersLook();
        }
        break;
      case "ready":
        if (now < state.loadedUntil) {
          v = loadedLook();
        } else if (state.tune && now < state.tuneUntil && !confirming()) {
          v = tuneLook(state.tune);
        } else if ((v = readbackView())) {
          // waiting for your readback
        } else if (confirming()) {
          v = confirmLook(state.confirmed);
        } else if (state.missed && now < state.missedUntil) {
          var md = detailFor(state.missed.detail, state.missed.boxes);
          v = { cls: "s-insist", html: LAMP + '<span class="bp-who">' + state.missed.label + "</span>" +
            (md ? '<span class="bp-sep">·</span><span>' + esc(md) + "</span>" : "") };
        } else if (state.atis && now < state.atisUntil) {
          v = atisLook(state.atis);
        } else if (state.contact && !state.autoTune && CONFIG.showContact) {
          v = contactLook(state.contact);
        } else if (checkInDue()) {
          // a reminder (amber, like ATC waiting for you), then a warning
          v = checkInWarn()
            ? { cls: "s-insist is-pulse", html: LAMP + '<span class="bp-who">Not checked in</span>' + facilityHtml("") }
            : { cls: "s-atc is-pulse", html: LAMP + '<span class="bp-who">Check in</span>' + facilityHtml("") };
        } else if ((v = keptView())) {
          // the last reply ATC took, instead of the station and the dot
        } else if (now < state.lingerUntil) {
          v = { cls: "", html: LAMP + facilityHtml("") };
        }
        break;
      default:
        // modes seen in the app but not yet observed live (waiting, controller, loading, ...)
        v = state.text ? { cls: "", html: LAMP + "<span>" + esc(state.text) + "</span>" } : null;
    }
    if (!v) v = { cls: "is-dot", html: LAMP };
    if (state.muted && !v.muteShown && !/\bis-dot\b/.test(v.cls)) v.html += MUTE;
    return withExtra(keepBoxes(v));
  }

  // "Live Traffic Enabled" over its question; the answers are chips in the column
  function promptLook(pr) {
    return { cls: "s-atc is-pulse is-msg", html: LAMP + '<span class="bp-who">' + esc(pr.title || "BeyondATC") + "</span>",
      extra: pr.text ? '<span class="bp-note">' + esc(pr.text) + "</span>" : "" };
  }

  function loading() { return state.stage === "loading" || state.stage === "download"; }

  // BeyondATC loads a flight: "Loading flight", the callsign once it's known (at about 10%), and the progress line
  function loadingLook() {
    return { cls: "s-proc has-track", track: Math.max(0, state.loadPct),
      html: DOTS + '<span class="bp-who">Loading flight</span>' +
        (state.callsign ? '<span class="bp-sep">·</span><span>' + esc(state.callsign) + "</span>" : "") };
  }

  // the flight is loaded: callsign and route, in the clearance boxes when the readback detail is Boxes
  function loadedLook() {
    var pg = state.progress, cs = state.callsign;
    if (CONFIG.readbackDetail === "boxes") {
      var boxes = [];
      if (cs) boxes.push({ title: "Callsign", info: cs });
      if (pg && pg.from) boxes.push({ title: "From", info: pg.from });
      if (pg && pg.to) boxes.push({ title: "To", info: pg.to });
      if (boxes.length) {
        return { cls: "s-ok is-msg", track: 100, html: CHECK + '<span class="bp-who">Flight loaded</span>', extra: boxesHtml(boxes) };
      }
    }
    var route = pg && pg.from && pg.to ? '<span class="bp-route"><span>' + esc(pg.from) + "</span>" + ARROW +
      "<span>" + esc(pg.to) + "</span></span>" : "";
    // track: the progress line fills up as it fades out
    return { cls: "s-ok", track: 100, html: CHECK + '<span class="bp-who">' + (cs ? esc(cs) : "Flight loaded") + "</span>" +
      (route ? '<span class="bp-sep">·</span>' + route : "") };
  }

  // you transmit on COM1 while it's muted: you won't hear the answer. Warning color and the pulsing speaker.
  function sendingMuted(v) {
    if (!state.muted || !CONFIG.warnMuted) return v;
    v.cls = /\bs-[a-z]+\b/.test(v.cls) ? v.cls.replace(/\bs-[a-z]+\b/, "s-insist") : v.cls + " s-insist";
    v.html += MUTE_WARN;
    v.muteShown = true;
    return v;
  }

  // Once a readback's clearance boxes are on the pill, they stay under whatever it shows (traffic, ATC talking to
  // others, an error, PTT) until that readback is over
  function keepBoxes(v) {
    var rb = state.readback;
    if (v.extra) {
      if (rb && /\bis-msg\b/.test(v.cls)) state.boxesFor = rb;
      return v;
    }
    if (!rb || state.boxesFor !== rb || CONFIG.readbackDetail !== "boxes" || !state.infoBoxes.length) return v;
    return { cls: v.cls.replace(/\bis-dot\b/, "") + " is-msg", html: v.html, extra: boxesHtml(state.infoBoxes) };
  }

  function keptView() { return state.kept && CONFIG.keepLast && CONFIG.showReadback ? keptLook(state.kept) : null; }

  // someone else on the frequency (AI traffic, ATC to them): your pending readback, else "Traffic" (if shown)
  // over the kept clearance's boxes, else the kept clearance as it was
  function othersLook() {
    var rb = readbackView();
    if (rb) return rb;
    var kept = keptView();
    if (!CONFIG.showTraffic) return kept;
    var t = { cls: "", html: BARS + "<span>Traffic</span>" };
    // the kept boxes stay, and so does their ✕
    if (kept && kept.extra) { t.cls = "is-msg"; t.html = KEPT_ICON + t.html; t.extra = kept.extra; }
    return t;
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
    if (switchesOpen) placeSwitches();
  }

  function cssReady() {
    return window.getComputedStyle(root).position === "absolute";
  }

  // instant: swap the content without the fade-out first (PTT should react when you press)
  function render(instant) {
    if (destroyed || !cssReady()) return;
    var v = view();
    // the progress line moves on its own (CSS transition), without the content's fade
    if (v.track !== undefined) trackFill.style.width = v.track + "%";
    var sig = v.hidden ? "hidden" : v.cls + "|" + v.html;
    if (sig === current) return;
    shown = v.hidden ? "hidden" : (v.cls || "-") + " | " + v.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    devLog("pill", shown);
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
    if (instant) {
      body.className = "bp-body";
      apply();
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
  var LEVEL = "(flight level\\s*\\d{2,3}|FL\\s?\\d{2,3}|\\d{1,3},?\\d{3}\\s*(?:feet|ft)|\\d{1,2},\\d{3}\\b)";
  var READBACKS = [
    [RWY + "[^.]*?cleared (?:to land|for (?:the )?(?:option|touch and go))", "Land $1"],
    ["cleared (?:to land|for (?:the )?(?:option|touch and go))[^.]*?" + RWY, "Land $1"],
    ["cleared (?:to land|for (?:the )?(?:option|touch and go))", "Land"],
    [RWY + "[^.]*?cleared (?:for )?take ?off", "Takeoff $1"],
    ["cleared (?:for )?take ?off[^.]*?" + RWY, "Takeoff $1"],
    ["cleared (?:for )?take ?off", "Takeoff"],
    [RWY + "[^.]*?line ?up", "Line up $1"],
    ["line ?up[^.]*?" + RWY, "Line up $1"],
    ["line ?up", "Line up"],
    ["go around", "Go around"],
    ["cleared\\s+([A-Z]{3,5}\\d[A-Z])\\s+arrival", "STAR $1"],
    ["confirm (?:new )?approach\\s+([A-Z][\\w-]*)[^.?]*?" + RWY, "Confirm $1 $2"],
    ["cleared[^.]*?approach[^.]*?" + RWY, "Approach $1"],
    ["cleared to (?!land)\\w[^.]*?(?:via|squawk|departure|climb|route)", "IFR clearance"],
    ["push(?:back)?(?: and (?:engine )?start(?:up)?)? approved", "Pushback"],
    ["face\\s+((?:north|south)(?:east|west)?|east|west)\\b", "Face $1"],
    ["exit (left|right)(?: at| via| onto)?\\s+([A-Z]{1,3}\\d{0,2})\\b", "Exit $1 $2"],
    ["taxi(?:(?!hold (?:short|position))[^.])*?" + RWY, "Taxi $1"],
    ["taxi\\s+to\\s+(ramp|gate|stand|apron|parking)\\s+(\\w+)", "Taxi to $1 $2"],
    // "taxi via M, T" / "via A and B": the words after each separator are one taxiway, so no backtracking
    ["taxi\\s+via\\s+([A-Z]{1,2}\\d{0,2}(?:,? (?:and )?[A-Z]{1,2}\\d{0,2}\\b)*)", "Taxi via $1"],
    ["taxi", "Taxi"],
    ["hold short[^.]*?" + RWY, "Hold short $1"],
    ["hold (?:short|position)", "Hold"],
    ["cross[^.]*?" + RWY, "Cross $1"],
    ["backtrack[^.]*?" + RWY, "Backtrack $1"],
    ["(climb|descend)[^.]*?" + LEVEL, "$1 $2"],
    ["maintain[^.]*?" + LEVEL, "Maintain $1"],
    ["heading\\s+(\\d{3})", "Heading $1"],
    ["(?:speed|reduce|increase|maintain)[^.]*?(\\d{3})\\s*(?:knots|kts|kt)\\b", "Speed $1"],
    ["minimum approach speed", "Min approach speed"],
    ["(?:resume )?normal speed", "Normal speed"],
    ["squawk\\s+(\\d{4})", "Squawk $1"],
    ["(?:contact|monitor)[^.]*?(1\\d{2}\\.\\d{1,3})", "Contact $1"],
    ["on\\s+(1\\d{2}\\.\\d{1,3})", "Contact $1"],
    ["(?:qnh|altimeter)\\s+(\\d{3,4}(?:\\.\\d{2})?)", "QNH $1"],
    ["unable direct(?:\\s+[A-Z]{2,5}\\b)?", "Unable direct"],
    ["(?:proceed )?direct(?: to)?\\s+(?!at\\b|this\\b|the\\b|to\\b)([A-Z]{2,5})\\b", "Direct $1"],
    ["say (?:again )?(callsign|fix name|parking|gate number|altitude|heading|speed|intentions)", "Say $1"],
    ["report ([a-z][a-z ]{2,30}?)(?=[.,?]|$)", "Report $1"],
    ["continue\\s*\\.?\\s*$", "Continue"],
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
    // checking in ("Announce On Frequency"), BeyondATC flashes "Say Callsign/Altitude¬Say Again¬" for a few ms
    // while your own request is still out, before ATC has said anything: not ATC waiting for you
    if (waiting && /^(request|processing|queued)$/.test(state.mode)) return;
    var announce = list.some(function (s) { return /^announce on frequency$/i.test(s); });
    if (!announce) state.checkInSince = 0;
    else if (!state.checkInSince) armCheckIn();
    var replies = waiting ? list.filter(function (s) { return s && !/^(say again|cancel\b)/i.test(s); }) : [];
    state.menu = list.filter(function (s) { return s; });
    if (!waiting) state.requests = state.menu;
    var key = "¬" + replies.join("¬"); // never "", which means not waiting
    if (waiting && key !== state.repliesKey) {
      // the instruction or question is the last ATC line (empty when we connected mid-exchange)
      state.readback = { text: clip(state.atcText), facility: state.facility, calls: 1,
        negative: /^negative\b/i.test(state.atcText), capId: state.lastAtcCap };
      state.answered = state.replied = false;
      state.missed = null;
    } else if (!waiting) {
      var wc = waitingFor();
      // ATC's answer to your reply: "Air Canada 202, unable 15,000 at this time."
      var unable = /\bunable\b[,\s]*(.*?)(?:\s+at this time)?[.\s]*$/i.exec(state.atcAnswer);
      if (state.readback && state.replied && state.autoTune && /^handoff$/i.test(wc.kind)) {
        // a handoff with Auto Tune on: BeyondATC retunes COM1 at once, and the radio change says it all
        state.confirmed = state.kept = null;
      } else if (state.readback && state.replied && unable) {
        // ATC turned down what you asked: not "Response OK"
        state.confirmed = state.kept = null;
        state.missed = { label: "Unable", detail: correction(unable[1]), boxes: [] };
        state.missedUntil = Date.now() + CONFIG.missedMs;
        clearTimeout(timers.missed);
        timers.missed = setTimeout(render, CONFIG.missedMs + 20);
      } else if (state.readback && state.replied) {
        // ATC took your reply (a correct readback gets no answer: the toolbar just drops "Say Again")
        state.confirmed = { readback: wc.readback,
          detail: readbackHint(state.readback.text) || (state.readback.negative && correction(state.readback.text)) || wc.kind,
          boxes: wc.choices.length ? [] : state.infoBoxes };
        state.confirmedUntil = 0;
        state.kept = { detail: state.confirmed.detail, boxes: state.confirmed.boxes };
        if (state.mode === "ready") startConfirm();
      } else if (state.readback && !state.replied) {
        // BeyondATC stopped waiting on its own (after ~18 s for taxi or acknowledge replies)
        state.missed = { label: wc.readback ? "No readback" : "No response",
          detail: readbackHint(state.readback.text) || (state.readback.negative && correction(state.readback.text)) || wc.kind, boxes: wc.choices.length ? [] : state.infoBoxes };
        state.missedUntil = Date.now() + CONFIG.missedMs;
        state.kept = null; // a newer instruction went unanswered: the kept one is out of date
        clearTimeout(timers.missed);
        timers.missed = setTimeout(render, CONFIG.missedMs + 20);
      }
      state.readback = null;
    }
    state.replies = replies;
    state.repliesKey = waiting ? key : "";
    state.menuFresh = true;
  }

  // the new station's menu offers "Announce On Frequency" (you haven't checked in): "Check in" after checkInMs
  function armCheckIn() {
    state.checkInSince = Date.now();
    clearTimeout(timers.checkIn);
    var show = function () { render(); renderComms(); };
    clearTimeout(timers.checkInWarn);
    timers.checkIn = setTimeout(show, CONFIG.checkInMs + 20);
    timers.checkInWarn = setTimeout(show, CONFIG.checkInWarnMs + 20);
  }

  function checkInWarn() { return checkInDue() && Date.now() - state.checkInSince >= CONFIG.checkInWarnMs; }

  function checkInDue() {
    return !!state.checkInSince && Date.now() - state.checkInSince >= CONFIG.checkInMs && CONFIG.showContact &&
      !state.autoRespond; // Auto Respond checks in for you
  }

  function startConfirm() {
    state.confirmedUntil = Date.now() + CONFIRM_MS;
    clearTimeout(timers.confirm);
    timers.confirm = setTimeout(function () { state.confirmed = null; render(); }, CONFIRM_MS + 20);
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
    devLog("msg", msg);
    handleMessage(msg);
    renderComms();
  }

  function handleMessage(msg) {
    var i = msg.indexOf(":");
    if (i < 0) return;
    var type = msg.slice(0, i);
    var payload = msg.slice(i + 1).trim();

    switch (type) {
      case "CommsState": {
        var cs = parseJson(payload);
        if (!cs) return;
        var mode = cs.mode || "ready";
        // a CPDLC exchange flashes "request" (with a stale label) around ATC's datalink answer, with no
        // processing or queued before it: the pill stays as it was (CPDLC is handled in the sim)
        if (mode === "request" && state.cpdlcAsked && !/^(processing|queued|speaking)$/.test(state.mode)) return;
        // you're talking (a voice reply gives processing then ready, with no Player: line)
        if (mode === "processing" || mode === "request" || mode === "queued") state.answered = state.replied = true;
        // talking with ATC: the check-in may be under way (an exchange's menu often re-offers it for a moment)
        if (state.checkInSince && /^(processing|request|queued|awaiting|speaking)$/.test(mode)) armCheckIn();
        if (mode !== "ready") {
          // talking again: an older confirmation is stale
          if (state.confirmedUntil) state.confirmed = null;
        } else if (state.confirmed && !state.confirmedUntil) {
          startConfirm(); // your reply finished playing
        }
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
        state.atcAnswer = state.answered ? payload : ""; // ATC answering what you just said
        state.lastAtcCap = addLine("atc", stationLabel(), payload);
        var c = contactIn(payload);
        if (c && !state.autoTune && !onContact(c)) { c.capId = state.lastAtcCap; state.contact = c; }
        state.menuFresh = false; // ATC may close the exchange: wait for the menu sent after it
        state.missed = null;
        if (state.readback) {
          // ATC calls you again before you replied: "Airfrans 1234, Montpellier Tower?" or the clearance
          // again (the toolbar's "Say Again" would have sent a Player: line first)
          // "Negative, QNH 1013.": ATC answers a wrong readback with the correction
          var negative = /^negative\b/i.test(payload);
          if (!negative && (state.answered || state.readback.facility.name !== state.facility.name)) {
            // you replied (or a new station talks): a new instruction with the same reply menu, like
            // "Nantes Tower, continue." after the handoff's "Acknowledge Instruction". Not the old hint.
            state.readback = { text: clip(payload), facility: state.facility, calls: 1, negative: false, capId: state.lastAtcCap };
          } else if (!state.answered && !negative) {
            state.readback.calls++;
          }
          if (negative || readbackHint(payload)) {
            state.readback.text = clip(payload);
            state.readback.negative = negative;
          }
          state.readback.capId = state.lastAtcCap; // the latest call is the message to answer
          if (negative) state.replied = false; // that reply didn't count
          state.answered = false;
        }
        return;
      case "ATCTraffic":
        state.speaker = "atcTraffic"; // ATC talking to another aircraft: your pending readback stays
        addLine("traffic", "ATC", payload);
        return;
      case "Player":
        state.speaker = "player"; // your readback (or "say again") is starting
        addLine("you", "You", payload);
        state.answered = state.replied = true;
        state.missed = null;
        state.menuFresh = false;
        return;
      case "Traffic":
        state.speaker = "traffic";
        addLine("traffic", "Traffic", payload);
        return;
      case "CPDLC_Pilot":
        // "REQUEST DIRECT TO LTP": ATC answers by datalink ("CPDLC_ATC: CLEARED DIRECT TO LTP") 15-35 s later
        if (/^request\b/i.test(payload)) state.cpdlcAsked = true;
        return;
      case "CPDLC_ATC":
        state.cpdlcAsked = false;
        return;
      case "Frequencies":
        state.freqs = parseFreqs(payload);
        if (state.freqs.rows) fileFreqs(state.freqs.rows);
        break;
      case "Progress": {
        var pg = parseJson(payload);
        if (!pg || typeof pg !== "object") break;
        // a new route: the stations filed for the last one don't apply
        if (state.progress && (pg.from !== state.progress.from || pg.to !== state.progress.to)) {
          state.freqBook = {};
          state.freqEnroute = [];
        }
        state.progress = pg;
        break;
      }
      case "Facility": {
        // "Montpellier Ground (30R, 30L)|121.955", or "Nothing Tuned" without a frequency
        var parts = payload.split("|");
        var freq = (parts[1] || "").trim();
        var prev = state.facility;
        state.facility = freq ? { name: stationName(parts[0]), freq: freq } : { name: "", freq: "" };
        if (state.seenFacility && (prev.name !== state.facility.name || prev.freq !== state.facility.freq)) {
          tuned("", state.facility);
          state.kept = null; // a new station: the last clearance belongs to the old one
          // the stations around you may have changed: refresh the open Frequencies tab
          if (state.panel && state.panelTab === "freq") send("frequencies");
        }
        if (state.seenFacility && prev.freq !== state.facility.freq) clearLog();
        if (state.contact && onContact(state.contact)) state.contact = null;
        state.seenFacility = true;
        break;
      }
      case "Com2": {
        // {"label":"Marseille Approach","frequency":"120.100","monitor":true}, {"label":"Radio Off",...}, or empty
        var c2 = parseJson(payload) || {};
        if (/^\(/.test(c2.label || "")) break; // "(Generating LFMT ATIS)": wait for the final label
        // monitor false ("Radio Off"): COM2 isn't received, the same station muted, not a new one
        if ("monitor" in c2) state.com2Muted = !c2.monitor;
        if (c2.frequency) state.com2Names[Number(c2.frequency).toFixed(3)] = stationName(c2.label);
        var key = (c2.label || "") + "|" + (c2.frequency || "");
        if (state.com2 !== null && key !== state.com2 && c2.frequency) {
          tuned("COM2", { name: stationName(c2.label), freq: c2.frequency });
        }
        state.com2 = key;
        break;
      }
      case "LoadState": {
        var ls = parseJson(payload);
        if (!ls) break;
        var wasLoading = loading();
        state.stage = ls.stage || "";
        state.loadPct = typeof ls.pct === "number" ? ls.pct : -1;
        // no panel while loading. Route, callsign and filed stations stay: a download can fail ("Ensure you have
        // generated your next planned leg") and BeyondATC doesn't send them again; a new route resets them (Progress)
        if (loading() && !wasLoading && state.panel) openPanel(false);
        if (wasLoading && state.stage === "ready") {
          state.loadedUntil = Date.now() + CONFIG.loadedMs;
          clearTimeout(timers.loaded);
          timers.loaded = setTimeout(render, CONFIG.loadedMs + 20);
        }
        break;
      }
      case "Prompt": {
        // {"id":"liveTrafficTime","title":"Live Traffic Enabled","text":"...","yesLabel":"Yes, Continue",
        // "noLabel":"No"} (field names from BeyondATC's code), or empty once answered, here or in the app
        var pr = parseJson(payload);
        state.prompt = pr && typeof pr === "object" && pr.id ? pr : null;
        break;
      }
      case "Callsign": {
        // {"full":"Alpine 68ML","shortForm":""}, or empty before a flight
        var cs = parseJson(payload);
        state.callsign = cs && typeof cs === "object" ? String(cs.full || cs.shortForm || "") : "";
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
        var via = null;
        state.infoBoxes = [];
        (ib && ib.length ? ib : []).forEach(function (b) {
          var box = { title: String(b.title || ""), info: String(b.info || "").replace(/<br\s*\/?>/gi, " ") };
          // a long taxi route comes as "Taxi Via 1".."Taxi Via 6", a box per taxiway: one box, "AK A B G B BA"
          if (/^taxi via\s*\d+$/i.test(box.title)) {
            if (via) { via.info += " " + box.info; return; }
            box.title = "Taxi via";
            via = box;
          }
          state.infoBoxes.push(box);
        });
        // {"title":"ATIS Current","info":"Z"} appears or changes after "information Z now current"; a clearance's
        // own "ATIS" box (a PDC's "information N") isn't news
        state.infoBoxes.forEach(function (b) {
          if (!/^atis current$/i.test(b.title) || !b.info || b.info === state.atisLetter) return;
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
        updateSwitches();
        break;
      case "AutoRespond":
        state.autoRespond = payload === "true";
        updateSwitches();
        break;
      case "Actions":
        onActions(payload);
        break;
      case "AppError": {
        // {"text":"No traffic liveries found, ...\nYou must ...","fatal":false,"kicked":false}, or plain text
        var ae = parseJson(payload);
        var full = String(ae && typeof ae === "object" ? ae.text || "" : payload).trim();
        var et = full.split("\n")[0].trim();
        // longer than a line: the whole text shows under a title
        state.errorFull = full.replace(/\s*\n\s*/g, " ");
        if (!et) {
          // cleared by BeyondATC (or dismissed here)
          state.error = "";
          state.errorFatal = false;
          break;
        }
        state.error = et.length > 48 ? et.slice(0, 47) + "…" : et;
        state.errorFatal = !!(ae && ae.fatal);
        var errMs = state.errorFull !== state.error ? CONFIG.errorLongMs : CONFIG.errorMs;
        state.errorUntil = Date.now() + errMs;
        clearTimeout(timers.error);
        timers.error = setTimeout(render, errMs + 20);
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
      state.freqs = null;
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
      state.loadedUntil = 0;
      state.replies = [];
      state.repliesKey = "";
      state.infoBoxes = [];
      state.readback = null;
      state.kept = null;
      state.caps = [];
      state.menu = [];
      state.requests = [];
      state.checkInSince = 0;
      state.panel = false;
      showSwitches(false);
      // closed on purpose for the developer log's snapshot: straight back, no "BATC offline" in between
      var now = resnapshot;
      resnapshot = false;
      if (!now) render();
      if (!destroyed) timers.reconnect = setTimeout(connect, now ? 0 : CONFIG.reconnectMs);
    };
    socket.onerror = function () { /* onclose follows */ };
  }

  // ---- settings card ---------------------------------------------------

  var STEPS = { x: [8, 0, 1600], y: [8, 0, 1000], scale: [0.1, 0.6, 2.5] };

  function updateCard() {
    var tabs = card.querySelectorAll("[data-tab]");
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].className = "bc-btn bc-tab" + (tabs[t].getAttribute("data-tab") === state.cardTab ? " is-on" : "");
    }
    var panes = card.querySelectorAll("[data-pane]");
    for (t = 0; t < panes.length; t++) {
      panes[t].className = "bc-pane" + (panes[t].getAttribute("data-pane") === state.cardTab ? "" : " is-away");
    }
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
    if (open !== state.editing) devLog("event", open ? "settings opened" : "settings closed");
    state.editing = open;
    // opened from the panel's gear: closing goes back to the panel
    if (open) { showSwitches(false); state.cardBack = state.panel; state.panel = false; }
    else if (state.cardBack) { state.cardBack = false; state.panel = !noComms(); }
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
    renderComms();
  }

  root.addEventListener("click", function (e) {
    // the kept clearance's ✕ hides it; anywhere else opens the comms panel (or closes the settings card)
    for (var el = e.target; el && el !== root; el = el.parentNode) {
      if (el.className && String(el.className.baseVal || el.className).indexOf("bp-unpin") >= 0) {
        if (state.editing) break; // the settings sample: just a click on the pill
        if (el.getAttribute("data-dismiss") === "error") {
          devLog("event", "dismiss error");
          send("ack_error");
          state.error = "";
          state.errorFatal = false;
          render();
          return;
        }
        devLog("event", "hide kept clearance");
        state.kept = null;
        render();
        return;
      }
    }
    if (state.editing) openCard(false);
    else if (noComms()) openCard(true); // no comms panel then: its gear is the only way to settings
    else openPanel(!state.panel);
  });

  // While the card or the panel is open, a transparent layer behind it (and the pill) takes the clicks elsewhere
  // and closes it: the sim keeps clicks that land on no element of ours, so the page never sees them otherwise.
  var shade = document.createElement("div");
  shade.id = "batc-pill-shade";
  shade.className = "is-closed";
  document.body.appendChild(shade);
  shade.addEventListener("click", function () {
    if (state.editing) openCard(false);
    else openPanel(false);
  });

  function updateShade() {
    var on = state.editing || (state.panel && commsShown());
    shade.className = on ? "" : "is-closed";
    if (on) shade.setAttribute("data-input-group", "BATC-PILL");
    else shade.removeAttribute("data-input-group");
  }


  card.addEventListener("click", function (e) {
    var el = e.target;
    while (el && el !== card && !el.hasAttribute("data-act") && !el.hasAttribute("data-corner") &&
           !el.hasAttribute("data-toggle") && !el.hasAttribute("data-choice") && !el.hasAttribute("data-tab")) {
      el = el.parentNode;
    }
    if (!el || el === card) return;
    if (el.hasAttribute("data-tab")) {
      state.cardTab = el.getAttribute("data-tab");
      updateCard();
      return;
    }

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

  // ---- BeyondATC buttons on hover ----------------------------------------
  // Mousemove reaches mainUi whatever is under the cursor, so hovering is worked out from positions, and only
  // when the mouse moves: a layout change under a still cursor never ends it. The zone is the pill, the
  // buttons beside it and the column under it; it remembers where the column was while the radio is busy (the
  // column closes then), so the requests come back under a still cursor once it's quiet.

  function canSwitch() {
    return state.connected && state.inFlight && !state.editing && current !== null &&
      current !== "hidden";
  }

  var hoverZone = null;

  function box(el) {
    var r = el.getBoundingClientRect();
    return r.width || r.height ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
  }

  function union(a, b) {
    if (!a || !b) return a || b;
    return { l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) };
  }

  function within(z, x, y, m) {
    return !!z && x >= z.l - m && x <= z.r + m && y >= z.t - m && y <= z.b + m;
  }

  function onMouseMove(e) {
    var x = e.clientX, y = e.clientY;
    if (!canSwitch()) { if (switchesOpen) showSwitches(false); hoverMessage(0); return; }
    var m = 8 * 0.000926 * window.innerHeight;
    var cur = box(root);
    if (switchesOpen) {
      cur = union(cur, box(switches));
      if (list.className !== "is-closed") cur = union(cur, box(list));
    }
    if (within(cur, x, y, switchesOpen ? m : 0)) {
      // keep the larger remembered zone while the column is away (radio busy), else follow the layout
      if (!(switchesOpen && busy() && within(hoverZone, x, y, 0))) hoverZone = cur && { l: cur.l - m, t: cur.t - m, r: cur.r + m, b: cur.b + m };
      clearTimeout(timers.swHide);
      timers.swHide = 0;
      if (!switchesOpen) showSwitches(true);
    } else if (switchesOpen && within(hoverZone, x, y, 0)) {
      clearTimeout(timers.swHide);
      timers.swHide = 0;
    } else if (switchesOpen && !timers.swHide) {
      timers.swHide = setTimeout(function () { timers.swHide = 0; hoverZone = null; showSwitches(false); }, 350);
    }
    // the message under the cursor, if it can show a row (the one ATC waits on, the handoff)
    var id = 0, nodes = msgs.children;
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i].getAttribute("data-leaving") && within(box(nodes[i]), x, y, 4 * 0.000926 * window.innerHeight)) {
        id = Number(nodes[i].getAttribute("data-id"));
      }
    }
    hoverMessage(id);
  }

  function showSwitches(open) {
    switchesOpen = open;
    if (!open) listAll = false;
    switches.className = open ? "" : "is-closed";
    // clicks need data-input-group on the exact element under the cursor (see openCard)
    for (var i = 0; i < switchEls.length; i++) {
      if (open) switchEls[i].setAttribute("data-input-group", "BATC-PILL");
      else switchEls[i].removeAttribute("data-input-group");
    }
    if (open) { placeSwitches(); updateSwitches(); }
    if (state.error) render(); // an error stays while hovered, and goes once left if its time is over
    renderComms();
  }

  function placeSwitches() {
    // on the pill's row, toward the screen center. By the pill's target width: it animates, and the current
    // width left the buttons over it while it grew
    var r = root.getBoundingClientRect();
    var w = parseFloat(root.style.width) || r.width;
    var gap = 5 * 0.000926 * window.innerHeight * Number(CONFIG.scale || 1);
    var bottom = /^bottom/.test(CONFIG.corner);
    var st = switches.style;
    st.top = st.bottom = st.left = st.right = "";
    var side = root.getAttribute("data-side") === "left" ? "left" : "right";
    switches.setAttribute("data-side", side);
    if (side === "left") st.left = r.left + w + gap + "px";
    else st.right = window.innerWidth - r.right + w + gap + "px";
    // level with the pill's status row (its first 26 units; the clearance boxes hang below it)
    // (a bottom-corner pill grows upward: its status row starts at its target height above its bottom)
    st.top = (bottom ? r.bottom - (parseFloat(root.style.height) || r.height) : r.top) + "px";
  }

  function updateSwitches() {
    var chips = switches.querySelectorAll("[data-sw]");
    for (var i = 0; i < chips.length; i++) {
      var on = chips[i].getAttribute("data-sw") === "autotune" ? state.autoTune : state.autoRespond;
      chips[i].className = "bs-btn" + (on ? " is-on" : "");
    }
  }

  switches.addEventListener("click", function (e) {
    var el = e.target;
    while (el && el !== switches && !el.hasAttribute("data-sw")) el = el.parentNode;
    if (!el || el === switches) return;
    flip(el.getAttribute("data-sw"));
  });

  // the same commands as BeyondATC's toolbar switches; it then sends the new state to every client
  function flip(which) {
    if (which === "autotune") {
      if (!send("set_autotune: " + !state.autoTune)) return;
      state.autoTune = !state.autoTune;
      if (state.autoTune) state.contact = null;
    } else {
      if (!send("set_autorespond: " + !state.autoRespond)) return;
      state.autoRespond = !state.autoRespond;
    }
    updateSwitches();
    render();
    renderComms();
  }

  document.addEventListener("mousemove", onMouseMove);

  // ---- comms: messages, answers, requests, panel ----------------------------
  // What BeyondATC's toolbar offers, around the pill. ATC's lines show as
  // messages under the pill; your exchange's lines leave together exchangeMs after it closes, AI traffic's one
  // by one. Hovering the message ATC waits on (or the pill) opens its answers below it; with that message off
  // screen they open in a column under the pill, which otherwise holds "Tune" after a handoff (Auto Tune off)
  // or the requests while the radio is quiet. Clicking the pill opens a panel with Frequencies and Log.

  var CAP_MS = 420;       // a message opening or closing its space
  var TRAFFIC_MS = 6000;  // AI traffic's messages leave one by one after this
  var MAX_CAPS = 6;       // a clearance exchange is five lines
  var LOG_MAX = 200;
  var SENT_MS = 4000;     // after a click, answers and requests stay hidden this long unless BeyondATC reacts first
  var CHIP_MAX = 3;       // answers shown before "+N"
  var IG = ' data-input-group="BATC-PILL"'; // clicks reach only elements carrying it (see openCard)
  var capSeq = 0, hoverCap = 0, hoverCapAll = false, listAll = false, panelHtml = "";
  var sent = [];
  // the Log, COM2 as followed so far and the stations heard outlive a restart of the pill (a hot reload): destroy()
  // leaves them here
  if (window.batcPillLog) {
    var kept = window.batcPillLog;
    state.log = kept.log;
    capSeq = kept.seq;
    ["com2Radio:com2", "com2Names:com2Names", "freqs:freqs", "freqBook:freqBook", "freqEnroute:freqEnroute"].forEach(function (p) {
      p = p.split(":");
      if (kept[p[1]]) state[p[0]] = kept[p[1]];
    });
    window.batcPillLog = null;
  }

  function send(cmd) {
    if (!socket || socket.readyState !== 1) return false;
    socket.send(cmd);
    devLog("event", "sent " + cmd);
    sent.push(cmd);
    if (sent.length > 20) sent.shift();
    return true;
  }

  function unit() { return 0.000926 * window.innerHeight * Number(CONFIG.scale || 1); }

  function stationLabel() {
    var name = state.facility.name;
    if (!name) return "ATC";
    if (CONFIG.facility === "short") { var w = name.split(" "); name = w[w.length - 1]; }
    return name;
  }

  // a radio line: into the Log, and onto the screen if the Messages setting shows it. Returns its id.
  function addLine(who, label, text) {
    var id = ++capSeq, now = Date.now();
    text = String(text).trim();
    state.log.push({ id: id, who: who, label: label, text: text, at: now });
    if (state.log.length > LOG_MAX) state.log.shift();
    if (who === "traffic" ? CONFIG.captions === "all" && CONFIG.showTraffic : CONFIG.captions !== "off") {
      state.caps.push({ id: id, who: who, label: label, text: text, born: now });
      // room for a whole exchange: AI traffic makes way first
      var i;
      for (i = 0; i < state.caps.length && state.caps.length > MAX_CAPS; i++) {
        if (state.caps[i].who === "traffic") state.caps.splice(i--, 1);
      }
      for (i = 0; i < state.caps.length && state.caps.length > MAX_CAPS; i++) {
        if (!capPinned(state.caps[i])) state.caps.splice(i--, 1);
      }
    }
    return id;
  }

  // ATC waits for your answer (the toolbar offers replies with "Say Again") and you haven't given it
  function awaiting() {
    return !!(state.readback && !state.answered && state.menuFresh && state.repliesKey);
  }

  function justSent() { return Date.now() - state.sentAt < SENT_MS; }

  // nothing can be sent now: someone's talking, a request is queued, or a click is on its way
  function busy() { return state.mode !== "ready" || justSent(); }

  // the frequency is busy with someone else (AI traffic, or ATC talking to it): a request still goes, and
  // BeyondATC queues it ("queued") until the frequency is free
  function othersTalking() {
    if (state.mode === "speaking") return state.speaker === "traffic" || state.speaker === "atcTraffic";
    return state.mode === "traffic" && !WEATHER.test(state.text);
  }

  function canRequest() { return (!busy() || othersTalking()) && !justSent(); }

  function capPinned(c) { return awaiting() && state.readback.capId === c.id; }

  // Auto Tune off and ATC handed you to a station: once you've answered, offer to tune COM1 to it
  function contactPending() { return !!(state.contact && state.contact.freq && !state.autoTune && !awaiting()); }

  // the toolbar's reply menu without "Say Again" (the message is there to read again); "Cancel ..." last
  // once each: "say fix name" lists the route's fixes with repeats ("MARRI¬MARRI")
  function answers() {
    var a = [], cancels = [], seen = {};
    state.menu.forEach(function (s) {
      if (/^say again$/i.test(s) || seen[s]) return;
      seen[s] = true;
      (/^cancel\b/i.test(s) ? cancels : a).push(s);
    });
    return a.concat(cancels);
  }

  function chip(label, attr, value, cls) {
    return '<span class="bm-chip' + (cls ? " " + cls : "") + '"' + IG + " " + attr + '="' + esc(value) + '">' +
      esc(label) + "</span>";
  }

  // the obvious answer (a readback, an acknowledgement) filled amber; a question's answers all alike.
  // A long list: the first few, then "+N" opens the rest in place.
  // the answer to fill amber: a readback or acknowledgement, a STAR's "Accept Clearance", the "Allocated Gate"
  // of a gate question, or the only answer offered ("Say Callsign"); a question's choices stay alike
  var OBVIOUS = /^(read ?back|acknowledge|accept|allocated)\b/i;

  function answerChips(all) {
    var a = answers(), off = busy() ? " is-busy" : "";
    var choices = a.filter(function (s) { return !/^cancel\b/i.test(s); });
    var obvious = choices.length === 1 || OBVIOUS.test(choices[0] || "");
    var cut = all || a.length <= CHIP_MAX + 1 ? a.length : CHIP_MAX, html = "";
    for (var i = 0; i < cut; i++) {
      var cls = i === 0 && obvious && !/^cancel\b/i.test(a[i]) ? "is-primary" : /^cancel\b/i.test(a[i]) ? "is-quiet" : "";
      html += chip(a[i], "data-reply", a[i], cls + off);
    }
    if (cut < a.length) html += chip("+" + (a.length - cut), "data-more", "1", "is-quiet");
    return html;
  }

  function tuneChip() {
    return chip("Tune " + state.contact.freq, "data-tune", state.contact.freq, "is-tune");
  }

  function commsShown() {
    return !noComms() && state.inFlight && !state.editing && current !== null && current !== "hidden";
  }

  function messagesShown() { return commsShown() && !state.panel && CONFIG.captions !== "off"; }

  function capShown(id) {
    return messagesShown() && state.caps.some(function (c) { return c.id === id; });
  }

  function renderComms() {
    if (destroyed || !cssReady()) return;
    renderMessages();
    renderList();
    renderPanel();
  }

  // ---- messages ----
  // Each message is a slot that opens and closes its height, so the others glide instead of jumping.

  function capText(c) {
    // ATC's lines go bare: the pill above names the station and the state
    return (c.who === "atc" ? "" : '<span class="bm-who">' + esc(c.label) + "</span>") + esc(c.text);
  }

  function capClass(c) { return "bm-cap bm-" + c.who + (capPinned(c) ? " is-pinned" : ""); }

  // the row under a message, while you hover it or the pill: its answers, or "Tune" under the handoff
  function capActs(c) {
    if (!(switchesOpen || hoverCap === c.id)) return "";
    if (awaiting() && state.readback.capId === c.id && !justSent()) return answerChips(hoverCapAll);
    if (contactPending() && state.contact.capId === c.id) return tuneChip();
    return "";
  }

  function capEnter(c) {
    var n = document.createElement("div");
    n.className = capClass(c) + " is-out";
    n.setAttribute("data-id", c.id);
    n.innerHTML = '<div class="bm-card">' + capText(c) + "</div>";
    n.style.height = "0px";
    msgs.appendChild(n);
    var h = n.firstChild.offsetHeight;
    requestAnimationFrame(function () {
      n.className = capClass(c);
      n.style.height = h + 6 * unit() + "px";
      // free the height once open, so a new row or a resize reflows normally
      setTimeout(function () { if (!n.getAttribute("data-leaving")) n.style.height = ""; }, CAP_MS + 30);
    });
  }

  function capLeave(n) {
    if (n.getAttribute("data-leaving")) return;
    n.setAttribute("data-leaving", "1");
    n.style.height = n.offsetHeight + "px";
    void n.offsetHeight; // start the collapse from the measured height
    n.className += " is-out is-leaving";
    n.style.height = "0px";
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, CAP_MS + 30);
  }

  // show or hide the row under a message, gliding its slot to the new height; a hidden row fades out first
  function capSet(n, acts) {
    var from = n.offsetHeight, row = null;
    for (var i = 0; i < n.children.length; i++) if (n.children[i].className.indexOf("bm-acts") === 0) row = n.children[i];
    clearTimeout(n.batcRowTimer);
    if (acts) {
      if (!row) {
        // a new row starts faded out and slides in as its slot opens (a row still fading out comes straight back)
        row = document.createElement("div");
        row.className = "bm-acts is-out";
        n.appendChild(row);
      }
      row.innerHTML = acts;
      void row.offsetHeight;
      row.className = "bm-acts";
    }
    n.setAttribute("data-acts", acts);
    if (n.className.indexOf(" is-out") >= 0) { // still opening: its own animation sizes it
      if (row && !acts) n.removeChild(row);
      return;
    }
    var gone = 0;
    if (row && !acts) {
      untag(row);
      gone = row.offsetHeight;
      row.className = "bm-acts is-out";
      n.batcRowTimer = setTimeout(function () { if (row.parentNode) row.parentNode.removeChild(row); }, CAP_MS);
    }
    n.style.height = "";
    var to = n.offsetHeight - gone; // natural height, measured before the frame paints
    if (Math.abs(to - from) < 1) return;
    n.style.height = from + "px";
    void n.offsetHeight;
    n.style.height = to + "px";
    clearTimeout(n.batcTimer);
    n.batcTimer = setTimeout(function () { if (!n.getAttribute("data-leaving")) n.style.height = ""; }, CAP_MS + 30);
  }

  function renderMessages() {
    var now = Date.now();
    // your exchange closes when nothing is pending, queued, playing or just sent; its lines then leave together
    var closed = state.mode === "ready" && !state.readback && !confirming() && !justSent();
    if (!closed) state.closedAt = 0;
    else if (!state.closedAt) state.closedAt = now;
    var clear = closed && now - state.closedAt >= CONFIG.exchangeMs;
    state.caps = state.caps.filter(function (c) {
      if (c.who === "traffic") return CONFIG.captions === "all" && CONFIG.showTraffic && now - c.born < TRAFFIC_MS;
      return CONFIG.captions !== "off" && !clear;
    });
    if (clear) clearTimeout(timers.capHover);
    if (!messagesShown()) {
      // hidden (panel open, settings, menus): nothing to measure; they open again from scratch
      msgs.innerHTML = "";
      msgs.style.display = "none";
      return;
    }
    msgs.style.display = "";
    var live = {}, nodes = {};
    state.caps.forEach(function (c) { live[c.id] = c; });
    [].slice.call(msgs.children).forEach(function (n) {
      var id = n.getAttribute("data-id");
      if (n.getAttribute("data-leaving")) return;
      if (!live[id]) { capLeave(n); return; }
      nodes[id] = n;
      var cls = capClass(live[id]);
      if (n.className !== cls && n.className.indexOf(" is-out") < 0) n.className = cls;
      var acts = capActs(live[id]);
      if ((n.getAttribute("data-acts") || "") !== acts) capSet(n, acts);
    });
    state.caps.forEach(function (c) { if (!nodes[c.id]) capEnter(c); });
  }

  // the message under the cursor (0: none). Leaving waits a moment, so the cursor can reach the row's chips.
  function hoverMessage(id) {
    if (id) {
      clearTimeout(timers.capHover);
      timers.capHover = 0;
      if (hoverCap !== id) { hoverCap = id; hoverCapAll = false; renderMessages(); }
    } else if (hoverCap && !timers.capHover) {
      timers.capHover = setTimeout(function () {
        timers.capHover = 0;
        hoverCap = 0;
        hoverCapAll = false;
        renderMessages();
      }, 350);
    }
  }

  // ---- the column under the pill (on hover) ----

  // BeyondATC's own actions: its question's answers (shown without hovering: it waits for them), Start flight in its
  // menu, Load Next Leg at the gate (LoadState turnaround: the leg is over, the next SimBrief plan isn't downloaded)
  function appChips() {
    if (!state.connected || !state.inFlight || state.editing || justSent()) return "";
    var pr = state.prompt;
    if (pr) {
      return chip(pr.yesLabel || "Yes", "data-app", "prompt_reply: " + pr.id + ":yes", "is-app is-main") +
        chip(pr.noLabel || "No", "data-app", "prompt_reply: " + pr.id + ":no", "is-app");
    }
    if (!switchesOpen || state.panel) return "";
    if (state.stage === "menu") return chip("Start IFR flight", "data-app", "start_flight: IFR", "is-app is-main");
    if (state.stage === "turnaround" && state.mode === "ready") return chip("Load Next Leg", "data-app", "turnaround", "is-app");
    return "";
  }

  function renderList() {
    // Load Next Leg comes before the requests (still ATC's at the gate); a question or Start flight alone
    var html = appChips();
    if ((!html || state.stage === "turnaround") && switchesOpen && commsShown() && !state.panel) {
      if (awaiting()) {
        // answers show in one place: under the message while it's on screen, else here
        if (!capShown(state.readback.capId) && !justSent()) html += answerChips(listAll);
      } else if (contactPending()) {
        // requests wait until you're on the new station
        if (!capShown(state.contact.capId)) html += tuneChip();
      } else if (canRequest()) {
        // BeyondATC's order: the likely next request first
        html += state.requests.map(function (r) {
          return chip(r, "data-req", r, checkInDue() && /^announce on frequency$/i.test(r) ? "is-primary" : "");
        }).join("");
      }
    }
    if (html && list.innerHTML !== html) list.innerHTML = html; // closing keeps its chips while they fade out
    list.className = html ? "" : "is-closed";
    if (html) list.setAttribute("data-input-group", "BATC-PILL");
    else {
      // fading out, they'd still take clicks meant for the answers under a message
      list.removeAttribute("data-input-group");
      untag(list);
    }
  }

  function untag(el) {
    var tagged = el.querySelectorAll("[data-input-group]");
    for (var i = 0; i < tagged.length; i++) tagged[i].removeAttribute("data-input-group");
  }

  // a click on an answer, a request, "+N" or "Tune" (under a message or in the column)
  function onChip(e, container) {
    var el = e.target;
    while (el && el !== container && !(el.getAttribute && (el.getAttribute("data-reply") ||
      el.getAttribute("data-req") || el.getAttribute("data-more") || el.getAttribute("data-tune") ||
      el.getAttribute("data-app")))) {
      el = el.parentNode;
    }
    if (!el || el === container) return;
    if (el.getAttribute("data-app")) {
      // only what's offered right now (a chip fading out isn't)
      var cmd = el.getAttribute("data-app");
      if (appChips().indexOf('data-app="' + esc(cmd) + '"') < 0 || !send(cmd)) return;
      if (/^prompt_reply/.test(cmd)) state.prompt = null;
      state.sentAt = Date.now();
      clearTimeout(timers.sent);
      timers.sent = setTimeout(function () { render(); renderComms(); }, SENT_MS + 20);
      render();
      renderComms();
      return;
    }
    if (el.getAttribute("data-more")) {
      if (container === list) { listAll = true; renderList(); } else { hoverCapAll = true; renderMessages(); }
      return;
    }
    if (el.getAttribute("data-tune")) { tune(el.getAttribute("data-tune")); return; }
    var label = el.getAttribute("data-reply") || el.getAttribute("data-req");
    // only what the toolbar's menu offers right now: a request while ATC waits for you is ignored by BeyondATC
    if (el.getAttribute("data-req") ? !canRequest() || awaiting() || state.requests.indexOf(label) < 0 ||
      state.menu.indexOf(label) < 0 : busy() || !awaiting() || answers().indexOf(label) < 0) return;
    // exactly as the toolbar's menu item: BeyondATC answers with queued / Player: / processing
    if (!send("set_action: " + label)) return;
    state.sentAt = Date.now();
    hoverCapAll = false;
    clearTimeout(timers.sent);
    timers.sent = setTimeout(renderComms, SENT_MS + 20);
    renderComms();
  }

  function tune(freq) {
    // as the toolbar's frequency list; BeyondATC retunes COM1 and sends the new Facility
    if (sameFreq(freq, state.facility.freq)) return; // already there
    if (send("set_frequency: " + freq)) renderComms();
  }

  msgs.addEventListener("click", function (e) { onChip(e, msgs); });
  list.addEventListener("click", function (e) { onChip(e, list); });

  // ---- panel: Frequencies and Log ----

  function openPanel(open) {
    state.panel = open;
    if (open) {
      showSwitches(false);
      state.freqSide = flightHalf();
      if (contactPending()) {
        state.panelTab = "freq"; // the station ATC handed you to, on the side that holds it
        ["dep", "arr"].forEach(function (k) {
          if (sideRows(k).some(function (r) { return sameFreq(r.freq, state.contact.freq); })) state.freqSide = k;
        });
      }
      state.logReset = true;
      send("frequencies"); // as the toolbar's Frequencies tab: BeyondATC answers only when asked
    }
    renderComms();
  }

  function sameFreq(a, b) { return !!a && !!b && Number(a).toFixed(3) === Number(b).toFixed(3); }

  // "Frequencies: [{"name","type","frequency","cpdlcLogonCode"}, ...]" (BeyondATC sends it only when asked). Seen
  // 2026-10-24 (LIRF-LFMT): both airports of the route, each a block in reverse calling order ending with its ATIS,
  // named after the airport ("LIRF"), then the Center ("Roma Radar"). Types: ATIS, Clearance, Ground, Tower,
  // Departure, Approach, UNICOM, Center (the toolbar also knows ApproachDeparture). Anything else is kept raw, so
  // the panel shows it instead of guessing.
  var DEP_ORDER = ["atis", "clearance", "ground", "tower", "departure", "approachdeparture", "approach", "unicom"];
  var ARR_ORDER = ["atis", "approach", "approachdeparture", "departure", "tower", "ground", "clearance", "unicom"];

  function flightHalf() {
    var pct = state.progress ? Number(state.progress.pct) : NaN; // 0-100 (sniffs: 0.0 at the gate, 99.7 at arrival)
    return pct >= 50 ? "arr" : "dep";
  }

  // each airport's stations, kept by ICAO and merged by frequency, so a later reply that leaves one out keeps it
  function fileFreqs(rows) {
    var pg = state.progress || {}, blocks = [[]], enroute = [];
    rows.forEach(function (r) {
      if (r.kind === "center") { enroute.push(r); return; }
      var cur = blocks[blocks.length - 1], last = cur[cur.length - 1];
      // each row names its airport (since 2026-10-27); older replies end each airport's block with its ATIS
      if (last && (r.airport || last.airport ? r.airport !== last.airport : last.kind === "atis" && r.kind !== "atis")) {
        blocks.push(cur = []);
      }
      cur.push(r);
    });
    blocks.forEach(function (b, i) {
      var named = b.filter(function (r) { return r.airport || r.icao; })[0];
      var icao = named ? named.airport || named.icao : [pg.from, pg.to][i]; // no ATIS: the route's order
      if (!icao) return;
      var book = state.freqBook[icao] = state.freqBook[icao] || [];
      b.forEach(function (r) {
        for (var j = 0; j < book.length; j++) if (sameFreq(book[j].freq, r.freq)) { book[j] = r; return; }
        book.push(r);
      });
    });
    if (enroute.length) state.freqEnroute = enroute;
  }

  // the airport's stations in the order you call them: on the way out, or on the way in
  function sideRows(side) {
    var pg = state.progress || {}, order = side === "arr" ? ARR_ORDER : DEP_ORDER;
    var rank = function (r) { var k = order.indexOf(r.kind); return k < 0 ? order.length : k; };
    return (state.freqBook[side === "arr" ? pg.to : pg.from] || []).slice().sort(function (a, b) { return rank(a) - rank(b); });
  }

  function parseFreqs(payload) {
    var data = parseJson(payload), rows = [];
    (data instanceof Array ? data : []).forEach(function (o) {
      var f = o && Number(o.frequency);
      if (!f || f < 100 || f > 200) return;
      var type = String(o.type || ""), name = stationName(o.name);
      var icao = /^atis$/i.test(type) && /^[A-Z0-9]{4}$/.test(name) ? name : "";
      // "FIUME GROUND" -> "Fiume Ground"; a one-word name gets its type: "LIRF ATIS", "Fiume Clearance"
      if (!icao) name = name.replace(/[^\s\/-]+/g, function (w) { return /^(ATIS|ACC|FIS)$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); });
      rows.push({ name: !name ? type : /\s/.test(name) ? name : name + " " + type, kind: type.toLowerCase().replace(/[^a-z]/g, ""),
        freq: f.toFixed(3), icao: icao, airport: /^[A-Z0-9]{3,4}$/.test(o.airport) ? o.airport : "",
        rwys: String(o.runways || "").replace(/\s*,\s*/g, " ").trim() }); // "26L": a station per runway
    });
    return rows.length ? { rows: rows } : { raw: String(payload) };
  }

  // a cog: 8 teeth in straight segments, and its hole
  var GEAR = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round">' +
    '<path d="M13.3 8.6L14.9 9.3L13.8 11.9L12.1 11.3L11.3 12.1L11.9 13.8L9.3 14.9L8.6 13.3L7.4 13.3L6.7 14.9L4.1 13.8' +
    'L4.7 12.1L3.9 11.3L2.2 11.9L1.1 9.3L2.7 8.6L2.7 7.4L1.1 6.7L2.2 4.1L3.9 4.7L4.7 3.9L4.1 2.2L6.7 1.1L7.4 2.7L8.6 2.7' +
    'L9.3 1.1L11.9 2.2L11.3 3.9L12.1 4.7L13.8 4.1L14.9 6.7L13.3 7.4Z"/><circle cx="8" cy="8" r="2.2"/></svg>';
  var CROSS = '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
    '<path d="M2 2l6 6M8 2l-6 6"/></svg>';

  function toggleHtml(label, attr, value, on) {
    return '<span class="bm-tog' + (on ? " is-on" : "") + '" ' + attr + '="' + value + '">' + label +
      '<span class="bm-sw"><i></i></span></span>';
  }

  function freqTab() {
    var f = state.freqs, h = "";
    if (contactPending()) {
      h += '<div class="bm-contact"><span class="bm-grow">ATC: contact ' + esc(state.contact.name) + " " +
        esc(state.contact.freq) + '</span><span class="bm-go" data-tune="' + esc(state.contact.freq) + '">Tune COM1</span></div>';
    }
    if (!f) return h + '<div class="bm-note">Waiting for BeyondATC\'s frequencies…</div>';
    if (f.raw) {
      return h + '<div class="bm-note">BeyondATC sent its frequencies in a form the pill can\'t read yet:</div>' +
        '<div class="bm-raw">' + esc(f.raw.slice(0, 600)) + "</div>";
    }
    var rows = f.rows, pg = state.progress;
    if (pg) {
      // Departure / Arrival: each airport's stations, then the Center you're under
      h += '<div class="bm-seg">' + [["dep", "Departure", pg.from], ["arr", "Arrival", pg.to]].map(function (t) {
        return '<span class="bm-tab' + (state.freqSide === t[0] ? " is-on" : "") + '" data-side="' + t[0] + '">' + t[1] +
          (t[2] ? " · " + esc(t[2]) : "") + "</span>";
      }).join("") + "</div>";
      rows = sideRows(state.freqSide);
      if (!rows.length) h += '<div class="bm-note">BeyondATC hasn\'t listed this airport\'s stations.</div>';
      if (state.freqEnroute.length) {
        if (rows.length) h += freqRows(rows);
        h += '<div class="bm-sec bm-sub">En route</div>';
        rows = state.freqEnroute;
      }
    }
    return h + freqRows(rows);
  }

  function freqRows(rows) {
    if (!rows.length) return "";
    // COM2 as followed from its key events (see onCom2Event), else as BeyondATC reports it (only while received)
    var com2 = state.com2Radio.act || (state.com2 ? state.com2.split("|")[1] : "");
    // one row per station, its frequencies as chips ("Fiume Ground 121.675 122.125 121.900"), in the rows' order;
    // a frequency for some runways only says which ("Vancouver Tower 118.700 26L 119.550 26R")
    var groups = [], byKey = {};
    rows.forEach(function (r) {
      var k = r.kind + "|" + r.name;
      if (!byKey[k]) groups.push(byKey[k] = { name: r.name, freqs: [] });
      byKey[k].freqs.push(r);
    });
    return '<div class="bm-rows">' + groups.map(function (g) {
      var on1 = false;
      var chips = g.freqs.map(function (r) {
        var f = r.freq, c1 = sameFreq(f, state.facility.freq);
        on1 = on1 || c1;
        // filled: COM1; outlined: COM2; amber: the station ATC handed you to
        var cls = c1 ? " is-com1" : contactPending() && sameFreq(f, state.contact.freq) ? " is-ask" : sameFreq(f, com2) ? " is-com2" : "";
        return '<span class="bm-fq' + cls + '" data-tune="' + esc(f) + '">' + esc(f) +
          (r.rwys ? '<span class="bm-rwy">' + esc(r.rwys) + "</span>" : "") + "</span>";
      }).join("");
      return '<div class="bm-row' + (on1 ? " is-active" : "") + '"><span class="bm-grow">' + esc(g.name) + "</span>" +
        '<span class="bm-fqs">' + chips + "</span></div>";
    }).join("") + "</div>";
  }

  // a new COM1 frequency starts a new Log. On screen, the old lines fade out first; lines that come in meanwhile stay
  function clearLog() {
    var cut = capSeq;
    function drop() {
      state.logCut = 0;
      state.log = state.log.filter(function (l) { return l.id > cut; });
      renderComms();
    }
    clearTimeout(timers.logClear);
    if (state.panel && state.panelTab === "log" && commsShown() && state.log.length) {
      state.logCut = cut;
      timers.logClear = setTimeout(drop, 350);
      renderComms();
    } else drop();
  }

  function hhmm(t) {
    var d = new Date(t), h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }

  function logTab() {
    var lines = state.log.filter(function (l) { return CONFIG.showTraffic || l.who !== "traffic"; });
    // a line slides in as it arrives; the ones already there when the Log opens don't. The class stays for the
    // animation's length, so a re-render meanwhile (same HTML) doesn't restart it
    if (state.logReset) state.logBase = capSeq;
    var fresh = Date.now() - 700, shown = Date.now() - state.trafficSince < 450;
    return '<div class="bm-bar is-end">' + toggleHtml("AI traffic", "data-act", "traffic",
      CONFIG.showTraffic && !state.trafficLeaving) + "</div>" +
      (lines.length ? '<div class="bm-logwrap"><div class="bm-log">' + lines.map(function (l) {
        var cls = l.id <= state.logCut ? " is-gone" : l.who === "traffic" && state.trafficLeaving ? " is-fold" :
          l.who === "traffic" && shown ? " is-unfold" : l.id > state.logBase && l.at > fresh ? " is-new" : "";
        return '<div class="bm-ln bm-' + l.who + cls + '"><span class="bm-t">' + hhmm(l.at) + '</span><span class="bm-x">' +
          '<span class="bm-w">' + esc(l.label) + "</span>" + esc(l.text) + "</span></div>";
      }).join("") + '</div><div class="bm-sb"><b class="bm-track"></b><i class="bm-thumb"></i></div></div>' : '<div class="bm-note">No radio calls yet.</div>');
  }

  // The Log's scrollbar, drawn (the sim shows none): the thumb follows the scroll; drag it, or click the track
  // to jump there. A drag follows mousemove (which reaches the page anywhere) and ends on mouseup or the
  // first move with no button held.
  var sbDrag = null;

  function syncScrollbar() {
    var log = panel.querySelector(".bm-log"), sb = panel.querySelector(".bm-sb");
    if (!log || !sb) return;
    var range = log.scrollHeight - log.clientHeight, track = sb.clientHeight;
    sb.className = range > 1 ? "bm-sb" : "bm-sb is-none";
    if (range <= 1) return;
    var h = Math.max(track * log.clientHeight / log.scrollHeight, 20 * unit());
    var thumb = sb.lastChild;
    thumb.style.height = h + "px";
    thumb.style.top = (track - h) * log.scrollTop / range + "px";
  }

  panel.addEventListener("scroll", syncScrollbar, true); // scroll doesn't bubble: caught on the way down

  panel.addEventListener("mousedown", function (e) {
    if (e.button === 2) return;
    var t = e.target.className;
    var sb = t === "bm-thumb" || t === "bm-track" ? e.target.parentNode : t === "bm-sb" ? e.target : null;
    var log = sb && panel.querySelector(".bm-log");
    if (!log) return;
    var thumb = sb.lastChild, range = log.scrollHeight - log.clientHeight;
    var room = sb.clientHeight - thumb.offsetHeight;
    if (t !== "bm-thumb") {
      // the track: put the thumb's middle under the cursor, then drag on from there
      var y = e.clientY - sb.getBoundingClientRect().top - thumb.offsetHeight / 2;
      log.scrollTop = room > 0 ? range * y / room : 0;
    }
    sbDrag = { y: e.clientY, top: log.scrollTop, perPx: room > 0 ? range / room : 0 };
    e.preventDefault();
  });

  function onDrag(e) {
    if (!sbDrag) return;
    if (e.type === "mouseup" || e.buttons === 0) { sbDrag = null; return; }
    var log = panel.querySelector(".bm-log");
    if (log) log.scrollTop = sbDrag.top + (e.clientY - sbDrag.y) * sbDrag.perPx;
  }
  document.addEventListener("mousemove", onDrag);
  document.addEventListener("mouseup", onDrag);

  function renderPanel() {
    var open = state.panel && commsShown();
    updateShade();
    panel.className = open ? "" : "is-closed";
    if (!open) { panel.removeAttribute("data-input-group"); return; }
    var tabs = [["freq", "Frequencies"], ["log", "Log"]].map(function (t) {
      var badge = t[0] === "freq" && contactPending() && state.panelTab !== "freq";
      return '<span class="bm-tab' + (state.panelTab === t[0] ? " is-on" : "") + '" data-tab="' + t[0] + '">' + t[1] +
        (badge ? '<i class="bm-badge"></i>' : "") + "</span>";
    }).join("");
    // the loaded flight: full callsign ("Airfrans 1234"), and its route
    var pg = state.progress, route = pg && pg.from && pg.to ? esc(pg.from) + " → " + esc(pg.to) : "";
    var html = (state.callsign ? '<div class="bm-id"><span class="bm-grow">' + esc(state.callsign) + "</span>" +
      (route ? '<span class="bm-route">' + route + "</span>" : "") + "</div>" : "") +
      '<div class="bm-head"><span class="bm-tabs">' + tabs + "</span>" +
      '<span class="bm-icon" data-act="settings">' + GEAR + '</span><span class="bm-icon" data-act="close">' + CROSS + "</span></div>" +
      (state.panelTab === "log" ? logTab() : freqTab()) +
      '<div class="bm-foot">' + toggleHtml("Auto Respond", "data-sw", "autorespond", state.autoRespond) +
      toggleHtml("Auto Tune", "data-sw", "autotune", state.autoTune) + "</div>";
    if (html === panelHtml && panel.firstChild) return; // unchanged: keep the DOM and the Log's scroll position
    // keep the Log where you scrolled it; follow new lines only while you're at its bottom
    var old = panel.querySelector(".bm-log"), top = old ? old.scrollTop : 0;
    var atBottom = !old || old.scrollHeight - old.scrollTop - old.clientHeight < 4;
    panel.innerHTML = panelHtml = html;
    var log = panel.querySelector(".bm-log");
    if (log) log.scrollTop = atBottom || state.logReset ? log.scrollHeight : top;
    state.logReset = false;
    // the sim checks data-input-group on the exact element under the cursor
    var els = [panel].concat([].slice.call(panel.querySelectorAll("*")));
    for (var i = 0; i < els.length; i++) els[i].setAttribute("data-input-group", "BATC-PILL");
    syncScrollbar();
  }

  panel.addEventListener("click", function (e) {
    var el = e.target, names = ["data-tab", "data-side", "data-tune", "data-act", "data-sw"];
    function has(n) { for (var i = 0; i < names.length; i++) if (n.getAttribute(names[i])) return true; return false; }
    while (el && el !== panel && !(el.getAttribute && has(el))) el = el.parentNode;
    if (!el || el === panel) return;
    var act = el.getAttribute("data-act");
    if (el.getAttribute("data-tab")) { state.panelTab = el.getAttribute("data-tab"); state.logReset = true; }
    else if (el.getAttribute("data-side")) state.freqSide = el.getAttribute("data-side");
    else if (el.getAttribute("data-tune")) { if (!rightClickEcho(e, el.getAttribute("data-tune"))) tune(el.getAttribute("data-tune")); return; }
    else if (el.getAttribute("data-sw")) { flip(el.getAttribute("data-sw")); return; }
    else if (act === "close") { openPanel(false); return; }
    else if (act === "settings") { openCard(true); return; }
    else if (act === "traffic") { toggleTraffic(); return; }
    renderPanel();
  });

  // A right click on a frequency sets the plane's COM2 through BeyondATC ("set_frequency_com2", which its toolbar
  // doesn't use; BeyondATC sets it over SimConnect, as COM1). Right clicks may come as contextmenu or as a button-2
  // mousedown: one per click.
  var com2At = 0;
  function onRightClick(e) {
    if (e.type === "mousedown" && e.button !== 2) return;
    var el = e.target;
    while (el && el !== panel && !(el.getAttribute && el.getAttribute("data-tune"))) el = el.parentNode;
    if (!el || el === panel) return;
    e.preventDefault();
    if (Date.now() - com2At < 300) return;
    com2At = Date.now();
    com2Freq = el.getAttribute("data-tune");
    setCom2(com2Freq);
  }
  var com2Freq = "";

  // in the sim a right click is also a click (the log showed a COM1 tune right after each COM2 one): not that one
  function rightClickEcho(e, freq) {
    return e.button === 2 || (Date.now() - com2At < 1000 && sameFreq(freq, com2Freq));
  }
  panel.addEventListener("contextmenu", onRightClick);
  panel.addEventListener("mousedown", onRightClick);

  function setCom2(freq) {
    if (!Number(freq) || !send("set_frequency_com2: " + freq)) return;
    // as if the sim's event came back (whether mainUi sees SimConnect's events is unknown)
    state.com2Radio.act = Number(freq).toFixed(3);
    clearTimeout(com2Timer);
    com2Timer = setTimeout(com2Settled, 150);
  }

  // the Log's AI traffic switch: its lines slide in, or fade out before they go (the switch flips at once)
  function toggleTraffic() {
    clearTimeout(timers.traffic);
    if (state.trafficLeaving) { state.trafficLeaving = false; renderPanel(); return; } // back on mid-fade
    if (!CONFIG.showTraffic) { state.trafficSince = Date.now(); set({ showTraffic: true }); return; }
    state.trafficLeaving = true;
    renderPanel();
    timers.traffic = setTimeout(function () { state.trafficLeaving = false; set({ showTraffic: false }); }, 350);
  }

  // under the pill, toward the screen center; bottom corners stack upward (see place)
  function placeComms(v, h) {
    var s = Number(CONFIG.scale || 1);
    [[msgs, 34], [panel, 34], [list, 32]].forEach(function (p) {
      var st = p[0].style;
      st.top = st.bottom = st.left = st.right = "";
      // the pill's height (26) and a gap, in 1080p pixels at this scale; cardShift: the clearance boxes' extra height
      st[v] = "calc(" + (Number(CONFIG.y) + p[1] * s) + " * 0.0926vh + " + cardShift + "px)";
      st[h] = "calc(" + Number(CONFIG.x) + " * 0.0926vh)";
      st.setProperty("--u", 0.0926 * s + "vh");
      p[0].setAttribute("data-side", h);
      p[0].setAttribute("data-edge", v);
    });
  }

  // ---- flight detection -----------------------------------------------

  function poll() {
    var inFlight = !!document.querySelector(CONFIG.host);
    state.inFlight = inFlight;
    // also catches the first render once the stylesheet applies, and re-measures in case a
    // measurement ran before layout settled
    render();
    resize();
    renderComms();
  }

  // ---- PTT ----------------------------------------------------------------
  // The sim reports key events to any view that asks (the way its own instruments do). A binding sends its
  // event once on press, then again every ~33 ms after ~0.4 s while held, and nothing on release; so PTT is
  // "held" until the repeats stop. mainUi has no Coherent/SimVar, but its `engine` handles the listener.

  var PTT_FIRST_MS = 450, PTT_REPEAT_MS = 120;
  var keyHandler = null;

  var pttLastAt = 0;

  function onKeyEvent(name) {
    if (name !== CONFIG.pttEvent || !CONFIG.showPtt) return;
    // the sim reports each event twice in the same ms: a copy isn't a repeat
    var now = Date.now();
    if (state.ptt && now - pttLastAt < 15) return;
    pttLastAt = now;
    var held = state.ptt;
    state.pttRepeating = held;
    state.ptt = true;
    clearTimeout(timers.ptt);
    timers.ptt = setTimeout(function () {
      clearTimeout(timers.pttShow);
      var shown = state.pttShown;
      state.ptt = state.pttRepeating = state.pttShown = false;
      devLog("event", "ptt up");
      if (shown) render(true);
    }, state.pttRepeating ? PTT_REPEAT_MS : PTT_FIRST_MS);
    if (!held) {
      devLog("event", "ptt down");
      // still held after pttDelayMs (the sim repeats from ~0.4 s): show it
      clearTimeout(timers.pttShow);
      timers.pttShow = setTimeout(function () { state.pttShown = true; render(true); }, CONFIG.pttDelayMs);
    }
  }

  // The sim's key events the pill watches: the PTT binding (if shown) and COM2's (always, never blocked)
  function listenKeys() {
    var eng = window.engine;
    if (!eng || typeof eng.on !== "function") return;
    // once per view and event: hot reloads (inspect_ui.py --push) keep the view, and its intercepts
    var reg = window.batcPillKeys = window.batcPillKeys || { attached: false, intercepted: {} };
    if (!reg.attached) {
      eng.trigger("ADD_VIEW_LISTENER", "JS_LISTENER_KEYEVENT", "/Global/mainUI.html");
      reg.attached = true;
    }
    if (!keyHandler) {
      keyHandler = function (name, v0, v1) { onKeyEvent(name); onCom2Event(name, v1); };
      eng.on("keyIntercepted", keyHandler);
    }
    var watch = COM2_EVENTS.map(function (e) { return [e, 0]; });
    // speech-recognition actions (Quick Reply is SR_COM_QUICK_REPLY) froze the sim when intercepted: never
    if (CONFIG.showPtt && !/^SR_/i.test(CONFIG.pttEvent)) watch.push([CONFIG.pttEvent, CONFIG.pttBlock ? 1 : 0]);
    watch.forEach(function (w) {
      var id = w[0] + (w[1] ? ":block" : "");
      if (reg.intercepted[id]) return;
      eng.call("INTERCEPT_KEY_EVENT", w[0], w[1]);
      reg.intercepted[id] = true;
    });
  }

  // COM2, followed from its key events (mainUi can't read the radio). The Fenix sets it with these alone, each
  // event reported twice: the knob is SWAP, SET_HZ <new standby>, SWAP; the transfer button SET_HZ <old standby>,
  // then SWAP, SET_HZ <old active>, SWAP (seen 2026-10-24). Unknown until the first event, or a right click.
  var COM2_EVENTS = ["COM2_RADIO_SET_HZ", "COM2_STBY_RADIO_SET_HZ", "COM2_RADIO_SWAP"];
  var com2Last = { key: "", at: 0 }, com2Timer = 0;

  function onCom2Event(name, value) {
    if (COM2_EVENTS.indexOf(name) < 0) return;
    var key = name + " " + value, now = Date.now();
    if (key === com2Last.key && now - com2Last.at < 5) return; // the copy
    com2Last = { key: key, at: now };
    var c = state.com2Radio;
    if (name === "COM2_RADIO_SWAP") { var a = c.act; c.act = c.stby; c.stby = a; }
    else {
      var f = (Number(value) / 1e6).toFixed(3);
      if (name === "COM2_RADIO_SET_HZ") c.act = f; else c.stby = f;
    }
    // a change is a burst of events: show it once they've settled
    clearTimeout(com2Timer);
    com2Timer = setTimeout(com2Settled, 150);
  }

  function com2Settled() {
    var f = state.com2Radio.act;
    if (!f || f === state.com2Radio.shown) return;
    state.com2Radio.shown = f;
    devLog("event", "COM2 now " + f);
    // the tune status even with COM2 muted (BeyondATC then reports "Radio Off"): the station if the panel has
    // listed it, else the frequency on its own
    tuned("COM2", { name: freqStation(f) || f, freq: freqStation(f) ? f : "" });
    render();
    renderComms();
  }

  function freqStation(f) {
    var all = [].concat(state.freqEnroute, (state.freqs && state.freqs.rows) || []);
    for (var k in state.freqBook) all = all.concat(state.freqBook[k]);
    for (var i = 0; i < all.length; i++) if (sameFreq(all[i].freq, f)) return all[i].name;
    return state.com2Names[Number(f).toFixed(3)] || "";
  }

  // ---- developer log (tools/pill_log.py) --------------------------------
  // With devLog on (your own builds), the pill streams to tools/pill_log.py whenever it runs, retrying quietly
  // otherwise: every BeyondATC message ("msg"), what it shows ("pill")
  // and what you do ("event"). The logger writes them as they come, so a sim crash keeps the log.

  var logSock = null;
  var resnapshot = false; // BeyondATC socket closed to get a fresh snapshot into the log
  var shown = "";         // what the pill shows, as logged: "s-atc is-pulse | Awaiting readback · Taxi 30R"

  function logConnect() {
    clearTimeout(timers.log);
    if (!CONFIG.devLog || destroyed) {
      if (logSock) { logSock.onclose = null; logSock.close(); logSock = null; }
      return;
    }
    if (logSock) return;
    try {
      logSock = new WebSocket(CONFIG.devLogUrl);
    } catch (e) {
      timers.log = setTimeout(logConnect, CONFIG.reconnectMs);
      return;
    }
    logSock.onopen = function () {
      devLog("pill", shown || "(not rendered yet)");
      // reconnect to BeyondATC so the log starts with its snapshot
      if (socket) { resnapshot = true; socket.close(); }
    };
    logSock.onclose = function () {
      logSock = null;
      if (CONFIG.devLog && !destroyed) timers.log = setTimeout(logConnect, CONFIG.reconnectMs);
    };
    logSock.onerror = function () { /* onclose follows */ };
  }

  function devLog(kind, value) {
    if (!logSock || logSock.readyState !== 1) return;
    try { logSock.send(JSON.stringify({ k: kind, v: value })); } catch (e) { /* the logger went away */ }
  }

  // ---- lifecycle -------------------------------------------------------

  function destroy() {
    destroyed = true;
    window.batcPillLog = { log: state.log, seq: capSeq, com2: state.com2Radio, com2Names: state.com2Names,
      freqs: state.freqs, freqBook: state.freqBook, freqEnroute: state.freqEnroute };
    clearTimeout(com2Timer);
    for (var k in timers) { clearTimeout(timers[k]); clearInterval(timers[k]); }
    if (socket) { socket.onclose = null; socket.close(); socket = null; }
    if (logSock) { logSock.onclose = null; logSock.close(); logSock = null; }
    if (keyHandler && window.engine && typeof window.engine.off === "function") window.engine.off("keyIntercepted", keyHandler);
    if (root.parentNode) root.parentNode.removeChild(root);
    if (card.parentNode) card.parentNode.removeChild(card);
    if (switches.parentNode) switches.parentNode.removeChild(switches);
    [msgs, list, panel].forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", onDrag);
    if (shade.parentNode) shade.parentNode.removeChild(shade);
    if (style.parentNode) style.parentNode.removeChild(style);
    if (window.batcPill && window.batcPill.destroy === destroy) delete window.batcPill;
  }

  // Same as the settings card, e.g. batcPill.set({ corner: "top-left", x: 40, y: 120 }). Saved.
  function set(patch) {
    settingsChanged = true;
    devLog("event", "settings " + JSON.stringify(patch));
    return applySettings(patch);
  }

  function applySettings(patch) {
    var moved = "corner" in patch;
    for (var k in patch) CONFIG[k] = patch[k];
    saveSettings();
    listenKeys(); // turning PTT on starts listening to it (off just ignores the events)
    place();
    updateCard();
    if (moved) current = null; // re-enter from the new side
    render();
    resize(); // same content at a new scale keeps its old pixel width otherwise
    renderComms();
    return CONFIG;
  }

  // Waits up to 90 s for DataStorage, then takes its settings over localStorage's, unless the user changed
  // some meanwhile; with nothing saved there yet (first start, or settings from 1.x), copies them in.
  function loadStoredSettings(tries) {
    var ds = dataStorage();
    if (!ds) {
      var eng = window.engine;
      if (!window.batcPillStore && eng && typeof eng.trigger === "function") {
        eng.trigger("ADD_VIEW_LISTENER", "JS_LISTENER_DATASTORAGE", "/Global/mainUI.html");
        window.batcPillStore = true; // once per view, like the key listener
      }
      if (tries < 90) timers.store = setTimeout(function () { loadStoredSettings(tries + 1); }, 1000);
      return;
    }
    var patch = null;
    try { patch = savedPatch(ds.getData(STORE_KEY)); } catch (e) { /* ignore */ }
    if (patch && !settingsChanged) applySettings(patch);
    else saveSettings();
  }

  window.batcPill = {
    destroy: destroy,
    set: set,
    state: state,
    config: CONFIG,
    feed: onMessage, // test hook: batcPill.feed('CommsState: {"mode":"awaiting","text":""}')
    sent: sent,      // the last commands sent to BeyondATC, newest last
    settings: function (open) { openCard(open !== false); }, // docs/render: the card as its gear opens it
  };

  poll();
  timers.poll = setInterval(poll, 1000);
  connect();
  logConnect();
  try { listenKeys(); } catch (e) { /* no key events in this view: no PTT, no COM2 */ }
  loadStoredSettings(0);
})();
