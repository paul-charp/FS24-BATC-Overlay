// BATC comms pill: shows BeyondATC's comms state in a screen corner during flight.
// Reads BeyondATC's toolbar socket (the same one its in-sim panel uses). The only thing it sends is what
// BeyondATC's own toolbar switches send: "set_autotune: true|false" and "set_autorespond: true|false".
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
    missedMs: 5000,      // "No readback" stays this long when BeyondATC stops waiting without your reply
    atisMs: 6000,        // how long a new ATIS letter is shown
    demoMs: 4000,        // settings card: how long the sample shows the last change before going back
    showReadback: true,  // while BeyondATC waits for your readback, hint what it is ("Taxi 30R")
    readbackDetail: "hint", // with a readback pending: "none" (status only), "short" (the boxes' values:
                            // "30R · T1"), "hint" ("Taxi via T1"), "boxes" (the toolbar's clearance boxes)
    keepLast: false,     // after ATC took your reply, keep its hint on the pill (quiet) until the next instruction,
                         // a new station on COM1, or its ✕ (hover) instead of shrinking to the dot
    showTuning: true,    // show the new station when COM1/COM2 changes
    showContact: true,   // Auto Tune off: after "contact <station> <freq>", remind you until COM1 is on it
    showAtis: true,      // show a new ATIS letter
    warnMuted: true,     // ATC calling you while COM1 is muted: red-orange instead of amber
    showPtt: false,      // show "Transmitting" while your PTT button is held. Needs that button also bound to
                         // the sim's Communications > TOGGLE SPEAKER (BeyondATC's own PTT stays as it is)
    pttEvent: "TOGGLE_SPEAKER", // the sim event that binding sends
    pttBlock: false,     // also stop the sim acting on it
    pttDelayMs: 250,     // PTT held this long before "Transmitting" shows. Under ~450 ms a click still shows briefly:
                         // the sim's first repeat comes at ~0.4 s, so a click looks held until then
    hideOffline: false,  // true: no pill at all while BeyondATC isn't running
    showTraffic: true,   // show a neutral "Traffic" pill while AI traffic talks
    facility: "short",   // "short": "Ground", "full": "Montpellier Ground"
    url: "ws://127.0.0.1:41716",
    reconnectMs: 5000,
    host: 'ui-resource-element[name="MasterPage_InGame"]', // only mounted in flight
  };
  var FADE_MS = 140;
  var CONFIRM_MS = 1500;  // "Readback OK" shows this long after ATC took your reply

  // What the settings card changes. Saved in localStorage, which every sim UI view shares.
  var USER_KEYS = ["corner", "x", "y", "scale", "showTuning", "showContact", "showAtis", "showReadback", "readbackDetail", "keepLast",
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
    atis: "",            // new ATIS letter, shown until atisUntil
    atisUntil: 0,
    atisLetter: "",      // last "ATIS Current" box seen
    seenInfo: false,     // the first InfoBoxes after connecting is the snapshot, not a change
  };
  var socket = null;
  var timers = { reconnect: 0, linger: 0, error: 0, tune: 0, missed: 0, confirm: 0, swHide: 0, atis: 0, demo: 0, ptt: 0, pttShow: 0, swap: 0, poll: 0 };
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
    '<div class="bc-head"><span>BATC Comms Pill</span><span class="bc-btn bc-x" data-act="close">' +
      // drawn, not the ✕ glyph: the sim's font set it off-center
      '<svg viewBox="0 0 10 10"><path d="M2 2l6 6M8 2l-6 6"/></svg></span></div>' +
    '<div class="bc-tabs"><span class="bc-btn bc-tab" data-tab="display">Display</span>' +
      '<span class="bc-btn bc-tab" data-tab="position">Position</span></div>' +
    '<div class="bc-pane" data-pane="display">' +
      toggleRow("Readback hints", "showReadback") +
      choiceRow("readbackDetail", [["none", "None"], ["short", "Short"], ["hint", "Hint"], ["boxes", "Boxes"]]) +
      toggleRow("Keep last clearance", "keepLast") +
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

  function tuneLook(t) {
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

  // who else is on the frequency right now: "ATC talking", "Traffic talking", or "" (an ATIS doesn't count)
  function busyWith() {
    if (state.mode === "speaking") {
      if (state.speaker === "atc" || state.speaker === "atcTraffic") return "ATC talking";
      if (state.speaker === "traffic") return "Traffic talking";
    }
    if (state.mode === "traffic" && /transmitting/i.test(state.text) && !/^atis/i.test(state.text)) {
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
        if (CONFIG.showTuning) return tuneLook({ label: "", facility: { name: "Montpellier Tower", freq: "118.700" } });
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
    if (state.pttShown && CONFIG.showPtt) return pttLook();

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
          v = replyLook("s-you", BARS, "Transmitting", "bp-who");
        }
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
        if (state.tune && now < state.tuneUntil && !confirming()) {
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
        } else if (state.kept && CONFIG.keepLast && CONFIG.showReadback && (v = keptLook(state.kept))) {
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
    if (state.muted && !/\bis-dot\b/.test(v.cls)) v.html += MUTE;
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

  // instant: swap the content without the fade-out first (PTT should react when you press)
  function render(instant) {
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
    var replies = waiting ? list.filter(function (s) { return s && !/^(say again|cancel\b)/i.test(s); }) : [];
    var key = "¬" + replies.join("¬"); // never "", which means not waiting
    if (waiting && key !== state.repliesKey) {
      // the instruction or question is the last ATC line (empty when we connected mid-exchange)
      state.readback = { text: clip(state.atcText), facility: state.facility, calls: 1,
        negative: /^negative\b/i.test(state.atcText) };
      state.answered = state.replied = false;
      state.missed = null;
    } else if (!waiting) {
      var wc = waitingFor();
      if (state.readback && state.replied && state.autoTune && /^handoff$/i.test(wc.kind)) {
        // a handoff with Auto Tune on: BeyondATC retunes COM1 at once, and the radio change says it all
        state.confirmed = state.kept = null;
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
        var c = contactIn(payload);
        if (c && !state.autoTune && !onContact(c)) state.contact = c;
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
            state.readback = { text: clip(payload), facility: state.facility, calls: 1, negative: false };
          } else if (!state.answered && !negative) {
            state.readback.calls++;
          }
          if (negative || readbackHint(payload)) {
            state.readback.text = clip(payload);
            state.readback.negative = negative;
          }
          if (negative) state.replied = false; // that reply didn't count
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
          state.kept = null; // a new station: the last clearance belongs to the old one
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
      state.kept = null;
      showSwitches(false);
      render();
      if (!destroyed) timers.reconnect = setTimeout(connect, CONFIG.reconnectMs);
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
    state.editing = open;
    if (open) showSwitches(false);
    card.className = open ? "" : "is-closed";
    shade.className = open ? "" : "is-closed";
    if (open) shade.setAttribute("data-input-group", "BATC-PILL");
    else shade.removeAttribute("data-input-group");
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

  root.addEventListener("click", function (e) {
    // the kept clearance's ✕ hides it; anywhere else opens the settings
    for (var el = e.target; el && el !== root; el = el.parentNode) {
      if (el.className && String(el.className.baseVal || el.className).indexOf("bp-unpin") >= 0) {
        if (state.editing) break; // the settings sample: just a click on the pill
        state.kept = null;
        render();
        return;
      }
    }
    openCard(!state.editing);
  });

  // While the card is open, a transparent layer behind it (and the pill) takes the clicks elsewhere and closes
  // it: the sim keeps clicks that land on no element of ours, so the page never sees them otherwise.
  var shade = document.createElement("div");
  shade.id = "batc-pill-shade";
  shade.className = "is-closed";
  document.body.appendChild(shade);
  shade.addEventListener("click", function () { openCard(false); });


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
  // Mousemove reaches mainUi whatever is under the cursor, so hovering is worked out from positions: the
  // buttons open over the pill and stay while the mouse is over the pill, the buttons or the gap between.

  function canSwitch() {
    return state.connected && state.inFlight && !state.editing && current !== null &&
      current !== "hidden";
  }

  function onMouseMove(e) {
    if (!canSwitch()) { if (switchesOpen) showSwitches(false); return; }
    var r = root.getBoundingClientRect();
    var a = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    if (switchesOpen) {
      var b = switches.getBoundingClientRect();
      a = { left: Math.min(a.left, b.left), right: Math.max(a.right, b.right),
        top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) };
    }
    var m = switchesOpen ? 8 : 0;
    var inside = e.clientX >= a.left - m && e.clientX <= a.right + m && e.clientY >= a.top - m && e.clientY <= a.bottom + m;
    if (inside) {
      clearTimeout(timers.swHide);
      timers.swHide = 0;
      if (!switchesOpen) showSwitches(true);
    } else if (switchesOpen && !timers.swHide) {
      timers.swHide = setTimeout(function () { timers.swHide = 0; showSwitches(false); }, 350);
    }
  }

  function showSwitches(open) {
    switchesOpen = open;
    switches.className = open ? "" : "is-closed";
    // clicks need data-input-group on the exact element under the cursor (see openCard)
    for (var i = 0; i < switchEls.length; i++) {
      if (open) switchEls[i].setAttribute("data-input-group", "BATC-PILL");
      else switchEls[i].removeAttribute("data-input-group");
    }
    if (open) { placeSwitches(); updateSwitches(); }
  }

  function placeSwitches() {
    // beside the pill, on its side, away from the screen edge it sits on
    var r = root.getBoundingClientRect();
    var gap = 6 * 0.000926 * window.innerHeight;
    var st = switches.style;
    st.top = st.bottom = st.left = st.right = "";
    if (root.getAttribute("data-side") === "left") st.left = r.left + "px";
    else st.right = window.innerWidth - r.right + "px";
    switches.setAttribute("data-edge", /^bottom/.test(CONFIG.corner) ? "bottom" : "top");
    if (/^bottom/.test(CONFIG.corner)) st.bottom = window.innerHeight - r.top + gap + "px";
    else st.top = r.bottom + gap + "px";
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
    if (!el || el === switches || !socket || socket.readyState !== 1) return;
    // the same commands as BeyondATC's toolbar switches; it then sends the new state to every client
    if (el.getAttribute("data-sw") === "autotune") {
      state.autoTune = !state.autoTune;
      if (state.autoTune) state.contact = null;
      socket.send("set_autotune: " + state.autoTune);
    } else {
      state.autoRespond = !state.autoRespond;
      socket.send("set_autorespond: " + state.autoRespond);
    }
    updateSwitches();
    render();
  });

  document.addEventListener("mousemove", onMouseMove);

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
      if (shown) render(true);
    }, state.pttRepeating ? PTT_REPEAT_MS : PTT_FIRST_MS);
    if (!held) {
      // still held after pttDelayMs (the sim repeats from ~0.4 s): show it
      clearTimeout(timers.pttShow);
      timers.pttShow = setTimeout(function () { state.pttShown = true; render(true); }, CONFIG.pttDelayMs);
    }
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
    if (switches.parentNode) switches.parentNode.removeChild(switches);
    document.removeEventListener("mousemove", onMouseMove);
    if (shade.parentNode) shade.parentNode.removeChild(shade);
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
