# 💬 TakeThatChat

Crea **screenshot di finte chat** per scherzare con gli amici. Stile "app di
messaggistica" — riconoscibile ma con identità propria (nome, colori e dettagli
volutamente diversi da WhatsApp).

Nessun build, nessun account, nessun server: è una singola pagina statica che
gira interamente nel browser. Le immagini vengono generate in locale e **non
vengono caricate da nessuna parte**.

## Funzioni

- 📝 Aggiungi messaggi in entrata ("Loro") e in uscita ("Io")
- 💬 Tipi di messaggio: **testo, vocale, audio, foto, video** (foto/video resi come immagine nello screenshot, con anteprima, tasto play e durata)
- 🔀 Riordina i messaggi con drag & drop, modifica testo, durata e orario al volo
- ✓✓ Spunte personalizzabili (inviato / consegnato / letto in blu)
- 👤 Nome contatto, stato ("online", "sta scrivendo…", "ultimo accesso…") e avatar
- 📶 Barra di stato: ora, operatore, percentuale batteria
- 🎨 Tema chiaro/scuro, sfondi diversi e colore d'accento personalizzabile
- 📱 **Ottimizzata per il mobile**: layout responsive, controlli grandi, riordino
  dei messaggi con pulsanti ↑↓ (oltre al drag & drop su desktop)
- 📸 Esporta in **PNG o JPG**, proporzioni **9:16** (TikTok/storie) o **naturali**
- 🎬 Esporta in **video** pronto per **TikTok**: verticale **9:16 a 720×1280**, in
  **MP4** dove il browser lo supporta (Safari/iOS, Chrome recente), altrimenti WebM.
  I messaggi compaiono uno alla volta, botta e risposta (con bolla "sta
  scrivendo…"). Encoding a **frame rate costante (30fps)**: dove disponibile usa
  **WebCodecs** (H.264 con timestamp esatti, nessun jitter → fluido anche dopo il
  ri-caricamento/ri-codifica di TikTok), con fallback automatico a MediaRecorder.
- 🎧 **Riproduzione simulata**: nel video, quando compare un vocale/audio/video
  si simula la pressione del **play** e resta in riproduzione (con avanzamento)
  per un numero di secondi **configurabile**

## Come si usa

Apri `index.html` in un browser. Tutto qui.

Oppure servilo localmente:

```bash
python3 -m http.server 8000
# poi vai su http://localhost:8000
```

### Online (GitHub Pages)

Il repo include un workflow che pubblica il sito su GitHub Pages a ogni push su
`main`. Per attivarlo: **Settings → Pages → Source: GitHub Actions**.

## Struttura

```
index.html                 markup dell'app
styles.css                 stile ed estetica del "telefono"
app.js                     logica (stato, render, export)
vendor/html2canvas.min.js  libreria per l'export PNG (offline)
```

## ⚠️ Uso responsabile

TakeThatChat è uno strumento **satirico/parodia**. Le conversazioni generate
sono **finte** e servono a farsi due risate. **Non** usarlo per:

- truffe, phishing o estorsioni;
- diffamare o mettere in cattiva luce persone reali;
- far credere che una conversazione falsa sia autentica (es. come "prova").

L'uso improprio è responsabilità di chi lo fa.

## Crediti

Creato da **[@iltempe](https://github.com/iltempe)** — [dad, computer science
engineer, civic hacker e songwriter](https://github.com/iltempe).

Repository: [github.com/iltempe/takethatchat](https://github.com/iltempe/takethatchat)

## Licenza

[MIT](LICENSE)
