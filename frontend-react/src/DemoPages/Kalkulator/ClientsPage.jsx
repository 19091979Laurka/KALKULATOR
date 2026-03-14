import React, { useState, useEffect, useRef } from "react";
import "./ClientsPage.css";
import NotebookPanel from "./NotebookPanel";

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
  const [nbEditMode, setNbEditMode] = useState(false);
  const [nbEditUrl, setNbEditUrl]   = useState("");
  const [nbCopied, setNbCopied]     = useState(false);
  const [nbApiStatus, setNbApiStatus] = useState(null); // null | {configured, message}
  const [nbCreating, setNbCreating]   = useState(false);
  const [nbAddingSource, setNbAddingSource] = useState(false);
  const [nbPodcastLoading, setNbPodcastLoading] = useState(false);
  const [nbPodcastStatus, setNbPodcastStatus]   = useState(null); // {audioOverviewId, status}
  const [nbPodcastPollTimer, setNbPodcastPollTimer] = useState(null);
  const [nbIframeError, setNbIframeError]   = useState(false);
  const [nbIframeLoading, setNbIframeLoading] = useState(true);

  // Check NotebookLM API status on mount
  useEffect(() => {
    fetch("/api/notebooklm/status")
      .then((r) => r.json())
      .then((d) => setNbApiStatus(d))
      .catch(() => setNbApiStatus({ configured: false, message: "Backend niedostępny" }));
  }, []);

  async function createNotebookForClient() {
    if (!selectedClient || nbCreating) return;
    const title = `${selectedClient.firstName} ${selectedClient.lastName} — sprawa ${selectedClient.caseNumber || selectedClient.id}`;
    setNbCreating(true);
    try {
      const resp = await fetch("/api/notebooklm/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!resp.ok) { const err = await resp.json(); throw new Error(err.detail || resp.statusText); }
      const data = await resp.json();
      setClients((prev) => prev.map((c) => c.id === selectedId ? { ...c, notebookLmUrl: data.url, notebookLmId: data.notebook_id } : c));
      setNbEditUrl(data.url);
      // Auto-add case summary as first text source
      await addCaseSummarySource(data.notebook_id);
    } catch (e) {
      alert(`Błąd tworzenia notebooka: ${e.message}`);
    }
    setNbCreating(false);
  }

  async function addCaseSummarySource(notebookId) {
    const client = clients.find((c) => c.id === selectedId);
    if (!client) return;
    const content = `STRESZCZENIE SPRAWY\n===================\nKlient: ${client.firstName} ${client.lastName}\nNr sprawy: ${client.caseNumber || 'brak'}\nAdres: ${client.address || 'brak'}\nStatus: ${client.status || 'aktywna'}\n\nWYNAGRODZENIE\n${client.compensation ? Number(client.compensation).toLocaleString('pl-PL') + ' zł' : 'nie ustalono'} | Zapłacone: ${client.compensationPaid ? 'TAK' : 'NIE'}\n\nANALIZY DZIAŁEK\n${(client.analyses || []).map((a, i) => `${i+1}. Działka ${a.parcelId || '?'}: Track A=${a.trackA||'?'} zł, Track B=${a.trackB||'?'} zł, Razem=${a.total||'?'} zł`).join('\n') || 'Brak analiz'}\n\nHISTORIA SPRAWY\n${(client.timeline || []).map((e) => `[${e.date}] ${eventLabel(e.type)}: ${e.text}`).join('\n') || 'Brak wpisów'}\n\nNOTATKI\n${client.notes || 'Brak notatek'}`;
    try {
      const resp = await fetch("/api/notebooklm/sources/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notebook_id: notebookId, source_title: `Streszczenie sprawy — ${client.firstName} ${client.lastName}`, content }),
      });
      if (!resp.ok) console.warn("Nie udało się dodać streszczenia sprawy do notebooka");
    } catch (e) { console.warn("addCaseSummarySource error:", e); }
  }

  async function generatePodcast() {
    const client = clients.find((c) => c.id === selectedId);
    if (!client?.notebookLmId || nbPodcastLoading) return;
    setNbPodcastLoading(true);
    setNbPodcastStatus(null);
    try {
      const resp = await fetch("/api/notebooklm/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notebook_id: client.notebookLmId, episode_focus: "Omów kluczowe aspekty prawne i finansowe tej sprawy służebności przesyłu.", language_code: "pl" }),
      });
      if (!resp.ok) { const err = await resp.json(); throw new Error(err.detail || resp.statusText); }
      const data = await resp.json();
      const aoId = data.audioOverviewId || data.name?.split("/").pop();
      setNbPodcastStatus({ audioOverviewId: aoId, status: data.status || "AUDIO_OVERVIEW_STATUS_IN_PROGRESS" });
      // Poll for completion
      const timer = setInterval(async () => {
        try {
          const pr = await fetch(`/api/notebooklm/audio/${client.notebookLmId}/${aoId}`);
          const pd = await pr.json();
          setNbPodcastStatus({ audioOverviewId: aoId, status: pd.status, data: pd });
          if (pd.status === "AUDIO_OVERVIEW_STATUS_COMPLETE" || pd.status === "AUDIO_OVERVIEW_STATUS_FAILED") {
            clearInterval(timer);
            setNbPodcastLoading(false);
          }
        } catch { clearInterval(timer); setNbPodcastLoading(false); }
      }, 10000);
      setNbPodcastPollTimer(timer);
    } catch (e) {
      alert(`Błąd generowania podcastu: ${e.message}`);
      setNbPodcastLoading(false);
    }
  }

  function saveNotebookUrl() {
    setClients((prev) => prev.map((c) => c.id === selectedId ? { ...c, notebookLmUrl: nbEditUrl.trim() } : c));
    setNbEditMode(false);
  }
  function copyPrompt() {
    const client = clients.find((c) => c.id === selectedId);
    if (!client) return;
    const prompt = `Jesteś asystentem prawnym w sprawie służebności przesyłu.\nKlient: ${client.firstName} ${client.lastName}\nNr sprawy: ${client.caseNumber || 'brak'}\nAdres: ${client.address || 'brak'}\nAnalizy działek: ${(client.analyses || []).map((a) => `Działka ${a.parcelId}, Track A: ${a.trackA} zł, Track B: ${a.trackB} zł, Razem: ${a.total} zł`).join('; ') || 'brak'}\nDokumenty: ${(client.files || []).map((f) => f.name).join(', ') || 'brak'}\nHistoria: ${(client.timeline || []).map((e) => `[${e.date}] ${eventLabel(e.type)}: ${e.text}`).join('; ') || 'brak'}\nNotatki: ${client.notes || 'brak'}\n\nNa podstawie powyższych danych odpowiadaj na pytania dotyczące tej sprawy.`;
    navigator.clipboard.writeText(prompt).then(() => { setNbCopied(true); setTimeout(() => setNbCopied(false), 2500); });
  }

  useEffect(() => { saveClients(clients); }, [clients]);
  useEffect(() => { if (activeTab === "ai") aiChatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [clients, activeTab]);
  // Reset iframe state when switching client
  useEffect(() => { setNbIframeError(false); setNbIframeLoading(true); }, [selectedId]);

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
                { key: "notebook",      icon: "📓", label: "NotebookLM" },
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

                {/* ─── NOTEBOOKLM PANEL ─── */}
                <div className="cp-nb-panel">
                  <div className="cp-nb-header">
                    <div className="cp-nb-logo">
                      <span className="cp-nb-logo-icon">📓</span>
                      <div>
                        <div className="cp-nb-title">NotebookLM Enterprise</div>
                        <div className="cp-nb-subtitle">Notebook AI dla tej sprawy • {nbApiStatus ? (nbApiStatus.configured ? <span style={{color:"#2e7d32",fontWeight:700}}>✅ API aktywne</span> : <span style={{color:"#c62828"}}>⚠️ {nbApiStatus.message}</span>) : <span style={{color:"#888"}}>sprawdzam…</span>}</div>
                      </div>
                    </div>
                    <div className="cp-nb-actions">
                      {selectedClient.notebookLmUrl && (
                        <a href={selectedClient.notebookLmUrl} target="_blank" rel="noopener noreferrer" className="cp-btn cp-btn-nb-open">🔗 Otwórz NotebookLM ↗</a>
                      )}
                      {nbApiStatus?.configured && !selectedClient.notebookLmId && (
                        <button className="cp-btn cp-btn-nb-create" onClick={createNotebookForClient} disabled={nbCreating}>
                          {nbCreating ? "⏳ Tworzę…" : "✨ Utwórz notebook automatycznie"}
                        </button>
                      )}
                      <button className="cp-btn cp-btn-ghost" onClick={() => { setNbEditMode(!nbEditMode); setNbEditUrl(selectedClient.notebookLmUrl || ""); }}>
                        {nbEditMode ? "✕ Anuluj" : (selectedClient.notebookLmUrl ? "✏️ Zmień link" : "+ Dodaj link ręcznie")}
                      </button>
                    </div>
                  </div>

                  {nbEditMode && (
                    <div className="cp-nb-edit-row">
                      <input
                        className="cp-input cp-nb-input"
                        placeholder="https://notebooklm.cloud.google.com/... lub https://notebooklm.google.com/notebook/..."
                        value={nbEditUrl}
                        onChange={(e) => setNbEditUrl(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveNotebookUrl(); }}
                        autoFocus
                      />
                      <button className="cp-btn cp-btn-primary" onClick={saveNotebookUrl}>Zapisz</button>
                    </div>
                  )}

                  {!selectedClient.notebookLmUrl && !nbEditMode && (
                    <div className="cp-nb-empty">
                      <div className="cp-nb-empty-icon">📓</div>
                      <div className="cp-nb-empty-title">Brak notebooka dla tej sprawy</div>
                      {nbApiStatus?.configured ? (
                        <div className="cp-nb-empty-text">Kliknij <strong>✨ Utwórz notebook automatycznie</strong> — system stworzy notebook w NotebookLM Enterprise i automatycznie doda streszczenie sprawy jako pierwsze źródło.</div>
                      ) : (
                        <>
                          <div className="cp-nb-empty-text">Utwórz notebook ręcznie w NotebookLM, wklej dokumenty klienta, a link zapisz tutaj.</div>
                          <div className="cp-nb-steps">
                            <div className="cp-nb-step"><span className="cp-nb-step-num">1</span><span>Wejdź na <a href="https://notebooklm.google.com" target="_blank" rel="noopener noreferrer">notebooklm.google.com</a></span></div>
                            <div className="cp-nb-step"><span className="cp-nb-step-num">2</span><span>Utwórz nowy notebook → nazwa: <strong>{selectedClient.firstName} {selectedClient.lastName} — sprawa {selectedClient.caseNumber || 'nr'}</strong></span></div>
                            <div className="cp-nb-step"><span className="cp-nb-step-num">3</span><span>Dodaj dokumenty klienta jako źródła (PDF, Word)</span></div>
                            <div className="cp-nb-step"><span className="cp-nb-step-num">4</span><span>Skopiuj URL i kliknij <em>+ Dodaj link ręcznie</em></span></div>
                          </div>
                        </>
                      )}
                      <button className="cp-btn cp-btn-nb-prompt" onClick={copyPrompt}>
                        {nbCopied ? "✅ Skopiowano!" : "📋 Kopiuj prompt startowy dla NotebookLM"}
                      </button>
                    </div>
                  )}

                  {selectedClient.notebookLmUrl && !nbEditMode && (
                    <div className="cp-nb-linked">
                      <div className="cp-nb-linked-info">
                        <span className="cp-nb-linked-icon">✅</span>
                        <span className="cp-nb-linked-url">{selectedClient.notebookLmUrl}</span>
                      </div>
                      <div className="cp-nb-linked-actions">
                        <button className="cp-btn cp-btn-ghost cp-btn-sm" onClick={copyPrompt}>
                          {nbCopied ? "✅ Skopiowano!" : "📋 Kopiuj prompt"}
                        </button>
                        {nbApiStatus?.configured && selectedClient.notebookLmId && (
                          <button
                            className="cp-btn cp-btn-podcast"
                            onClick={generatePodcast}
                            disabled={nbPodcastLoading}
                            title="Wygeneruj 10-minutowy audio-brief sprawy"
                          >
                            {nbPodcastLoading ? "⏳ Generuję audio…" : "🎧 Generuj Audio-Brief"}
                          </button>
                        )}
                        <span className="cp-nb-linked-hint">Wklej prompt jako pierwszą wiadomość w NotebookLM — AI pozna dane sprawy</span>
                      </div>
                      {nbPodcastStatus && (
                        <div className="cp-nb-podcast-status">
                          {nbPodcastStatus.status === "AUDIO_OVERVIEW_STATUS_IN_PROGRESS" && <span>⏳ Generowanie audio-briefu w toku… (może potrwać 1–2 min)</span>}
                          {nbPodcastStatus.status === "AUDIO_OVERVIEW_STATUS_COMPLETE" && <span>✅ Audio-brief gotowy! <a href={nbPodcastStatus.data?.name} target="_blank" rel="noopener noreferrer">Otwórz w NotebookLM ↗</a></span>}
                          {nbPodcastStatus.status === "AUDIO_OVERVIEW_STATUS_FAILED" && <span>❌ Błąd generowania audio. Spróbuj ponownie.</span>}
                        </div>
                      )}
                      {nbApiStatus?.configured && selectedClient.notebookLmId && (
                        <div className="cp-nb-sync-row">
                          <button
                            className="cp-btn cp-btn-ghost cp-btn-sm"
                            onClick={() => addCaseSummarySource(selectedClient.notebookLmId)}
                            disabled={nbAddingSource}
                          >
                            {nbAddingSource ? "⏳ Dodaję…" : "🔄 Aktualizuj streszczenie sprawy w NotebookLM"}
                          </button>
                          <span className="cp-nb-linked-hint">Synchronizuje dane klienta, analizy i historię z notebookiem</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="cp-nb-divider"><span>lub użyj wbudowanego asystenta AI</span></div>
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

            {/* NOTEBOOKLM — natywny panel 3-kolumnowy */}
            {activeTab === "notebook" && (
              <NotebookPanel
                selectedClient={selectedClient}
                nbApiStatus={nbApiStatus}
                nbCreating={nbCreating}
                nbPodcastLoading={nbPodcastLoading}
                nbPodcastStatus={nbPodcastStatus}
                nbAddingSource={nbAddingSource}
                onCreateNotebook={createNotebookForClient}
                onAddCaseSummary={() => addCaseSummarySource(selectedClient.notebookLmId)}
                onGeneratePodcast={generatePodcast}
                selectedId={selectedId}
                clients={clients}
                setClients={setClients}
                eventLabel={eventLabel}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
