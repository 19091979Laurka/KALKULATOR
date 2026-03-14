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
  { value: "pismo_wyslane",   label: "Pismo wysłane",       icon: "pe-7s-paper-plane", color: "#6a4c93" },
  { value: "wniosek_zlozony", label: "Wniosek złożony",     icon: "pe-7s-note2",        color: "#3a86ff" },
  { value: "odpowiedz",       label: "Odpowiedź",           icon: "pe-7s-mail-open",    color: "#06d6a0" },
  { value: "spotkanie",       label: "Spotkanie",           icon: "pe-7s-users",        color: "#ffd166" },
  { value: "platnosc",        label: "Płatność",            icon: "pe-7s-cash",         color: "#3ac47d" },
  { value: "notatka",         label: "Notatka",             icon: "pe-7s-pen",          color: "#9b9faa" },
  { value: "inne",            label: "Inne",                icon: "pe-7s-star",         color: "#ff6b6b" },
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
            {/* Header / Top Profile Card */}
            <div className="card mb-4 mt-2">
              <div className="card-body d-flex align-items-center justify-content-between p-4">
                <div className="d-flex align-items-center">
                  <div className="cp-detail-avatar me-4" style={{ width: '70px', height: '70px', fontSize: '1.8rem', background: 'linear-gradient(135deg, #6a4c93, #a288d9)' }}>
                    {selectedClient.firstName?.[0]}{selectedClient.lastName?.[0]}
                  </div>
                  <div>
                    <h2 className="mb-2" style={{ fontWeight: 700, color: '#3f4254', fontSize: '1.4rem' }}>{selectedClient.firstName} {selectedClient.lastName}</h2>
                    <div className="d-flex align-items-center gap-3">
                       <span className={`badge badge-${selectedClient.status === 'aktywna' ? 'success' : 'warning'}`}>{selectedClient.status}</span>
                       {selectedClient.caseNumber && <span className="text-muted font-weight-bold" style={{fontSize: '0.9rem'}}>#{selectedClient.caseNumber}</span>}
                       <span className="text-secondary small font-italic">Dodano: {fmtDate(selectedClient.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="d-flex gap-2">
                  <button className="btn btn-outline-primary btn-sm" onClick={() => openEdit(selectedClient)}><i className="pe-7s-config"></i> Edytuj</button>
                  <button className="btn btn-outline-danger btn-sm" onClick={() => deleteClient(selectedClient.id)}><i className="pe-7s-trash"></i> Usuń</button>
                </div>
              </div>
            </div>

            {/* Tabs — ArchitectUI Native Style */}
            <ul className="nav nav-tabs nav-fill mb-4">
              {[
                { key: "dashboard",     icon: "pe-7s-graph2",    label: "Dashboard" },
                { key: "dane",          icon: "pe-7s-id",        label: "Dane" },
                { key: "wynagrodzenie", icon: "pe-7s-cash",      label: "Finanse" },
                { key: "analizy",       icon: "pe-7s-display1",  label: `Analizy (${(selectedClient.analyses || []).length})` },
                { key: "dokumenty",     icon: "pe-7s-folder",    label: "Dokumenty" },
                { key: "timeline",      icon: "pe-7s-timer",     label: "Historia" },
                { key: "ai_full",       icon: "pe-7s-magic-wand", label: "AI & Notebook" },
              ].map((t) => (
                <li key={t.key} className="nav-item">
                  <button 
                    className={`nav-link ${activeTab === t.key || (t.key === 'ai_full' && activeTab === 'ai') || (t.key === 'ai_full' && activeTab === 'notebook') ? "active" : ""}`} 
                    onClick={() => setActiveTab(t.key)}
                    style={{ border: 'none', background: 'transparent', width: '100%', padding: '15px' }}
                  >
                    <i className={`nav-link-icon ${t.icon} me-2`}></i>
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>

            {/* TABS CONTENT */}
            
            {/* DASHBOARD */}
            {activeTab === "dashboard" && (() => {
              const stats = getDashboardStats(selectedClient);
              return (
                <div className="cp-section cp-dashboard">
                  <div className="row mb-4">
                    <div className="col-md-3">
                      <div className="card widget-content bg-midnight-bloom">
                        <div className="widget-content-wrapper text-white">
                          <div className="widget-content-left">
                            <div className="widget-heading">Analizy</div>
                            <div className="widget-subheading">Suma ocen</div>
                          </div>
                          <div className="widget-content-right">
                            <div className="widget-numbers text-white">{stats.totalAnalyses}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="card widget-content bg-arielle-smile">
                        <div className="widget-content-wrapper text-white">
                          <div className="widget-content-left">
                            <div className="widget-heading">Dokumenty</div>
                            <div className="widget-subheading">Ilość plików</div>
                          </div>
                          <div className="widget-content-right">
                            <div className="widget-numbers text-white">{stats.totalFiles}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="card widget-content bg-grow-early">
                        <div className="widget-content-wrapper text-white">
                          <div className="widget-content-left">
                            <div className="widget-heading">Wynagrodzenie</div>
                            <div className="widget-subheading">Kwota szacowana</div>
                          </div>
                          <div className="widget-content-right">
                            <div className="widget-numbers text-white">{stats.totalComp > 0 ? stats.totalComp.toLocaleString("pl-PL") + " zł" : "—"}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="card widget-content bg-plum-plate">
                        <div className="widget-content-wrapper text-white">
                          <div className="widget-content-left">
                            <div className="widget-heading">Historia</div>
                            <div className="widget-subheading">Wpisy akcji</div>
                          </div>
                          <div className="widget-content-right">
                            <div className="widget-numbers text-white">{stats.totalEvents}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-md-4">
                      <div className="card mb-3">
                        <div className="card-header">📋 Dane kontaktowe</div>
                        <div className="card-body">
                          <div className="cp-dash-info-item mb-2"><span className="text-secondary small d-block">Email</span><strong>{selectedClient.email || "—"}</strong></div>
                          <div className="cp-dash-info-item mb-2"><span className="text-secondary small d-block">Telefon</span><strong>{selectedClient.phone || "—"}</strong></div>
                          <div className="cp-dash-info-item"><span className="text-secondary small d-block">Adres</span><strong>{selectedClient.address || "—"}</strong></div>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="card mb-3">
                        <div className="card-header">⚖️ Przebieg sprawy</div>
                        <div className="card-body">
                          <div className="cp-case-steps">
                            {[
                              { label: "Wniosek do starostwa", date: selectedClient.dateWniosekStarostwo },
                              { label: "Wysłane do operatora", date: selectedClient.dateWyslanieDoOperatora },
                              { label: "Odpowiedź od operatora", date: selectedClient.datePismoOperatora },
                            ].map((step, i) => (
                              <div key={i} className={`cp-case-step d-flex align-items-center mb-2 ${step.date ? "text-success" : "text-muted"}`}>
                                <i className={`pe-7s-${step.date ? 'check' : 'attention'} me-2`} style={{fontSize: '1.2rem'}}></i>
                                <div>
                                  <div className="small">{step.label}</div>
                                  <div className="font-weight-bold">{step.date ? fmtDate(step.date) : "—"}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="card mb-3">
                        <div className="card-header">📊 Najlepsza analiza</div>
                        <div className="card-body">
                          {stats.bestAnalysis ? (
                            <div className="text-center">
                              <code className="d-block mb-2" style={{fontSize: '1.1rem'}}>{stats.bestAnalysis.parcelId}</code>
                              <div className="h4 text-success font-weight-bold">{stats.bestAnalysis.total ? Number(stats.bestAnalysis.total).toLocaleString("pl-PL") + " zł" : "—"}</div>
                            </div>
                          ) : <div className="text-muted text-center py-3">Brak analiz</div>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="row mt-2">
                    <div className="col-md-12">
                      {stats.lastEvent && (
                        <div className="card mb-3">
                          <div className="card-header">🕐 Ostatnia aktywność</div>
                          <div className="card-body p-3">
                            <div className="d-flex align-items-start">
                              <div className="badge badge-dot badge-dot-lg me-3" style={{ backgroundColor: eventColor(stats.lastEvent.type) }}> </div>
                              <div>
                                <h5 className="mb-1 font-weight-bold">{eventLabel(stats.lastEvent.type)}</h5>
                                <p className="mb-1 text-secondary">{stats.lastEvent.text}</p>
                                <span className="small text-muted">{fmtDate(stats.lastEvent.date)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      {selectedClient.notes && (
                        <div className="card">
                          <div className="card-header">📝 Notatki ogólne</div>
                          <div className="card-body">
                            <p style={{whiteSpace: 'pre-wrap', color: '#555'}}>{selectedClient.notes}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* OTHER TABS */}
            {activeTab === "dane" && (
              <div className="cp-section">
                <div className="card">
                   <div className="card-header">Dane kontaktowe</div>
                   <div className="card-body">
                    <div className="cp-data-grid">
                      {[["Imię i nazwisko", `${selectedClient.firstName} ${selectedClient.lastName}`], ["E-mail", selectedClient.email || "—"], ["Telefon", selectedClient.phone || "—"], ["Adres", selectedClient.address || "—"], ["Nr sprawy", selectedClient.caseNumber || "—"], ["Data dodania", fmtDate(selectedClient.createdAt)]].map(([label, value]) => (
                        <div key={label} className="cp-data-item"><span className="cp-data-label">{label}</span><span className="cp-data-value">{value}</span></div>
                      ))}
                    </div>
                   </div>
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

            {activeTab === "wynagrodzenie" && (
              <div className="cp-section">
                <div className="card">
                  <div className="card-body">
                    <div className="cp-comp-hero">
                      <div className="cp-comp-hero-left">
                        <div className="cp-comp-hero-label text-muted small uppercase">Ustalone wynagrodzenie</div>
                        <div className="cp-comp-hero-amount h2 font-weight-bold text-primary">{selectedClient.compensation ? Number(selectedClient.compensation).toLocaleString("pl-PL", { minimumFractionDigits: 2 }) + " zł" : "Nie ustalono"}</div>
                      </div>
                      <div className="cp-comp-hero-right">
                        <button className={`btn btn-${selectedClient.compensationPaid ? 'success' : 'outline-warning'}`} onClick={() => setClients(prev => prev.map(c => c.id === selectedId ? {...c, compensationPaid: !c.compensationPaid} : c))}>
                           {selectedClient.compensationPaid ? "✅ Zapłacone" : "⏳ Oczekuje"}
                        </button>
                      </div>
                    </div>
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

            {activeTab === "analizy" && (
              <div className="cp-section">
                 <div className="cp-analyses-cards">
                    {(selectedClient.analyses || []).length === 0 ? (
                      <div className="cp-tab-empty"><div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📊</div><p>Brak przypisanych analiz.</p><p style={{ fontSize: "0.85em", color: "#9b9faa" }}>Po wykonaniu analizy działki użyj przycisku „Przypisz do klienta".</p></div>
                    ) : (
                      (selectedClient.analyses || []).map((a, i) => (
                        <div key={i} className="card mb-3 p-3">
                          <div className="d-flex justify-content-between align-items-center">
                            <strong><code>{a.parcelId}</code></strong>
                            <span className="text-muted small">{fmtDate(a.date)}</span>
                          </div>
                          <hr className="my-2" />
                          <div className="d-flex justify-content-between">
                            <span>Suma:</span>
                            <strong className="text-success">{a.total ? Number(a.total).toLocaleString("pl-PL") + " zł" : "—"}</strong>
                          </div>
                        </div>
                      ))
                    )}
                 </div>
              </div>
            )}

            {activeTab === "dokumenty" && (
              <div className="cp-section">
                <div className="card p-4 text-center border-dashed" onClick={() => fileInputRef.current?.click()} style={{ border: '2px dashed #ddd', cursor: 'pointer' }}>
                   <i className="pe-7s-cloud-upload display-4 text-muted"></i>
                   <p className="mt-2 font-weight-bold">Prześlij dokumenty</p>
                   <input ref={fileInputRef} type="file" className="d-none" onChange={handleFileUpload} />
                </div>
                <div className="mt-4">
                   {(selectedClient.files || []).map(f => (
                     <div key={f.id} className="card mb-2 p-2 px-3 d-flex flex-row align-items-center justify-content-between">
                        <div className="d-flex align-items-center">
                          <i className="pe-7s-file me-3 h4 mb-0 text-primary"></i>
                          <div>
                            <div className="font-weight-bold small">{f.name}</div>
                            <div className="text-muted tiny">{fmtSize(f.size)}</div>
                          </div>
                        </div>
                        <button className="btn btn-link text-danger" onClick={() => removeFile(f.id)}><i className="pe-7s-trash"></i></button>
                     </div>
                   ))}
                </div>
              </div>
            )}

            {activeTab === "timeline" && (
               <div className="cp-section">
                 <div className="card mb-4 p-3">
                   <h6>Dodaj wpis</h6>
                   <div className="d-flex gap-2">
                     <select className="form-control" value={newEventType} onChange={e => setNewEventType(e.target.value)}>
                       {EVENT_TYPES.map(et => <option key={et.value} value={et.value}>{et.label}</option>)}
                     </select>
                     <input className="form-control" placeholder="Opis..." value={newEventText} onChange={e => setNewEventText(e.target.value)} />
                     <button className="btn btn-primary" onClick={addTimelineEvent}>Dodaj</button>
                   </div>
                 </div>
                 <div className="vertical-timeline vertical-timeline--animate vertical-timeline--one-column">
                    {(selectedClient.timeline || []).map(e => (
                      <div key={e.id} className="vertical-timeline-item vertical-timeline-element">
                         <div>
                            <span className="vertical-timeline-element-icon bounce-in">
                               <i className="badge badge-dot badge-dot-xl" style={{ backgroundColor: eventColor(e.type) }}> </i>
                            </span>
                            <div className="vertical-timeline-element-content bounce-in">
                               <h4 className="timeline-title">{eventLabel(e.type)}</h4>
                               <p>{e.text}</p>
                               <span className="vertical-timeline-element-date">{fmtDate(e.date)}</span>
                            </div>
                         </div>
                      </div>
                    ))}
                 </div>
               </div>
            )}

            {/* AI & NOTEBOOK — Unified Panel using the good GitHub component */}
            {(activeTab === "ai_full" || activeTab === "ai" || activeTab === "notebook") && (
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
