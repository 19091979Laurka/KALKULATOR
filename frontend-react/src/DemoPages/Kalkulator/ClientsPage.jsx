import React, { useState, useEffect, useRef } from "react";
import "./ClientsPage.css";

// ── Storage helpers ──────────────────────────────────────────────────────────
const STORAGE_KEY = "ksws_clients_v1";

function loadClients() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveClients(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("pl-PL"); } catch { return iso; }
}

function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ── Empty client template ────────────────────────────────────────────────────
const EMPTY_CLIENT = {
  id: null,
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  caseNumber: "",
  notes: "",
  status: "aktywna",
  createdAt: "",
  // Case dates
  dateWniosekStarostwo: "",   // data złożenia wniosku do starostwa
  datePismoOperatora: "",     // data pisma od operatora
  dateWyslanieDoOperatora: "", // data wysłania pisma do operatora
  // Compensation
  compensation: "",
  compensationPaid: false,
  analyses: [],
  files: [],
};

// ════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function ClientsPage() {
  const [clients, setClients] = useState(loadClients);
  const [selectedId, setSelectedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editData, setEditData] = useState(EMPTY_CLIENT);
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState("dane"); // dane | analizy | pliki
  const [fileNote, setFileNote] = useState("");
  const fileInputRef = useRef(null);

  // persist on change
  useEffect(() => { saveClients(clients); }, [clients]);

  const selectedClient = clients.find((c) => c.id === selectedId) || null;
  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.caseNumber.toLowerCase().includes(q) ||
      c.phone.includes(q)
    );
  });

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function openNew() {
    setEditData({ ...EMPTY_CLIENT, id: null, createdAt: new Date().toISOString() });
    setShowForm(true);
  }

  function openEdit(client) {
    setEditData({ ...client });
    setShowForm(true);
  }

  function saveClient() {
    const isNew = !editData.id;
    const entry = { ...editData, id: editData.id || genId() };
    const updated = isNew
      ? [entry, ...clients]
      : clients.map((c) => (c.id === entry.id ? entry : c));
    setClients(updated);
    setSelectedId(entry.id);
    setShowForm(false);
  }

  function deleteClient(id) {
    if (!window.confirm("Usunąć klienta i wszystkie dane?")) return;
    setClients((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  // ── File upload ───────────────────────────────────────────────────────────
  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !selectedClient) return;
    const MAX_BASE64 = 4 * 1024 * 1024; // 4 MB limit for inline storage

    const meta = {
      id: genId(),
      name: file.name,
      size: file.size,
      type: file.type,
      date: new Date().toISOString(),
      note: fileNote.trim(),
      data: null, // will be set below for small files
    };

    if (file.size <= MAX_BASE64) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        meta.data = ev.target.result; // base64 data URL
        attachFileTo(meta);
      };
      reader.readAsDataURL(file);
    } else {
      meta.tooLarge = true;
      attachFileTo(meta);
    }

    setFileNote("");
    e.target.value = "";
  }

  function attachFileTo(meta) {
    setClients((prev) =>
      prev.map((c) =>
        c.id === selectedId
          ? { ...c, files: [meta, ...(c.files || [])] }
          : c
      )
    );
  }

  function downloadFile(file) {
    if (!file.data) return;
    const a = document.createElement("a");
    a.href = file.data;
    a.download = file.name;
    a.click();
  }

  function removeFile(fileId) {
    setClients((prev) =>
      prev.map((c) =>
        c.id === selectedId
          ? { ...c, files: (c.files || []).filter((f) => f.id !== fileId) }
          : c
      )
    );
  }

  // ── FILE TYPE ICON ────────────────────────────────────────────────────────
  function fileIcon(type) {
    if (!type) return "📄";
    if (type.includes("pdf")) return "📕";
    if (type.includes("image")) return "🖼️";
    if (type.includes("word") || type.includes("document")) return "📝";
    if (type.includes("excel") || type.includes("spreadsheet")) return "📊";
    return "📄";
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="cp-root">

      {/* ══ LEFT PANEL — client list ══════════════════════════════════════ */}
      <aside className="cp-sidebar">
        <div className="cp-sidebar-top">
          <div className="cp-sidebar-title">
            <span>👤</span> Klienci
            <span className="cp-badge">{clients.length}</span>
          </div>
          <button className="cp-btn cp-btn-add" onClick={openNew}>
            + Nowy klient
          </button>
        </div>

        <div className="cp-search-wrap">
          <input
            className="cp-search"
            placeholder="Szukaj…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <ul className="cp-client-list">
          {filtered.length === 0 && (
            <li className="cp-empty">
              {search ? "Brak wyników" : "Brak klientów — dodaj pierwszego"}
            </li>
          )}
          {filtered.map((c) => (
            <li
              key={c.id}
              className={`cp-client-item ${selectedId === c.id ? "active" : ""}`}
              onClick={() => { setSelectedId(c.id); setActiveSection("dane"); }}
            >
              <div className="cp-client-avatar">
                {(c.firstName?.[0] || "?").toUpperCase()}
                {(c.lastName?.[0] || "").toUpperCase()}
              </div>
              <div className="cp-client-info">
                <div className="cp-client-name">
                  {c.firstName} {c.lastName}
                </div>
                <div className="cp-client-meta">
                  {c.caseNumber && <span className="cp-case-nr">{c.caseNumber}</span>}
                  {c.email && <span>{c.email}</span>}
                </div>
              </div>
              <div className={`cp-status-dot ${c.status}`} title={c.status} />
            </li>
          ))}
        </ul>
      </aside>

      {/* ══ RIGHT PANEL — detail / form ══════════════════════════════════ */}
      <main className="cp-main">

        {/* ── FORM: new/edit client ── */}
        {showForm && (
          <div className="cp-form-overlay">
            <div className="cp-form-panel">
              <div className="cp-form-header">
                <h2>{editData.id ? "Edytuj klienta" : "Nowy klient"}</h2>
                <button className="cp-icon-btn" onClick={() => setShowForm(false)}>✕</button>
              </div>

              <div className="cp-form-grid">
                <div className="cp-form-group">
                  <label>Imię *</label>
                  <input value={editData.firstName} onChange={(e) => setEditData((p) => ({ ...p, firstName: e.target.value }))} placeholder="Jan" />
                </div>
                <div className="cp-form-group">
                  <label>Nazwisko *</label>
                  <input value={editData.lastName} onChange={(e) => setEditData((p) => ({ ...p, lastName: e.target.value }))} placeholder="Kowalski" />
                </div>
                <div className="cp-form-group">
                  <label>E-mail</label>
                  <input type="email" value={editData.email} onChange={(e) => setEditData((p) => ({ ...p, email: e.target.value }))} placeholder="jan@email.pl" />
                </div>
                <div className="cp-form-group">
                  <label>Telefon</label>
                  <input value={editData.phone} onChange={(e) => setEditData((p) => ({ ...p, phone: e.target.value }))} placeholder="+48 600 000 000" />
                </div>
                <div className="cp-form-group cp-span-2">
                  <label>Adres</label>
                  <input value={editData.address} onChange={(e) => setEditData((p) => ({ ...p, address: e.target.value }))} placeholder="ul. Polna 1, 00-001 Warszawa" />
                </div>
                <div className="cp-form-group">
                  <label>Nr sprawy</label>
                  <input value={editData.caseNumber} onChange={(e) => setEditData((p) => ({ ...p, caseNumber: e.target.value }))} placeholder="SZU/2026/001" />
                </div>
                <div className="cp-form-group">
                  <label>Status</label>
                  <select value={editData.status} onChange={(e) => setEditData((p) => ({ ...p, status: e.target.value }))}>
                    <option value="aktywna">Aktywna</option>
                    <option value="czeka">Czeka</option>
                    <option value="zakonczona">Zakończona</option>
                  </select>
                </div>
                <div className="cp-form-group cp-span-2">
                  <label>Notatki</label>
                  <textarea rows={3} value={editData.notes} onChange={(e) => setEditData((p) => ({ ...p, notes: e.target.value }))} placeholder="Dodatkowe informacje o sprawie…" />
                </div>

                {/* Daty sprawy */}
                <div className="cp-form-group">
                  <label>📋 Data złożenia wniosku do starostwa</label>
                  <input type="date" value={editData.dateWniosekStarostwo} onChange={(e) => setEditData((p) => ({ ...p, dateWniosekStarostwo: e.target.value }))} />
                </div>
                <div className="cp-form-group">
                  <label>📧 Data wysłania pisma do operatora</label>
                  <input type="date" value={editData.dateWyslanieDoOperatora} onChange={(e) => setEditData((p) => ({ ...p, dateWyslanieDoOperatora: e.target.value }))} />
                </div>
                <div className="cp-form-group">
                  <label>📩 Data pisma od operatora</label>
                  <input type="date" value={editData.datePismoOperatora} onChange={(e) => setEditData((p) => ({ ...p, datePismoOperatora: e.target.value }))} />
                </div>

                {/* Wynagrodzenie */}
                <div className="cp-form-group">
                  <label>💰 Wynagrodzenie [zł]</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editData.compensation}
                    onChange={(e) => setEditData((p) => ({ ...p, compensation: e.target.value }))}
                    placeholder="np. 15000.00"
                  />
                </div>
                <div className="cp-form-group" style={{ justifyContent: "flex-end" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", paddingTop: 22 }}>
                    <input
                      type="checkbox"
                      style={{ width: 18, height: 18, accentColor: "#8ac926", cursor: "pointer" }}
                      checked={editData.compensationPaid}
                      onChange={(e) => setEditData((p) => ({ ...p, compensationPaid: e.target.checked }))}
                    />
                    <span style={{ fontWeight: 700, color: editData.compensationPaid ? "#5a8a17" : "#636e72" }}>
                      {editData.compensationPaid ? "✅ Zapłacone" : "⏳ Nie zapłacone"}
                    </span>
                  </label>
                </div>
              </div>

              <div className="cp-form-actions">
                <button className="cp-btn cp-btn-primary" onClick={saveClient}>
                  {editData.id ? "Zapisz zmiany" : "Utwórz klienta"}
                </button>
                <button className="cp-btn cp-btn-ghost" onClick={() => setShowForm(false)}>
                  Anuluj
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── NO SELECTION ── */}
        {!selectedClient && !showForm && (
          <div className="cp-empty-state">
            <div className="cp-empty-icon">👤</div>
            <div className="cp-empty-title">Wybierz klienta</div>
            <div className="cp-empty-sub">lub dodaj nowego klikając "+ Nowy klient"</div>
            <button className="cp-btn cp-btn-primary" style={{ marginTop: 20 }} onClick={openNew}>
              + Dodaj pierwszego klienta
            </button>
          </div>
        )}

        {/* ── CLIENT DETAIL ── */}
        {selectedClient && !showForm && (
          <div className="cp-detail">

            {/* Header */}
            <div className="cp-detail-header">
              <div className="cp-detail-avatar">
                {(selectedClient.firstName?.[0] || "?").toUpperCase()}
                {(selectedClient.lastName?.[0] || "").toUpperCase()}
              </div>
              <div className="cp-detail-title-wrap">
                <h1 className="cp-detail-name">
                  {selectedClient.firstName} {selectedClient.lastName}
                </h1>
                <div className="cp-detail-meta">
                  {selectedClient.caseNumber && (
                    <span className="cp-chip cp-chip-purple">📁 {selectedClient.caseNumber}</span>
                  )}
                  <span className={`cp-chip cp-status-chip ${selectedClient.status}`}>
                    {selectedClient.status === "aktywna" && "🟢 Aktywna"}
                    {selectedClient.status === "czeka"   && "🟡 Czeka"}
                    {selectedClient.status === "zakonczona" && "⚫ Zakończona"}
                  </span>
                  <span className="cp-chip">📅 {fmtDate(selectedClient.createdAt)}</span>
                </div>
              </div>
              <div className="cp-detail-actions">
                <button className="cp-btn cp-btn-outline" onClick={() => openEdit(selectedClient)}>
                  ✏️ Edytuj
                </button>
                <button className="cp-btn cp-btn-danger" onClick={() => deleteClient(selectedClient.id)}>
                  🗑
                </button>
              </div>
            </div>

            {/* Quick contact */}
            <div className="cp-contact-row">
              {selectedClient.email && (
                <a className="cp-contact-chip" href={`mailto:${selectedClient.email}`}>
                  📧 {selectedClient.email}
                </a>
              )}
              {selectedClient.phone && (
                <a className="cp-contact-chip" href={`tel:${selectedClient.phone}`}>
                  📞 {selectedClient.phone}
                </a>
              )}
              {selectedClient.address && (
                <span className="cp-contact-chip">📍 {selectedClient.address}</span>
              )}
            </div>

            {/* Tabs */}
            <div className="cp-tabs">
              {[
                { key: "dane",    label: "Dane" },
                { key: "analizy", label: `Analizy (${(selectedClient.analyses || []).length})` },
                { key: "pliki",   label: `Pliki (${(selectedClient.files || []).length})` },
              ].map((t) => (
                <button
                  key={t.key}
                  className={`cp-tab ${activeSection === t.key ? "active" : ""}`}
                  onClick={() => setActiveSection(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── TAB: DANE ── */}
            {activeSection === "dane" && (
              <div className="cp-section">
                {/* Dane kontaktowe */}
                <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#9b9faa", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                  Dane kontaktowe
                </div>
                <div className="cp-data-grid">
                  <div className="cp-data-item">
                    <span className="cp-data-label">Imię i nazwisko</span>
                    <span className="cp-data-value">{selectedClient.firstName} {selectedClient.lastName}</span>
                  </div>
                  <div className="cp-data-item">
                    <span className="cp-data-label">E-mail</span>
                    <span className="cp-data-value">{selectedClient.email || "—"}</span>
                  </div>
                  <div className="cp-data-item">
                    <span className="cp-data-label">Telefon</span>
                    <span className="cp-data-value">{selectedClient.phone || "—"}</span>
                  </div>
                  <div className="cp-data-item">
                    <span className="cp-data-label">Adres</span>
                    <span className="cp-data-value">{selectedClient.address || "—"}</span>
                  </div>
                  <div className="cp-data-item">
                    <span className="cp-data-label">Nr sprawy</span>
                    <span className="cp-data-value">{selectedClient.caseNumber || "—"}</span>
                  </div>
                  <div className="cp-data-item">
                    <span className="cp-data-label">Data dodania</span>
                    <span className="cp-data-value">{fmtDate(selectedClient.createdAt)}</span>
                  </div>
                </div>

                {/* Daty sprawy */}
                <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#9b9faa", textTransform: "uppercase", letterSpacing: "0.5px", margin: "18px 0 10px" }}>
                  Przebieg sprawy
                </div>
                <div className="cp-data-grid">
                  <div className={`cp-data-item ${selectedClient.dateWniosekStarostwo ? "highlight-blue" : ""}`}>
                    <span className="cp-data-label">📋 Wniosek do starostwa</span>
                    <span className="cp-data-value">{fmtDate(selectedClient.dateWniosekStarostwo) || "—"}</span>
                  </div>
                  <div className={`cp-data-item ${selectedClient.dateWyslanieDoOperatora ? "highlight-purple" : ""}`}>
                    <span className="cp-data-label">📤 Wysłane do operatora</span>
                    <span className="cp-data-value">{fmtDate(selectedClient.dateWyslanieDoOperatora) || "—"}</span>
                  </div>
                  <div className={`cp-data-item ${selectedClient.datePismoOperatora ? "highlight-green" : ""}`}>
                    <span className="cp-data-label">📩 Pismo od operatora</span>
                    <span className="cp-data-value">{fmtDate(selectedClient.datePismoOperatora) || "—"}</span>
                  </div>
                </div>

                {/* Wynagrodzenie */}
                {(selectedClient.compensation !== "" && selectedClient.compensation !== undefined && selectedClient.compensation !== null) && (
                  <div className="cp-compensation-box">
                    <div>
                      <div className="cp-comp-label">Wynagrodzenie</div>
                      <div className="cp-comp-value">
                        {Number(selectedClient.compensation).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} zł
                      </div>
                    </div>
                    <div className="cp-comp-paid">
                      <input
                        type="checkbox"
                        id={`paid-${selectedClient.id}`}
                        checked={!!selectedClient.compensationPaid}
                        onChange={(e) => {
                          setClients((prev) =>
                            prev.map((c) =>
                              c.id === selectedClient.id
                                ? { ...c, compensationPaid: e.target.checked }
                                : c
                            )
                          );
                        }}
                      />
                      <label htmlFor={`paid-${selectedClient.id}`} style={{ cursor: "pointer" }}>
                        {selectedClient.compensationPaid ? "✅ Zapłacone" : "⏳ Oczekuje na płatność"}
                      </label>
                    </div>
                  </div>
                )}

                {/* Notatki */}
                {selectedClient.notes && (
                  <div className="cp-notes-box" style={{ marginTop: 16 }}>
                    <div className="cp-notes-label">📝 Notatki</div>
                    <div className="cp-notes-text">{selectedClient.notes}</div>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB: ANALIZY ── */}
            {activeSection === "analizy" && (
              <div className="cp-section">
                {(selectedClient.analyses || []).length === 0 ? (
                  <div className="cp-tab-empty">
                    <p>Brak przypisanych analiz.</p>
                    <p style={{ fontSize: "0.85em", color: "#9b9faa" }}>
                      Po wykonaniu analizy działki użyj przycisku<br />
                      „Przypisz do klienta" by dodać tutaj wyniki.
                    </p>
                  </div>
                ) : (
                  <table className="cp-analyses-table">
                    <thead>
                      <tr>
                        <th>Działka</th>
                        <th>Data</th>
                        <th>Track A</th>
                        <th>Track B</th>
                        <th>Razem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedClient.analyses || []).map((a, i) => (
                        <tr key={i}>
                          <td><code>{a.parcelId}</code></td>
                          <td>{fmtDate(a.date)}</td>
                          <td>{a.trackA ? `${Number(a.trackA).toLocaleString("pl-PL")} zł` : "—"}</td>
                          <td>{a.trackB ? `${Number(a.trackB).toLocaleString("pl-PL")} zł` : "—"}</td>
                          <td style={{ fontWeight: 700, color: "#6a4c93" }}>
                            {a.total ? `${Number(a.total).toLocaleString("pl-PL")} zł` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── TAB: PLIKI ── */}
            {activeSection === "pliki" && (
              <div className="cp-section">

                {/* Upload area */}
                <div className="cp-upload-area" onClick={() => fileInputRef.current?.click()}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: "none" }}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt"
                    onChange={handleFileUpload}
                  />
                  <div className="cp-upload-icon">📎</div>
                  <div className="cp-upload-label">Kliknij lub przeciągnij plik</div>
                  <div className="cp-upload-hint">PDF · DOC · XLS · JPG · PNG (maks. 4 MB — przechowywane lokalnie)</div>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 16, marginTop: 10 }}>
                  <input
                    className="cp-note-input"
                    placeholder="Opis pliku (opcjonalnie)…"
                    value={fileNote}
                    onChange={(e) => setFileNote(e.target.value)}
                  />
                  <button
                    className="cp-btn cp-btn-outline"
                    style={{ whiteSpace: "nowrap" }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    + Dodaj plik
                  </button>
                </div>

                {(selectedClient.files || []).length === 0 && (
                  <div className="cp-tab-empty">Brak plików — dodaj pierwsze</div>
                )}

                <div className="cp-file-list">
                  {(selectedClient.files || []).map((f) => (
                    <div key={f.id} className="cp-file-item">
                      <span className="cp-file-icon">{fileIcon(f.type)}</span>
                      <div className="cp-file-info">
                        <div className="cp-file-name">{f.name}</div>
                        <div className="cp-file-meta">
                          {fmtDate(f.date)}
                          {f.size ? ` · ${fmtSize(f.size)}` : ""}
                          {f.note ? ` · ${f.note}` : ""}
                          {f.tooLarge && (
                            <span style={{ color: "#ff595e", marginLeft: 6 }}>
                              ⚠ Za duży do zapisania — tylko metadane
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="cp-file-actions">
                        {f.data && (
                          <button className="cp-icon-btn cp-icon-btn-green" title="Pobierz" onClick={() => downloadFile(f)}>
                            ⬇
                          </button>
                        )}
                        <button className="cp-icon-btn cp-icon-btn-red" title="Usuń" onClick={() => removeFile(f.id)}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </main>
    </div>
  );
}
