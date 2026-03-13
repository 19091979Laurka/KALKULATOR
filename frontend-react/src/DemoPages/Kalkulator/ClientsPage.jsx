import React, { useState, useEffect, useRef } from "react";
import "./ClientsPage.css";

const STORAGE_KEY = "ksws_clients_v2";
function loadClients() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { const old = localStorage.getItem("ksws_clients_v1"); return old ? JSON.parse(old) : []; }
    return JSON.parse(raw);
  } catch { return []; }
}
function saveClients(list) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {} }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function fmtDate(iso) { if (!iso) return "—"; try { return new Date(iso).toLocaleDateString("pl-PL"); } catch { return iso; } }
function fmtSize(bytes) { if (!bytes) return ""; if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`; return `${(bytes / 1048576).toFixed(1)} MB`; }
function fmtDateTime(iso) { if (!iso) return "—"; try { const d = new Date(iso); return d.toLocaleDateString("pl-PL") + " " + d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }); } catch { return iso; } }

const EMPTY_CLIENT = {
  id: null, firstName: "", lastName: "", email: "", phone: "",
  address: "", caseNumber: "", notes: "", status: "aktywna", createdAt: "",
  dateWniosekStarostwo: "", datePismoOperatora: "", dateWyslanieDoOperatora: "",
  compensation: "", compensationPaid: false, compensationDate: "",
  analyses: [], files: [], timeline: [], notebookLmUrl: "", aiChat: [],
};

const EVENT_TYPES = [
  { value: "pismo_wyslane",   label: "📤 Pismo wysłane",       color: "#6a4c93" },
  { value: "wniosek_zlozony", label: "📋 Wniosek złożony",     color: "#3a86ff" },
  { value: "odpowiedz",       label: "📩 Odpowiedź otrzymana", color: "#06d6a0" },
  { value: "spotkanie",       label: "🤝 Spotkanie",           color: "#ffd166" },
  { value: "platnosc",        label: "💰 Płatność",            color: "#06d6a0" },
  { value: "notatka",         label: "📝 Notatka",             color: "#9b9faa" },
  { value: "inne",            label: "📌 Inne",                color: "#ff6b6b" },
];
function eventColor(type) { return EVENT_TYPES.find((e) => e.value === type)?.color || "#9b9faa"; }
function eventLabel(type) { return EVENT_TYPES.find((e) => e.value === type)?.label || type; }

export default function ClientsPage() {
  const [clients, setClients]       = useState(loadClients);
  const [selectedId, setSelectedId] = useState(null);
  const [showForm, setShowForm]     = useState(false);
  const [editData, setEditData]     = useState(EMPTY_CLIENT);
  const [search, setSearch]         = useState("");
  const [activeTab, setActiveTab]   = useState("dashboard");
  const [fileNote, setFileNote]     = useState("");
  const fileInputRef                = useRef(null);
  const [newEventType, setNewEventType] = useState("notatka");
  const [newEventText, setNewEventText] = useState("");
  const [newEventDate, setNewEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [aiInput, setAiInput]   = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const aiChatEndRef             = useRef(null);

  useEffect(() => { saveClients(clients); }, [clients]);
  useEffect(() => { if (activeTab === "ai") aiChatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [clients, activeTab]);

  const selectedClient = clients.find((c) => c.id === selectedId) || null;
  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return !q || `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) || (c.caseNumber || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q);
  });

  function openNew() { setEditData({ ...EMPTY_CLIENT, id: null, createdAt: new Date().toISOString() }); setShowForm(true); }
  function openEdit(client) { setEditData({ ...client }); setShowForm(true); }
  function saveClient() {
    const isNew = !editData.id;
    const entry = { ...editData, id: editData.id || genId() };
    setClients(isNew ? [entry, ...clients] : clients.map((c) => (c.id === entry.id ? entry : c)));
    setSelectedId(entry.id); setShowForm(false);
  }
  function deleteClient(id) {
    if (!window.confirm("Usunąć klienta i wszystkie dane?")) return;
    setClients((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !selectedClient) return;
    const meta = { id: genId(), name: file.name, size: file.size, type: file.type, date: new Date().toISOString(), note: fileNote.trim(), data: null };
    if (file.size <= 4 * 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = (ev) => { meta.data = ev.target.result; attachFileTo(meta); };
      reader.readAsDataURL(file);
    } else { meta.tooLarge = true; attachFileTo(meta); }
    setFileNote(""); e.target.value = "";
  }
  function attachFileTo(meta) { setClients((prev) => prev.map((c) => c.id === selectedId ? { ...c, files: [meta, ...(c.files || [])] } : c)); }
  function downloadFile(file) { if (!file.data) return; const a = document.createElement("a"); a.href = file.data; a.download = file.name; a.click(); }
  function removeFile(fileId) { setClients((prev) => prev.map((c) => c.id === selectedId ? { ...c, files: (c.files || []).filter((f) => f.id !== fileId) } : c)); }
  function fileIcon(type) {
    if (!type) return "📄"; if (type.includes("pdf")) return "📕"; if (type.includes("image")) return "🖼️";
    if (type.includes("word") || type.includes("document")) return "📝"; if (type.includes("excel") || type.includes("spreadsheet")) return "📊"; return "📄";
  }

  function addTimelineEvent() {
    if (!newEventText.trim() || !selectedClient) return;
    const event = { id: genId(), type: newEventType, text: newEventText.trim(), date: newEventDate || new Date().toISOString().slice(0, 10), createdAt: new Date().toISOString() };
    setClients((prev) => prev.map((c) => c.id === selectedId ? { ...c, timeline: [event, ...(c.timeline || [])] } : c));
    setNewEventText(""); setNewEventDate(new Date().toISOString().slice(0, 10));
  }
  function removeTimelineEvent(eventId) { setClients((prev) => prev.map((c) => c.id === selectedId ? { ...c, timeline: (c.timeline || []).filter((e) => e.id !== eventId) } : c)); }

  async function sendAiMessage() {
    if (!aiInput.trim() || !selectedClient || aiLoading) return;
    const userMsg = aiInput.trim(); setAiInput(""); setAiLoading(true);
    const userEntry = { role: "user", content: userMsg, ts: new Date().toISOString() };
    setClients((prev) => prev.map((c) => c.id === selectedId ? { ...c, aiChat: [...(c.aiChat || []), userEntry] } : c));
    const client = clients.find((c) => c.id === selectedId);
    const systemPrompt = `Jesteś asystentem prawnym dla kancelarii zajmującej się służebnościami przesyłu i odszkodowaniami za linie energetyczne.
Dane klienta: ${client.firstName} ${client.lastName}, email: ${client.email || "brak"}, tel: ${client.phone || "brak"}, adres: ${client.address || "brak"}, nr sprawy: ${client.caseNumber || "brak"}, status: ${client.status || "aktywna"}.
Wynagrodzenie: ${client.compensation ? Number(client.compensation).toLocaleString("pl-PL") + " zł" : "nie ustalono"}, zapłacone: ${client.compensationPaid ? "TAK" : "NIE"}.
Analizy (${(client.analyses || []).length}): ${(client.analyses || []).map((a, i) => `${i + 1}. Działka ${a.parcelId || "?"}, Track A: ${a.trackA || "?"} zł, Track B: ${a.trackB || "?"} zł, Razem: ${a.total || "?"} zł`).join("; ") || "brak"}.
Dokumenty: ${(client.files || []).map((f) => f.name).join(", ") || "brak"}.
Historia: ${(client.timeline || []).map((e) => `[${e.date}] ${eventLabel(e.type)}: ${e.text}`).join("; ") || "brak"}.
Notatki: ${client.notes || "brak"}.
Odpowiadaj po polsku, krótko i konkretnie.`;
    try {
      const response = await fetch("/api/ai-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "system", content: systemPrompt }, ...((client.aiChat || []).slice(-6).map((m) => ({ role: m.role, content: m.content }))), { role: "user", content: userMsg }] }) });
      const data = await response.json();
      const assistantEntry = { role: "assistant", content: data.reply || data.message || "Brak odpowiedzi.", ts: new Date().toISOString() };
      setClients((prev) => prev.map((c) => c.id === selectedId ? { ...c, aiChat: [...(c.aiChat || []), assistantEntry] } : c));
    } catch {
      setClients((prev) => prev.map((c) => c.id === selectedId ? { ...c, aiChat: [...(c.aiChat || []), { role: "assistant", content: "⚠️ Błąd połączenia z AI. Sprawdź czy backend działa.", ts: new Date().toISOString() }] } : c));
    }
    setAiLoading(false);
  }
  function clearAiChat() { if (!window.confirm("Wyczyścić historię rozmowy z AI?")) return; setClients((prev) => prev.map((c) => c.id === selectedId ? { ...c, aiChat: [] } : c)); }

  function statusBadge(status) {
    const map = { aktywna: { label: "Aktywna", cls: "cp-status-active" }, czeka: { label: "Czeka", cls: "cp-status-hold" }, wstrzymana: { label: "Wstrzymana", cls: "cp-status-hold" }, zakonczona: { label: "Zakończona", cls: "cp-status-done" } };
    const s = map[status] || map.aktywna;
    return <span className={`cp-status-badge ${s.cls}`}>{s.label}</span>;
  }

  function getDashboardStats(client) {
    const totalAnalyses = (client.analyses || []).length, totalFiles = (client.files || []).length, totalEvents = (client.timeline || []).length;
    const lastEvent = (client.timeline || [])[0], totalComp = client.compensation ? Number(client.compensation) : 0;
    const bestAnalysis = (client.analyses || []).reduce((best, a) => { const t = Number(a.total) || 0; return t > (Number(best?.total) || 0) ? a : best; }, null);
    return { totalAnalyses, totalFiles, totalEvents, lastEvent, totalComp, bestAnalysis };
  }

  return (
    <div className="cp-root">
      {/* LEFT SIDEBAR */}
      <aside className="cp-sidebar">
        <div className="cp-sidebar-top">
          <div className="cp-sidebar-title"><span>👤</span> Klienci <span className="cp-badge">{clients.length}</span></div>
          <button className="cp-btn cp-btn-add" onClick={openNew}>+ Nowy klient</button>
        </div>
        <div className="cp-search-wrap">
          <input className="cp-search" placeholder="🔍 Szukaj klienta…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="cp-client-list">
          {filtered.length === 0 && <div className="cp-list-empty">Brak klientów</div>}
          {filtered.map((c) => (
            <div key={c.id} className={`cp-client-item ${selectedId === c.id ? "active" : ""}`} onClick={() => { setSelectedId(c.id); setActiveTab("dashboard"); }}>
              <div className="cp-client-avatar">{c.firstName?.[0]}{c.lastName?.[0]}</div>
              <div className="cp-client-info">
                <div className="cp-client-name">{c.firstName} {c.lastName}</div>
                <div className="cp-client-sub">{c.caseNumber ? `#${c.caseNumber}` : c.email || "—"}</div>
              </div>
              <div className="cp-client-meta">{statusBadge(c.status)}</div>
            </div>
          ))}
        </div>
      </aside>

      {/* RIGHT MAIN */}
      <main className="cp-main">
        {!selectedClient && !showForm && (
          <div className="cp-empty-state">
            <div className="cp-empty-icon">👤</div>
            <div className="cp-empty-title">Wybierz klienta</div>
            <div className="cp-empty-sub">lub dodaj nowego aby rozpocząć</div>
            <button className="cp-btn cp-btn-primary" onClick={openNew}>+ Dodaj pierwszego klienta</button>
          </div>
        )}

        {showForm && (
          <div className="cp-form-wrap">
            <div className="cp-form-header">
              <h2>{editData.id ? "Edytuj klienta" : "Nowy klient"}</h2>
              <button className="cp-btn cp-btn-ghost" onClick={() => setShowForm(false)}>✕ Anuluj</button>
            </div>
            <div className="cp-form-grid">
              <div className="cp-form-group"><label>Imię</label><input className="cp-input" value={editData.firstName} onChange={(e) => setEditData({ ...editData, firstName: e.target.value })} placeholder="Jan" /></div>
              <div className="cp-form-group"><label>Nazwisko</label><input className="cp-input" value={editData.lastName} onChange={(e) => setEditData({ ...editData, lastName: e.target.value })} placeholder="Kowalski" /></div>
              <div className="cp-form-group"><label>E-mail</label><input className="cp-input" type="email" value={editData.email} onChange={(e) => setEditData({ ...editData, email: e.target.value })} placeholder="jan@example.com" /></div>
              <div className="cp-form-group"><label>Telefon</label><input className="cp-input" value={editData.phone} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} placeholder="+48 600 000 000" /></div>
              <div className="cp-form-group cp-form-full"><label>Adres</label><input className="cp-input" value={editData.address} onChange={(e) => setEditData({ ...editData, address: e.target.value })} placeholder="ul. Polna 1, 00-001 Warszawa" /></div>
              <div className="cp-form-group"><label>Nr sprawy</label><input className="cp-input" value={editData.caseNumber} onChange={(e) => setEditData({ ...editData, caseNumber: e.target.value })} placeholder="KSWS/2025/001" /></div>
              <div className="cp-form-group"><label>Status</label><select className="cp-input" value={editData.status} onChange={(e) => setEditData({ ...editData, status: e.target.value })}><option value="aktywna">Aktywna</option><option value="czeka">Czeka</option><option value="wstrzymana">Wstrzymana</option><option value="zakonczona">Zakończona</option></select></div>
              <div className="cp-form-group"><label>Wynagrodzenie (zł)</label><input className="cp-input" type="number" value={editData.compensation} onChange={(e) => setEditData({ ...editData, compensation: e.target.value })} placeholder="0.00" /></div>
              <div className="cp-form-group"><label>Data płatności</label><input className="cp-input" type="date" value={editData.compensationDate || ""} onChange={(e) => setEditData({ ...editData, compensationDate: e.target.value })} /></div>
              <div className="cp-form-group cp-form-full"><label>Link NotebookLM</label><input className="cp-input" value={editData.notebookLmUrl || ""} onChange={(e) => setEditData({ ...editData, notebookLmUrl: e.target.value })} placeholder="https://notebooklm.google.com/notebook/..." /></div>
              <div className="cp-form-group cp-form-full"><label>Notatki ogólne</label><textarea className="cp-input cp-textarea" rows={3} value={editData.notes} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} placeholder="Dodatkowe informacje o kliencie…" /></div>
              <div className="cp-form-group"><label>📋 Wniosek do starostwa</label><input className="cp-input" type="date" value={editData.dateWniosekStarostwo || ""} onChange={(e) => setEditData({ ...editData, dateWniosekStarostwo: e.target.value })} /></div>
              <div className="cp-form-group"><label>📤 Wysłane do operatora</label><input className="cp-input" type="date" value={editData.dateWyslanieDoOperatora || ""} onChange={(e) => setEditData({ ...editData, dateWyslanieDoOperatora: e.target.value })} /></div>
              <div className="cp-form-group"><label>📩 Pismo od operatora</label><input className="cp-input" type="date" value={editData.datePismoOperatora || ""} onChange={(e) => setEditData({ ...editData, datePismoOperatora: e.target.value })} /></div>
            </div>
            <div className="cp-form-actions">
              <button className="cp-btn cp-btn-primary" onClick={saveClient}>{editData.id ? "💾 Zapisz zmiany" : "✅ Dodaj klienta"}</button>
              {editData.id && <button className="cp-btn cp-btn-danger" onClick={() => { deleteClient(editData.id); setShowForm(false); }}>🗑 Usuń</button>}
            </div>
          </div>
        )}

        {selectedClient && !showForm && (
          <div className="cp-detail">
            {/* Header */}
            <div className="cp-detail-header">
              <div className="cp-detail-avatar">{selectedClient.firstName?.[0]}{selectedClient.lastName?.[0]}</div>
              <div className="cp-detail-title-wrap">
                <h2 className="cp-detail-name">{selectedClient.firstName} {selectedClient.lastName}</h2>
                <div className="cp-detail-meta-row">
                  {statusBadge(selectedClient.status)}
                  {selectedClient.caseNumber && <span className="cp-detail-case">#{selectedClient.caseNumber}</span>}
                  <span className="cp-detail-date">Dodano: {fmtDate(selectedClient.createdAt)}</span>
                </div>
              </div>
              <div className="cp-detail-header-actions">
                <button className="cp-btn cp-btn-outline" onClick={() => openEdit(selectedClient)}>✏️ Edytuj</button>
                <button className="cp-btn cp-btn-danger" onClick={() => deleteClient(selectedClient.id)}>🗑</button>
              </div>
            </div>

            {/* Tabs */}
            <div className="cp-tabs">
              {[
                { key: "dashboard",     icon: "🏠", label: "Dashboard" },
                { key: "dane",          icon: "👤", label: "Dane" },
                { key: "wynagrodzenie", icon: "💰", label: "Wynagrodzenie" },
                { key: "analizy",       icon: "📊", label: `Analizy (${(selectedClient.analyses || []).length})` },
                { key: "dokumenty",     icon: "📁", label: `Dokumenty (${(selectedClient.files || []).length})` },
                { key: "timeline",      icon: "📅", label: `Historia (${(selectedClient.timeline || []).length})` },
                { key: "ai",            icon: "🤖", label: "AI Asystent" },
              ].map((t) => (
                <button key={t.key} className={`cp-tab ${activeTab === t.key ? "active" : ""}`} onClick={() => setActiveTab(t.key)}>
                  <span className="cp-tab-icon">{t.icon}</span>
                  <span className="cp-tab-label">{t.label}</span>
                </button>
              ))}
            </div>

            {/* DASHBOARD */}
            {activeTab === "dashboard" && (() => {
              const stats = getDashboardStats(selectedClient);
              return (
                <div className="cp-section cp-dashboard">
                  <div className="cp-stats-grid">
                    <div className="cp-stat-card cp-stat-purple"><div className="cp-stat-icon">📊</div><div className="cp-stat-value">{stats.totalAnalyses}</div><div className="cp-stat-label">Analizy działek</div></div>
                    <div className="cp-stat-card cp-stat-blue"><div className="cp-stat-icon">📁</div><div className="cp-stat-value">{stats.totalFiles}</div><div className="cp-stat-label">Dokumenty</div></div>
                    <div className="cp-stat-card cp-stat-green"><div className="cp-stat-icon">💰</div><div className="cp-stat-value">{stats.totalComp > 0 ? stats.totalComp.toLocaleString("pl-PL") + " zł" : "—"}</div><div className="cp-stat-label">Wynagrodzenie</div></div>
                    <div className="cp-stat-card cp-stat-orange"><div className="cp-stat-icon">📅</div><div className="cp-stat-value">{stats.totalEvents}</div><div className="cp-stat-label">Wpisy historii</div></div>
                  </div>
                  <div className="cp-dashboard-row">
                    <div className="cp-dash-card">
                      <div className="cp-dash-card-title">📋 Dane kontaktowe</div>
                      <div className="cp-dash-info-list">
                        <div className="cp-dash-info-item"><span className="cp-dash-info-label">Email</span><span className="cp-dash-info-value">{selectedClient.email || "—"}</span></div>
                        <div className="cp-dash-info-item"><span className="cp-dash-info-label">Telefon</span><span className="cp-dash-info-value">{selectedClient.phone || "—"}</span></div>
                        <div className="cp-dash-info-item"><span className="cp-dash-info-label">Adres</span><span className="cp-dash-info-value">{selectedClient.address || "—"}</span></div>
                      </div>
                    </div>
                    <div className="cp-dash-card">
                      <div className="cp-dash-card-title">⚖️ Przebieg sprawy</div>
                      <div className="cp-case-steps">
                        {[
                          { label: "Wniosek do starostwa", date: selectedClient.dateWniosekStarostwo },
                          { label: "Wysłane do operatora", date: selectedClient.dateWyslanieDoOperatora },
                          { label: "Odpowiedź od operatora", date: selectedClient.datePismoOperatora },
                          { label: "Wynagrodzenie zapłacone", date: selectedClient.compensationPaid ? selectedClient.compensationDate : null, pending: !selectedClient.compensationPaid },
                        ].map((step, i) => (
                          <div key={i} className={`cp-case-step ${step.date ? "done" : ""}`}>
                            <div className="cp-case-step-dot"></div>
                            <div className="cp-case-step-info">
                              <div className="cp-case-step-label">{step.label}</div>
                              <div className="cp-case-step-date">{step.date ? fmtDate(step.date) : step.pending ? "oczekuje" : "—"}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="cp-dash-card">
                      <div className="cp-dash-card-title">📊 Najlepsza analiza</div>
                      {stats.bestAnalysis ? (
                        <div className="cp-dash-analysis">
                          <div className="cp-dash-analysis-parcel"><code>{stats.bestAnalysis.parcelId}</code></div>
                          <div className="cp-dash-analysis-amounts">
                            <div className="cp-dash-amount-row"><span>Track A</span><strong>{stats.bestAnalysis.trackA ? Number(stats.bestAnalysis.trackA).toLocaleString("pl-PL") + " zł" : "—"}</strong></div>
                            <div className="cp-dash-amount-row"><span>Track B</span><strong>{stats.bestAnalysis.trackB ? Number(stats.bestAnalysis.trackB).toLocaleString("pl-PL") + " zł" : "—"}</strong></div>
                            <div className="cp-dash-amount-row cp-dash-total"><span>Razem</span><strong>{stats.bestAnalysis.total ? Number(stats.bestAnalysis.total).toLocaleString("pl-PL") + " zł" : "—"}</strong></div>
                          </div>
                        </div>
                      ) : <div className="cp-dash-empty">Brak analiz</div>}
                    </div>
                  </div>
                  {stats.lastEvent && (
                    <div className="cp-dash-last-event">
                      <div className="cp-dash-card-title">🕐 Ostatnia aktywność</div>
                      <div className="cp-timeline-item" style={{ borderLeftColor: eventColor(stats.lastEvent.type) }}>
                        <div className="cp-timeline-dot" style={{ background: eventColor(stats.lastEvent.type) }}></div>
                        <div className="cp-timeline-content">
                          <div className="cp-timeline-type">{eventLabel(stats.lastEvent.type)}</div>
                          <div className="cp-timeline-text">{stats.lastEvent.text}</div>
                          <div className="cp-timeline-date">{fmtDate(stats.lastEvent.date)}</div>
                        </div>
                      </div>
                    </div>
                  )}
                  {selectedClient.notes && <div className="cp-dash-notes"><div className="cp-dash-card-title">📝 Notatki</div><p>{selectedClient.notes}</p></div>}
                </div>
              );
            })()}

            {/* DANE */}
            {activeTab === "dane" && (
              <div className="cp-section">
                <div className="cp-section-title">Dane kontaktowe</div>
                <div className="cp-data-grid">
                  {[["Imię i nazwisko", `${selectedClient.firstName} ${selectedClient.lastName}`], ["E-mail", selectedClient.email || "—"], ["Telefon", selectedClient.phone || "—"], ["Adres", selectedClient.address || "—"], ["Nr sprawy", selectedClient.caseNumber || "—"], ["Data dodania", fmtDate(selectedClient.createdAt)]].map(([label, value]) => (
                    <div key={label} className="cp-data-item"><span className="cp-data-label">{label}</span><span className="cp-data-value">{value}</span></div>
                  ))}
                </div>
                <div className="cp-section-title" style={{ marginTop: 24 }}>Przebieg sprawy</div>
                <div className="cp-data-grid">
                  <div className={`cp-data-item ${selectedClient.dateWniosekStarostwo ? "highlight-blue" : ""}`}><span className="cp-data-label">📋 Wniosek do starostwa</span><span className="cp-data-value">{fmtDate(selectedClient.dateWniosekStarostwo)}</span></div>
                  <div className={`cp-data-item ${selectedClient.dateWyslanieDoOperatora ? "highlight-purple" : ""}`}><span className="cp-data-label">📤 Wysłane do operatora</span><span className="cp-data-value">{fmtDate(selectedClient.dateWyslanieDoOperatora)}</span></div>
                  <div className={`cp-data-item ${selectedClient.datePismoOperatora ? "highlight-green" : ""}`}><span className="cp-data-label">📩 Pismo od operatora</span><span className="cp-data-value">{fmtDate(selectedClient.datePismoOperatora)}</span></div>
                </div>
                {selectedClient.notes && <><div className="cp-section-title" style={{ marginTop: 24 }}>Notatki</div><div className="cp-notes-box">{selectedClient.notes}</div></>}
                <div style={{ marginTop: 20 }}><button className="cp-btn cp-btn-outline" onClick={() => openEdit(selectedClient)}>✏️ Edytuj dane klienta</button></div>
              </div>
            )}

            {/* WYNAGRODZENIE */}
            {activeTab === "wynagrodzenie" && (
              <div className="cp-section">
                <div className="cp-comp-hero">
                  <div className="cp-comp-hero-left">
                    <div className="cp-comp-hero-label">Ustalone wynagrodzenie</div>
                    <div className="cp-comp-hero-amount">{selectedClient.compensation ? Number(selectedClient.compensation).toLocaleString("pl-PL", { minimumFractionDigits: 2 }) + " zł" : "Nie ustalono"}</div>
                    {selectedClient.compensationDate && <div className="cp-comp-hero-date">Data płatności: {fmtDate(selectedClient.compensationDate)}</div>}
                  </div>
                  <div className="cp-comp-hero-right">
                    <label className={`cp-paid-toggle ${selectedClient.compensationPaid ? "paid" : "unpaid"}`}>
                      <input type="checkbox" checked={!!selectedClient.compensationPaid} onChange={(e) => setClients((prev) => prev.map((c) => c.id === selectedClient.id ? { ...c, compensationPaid: e.target.checked } : c))} />
                      <span className="cp-paid-toggle-icon">{selectedClient.compensationPaid ? "✅" : "⏳"}</span>
                      <span className="cp-paid-toggle-label">{selectedClient.compensationPaid ? "ZAPŁACONE" : "OCZEKUJE"}</span>
                    </label>
                  </div>
                </div>
                {(selectedClient.analyses || []).length > 0 && (
                  <><div className="cp-section-title" style={{ marginTop: 24 }}>Podstawa wyliczenia</div>
                  <table className="cp-analyses-table"><thead><tr><th>Działka</th><th>Data</th><th>Track A</th><th>Track B</th><th>Razem</th></tr></thead>
                  <tbody>{(selectedClient.analyses || []).map((a, i) => (<tr key={i}><td><code>{a.parcelId}</code></td><td>{fmtDate(a.date)}</td><td>{a.trackA ? Number(a.trackA).toLocaleString("pl-PL") + " zł" : "—"}</td><td>{a.trackB ? Number(a.trackB).toLocaleString("pl-PL") + " zł" : "—"}</td><td className="cp-table-total">{a.total ? Number(a.total).toLocaleString("pl-PL") + " zł" : "—"}</td></tr>))}</tbody></table></>
                )}
                <div style={{ marginTop: 20 }}><button className="cp-btn cp-btn-outline" onClick={() => openEdit(selectedClient)}>✏️ Edytuj wynagrodzenie</button></div>
              </div>
            )}

            {/* ANALIZY */}
            {activeTab === "analizy" && (
              <div className="cp-section">
                {(selectedClient.analyses || []).length === 0 ? (
                  <div className="cp-tab-empty"><div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📊</div><p>Brak przypisanych analiz.</p><p style={{ fontSize: "0.85em", color: "#9b9faa" }}>Po wykonaniu analizy działki użyj przycisku „Przypisz do klienta".</p></div>
                ) : (
                  <><div className="cp-section-title">Analizy działek ({(selectedClient.analyses || []).length})</div>
                  <div className="cp-analyses-cards">{(selectedClient.analyses || []).map((a, i) => (
                    <div key={i} className="cp-analysis-card">
                      <div className="cp-analysis-card-header"><code className="cp-analysis-parcel">{a.parcelId || "Działka"}</code><span className="cp-analysis-date">{fmtDate(a.date)}</span></div>
                      <div className="cp-analysis-amounts">
                        <div className="cp-analysis-amount"><span>Track A</span><strong>{a.trackA ? Number(a.trackA).toLocaleString("pl-PL") + " zł" : "—"}</strong></div>
                        <div className="cp-analysis-amount"><span>Track B</span><strong>{a.trackB ? Number(a.trackB).toLocaleString("pl-PL") + " zł" : "—"}</strong></div>
                        <div className="cp-analysis-amount cp-analysis-total"><span>Razem</span><strong>{a.total ? Number(a.total).toLocaleString("pl-PL") + " zł" : "—"}</strong></div>
                      </div>
                    </div>
                  ))}</div></>
                )}
              </div>
            )}

            {/* DOKUMENTY */}
            {activeTab === "dokumenty" && (
              <div className="cp-section">
                <div className="cp-upload-area" onClick={() => fileInputRef.current?.click()}>
                  <input ref={fileInputRef} type="file" style={{ display: "none" }} accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt" onChange={handleFileUpload} />
                  <div className="cp-upload-icon">📎</div>
                  <div className="cp-upload-label">Kliknij lub przeciągnij plik</div>
                  <div className="cp-upload-hint">PDF · DOC · XLS · JPG · PNG (maks. 4 MB)</div>
                </div>
                <div className="cp-upload-controls">
                  <input className="cp-note-input" placeholder="Opis pliku (np. Wniosek do starostwa)…" value={fileNote} onChange={(e) => setFileNote(e.target.value)} />
                  <button className="cp-btn cp-btn-outline" onClick={() => fileInputRef.current?.click()}>+ Dodaj plik</button>
                </div>
                {(selectedClient.files || []).length === 0 && <div className="cp-tab-empty">Brak plików — dodaj pierwsze</div>}
                <div className="cp-file-list">
                  {(selectedClient.files || []).map((f) => (
                    <div key={f.id} className="cp-file-item">
                      <span className="cp-file-icon">{fileIcon(f.type)}</span>
                      <div className="cp-file-info">
                        <div className="cp-file-name">{f.name}</div>
                        <div className="cp-file-meta">{fmtDate(f.date)}{f.size ? ` · ${fmtSize(f.size)}` : ""}{f.note ? ` · ${f.note}` : ""}{f.tooLarge && <span className="cp-file-toolarge"> ⚠ Za duży</span>}</div>
                      </div>
                      <div className="cp-file-actions">
                        {f.data && <button className="cp-icon-btn cp-icon-btn-green" title="Pobierz" onClick={() => downloadFile(f)}>⬇</button>}
                        <button className="cp-icon-btn cp-icon-btn-red" title="Usuń" onClick={() => removeFile(f.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TIMELINE */}
            {activeTab === "timeline" && (
              <div className="cp-section">
                <div className="cp-timeline-add">
                  <div className="cp-timeline-add-title">➕ Dodaj wpis do historii</div>
                  <div className="cp-timeline-add-row">
                    <select className="cp-input cp-timeline-type-select" value={newEventType} onChange={(e) => setNewEventType(e.target.value)}>
                      {EVENT_TYPES.map((et) => <option key={et.value} value={et.value}>{et.label}</option>)}
                    </select>
                    <input className="cp-input" type="date" value={newEventDate} onChange={(e) => setNewEventDate(e.target.value)} style={{ maxWidth: 160 }} />
                  </div>
                  <div className="cp-timeline-add-row">
                    <input className="cp-input cp-timeline-text-input" placeholder="Opis zdarzenia (np. Pismo wysłane do PGE Dystrybucja)…" value={newEventText} onChange={(e) => setNewEventText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTimelineEvent()} />
                    <button className="cp-btn cp-btn-primary" onClick={addTimelineEvent}>Dodaj</button>
                  </div>
                </div>
                {(selectedClient.timeline || []).length === 0 ? (
                  <div className="cp-tab-empty"><div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📅</div><p>Brak wpisów w historii sprawy.</p></div>
                ) : (
                  <div className="cp-timeline-list">
                    {(selectedClient.timeline || []).map((event) => (
                      <div key={event.id} className="cp-timeline-item" style={{ borderLeftColor: eventColor(event.type) }}>
                        <div className="cp-timeline-dot" style={{ background: eventColor(event.type) }}></div>
                        <div className="cp-timeline-content">
                          <div className="cp-timeline-header">
                            <span className="cp-timeline-type">{eventLabel(event.type)}</span>
                            <span className="cp-timeline-date">{fmtDate(event.date)}</span>
                            <button className="cp-icon-btn cp-icon-btn-red cp-timeline-delete" onClick={() => removeTimelineEvent(event.id)} title="Usuń wpis">✕</button>
                          </div>
                          <div className="cp-timeline-text">{event.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* AI ASYSTENT */}
            {activeTab === "ai" && (
              <div className="cp-section cp-ai-section">
                <div className="cp-notebooklm-bar">
                  <span className="cp-notebooklm-icon">🔬</span>
                  <span className="cp-notebooklm-label">NotebookLM:</span>
                  {selectedClient.notebookLmUrl ? (
                    <a href={selectedClient.notebookLmUrl} target="_blank" rel="noopener noreferrer" className="cp-notebooklm-link">Otwórz notebook klienta ↗</a>
                  ) : (
                    <span className="cp-notebooklm-empty">Brak linku — dodaj w edycji klienta</span>
                  )}
                  <button className="cp-btn cp-btn-ghost cp-notebooklm-edit" onClick={() => openEdit(selectedClient)}>✏️</button>
                </div>
                <div className="cp-ai-header">
                  <div className="cp-ai-title">🤖 AI Asystent sprawy</div>
                  <div className="cp-ai-subtitle">Asystent zna dane klienta, analizy i historię sprawy</div>
                  {(selectedClient.aiChat || []).length > 0 && <button className="cp-btn cp-btn-ghost" onClick={clearAiChat} style={{ marginLeft: "auto" }}>🗑 Wyczyść</button>}
                </div>
                <div className="cp-ai-chat">
                  {(selectedClient.aiChat || []).length === 0 && (
                    <div className="cp-ai-welcome">
                      <div className="cp-ai-welcome-icon">🤖</div>
                      <div className="cp-ai-welcome-title">Asystent gotowy</div>
                      <div className="cp-ai-welcome-text">Zadaj pytanie o sprawę klienta, poproś o redakcję pisma,<br />lub zapytaj o kolejne kroki w postępowaniu.</div>
                      <div className="cp-ai-suggestions">
                        {["Jakie są kolejne kroki w tej sprawie?", "Napisz pismo do operatora sieci", "Podsumuj stan sprawy", "Jak obliczyć wynagrodzenie za służebność?"].map((s) => (
                          <button key={s} className="cp-ai-suggestion" onClick={() => setAiInput(s)}>{s}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {(selectedClient.aiChat || []).map((msg, i) => (
                    <div key={i} className={`cp-ai-msg cp-ai-msg-${msg.role}`}>
                      <div className="cp-ai-msg-avatar">{msg.role === "user" ? "👤" : "🤖"}</div>
                      <div className="cp-ai-msg-bubble">
                        <div className="cp-ai-msg-content">{msg.content}</div>
                        <div className="cp-ai-msg-time">{fmtDateTime(msg.ts)}</div>
                      </div>
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="cp-ai-msg cp-ai-msg-assistant">
                      <div className="cp-ai-msg-avatar">🤖</div>
                      <div className="cp-ai-msg-bubble cp-ai-loading"><span></span><span></span><span></span></div>
                    </div>
                  )}
                  <div ref={aiChatEndRef} />
                </div>
                <div className="cp-ai-input-row">
                  <textarea className="cp-ai-input" placeholder="Zadaj pytanie o sprawę klienta…" value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAiMessage(); } }} rows={2} />
                  <button className="cp-btn cp-btn-primary cp-ai-send" onClick={sendAiMessage} disabled={aiLoading || !aiInput.trim()}>{aiLoading ? "⏳" : "➤"}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
