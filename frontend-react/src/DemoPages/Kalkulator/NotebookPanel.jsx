import React, { useState, useRef, useEffect } from "react";
import "./NotebookPanel.css";

// ─── Helpers ────────────────────────────────────────────────────────────────
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── NotebookPanel ───────────────────────────────────────────────────────────
export default function NotebookPanel({
  selectedClient,
  nbApiStatus,
  nbCreating,
  nbPodcastLoading,
  nbPodcastStatus,
  nbAddingSource,
  onCreateNotebook,
  onAddCaseSummary,
  onGeneratePodcast,
  selectedId,
  clients,
  setClients,
  eventLabel,
}) {
  // ── Chat state ──────────────────────────────────────────────────────────
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [nbChat, setNbChat] = useState([]);
  const chatEndRef = useRef(null);

  // ── Sources state ───────────────────────────────────────────────────────
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceUrlName, setSourceUrlName] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [sourceTextTitle, setSourceTextTitle] = useState("");
  const [addingText, setAddingText] = useState(false);
  const [sourceTab, setSourceTab] = useState("list"); // "list" | "url" | "text"
  const [sourceMsg, setSourceMsg] = useState(null); // {type:"ok"|"err", text}

  // ── Studio state ────────────────────────────────────────────────────────
  const [studioTab, setStudioTab] = useState("audio"); // "audio" | "mindmap" | "reports"
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryText, setSummaryText] = useState("");

  // Reset chat when client changes
  useEffect(() => {
    setNbChat([]);
    setChatInput("");
    setSourceMsg(null);
    setSummaryText("");
  }, [selectedId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [nbChat]);

  // ── Chat send ───────────────────────────────────────────────────────────
  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatLoading(true);
    const client = clients.find((c) => c.id === selectedId);
    const userEntry = { id: genId(), role: "user", content: userMsg };
    setNbChat((prev) => [...prev, userEntry]);

    const systemPrompt = `Jesteś asystentem prawnym dla kancelarii zajmującej się służebnościami przesyłu i odszkodowaniami za linie energetyczne.
Klient: ${client.firstName} ${client.lastName}, nr sprawy: ${client.caseNumber || "brak"}, status: ${client.status || "aktywna"}.
Wynagrodzenie: ${client.compensation ? Number(client.compensation).toLocaleString("pl-PL") + " zł" : "nie ustalono"}, zapłacone: ${client.compensationPaid ? "TAK" : "NIE"}.
Analizy (${(client.analyses || []).length}): ${(client.analyses || []).map((a, i) => `${i + 1}. Działka ${a.parcelId || "?"}, Track A: ${a.trackA || "?"} zł, Track B: ${a.trackB || "?"} zł, Razem: ${a.total || "?"} zł`).join("; ") || "brak"}.
Dokumenty: ${(client.files || []).map((f) => f.name).join(", ") || "brak"}.
Historia: ${(client.timeline || []).map((e) => `[${e.date}] ${eventLabel(e.type)}: ${e.text}`).join("; ") || "brak"}.
Notatki: ${client.notes || "brak"}.
Odpowiadaj po polsku, konkretnie i profesjonalnie.`;

    try {
      const history = nbChat.slice(-8).map((m) => ({ role: m.role, content: m.content }));
      const resp = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: userMsg },
          ],
        }),
      });
      const data = await resp.json();
      setNbChat((prev) => [
        ...prev,
        { id: genId(), role: "assistant", content: data.reply || data.message || "Brak odpowiedzi." },
      ]);
    } catch {
      setNbChat((prev) => [
        ...prev,
        { id: genId(), role: "assistant", content: "⚠️ Błąd połączenia z AI. Sprawdź czy backend działa." },
      ]);
    }
    setChatLoading(false);
  }

  // ── Add URL source ──────────────────────────────────────────────────────
  async function addUrlSource() {
    if (!sourceUrl.trim() || !selectedClient?.notebookLmId) return;
    setAddingUrl(true);
    setSourceMsg(null);
    try {
      const resp = await fetch("/api/notebooklm/sources/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notebook_id: selectedClient.notebookLmId,
          url: sourceUrl.trim(),
          source_name: sourceUrlName.trim() || sourceUrl.trim(),
        }),
      });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.detail || resp.statusText); }
      setSourceMsg({ type: "ok", text: "✅ Źródło URL dodane do notebooka." });
      setSourceUrl(""); setSourceUrlName(""); setSourceTab("list");
    } catch (e) {
      setSourceMsg({ type: "err", text: `❌ ${e.message}` });
    }
    setAddingUrl(false);
  }

  // ── Add text source ─────────────────────────────────────────────────────
  async function addTextSource() {
    if (!sourceText.trim() || !selectedClient?.notebookLmId) return;
    setAddingText(true);
    setSourceMsg(null);
    try {
      const resp = await fetch("/api/notebooklm/sources/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notebook_id: selectedClient.notebookLmId,
          source_title: sourceTextTitle.trim() || "Notatka",
          content: sourceText.trim(),
        }),
      });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.detail || resp.statusText); }
      setSourceMsg({ type: "ok", text: "✅ Tekst dodany jako źródło do notebooka." });
      setSourceText(""); setSourceTextTitle(""); setSourceTab("list");
    } catch (e) {
      setSourceMsg({ type: "err", text: `❌ ${e.message}` });
    }
    setAddingText(false);
  }

  // ── Generate summary ────────────────────────────────────────────────────
  async function generateSummary() {
    const client = clients.find((c) => c.id === selectedId);
    if (!client || summaryLoading) return;
    setSummaryLoading(true);
    setSummaryText("");
    const systemPrompt = `Jesteś asystentem prawnym. Wygeneruj profesjonalne streszczenie sprawy służebności przesyłu dla kancelarii.`;
    const content = `Klient: ${client.firstName} ${client.lastName}\nNr sprawy: ${client.caseNumber || "brak"}\nAdres: ${client.address || "brak"}\nStatus: ${client.status || "aktywna"}\nWynagrodzenie: ${client.compensation ? Number(client.compensation).toLocaleString("pl-PL") + " zł" : "nie ustalono"}\nZapłacone: ${client.compensationPaid ? "TAK" : "NIE"}\nAnalizy: ${(client.analyses || []).map((a) => `Działka ${a.parcelId}: Track A=${a.trackA} zł, Track B=${a.trackB} zł, Razem=${a.total} zł`).join("; ") || "brak"}\nHistoria: ${(client.timeline || []).map((e) => `[${e.date}] ${eventLabel(e.type)}: ${e.text}`).join("; ") || "brak"}\nNotatki: ${client.notes || "brak"}`;
    try {
      const resp = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Wygeneruj streszczenie tej sprawy:\n\n${content}` },
          ],
        }),
      });
      const data = await resp.json();
      setSummaryText(data.reply || data.message || "Brak odpowiedzi.");
    } catch {
      setSummaryText("⚠️ Błąd generowania streszczenia.");
    }
    setSummaryLoading(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const hasNotebook = !!(selectedClient?.notebookLmId && selectedClient?.notebookLmUrl);

  return (
    <div className="nbp-root">
      {/* ── TOP BAR ── */}
      <div className="nbp-topbar">
        <div className="nbp-topbar-left">
          <span className="nbp-topbar-icon">📓</span>
          <div>
            <div className="nbp-topbar-title">NotebookLM Enterprise</div>
            <div className="nbp-topbar-sub">
              {hasNotebook
                ? <><span className="nbp-status-dot nbp-status-ok"></span> Notebook aktywny</>
                : <><span className="nbp-status-dot nbp-status-off"></span> Brak notebooka</>}
              {nbApiStatus && (
                <span className="nbp-api-badge">
                  {nbApiStatus.configured
                    ? <span className="nbp-api-ok">✅ API aktywne</span>
                    : <span className="nbp-api-err">⚠️ {nbApiStatus.message}</span>}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="nbp-topbar-right">
          {selectedClient?.notebookLmUrl && (
            <a
              href={selectedClient.notebookLmUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="cp-btn cp-btn-nb-open"
              title="Otwórz pełny NotebookLM w nowej karcie"
            >
              🔗 Otwórz NotebookLM ↗
            </a>
          )}
          {nbApiStatus?.configured && !selectedClient?.notebookLmId && (
            <button
              className="cp-btn cp-btn-nb-create"
              onClick={onCreateNotebook}
              disabled={nbCreating}
            >
              {nbCreating ? "⏳ Tworzę…" : "✨ Utwórz notebook automatycznie"}
            </button>
          )}
        </div>
      </div>

      {/* ── NO NOTEBOOK STATE ── */}
      {!hasNotebook && (
        <div className="nbp-empty">
          <div className="nbp-empty-icon">📓</div>
          <div className="nbp-empty-title">Brak notebooka dla tej sprawy</div>
          <div className="nbp-empty-text">
            {nbApiStatus?.configured
              ? "Kliknij ✨ Utwórz notebook automatycznie — system stworzy notebook i doda streszczenie sprawy jako pierwsze źródło."
              : "Skonfiguruj NotebookLM Enterprise API lub dodaj link ręcznie w zakładce AI Asystent."}
          </div>
        </div>
      )}

      {/* ── 3-COLUMN PANEL ── */}
      {hasNotebook && (
        <div className="nbp-columns">

          {/* ═══ KOLUMNA 1: ŹRÓDŁA ═══ */}
          <div className="nbp-col nbp-col-sources">
            <div className="nbp-col-header">
              <span className="nbp-col-icon">📚</span>
              <span className="nbp-col-title">Źródła</span>
              <div className="nbp-col-header-actions">
                <button
                  className={`nbp-src-tab-btn ${sourceTab === "url" ? "active" : ""}`}
                  onClick={() => setSourceTab(sourceTab === "url" ? "list" : "url")}
                  title="Dodaj URL"
                >+ URL</button>
                <button
                  className={`nbp-src-tab-btn ${sourceTab === "text" ? "active" : ""}`}
                  onClick={() => setSourceTab(sourceTab === "text" ? "list" : "text")}
                  title="Dodaj tekst"
                >+ Tekst</button>
              </div>
            </div>

            {sourceMsg && (
              <div className={`nbp-src-msg ${sourceMsg.type === "ok" ? "nbp-src-msg-ok" : "nbp-src-msg-err"}`}>
                {sourceMsg.text}
                <button className="nbp-src-msg-close" onClick={() => setSourceMsg(null)}>✕</button>
              </div>
            )}

            {/* Add URL form */}
            {sourceTab === "url" && (
              <div className="nbp-src-form">
                <div className="nbp-src-form-title">Dodaj źródło URL</div>
                <input
                  className="cp-input nbp-src-input"
                  placeholder="https://..."
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addUrlSource(); }}
                />
                <input
                  className="cp-input nbp-src-input"
                  placeholder="Nazwa źródła (opcjonalna)"
                  value={sourceUrlName}
                  onChange={(e) => setSourceUrlName(e.target.value)}
                />
                <button
                  className="cp-btn cp-btn-primary nbp-src-submit"
                  onClick={addUrlSource}
                  disabled={addingUrl || !sourceUrl.trim()}
                >
                  {addingUrl ? "⏳ Dodaję…" : "Dodaj URL"}
                </button>
              </div>
            )}

            {/* Add text form */}
            {sourceTab === "text" && (
              <div className="nbp-src-form">
                <div className="nbp-src-form-title">Dodaj źródło tekstowe</div>
                <input
                  className="cp-input nbp-src-input"
                  placeholder="Tytuł źródła"
                  value={sourceTextTitle}
                  onChange={(e) => setSourceTextTitle(e.target.value)}
                />
                <textarea
                  className="cp-input nbp-src-textarea"
                  placeholder="Wklej treść dokumentu, notatki, pisma…"
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  rows={6}
                />
                <button
                  className="cp-btn cp-btn-primary nbp-src-submit"
                  onClick={addTextSource}
                  disabled={addingText || !sourceText.trim()}
                >
                  {addingText ? "⏳ Dodaję…" : "Dodaj tekst"}
                </button>
              </div>
            )}

            {/* Sources list */}
            {sourceTab === "list" && (
              <div className="nbp-src-list">
                {/* Streszczenie sprawy — zawsze jako pierwsze źródło */}
                <div className="nbp-src-item nbp-src-item-system">
                  <span className="nbp-src-item-icon">📋</span>
                  <div className="nbp-src-item-info">
                    <div className="nbp-src-item-name">Streszczenie sprawy</div>
                    <div className="nbp-src-item-sub">Automatycznie generowane</div>
                  </div>
                  <button
                    className="nbp-src-item-sync"
                    onClick={onAddCaseSummary}
                    disabled={nbAddingSource}
                    title="Synchronizuj streszczenie z NotebookLM"
                  >
                    {nbAddingSource ? "⏳" : "🔄"}
                  </button>
                </div>

                {/* Dokumenty klienta */}
                {(selectedClient.files || []).length > 0 && (
                  <>
                    <div className="nbp-src-section-label">Dokumenty klienta</div>
                    {(selectedClient.files || []).map((f) => (
                      <div key={f.id} className="nbp-src-item">
                        <span className="nbp-src-item-icon">
                          {f.type?.includes("pdf") ? "📕" : f.type?.includes("image") ? "🖼️" : "📄"}
                        </span>
                        <div className="nbp-src-item-info">
                          <div className="nbp-src-item-name">{f.name}</div>
                          <div className="nbp-src-item-sub">
                            {f.size ? `${(f.size / 1024).toFixed(0)} KB` : ""} · {f.date ? new Date(f.date).toLocaleDateString("pl-PL") : ""}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Analizy */}
                {(selectedClient.analyses || []).length > 0 && (
                  <>
                    <div className="nbp-src-section-label">Analizy działek</div>
                    {(selectedClient.analyses || []).map((a, i) => (
                      <div key={i} className="nbp-src-item">
                        <span className="nbp-src-item-icon">📊</span>
                        <div className="nbp-src-item-info">
                          <div className="nbp-src-item-name">Działka {a.parcelId || `#${i + 1}`}</div>
                          <div className="nbp-src-item-sub">
                            Razem: {a.total ? Number(a.total).toLocaleString("pl-PL") + " zł" : "—"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {(selectedClient.files || []).length === 0 && (selectedClient.analyses || []).length === 0 && (
                  <div className="nbp-src-empty">
                    <div>Brak dokumentów i analiz.</div>
                    <div className="nbp-src-empty-hint">Dodaj URL lub tekst używając przycisków powyżej.</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ═══ KOLUMNA 2: CZAT ═══ */}
          <div className="nbp-col nbp-col-chat">
            <div className="nbp-col-header">
              <span className="nbp-col-icon">💬</span>
              <span className="nbp-col-title">Czat</span>
              {nbChat.length > 0 && (
                <button
                  className="nbp-clear-btn"
                  onClick={() => { if (window.confirm("Wyczyścić historię czatu?")) setNbChat([]); }}
                  title="Wyczyść czat"
                >🗑</button>
              )}
            </div>

            <div className="nbp-chat-messages">
              {nbChat.length === 0 && (
                <div className="nbp-chat-welcome">
                  <div className="nbp-chat-welcome-icon">🤖</div>
                  <div className="nbp-chat-welcome-title">Asystent NotebookLM</div>
                  <div className="nbp-chat-welcome-text">
                    Zadaj pytanie o sprawę klienta. Asystent zna dane, analizy i historię.
                  </div>
                  <div className="nbp-chat-suggestions">
                    {[
                      "Jakie są kolejne kroki w tej sprawie?",
                      "Podsumuj stan sprawy",
                      "Napisz pismo do operatora sieci",
                      "Jak obliczyć wynagrodzenie za służebność?",
                    ].map((s) => (
                      <button key={s} className="nbp-chat-suggestion" onClick={() => setChatInput(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {nbChat.map((msg) => (
                <div key={msg.id} className={`nbp-msg nbp-msg-${msg.role}`}>
                  <div className="nbp-msg-avatar">{msg.role === "user" ? "👤" : "🤖"}</div>
                  <div className="nbp-msg-bubble">
                    <div className="nbp-msg-content">{msg.content}</div>
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="nbp-msg nbp-msg-assistant">
                  <div className="nbp-msg-avatar">🤖</div>
                  <div className="nbp-msg-bubble nbp-msg-loading">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="nbp-chat-input-row">
              <textarea
                className="nbp-chat-input"
                placeholder="Zadaj pytanie o sprawę…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                rows={2}
              />
              <button
                className="nbp-chat-send"
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
              >
                {chatLoading ? "⏳" : "➤"}
              </button>
            </div>
          </div>

          {/* ═══ KOLUMNA 3: STUDIO ═══ */}
          <div className="nbp-col nbp-col-studio">
            <div className="nbp-col-header">
              <span className="nbp-col-icon">🎛️</span>
              <span className="nbp-col-title">Studio</span>
            </div>

            {/* Studio sub-tabs */}
            <div className="nbp-studio-tabs">
              {[
                { key: "audio", icon: "🎧", label: "Audio Overview" },
                { key: "summary", icon: "📝", label: "Streszczenie" },
                { key: "reports", icon: "📊", label: "Raporty" },
              ].map((t) => (
                <button
                  key={t.key}
                  className={`nbp-studio-tab ${studioTab === t.key ? "active" : ""}`}
                  onClick={() => setStudioTab(t.key)}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {/* Audio Overview */}
            {studioTab === "audio" && (
              <div className="nbp-studio-section">
                <div className="nbp-studio-card">
                  <div className="nbp-studio-card-icon">🎧</div>
                  <div className="nbp-studio-card-title">Audio Overview</div>
                  <div className="nbp-studio-card-desc">
                    Wygeneruj 10-minutowy audio-brief sprawy. AI omówi kluczowe aspekty prawne i finansowe.
                  </div>
                  <button
                    className="cp-btn cp-btn-podcast"
                    onClick={onGeneratePodcast}
                    disabled={nbPodcastLoading}
                  >
                    {nbPodcastLoading ? "⏳ Generuję audio…" : "🎧 Generuj Audio-Brief"}
                  </button>
                  {nbPodcastStatus && (
                    <div className="nbp-podcast-status">
                      {nbPodcastStatus.status === "AUDIO_OVERVIEW_STATUS_IN_PROGRESS" && (
                        <div className="nbp-podcast-progress">
                          <div className="nbp-podcast-spinner"></div>
                          <span>Generowanie audio-briefu… (1–2 min)</span>
                        </div>
                      )}
                      {nbPodcastStatus.status === "AUDIO_OVERVIEW_STATUS_COMPLETE" && (
                        <div className="nbp-podcast-done">
                          ✅ Audio-brief gotowy!{" "}
                          <a href={selectedClient.notebookLmUrl} target="_blank" rel="noopener noreferrer">
                            Otwórz w NotebookLM ↗
                          </a>
                        </div>
                      )}
                      {nbPodcastStatus.status === "AUDIO_OVERVIEW_STATUS_FAILED" && (
                        <div className="nbp-podcast-err">❌ Błąd generowania. Spróbuj ponownie.</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="nbp-studio-card nbp-studio-card-secondary">
                  <div className="nbp-studio-card-icon">🗺️</div>
                  <div className="nbp-studio-card-title">Mind Map</div>
                  <div className="nbp-studio-card-desc">
                    Mapa myśli dostępna w pełnym NotebookLM.
                  </div>
                  <a
                    href={selectedClient.notebookLmUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cp-btn cp-btn-ghost"
                  >
                    Otwórz Mind Map ↗
                  </a>
                </div>
              </div>
            )}

            {/* Streszczenie */}
            {studioTab === "summary" && (
              <div className="nbp-studio-section">
                <div className="nbp-studio-card">
                  <div className="nbp-studio-card-icon">📝</div>
                  <div className="nbp-studio-card-title">Streszczenie sprawy</div>
                  <div className="nbp-studio-card-desc">
                    Wygeneruj streszczenie AI na podstawie danych klienta, analiz i historii.
                  </div>
                  <div className="nbp-studio-card-actions">
                    <button
                      className="cp-btn cp-btn-primary"
                      onClick={generateSummary}
                      disabled={summaryLoading}
                    >
                      {summaryLoading ? "⏳ Generuję…" : "✨ Generuj streszczenie"}
                    </button>
                    {summaryText && (
                      <button
                        className="cp-btn cp-btn-ghost"
                        onClick={onAddCaseSummary}
                        disabled={nbAddingSource}
                        title="Wyślij streszczenie do NotebookLM jako źródło"
                      >
                        {nbAddingSource ? "⏳" : "🔄 Synchronizuj z NotebookLM"}
                      </button>
                    )}
                  </div>
                  {summaryText && (
                    <div className="nbp-summary-box">
                      <div className="nbp-summary-text">{summaryText}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Raporty */}
            {studioTab === "reports" && (
              <div className="nbp-studio-section">
                <div className="nbp-studio-card">
                  <div className="nbp-studio-card-icon">📊</div>
                  <div className="nbp-studio-card-title">Raporty sprawy</div>
                  <div className="nbp-studio-card-desc">
                    Study Guide, FAQ i inne raporty dostępne w pełnym NotebookLM.
                  </div>
                  <a
                    href={selectedClient.notebookLmUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cp-btn cp-btn-nb-open"
                  >
                    📊 Otwórz Raporty w NotebookLM ↗
                  </a>
                </div>

                {/* Quick stats */}
                <div className="nbp-reports-stats">
                  <div className="nbp-reports-stat">
                    <div className="nbp-reports-stat-val">{(selectedClient.analyses || []).length}</div>
                    <div className="nbp-reports-stat-label">Analizy działek</div>
                  </div>
                  <div className="nbp-reports-stat">
                    <div className="nbp-reports-stat-val">{(selectedClient.files || []).length}</div>
                    <div className="nbp-reports-stat-label">Dokumenty</div>
                  </div>
                  <div className="nbp-reports-stat">
                    <div className="nbp-reports-stat-val">{(selectedClient.timeline || []).length}</div>
                    <div className="nbp-reports-stat-label">Wpisy historii</div>
                  </div>
                  <div className="nbp-reports-stat">
                    <div className="nbp-reports-stat-val">
                      {selectedClient.compensation
                        ? Number(selectedClient.compensation).toLocaleString("pl-PL") + " zł"
                        : "—"}
                    </div>
                    <div className="nbp-reports-stat-label">Wynagrodzenie</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
