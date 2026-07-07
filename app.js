/* TakeThatChat — generatore di finte chat per scherzare.
   Nessuna dipendenza di build: vanilla JS + html2canvas per l'export PNG.
   Tipi di messaggio: testo, vocale, audio, foto, video (media resi come immagine). */

(function () {
  "use strict";

  // ============================================================
  // Tracker visite (analytics privata su Supabase).
  // Riempi url e anonKey col tuo progetto: finché sono vuoti è disattivato.
  // La chiave "anon" è pubblica per definizione; i dati restano privati grazie
  // alle policy RLS (inserimento consentito, lettura no).
  // ============================================================
  const ANALYTICS = {
    url: "",      // es. "https://xxxx.supabase.co"
    anonKey: "",  // chiave publishable/anon del progetto
  };

  function trackVisit() {
    try {
      if (!ANALYTICS.url || !ANALYTICS.anonKey) return; // non configurato
      let sid = null;
      try { sid = localStorage.getItem("ttc_sid"); } catch (e) { /* ignora */ }
      if (!sid) {
        sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
        try { localStorage.setItem("ttc_sid", sid); } catch (e) { /* ignora */ }
      }
      const body = {
        path: location.pathname,
        referrer: document.referrer || null,
        lang: navigator.language || null,
        screen: (screen.width || 0) + "x" + (screen.height || 0),
        session: sid,
        user_agent: (navigator.userAgent || "").slice(0, 300),
      };
      fetch(ANALYTICS.url.replace(/\/$/, "") + "/rest/v1/visits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANALYTICS.anonKey,
          Authorization: "Bearer " + ANALYTICS.anonKey,
          Prefer: "return=minimal",
        },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(function () { /* mai bloccare l'app per il tracker */ });
    } catch (e) { /* mai bloccare l'app per il tracker */ }
  }

  // ---- Stato ----
  const STORAGE_KEY = "takethatchat_default_v1";
  function demoMessages() {
    return [
      { id: uid(), type: "text", side: "in", text: "Hai già cenato?", time: "21:45", tick: "read" },
      { id: uid(), type: "voice", side: "out", duration: "0:08", time: "21:46", tick: "read" },
      { id: uid(), type: "text", side: "in", text: "Ahah che scemo. Ti tengo la pasta 🍝", time: "21:47", tick: "delivered" },
    ];
  }
  const state = {
    messages: demoMessages(),
    nextSide: "in",
    avatar: null, // data URL dell'avatar (per poterlo salvare)
  };

  const TICKS = { none: "", sent: "✓", delivered: "✓✓", read: "✓✓" };
  const TYPE_LABEL = { text: "💬", voice: "🎤", audio: "🎵", photo: "🖼️", video: "🎬" };
  const DEFAULT_DUR = { voice: "0:08", audio: "2:34", video: "0:15" };

  // ---- Helpers ----
  function uid() { return Math.random().toString(36).slice(2, 9); }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function nowTime() {
    const d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function initials(name) {
    const parts = name.trim().replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }
  // Waveform deterministica basata sull'id (non cambia tra i render)
  function waveform(seed, n) {
    let s = 2166136261;
    for (const c of seed) s = (Math.imul(s ^ c.charCodeAt(0), 16777619)) >>> 0;
    const bars = [];
    for (let i = 0; i < n; i++) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      bars.push(28 + (s % 72));
    }
    return bars;
  }

  // ---- Rendering delle bolle ----
  function metaHTML(m) {
    const tick = TICKS[m.tick] || "";
    const tickCls = m.tick === "read" ? "b-tick read" : "b-tick";
    return (
      `<span class="meta"><span class="b-time">${esc(m.time || "")}</span>` +
      (m.side === "out" && tick ? `<span class="${tickCls}">${tick}</span>` : "") +
      `</span>`
    );
  }

  function textHTML(m) {
    return `${esc(m.text)}${metaHTML(m)}`;
  }

  const PAUSE_BARS = `<span class="pausebars"><i></i><i></i></span>`;

  // playing: null = fermo; numero 0..1 = in riproduzione con avanzamento
  function voiceHTML(m, playing) {
    const bars = waveform(m.id, 26);
    const played = playing == null ? -1 : Math.round(playing * (bars.length - 1));
    const barsHTML = bars
      .map((h, i) => `<i class="${playing != null && i <= played ? "on" : ""}" style="height:${h}%"></i>`)
      .join("");
    const icon = m.type === "audio" ? "🎵" : "🎤";
    const btn = playing != null
      ? `<span class="v-play playing">${PAUSE_BARS}</span>`
      : `<span class="v-play">▶</span>`;
    return (
      `<div class="voice-inner">` + btn +
      `<span class="v-wave">${barsHTML}</span>` +
      `<span class="v-meta"><span class="v-dur">${esc(m.duration || DEFAULT_DUR[m.type] || "0:08")}</span>` +
      `<span class="v-icon">${icon}</span></span>` +
      `</div>` +
      metaHTML(m)
    );
  }

  function mediaHTML(m, playing) {
    const hasCap = m.text && m.text.trim();
    const img = m.media
      ? `<img src="${m.media}" alt="" crossorigin="anonymous" />`
      : `<div class="media-empty">${m.type === "video" ? "🎬" : "🖼️"}<span>nessuna immagine</span></div>`;
    let overlay = "";
    if (m.type === "video") {
      overlay =
        (playing != null
          ? `<span class="media-play playing">${PAUSE_BARS}</span>` +
            `<span class="media-progress"><i style="width:${Math.round(playing * 100)}%"></i></span>`
          : `<span class="media-play">▶</span>`) +
        `<span class="media-badge">🎬 ${esc(m.duration || DEFAULT_DUR.video)}</span>`;
    }
    const tick = TICKS[m.tick] || "";
    const tickOverlay =
      !hasCap
        ? `<span class="media-time">${esc(m.time || "")}` +
          (m.side === "out" && tick ? `<span class="${m.tick === "read" ? "b-tick read" : "b-tick"}">${tick}</span>` : "") +
          `</span>`
        : "";
    const caption = hasCap ? `<div class="media-cap">${esc(m.text)}${metaHTML(m)}</div>` : "";
    return `<div class="media-wrap">${img}${overlay}${tickOverlay}</div>${caption}`;
  }

  function bubbleInner(m, playing) {
    if (m.type === "voice" || m.type === "audio") return voiceHTML(m, playing);
    if (m.type === "photo" || m.type === "video") return mediaHTML(m, playing);
    return textHTML(m);
  }

  function bubbleClass(m) {
    if (m.type === "voice" || m.type === "audio") return "voice";
    if (m.type === "photo" || m.type === "video") return "media";
    return "text";
  }

  function bubbleHTML(m, playing) {
    const p = playing && playing.id === m.id ? playing.progress : null;
    return `<div class="bubble ${bubbleClass(m)} ${m.side}">${bubbleInner(m, p)}</div>`;
  }

  function typingHTML(side) {
    return `<div class="bubble text ${side} typing"><span class="typing-dots"><i></i><i></i><i></i></span></div>`;
  }

  // Costruisce l'HTML per una lista di messaggi, con eventuale bolla "sta scrivendo…"
  // e un eventuale messaggio "in riproduzione" (playing = {id, progress}).
  function messagesHTML(list, typing, playing) {
    let html = list.map((m) => bubbleHTML(m, playing)).join("");
    if (typing) html += typingHTML(typing);
    return html;
  }

  function renderMessages() {
    $("chat-messages").innerHTML = messagesHTML(state.messages, null, null);
  }

  function renderHeader() {
    const name = $("contact-name").value || " ";
    $("ch-name").textContent = name;
    $("ch-status").textContent = $("contact-status").value;
    const initEl = $("ch-avatar-initials");
    if (initEl) initEl.textContent = initials(name);
  }

  function renderStatusbar() {
    $("sb-time").textContent = $("phone-time").value || nowTime();
    $("sb-carrier").textContent = $("phone-carrier").value;
    let b = parseInt($("phone-battery").value, 10);
    if (isNaN(b)) b = 100;
    b = Math.max(0, Math.min(100, b));
    $("sb-batt-num").textContent = b;
    $("sb-batt-fill").style.width = b + "%";
  }

  function renderAppearance() {
    $("capture").classList.toggle("dark", $("chat-theme").value === "dark");
    $("chat-body").className = "chat-body wp-" + $("chat-wallpaper").value;
    document.documentElement.style.setProperty("--accent", $("accent-color").value);
  }

  function renderAll() {
    renderHeader();
    renderStatusbar();
    renderAppearance();
    renderMessages();
    renderEditorList();
  }

  // ---- Editor lista messaggi ----
  function renderEditorList() {
    const ul = $("msg-list");
    ul.innerHTML = "";
    state.messages.forEach((m) => {
      const li = document.createElement("li");
      li.className = "msg-row";
      li.draggable = true;
      li.dataset.id = m.id;

      let middle;
      if (m.type === "voice" || m.type === "audio") {
        middle =
          `<span class="type-tag">${TYPE_LABEL[m.type]}</span>` +
          `<input class="dur" type="text" value="${esc(m.duration || DEFAULT_DUR[m.type] || "")}" placeholder="durata" title="Durata" />` +
          `<span class="type-name">${m.type === "audio" ? "Audio" : "Vocale"}</span>`;
      } else if (m.type === "photo" || m.type === "video") {
        const thumb = m.media
          ? `<img class="thumb" src="${m.media}" alt="" title="Clicca per cambiare immagine" />`
          : `<button type="button" class="thumb thumb-empty" title="Scegli immagine">＋</button>`;
        middle =
          `<span class="type-tag">${TYPE_LABEL[m.type]}</span>` +
          thumb +
          `<input class="txt cap" type="text" value="${esc(m.text || "")}" placeholder="Didascalia (opz.)" />` +
          (m.type === "video"
            ? `<input class="dur" type="text" value="${esc(m.duration || DEFAULT_DUR.video)}" placeholder="0:15" title="Durata" />`
            : "") +
          `<input type="file" class="row-media" accept="image/*" hidden />`;
      } else {
        middle = `<input class="txt" type="text" value="${esc(m.text || "")}" placeholder="Testo del messaggio" />`;
      }

      li.innerHTML = `
        <span class="reorder">
          <button class="mv up" type="button" title="Sposta su" aria-label="Sposta su">▲</button>
          <button class="mv down" type="button" title="Sposta giù" aria-label="Sposta giù">▼</button>
        </span>
        <span class="drag" title="Trascina">⠿</span>
        <button class="who ${m.side}" type="button" title="Cambia mittente">${m.side === "out" ? "Io" : "Loro"}</button>
        ${middle}
        <input class="txt-time" type="text" value="${esc(m.time || "")}" title="Ora" />
        <select class="tick-sel" title="Spunte">
          <option value="none">–</option>
          <option value="sent">✓</option>
          <option value="delivered">✓✓</option>
          <option value="read">✓✓ blu</option>
        </select>
        <button class="del" type="button" title="Elimina">✕</button>`;

      const tickSel = li.querySelector(".tick-sel");
      tickSel.value = m.tick;
      tickSel.disabled = m.side !== "out";
      tickSel.style.opacity = m.side !== "out" ? 0.35 : 1;

      // eventi comuni
      li.querySelector(".who").addEventListener("click", () => {
        m.side = m.side === "out" ? "in" : "out";
        renderAll();
      });
      li.querySelector(".txt-time").addEventListener("input", (e) => { m.time = e.target.value; renderMessages(); });
      tickSel.addEventListener("change", (e) => { m.tick = e.target.value; renderMessages(); });
      li.querySelector(".del").addEventListener("click", () => {
        state.messages = state.messages.filter((x) => x.id !== m.id);
        renderAll();
      });
      li.querySelector(".mv.up").addEventListener("click", () => moveMsg(m.id, -1));
      li.querySelector(".mv.down").addEventListener("click", () => moveMsg(m.id, 1));

      // eventi per tipo
      const txt = li.querySelector(".txt");
      if (txt) txt.addEventListener("input", (e) => { m.text = e.target.value; renderMessages(); });
      const dur = li.querySelector(".dur");
      if (dur) dur.addEventListener("input", (e) => { m.duration = e.target.value; renderMessages(); });
      const thumb = li.querySelector(".thumb");
      const rowFile = li.querySelector(".row-media");
      if (thumb && rowFile) {
        thumb.addEventListener("click", () => rowFile.click());
        rowFile.addEventListener("change", (e) => {
          const file = e.target.files[0];
          if (!file) return;
          readImage(file, (url) => { m.media = url; renderAll(); });
        });
      }

      addDnD(li);
      ul.appendChild(li);
    });
  }

  // ---- Riordino con pulsanti su/giù ----
  function moveMsg(id, dir) {
    const i = state.messages.findIndex((m) => m.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= state.messages.length) return;
    const [m] = state.messages.splice(i, 1);
    state.messages.splice(j, 0, m);
    renderAll();
  }

  // ---- Drag & drop riordino (desktop) ----
  let dragId = null;
  function addDnD(li) {
    li.addEventListener("dragstart", (e) => {
      // non iniziare il drag partendo dai campi di testo
      if (e.target.closest("input, select, .thumb")) { e.preventDefault(); return; }
      dragId = li.dataset.id;
      li.classList.add("dragging");
    });
    li.addEventListener("dragend", () => { dragId = null; li.classList.remove("dragging"); });
    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      const overId = li.dataset.id;
      if (!dragId || dragId === overId) return;
      const from = state.messages.findIndex((m) => m.id === dragId);
      const to = state.messages.findIndex((m) => m.id === overId);
      if (from < 0 || to < 0) return;
      const [moved] = state.messages.splice(from, 1);
      state.messages.splice(to, 0, moved);
      renderAll();
    });
  }

  // ---- Aggiungi messaggio ----
  function readImage(file, cb) {
    const reader = new FileReader();
    reader.onload = () => cb(reader.result);
    reader.readAsDataURL(file);
  }

  function pushMessage(extra) {
    state.messages.push(Object.assign(
      { id: uid(), side: state.nextSide, time: $("phone-time").value || nowTime(), tick: state.nextSide === "out" ? "read" : "none" },
      extra
    ));
    renderAll();
  }

  function addMessage() {
    const type = $("new-msg-type").value;
    const input = $("new-msg-text");
    const val = input.value.trim();

    if (type === "photo" || type === "video") {
      // apre il selettore file; la didascalia è il testo eventuale
      $("new-media-file").click();
      return;
    }
    if (type === "voice" || type === "audio") {
      pushMessage({ type, duration: val || DEFAULT_DUR[type] });
      input.value = "";
      input.focus();
      return;
    }
    // testo
    if (!val) return;
    pushMessage({ type: "text", text: val });
    input.value = "";
    input.focus();
  }

  // ---- Avatar ----
  function setAvatar(dataUrl) {
    state.avatar = dataUrl || null;
    const el = $("ch-avatar");
    if (dataUrl) {
      el.innerHTML = `<img src="${dataUrl}" alt="" crossorigin="anonymous" />`;
    } else {
      el.innerHTML = `<span id="ch-avatar-initials">${initials($("contact-name").value)}</span>`;
    }
  }

  // ---- Salvataggio conversazione predefinita (localStorage) ----
  const FIELD_IDS = [
    "contact-name", "contact-status", "phone-time", "phone-carrier", "phone-battery",
    "chat-theme", "chat-wallpaper", "accent-color", "media-play-secs",
  ];

  function snapshotFields() {
    const o = {};
    FIELD_IDS.forEach((id) => { const el = $(id); if (el) o[id] = el.value; });
    return o;
  }

  function serializeState() {
    return {
      v: 1,
      messages: state.messages,
      avatar: state.avatar || null,
      fields: snapshotFields(),
      progressBar: $("video-progress-bar").checked,
    };
  }

  function applyState(s) {
    if (!s) return;
    if (Array.isArray(s.messages)) {
      state.messages = s.messages.map((m) => Object.assign({}, m, { id: m.id || uid() }));
    }
    if (s.fields) {
      Object.keys(s.fields).forEach((id) => { const el = $(id); if (el) el.value = s.fields[id]; });
    }
    if (typeof s.progressBar === "boolean") $("video-progress-bar").checked = s.progressBar;
    setAvatar(s.avatar || null);
    renderAll();
  }

  // valori di partenza (demo), catturati prima di caricare un'eventuale predefinita
  let DEFAULT_SNAPSHOT = null;

  function saveDefault() {
    const btn = $("save-default");
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
      const old = btn.textContent;
      btn.textContent = "✓ Salvata";
      setTimeout(() => { btn.textContent = old; }, 1500);
    } catch (e) {
      alert(
        "Non riesco a salvare la conversazione predefinita.\n" +
        (String(e).match(/quota|exceeded/i)
          ? "Probabilmente le immagini (avatar/foto) sono troppo grandi per lo spazio del browser: prova con immagini più piccole."
          : e.message)
      );
    }
  }

  function resetDemo() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignora */ }
    applyState(DEFAULT_SNAPSHOT || { messages: demoMessages(), fields: {}, avatar: null, progressBar: true });
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // ---- Export immagine (PNG/JPG, naturale o 9:16) ----
  // Adatta lo screenshot dentro una tela 9:16 riempiendo lo sfondo.
  function fit9x16(src) {
    const target = document.createElement("canvas");
    const ratio = 9 / 16;
    // la tela ha la stessa larghezza dello screenshot, altezza = larghezza/ (9/16)
    let w = src.width;
    let h = Math.round(w / ratio);
    if (h < src.height) { h = src.height; w = Math.round(h * ratio); }
    target.width = w;
    target.height = h;
    const ctx = target.getContext("2d");
    // sfondo: sfumatura con il colore d'accento per riempire i bordi
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#128a5a";
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, accent);
    grad.addColorStop(1, "#0b141a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // screenshot centrato
    const x = Math.round((w - src.width) / 2);
    const y = Math.round((h - src.height) / 2);
    ctx.drawImage(src, x, y);
    return target;
  }

  async function exportImage() {
    const btn = $("btn-export");
    const old = btn.textContent;
    btn.textContent = "⏳ Genero…";
    btn.disabled = true;
    try {
      const format = $("export-format").value; // png | jpg
      const ratio = $("export-ratio").value; // natural | 9x16
      let canvas = await html2canvas($("capture"), {
        backgroundColor: format === "jpg" ? "#0b141a" : null,
        scale: Math.min(3, (window.devicePixelRatio || 1) * 2),
        useCORS: true,
        logging: false,
      });
      if (ratio === "9x16") canvas = fit9x16(canvas);

      const isJpg = format === "jpg";
      const mime = isJpg ? "image/jpeg" : "image/png";
      const ext = isJpg ? "jpg" : "png";
      const name = ($("contact-name").value || "chat").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 24);
      const link = document.createElement("a");
      link.download = `takethatchat_${name || "chat"}${ratio === "9x16" ? "_9x16" : ""}.${ext}`;
      link.href = canvas.toDataURL(mime, isJpg ? 0.92 : undefined);
      link.click();
    } catch (err) {
      alert("Ops, export non riuscito: " + err.message);
    } finally {
      btn.textContent = old;
      btn.disabled = false;
    }
  }

  // ---- Export VIDEO (messaggi che appaiono uno alla volta) ----
  const VIDEO_SAFE_MAX = 60; // tetto di sicurezza in secondi
  const VIDEO_FPS = 30;      // frame rate COSTANTE (importante per TikTok)

  function pickVideoMime() {
    // MP4/H.264 per primo: è il formato che TikTok (e il rullino di iPhone) accettano meglio.
    const candidates = [
      "video/mp4;codecs=h264",
      "video/mp4;codecs=avc1",
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    for (const c of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
    }
    return "";
  }

  // --- WebCodecs: encoding deterministico a frame rate costante (ideale per TikTok) ---
  function hasWebCodecs() {
    return typeof window.VideoEncoder === "function" &&
      typeof window.VideoFrame === "function" &&
      window.Mp4Muxer && typeof window.Mp4Muxer.Muxer === "function";
  }

  async function pickAvcCodec(W, H) {
    const cands = ["avc1.640028", "avc1.4D0028", "avc1.42E028", "avc1.4D401F", "avc1.42E01F"];
    for (const codec of cands) {
      try {
        const s = await VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate: 6000000, framerate: VIDEO_FPS });
        if (s && s.supported) return codec;
      } catch (e) { /* prova il prossimo */ }
    }
    return null;
  }

  // Restituisce un Blob MP4 valido, oppure null (→ si usa il fallback). Non lancia
  // mai per errori "attesi": qualsiasi problema fa tornare null così l'export ripiega.
  // Sonda: alcuni Safari espongono VideoEncoder ma non producono output utilizzabile.
  // Codifichiamo 2 frame di prova (una volta sola) per decidere se fidarci di WebCodecs.
  let _wcProbe;
  async function webCodecsUsable(W, H) {
    if (_wcProbe !== undefined) return _wcProbe;
    _wcProbe = false;
    if (!hasWebCodecs()) return _wcProbe;
    try {
      const codec = await pickAvcCodec(W, H);
      if (!codec) return _wcProbe;
      const { Muxer, ArrayBufferTarget } = window.Mp4Muxer;
      const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: "avc", width: W, height: H, frameRate: VIDEO_FPS }, fastStart: "in-memory" });
      let n = 0, err = null;
      const enc = new VideoEncoder({ output: (c, m) => { n++; try { muxer.addVideoChunk(c, m); } catch (e) { err = e; } }, error: (e) => { err = e; } });
      enc.configure({ codec, width: W, height: H, bitrate: 1000000, framerate: VIDEO_FPS });
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const cx = cv.getContext("2d"); cx.fillStyle = "#123456"; cx.fillRect(0, 0, W, H);
      for (let i = 0; i < 2; i++) { const vf = new VideoFrame(cv, { timestamp: i * 33333, duration: 33333 }); enc.encode(vf, { keyFrame: i === 0 }); vf.close(); }
      await enc.flush();
      try { enc.close(); } catch (e) { /* ignora */ }
      _wcProbe = !err && n > 0;
    } catch (e) { _wcProbe = false; }
    return _wcProbe;
  }

  async function encodeCFR(paint, total, W, H, onProgress) {
    if (!window.Mp4Muxer) return null;
    const codec = await pickAvcCodec(W, H);
    if (!codec) return null;
    const { Muxer, ArrayBufferTarget } = window.Mp4Muxer;
    let muxer, encoder, encErr = null, chunkCount = 0;
    try {
      muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: "avc", width: W, height: H, frameRate: VIDEO_FPS },
        fastStart: "in-memory",
      });
      encoder = new VideoEncoder({
        output: (chunk, meta) => { chunkCount++; try { muxer.addVideoChunk(chunk, meta); } catch (e) { encErr = e; } },
        error: (e) => { encErr = e; },
      });
      encoder.configure({ codec, width: W, height: H, bitrate: 9000000, framerate: VIDEO_FPS });

      const off = document.createElement("canvas");
      off.width = W; off.height = H;
      const octx = off.getContext("2d");
      const totalFrames = Math.max(1, Math.round(total * VIDEO_FPS));
      const frameDurUs = 1e6 / VIDEO_FPS;

      for (let i = 0; i < totalFrames; i++) {
        if (encErr) return null;
        paint(octx, i / VIDEO_FPS);
        const vf = new VideoFrame(off, { timestamp: Math.round(i * frameDurUs), duration: Math.round(frameDurUs) });
        encoder.encode(vf, { keyFrame: i % VIDEO_FPS === 0 }); // keyframe ogni secondo
        vf.close();
        if (encoder.encodeQueueSize > 8 || i % 6 === 0) {
          await new Promise((r) => setTimeout(r, 0));
          if (onProgress) onProgress(i / totalFrames);
        }
      }
      await encoder.flush();
      try { encoder.close(); } catch (e) { /* ignora */ }

      // Se l'encoder non ha prodotto nulla (capita su alcuni Safari), ripiega.
      if (encErr || chunkCount === 0) return null;
      muxer.finalize();
      const buf = muxer.target && muxer.target.buffer;
      if (!buf || buf.byteLength < 512) return null;
      return new Blob([buf], { type: "video/mp4" });
    } catch (e) {
      console.warn("encodeCFR fallito:", e);
      return null;
    }
  }

  // --- Fallback: MediaRecorder che campiona il canvas a fps fisso ---
  function recordWithMediaRecorder(paint, total, W, H, mime) {
    return new Promise((resolve, reject) => {
      const out = document.createElement("canvas");
      out.width = W; out.height = H;
      const ctx = out.getContext("2d");
      paint(ctx, 0);
      let stream;
      try { stream = out.captureStream(VIDEO_FPS); } catch (e) { reject(e); return; }
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 9000000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
      rec.onerror = (e) => reject(e.error || new Error("Errore di registrazione"));
      rec.start();
      const t0 = performance.now();
      function frame() {
        const t = (performance.now() - t0) / 1000;
        paint(ctx, Math.min(t, total));
        if (t >= total) { rec.stop(); return; }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  async function exportVideo() {
    const btn = $("btn-video");
    const canRecord = !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);
    const webcodecs = hasWebCodecs();
    if (!webcodecs && !canRecord) {
      alert("Il tuo browser non supporta l'export video. Usa Chrome, Edge o Safari recenti.");
      return;
    }
    const mime = canRecord ? pickVideoMime() : "";
    if (!webcodecs && !mime) { alert("Nessun formato video supportato dal browser."); return; }
    if (!state.messages.length) { alert("Aggiungi almeno un messaggio."); return; }

    const old = btn.textContent;
    btn.disabled = true;
    $("btn-export").disabled = true;

    const chatBox = $("chat-messages");
    const savedHTML = chatBox.innerHTML;
    // Il video è pensato per le storie/TikTok: sempre verticale 9:16.
    const vertical = $("export-ratio").value !== "natural";
    // Secondi di "ascolto/visione" simulati per vocali, audio e video.
    let mediaPlay = parseFloat($("media-play-secs").value);
    if (isNaN(mediaPlay)) mediaPlay = 4;
    mediaPlay = Math.max(0.5, Math.min(15, mediaPlay));

    try {
      // 1) Pre-render dei fotogrammi: costruisce una sequenza di segmenti {canvas, dur}
      const msgs = state.messages;
      const N = msgs.length;
      const startHold = 0.5, endHold = 1.4, appearBeat = 0.5;

      async function shot(list, typing, playing) {
        chatBox.innerHTML = messagesHTML(list, typing, playing);
        let c = await html2canvas($("capture"), { backgroundColor: "#0b141a", scale: 2, useCORS: true, logging: false });
        if (vertical) c = fit9x16(c);
        return c;
      }

      const seq = [];
      btn.textContent = "⏳ 0%";
      seq.push({ canvas: await shot([], null, null), dur: startHold });

      for (let i = 1; i <= N; i++) {
        const m = msgs[i - 1];
        const upto = msgs.slice(0, i);
        // bolla "sta scrivendo…" prima dei messaggi in entrata
        if (m.side === "in") {
          seq.push({ canvas: await shot(msgs.slice(0, i - 1), "in", null), dur: 0.9 });
        }
        // il messaggio compare (stato "fermo", play ▶ visibile)
        const appear = await shot(upto, null, null);
        seq.push({ canvas: appear, dur: appearBeat });

        const playable = m.type === "voice" || m.type === "audio" || m.type === "video";
        if (playable) {
          // pressione play + riproduzione per mediaPlay secondi con avanzamento
          const steps = Math.min(10, Math.max(3, Math.round(mediaPlay / 0.6)));
          for (let k = 1; k <= steps; k++) {
            const progress = k / steps;
            const cv = await shot(upto, null, { id: m.id, progress });
            seq.push({ canvas: cv, dur: mediaPlay / steps });
          }
        } else {
          // testo o foto: tempo per leggere
          const len = (m.text || "").length;
          const readBeat = Math.min(3.2, Math.max(1.2, len * 0.045)) + (m.type === "photo" ? 0.9 : 0);
          seq.push({ canvas: appear, dur: readBeat });
        }
        btn.textContent = "⏳ " + Math.round((i / N) * 100) + "%";
      }
      seq[seq.length - 1].dur += endHold;
      chatBox.innerHTML = savedHTML;

      // tetto di sicurezza: se troppo lungo, comprime proporzionalmente
      let total = seq.reduce((a, s) => a + s.dur, 0);
      if (total > VIDEO_SAFE_MAX) {
        const k = VIDEO_SAFE_MAX / total;
        seq.forEach((s) => (s.dur *= k));
        total = VIDEO_SAFE_MAX;
      }
      // tempi cumulativi per la ricerca del fotogramma corrente
      let accCum = 0;
      for (const s of seq) { s.start = accCum; accCum += s.dur; }
      const frameAt = (t) => {
        for (const s of seq) { if (t < s.start + s.dur) return s.canvas; }
        return seq[seq.length - 1].canvas;
      };

      // 2) Encoding del video
      const W = vertical ? 720 : seq[0].canvas.width;
      const H = vertical ? 1280 : seq[0].canvas.height;
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#128a5a";
      const barH = Math.max(4, Math.round(H * 0.007));

      // Compositore: disegna il fotogramma + una barra "storia" in alto che avanza
      // in modo continuo. Così OGNI frame è diverso dal precedente e TikTok non
      // tratta il video come statico (è questo che causava gli scatti).
      const showBar = $("video-progress-bar").checked;
      function paint(dctx, t) {
        dctx.globalAlpha = 1;
        dctx.fillStyle = "#0b141a"; dctx.fillRect(0, 0, W, H);
        dctx.drawImage(frameAt(t), 0, 0, W, H);
        if (showBar) {
          const p = Math.max(0, Math.min(1, total ? t / total : 1));
          dctx.fillStyle = "rgba(0,0,0,0.30)"; dctx.fillRect(0, 0, W, barH);
          dctx.fillStyle = "#ffffff"; dctx.fillRect(0, 0, Math.round(W * p), barH);
        }
      }

      let blob = null, ext = "mp4";

      // Primario: WebCodecs → frame rate COSTANTE deterministico (niente jitter da
      // tempo reale). È questo che rende la riproduzione fluida anche dopo il
      // ri-caricamento su TikTok. Solo se la sonda conferma che funziona davvero.
      if (await webCodecsUsable(W, H)) {
        try {
          btn.textContent = "🎞️ 0%";
          blob = await encodeCFR(paint, total, W, H, (p) => { btn.textContent = "🎞️ " + Math.round(p * 100) + "%"; });
        } catch (e) {
          console.warn("WebCodecs non riuscito, uso MediaRecorder:", e);
          blob = null;
        }
      }

      // Fallback: MediaRecorder (campiona il canvas a fps fisso). Serve anche
      // quando WebCodecs c'è ma non produce un file valido (capita su alcuni Safari).
      if (!blob || blob.size < 1024) {
        if (!mime) throw new Error("Il browser non ha un encoder video utilizzabile.");
        btn.textContent = "🔴 Registro…";
        blob = await recordWithMediaRecorder(paint, total, W, H, mime);
        ext = mime.indexOf("mp4") >= 0 ? "mp4" : "webm";
      }

      // Non scaricare MAI un file vuoto/corrotto (era la causa del file illeggibile).
      if (!blob || blob.size < 1024) {
        throw new Error("il video è risultato vuoto. Riprova; se sei su Safari/iPhone, prova a disattivare la barra di avanzamento o aggiorna iOS.");
      }

      const name = ($("contact-name").value || "chat").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 24);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `takethatchat_${name || "chat"}${vertical ? "_9x16" : ""}.${ext}`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      if (ext === "webm") {
        setTimeout(() => alert(
          "Video salvato in .webm (verticale 9:16).\n\n" +
          "Per TikTok è meglio l'MP4: esporta da Chrome/Edge o Safari recenti, " +
          "dove viene generato automaticamente in MP4 a frame rate costante."
        ), 300);
      }
    } catch (err) {
      chatBox.innerHTML = savedHTML;
      alert("Ops, export video non riuscito: " + err.message);
    } finally {
      btn.textContent = old;
      btn.disabled = false;
      $("btn-export").disabled = false;
    }
  }

  // ---- Placeholder dinamico in base al tipo ----
  function updateAddPlaceholder() {
    const type = $("new-msg-type").value;
    const input = $("new-msg-text");
    const btn = $("add-msg-btn");
    const map = {
      text: ["Scrivi un messaggio e premi Invio…", "Aggiungi"],
      voice: ["Durata (es. 0:08)", "Aggiungi 🎤"],
      audio: ["Durata (es. 2:34)", "Aggiungi 🎵"],
      photo: ["Didascalia (opzionale)", "Scegli foto 🖼️"],
      video: ["Didascalia (opzionale)", "Scegli video 🎬"],
    };
    input.placeholder = map[type][0];
    btn.textContent = map[type][1];
  }

  // ---- Bind eventi ----
  function bind() {
    ["contact-name", "contact-status"].forEach((id) => $(id).addEventListener("input", renderHeader));
    ["phone-time", "phone-carrier", "phone-battery"].forEach((id) => $(id).addEventListener("input", renderStatusbar));
    ["chat-theme", "chat-wallpaper", "accent-color"].forEach((id) => $(id).addEventListener("input", renderAppearance));

    $("new-msg-type").addEventListener("change", updateAddPlaceholder);
    $("add-msg-btn").addEventListener("click", addMessage);
    $("new-msg-text").addEventListener("keydown", (e) => { if (e.key === "Enter") addMessage(); });

    $("new-media-file").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const type = $("new-msg-type").value;
      const cap = $("new-msg-text").value.trim();
      readImage(file, (url) => {
        pushMessage({ type, media: url, text: cap, duration: type === "video" ? DEFAULT_DUR.video : undefined });
        $("new-msg-text").value = "";
        e.target.value = "";
      });
    });

    document.querySelectorAll(".side-btn").forEach((b) =>
      b.addEventListener("click", () => {
        document.querySelectorAll(".side-btn").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        state.nextSide = b.dataset.side;
      })
    );

    $("avatar-file").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      readImage(file, setAvatar);
    });
    $("avatar-clear").addEventListener("click", () => { $("avatar-file").value = ""; setAvatar(null); });

    $("btn-export").addEventListener("click", exportImage);
    $("btn-video").addEventListener("click", exportVideo);
    $("save-default").addEventListener("click", saveDefault);
    $("reset-demo").addEventListener("click", resetDemo);
    $("btn-theme").addEventListener("click", () => document.body.classList.toggle("light"));
  }

  // ---- Init ----
  bind();
  updateAddPlaceholder();
  // cattura i valori demo (dai default dell'HTML) prima di caricare una predefinita
  DEFAULT_SNAPSHOT = {
    messages: demoMessages(),
    fields: snapshotFields(),
    avatar: null,
    progressBar: $("video-progress-bar").checked,
  };
  const saved = loadSaved();
  if (saved) applyState(saved);
  else renderAll();

  trackVisit();
})();
