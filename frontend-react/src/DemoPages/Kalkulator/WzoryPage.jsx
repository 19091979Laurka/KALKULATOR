import React, { useState, useRef } from "react";
import "./WzoryPage.css";

// ── Storage helpers ───────────────────────────────────────────────────────────
function loadClients() {
  try { return JSON.parse(localStorage.getItem("ksws_clients_v1") || "[]"); } catch { return []; }
}

// ── Templates config ─────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    id: "starostwo_tytul",
    category: "Starostwo",
    title: "Wniosek o informację o tytule prawnym urządzeń przesyłowych",
    desc: "Ustalenie czy istnieje decyzja administracyjna lub inny tytuł prawny do zajęcia nieruchomości.",
    icon: "📋",
    urgent: true,
  },
  {
    id: "operator_wezwanie",
    category: "Operator",
    title: "Wezwanie do zapłaty wynagrodzenia za służebność przesyłu",
    desc: "Przedsądowe wezwanie operatora do zawarcia umowy służebności i wypłaty wynagrodzenia.",
    icon: "📤",
    urgent: false,
  },
  {
    id: "kw_odpis",
    category: "Sąd",
    title: "Wniosek o wydanie odpisu KW",
    desc: "Wniosek do wydziału ksiąg wieczystych o wydanie odpisu — do weryfikacji wpisanych służebności.",
    icon: "⚖️",
    urgent: false,
  },
];

// ── Generator formularza ─────────────────────────────────────────────────────
function TemplateForm({ template, onGenerate }) {
  const clients = loadClients();

  const [form, setForm] = useState({
    clientId: "",
    clientName: "",
    clientAddress: "",
    parcelId: "",
    parcelObreb: "",
    parcelGmina: "",
    parcelPowiat: "",
    voivodeship: "",
    starostwoNazwa: "",
    starostwoAdres: "",
    operatorNazwa: "",
    operatorAdres: "",
    kwNumber: "",
    dataWniosku: new Date().toISOString().slice(0, 10),
    miejscowosc: "",
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // Wypełnij z wybranego klienta
  function fillFromClient(id) {
    const c = clients.find((cl) => cl.id === id);
    if (!c) return;
    set("clientId", id);
    set("clientName", `${c.firstName} ${c.lastName}`.trim());
    set("clientAddress", c.address || "");
  }

  const fields = {
    starostwo_tytul: (
      <>
        <Section label="Wnioskodawca (właściciel nieruchomości)">
          <Row>
            <Group label="Wybierz klienta z bazy" span={2}>
              <select
                className="wz-input"
                value={form.clientId}
                onChange={(e) => fillFromClient(e.target.value)}
              >
                <option value="">— wybierz lub wpisz ręcznie —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}{c.caseNumber ? ` (${c.caseNumber})` : ""}
                  </option>
                ))}
              </select>
            </Group>
          </Row>
          <Row>
            <Group label="Imię i Nazwisko / Firma *">
              <input className="wz-input" value={form.clientName} onChange={(e) => set("clientName", e.target.value)} placeholder="Jan Kowalski" />
            </Group>
            <Group label="Adres zamieszkania / siedziby *">
              <input className="wz-input" value={form.clientAddress} onChange={(e) => set("clientAddress", e.target.value)} placeholder="ul. Polna 1, 00-001 Warszawa" />
            </Group>
          </Row>
        </Section>

        <Section label="Starostwo (adresat)">
          <Row>
            <Group label="Nazwa starostwa *">
              <input className="wz-input" value={form.starostwoNazwa} onChange={(e) => set("starostwoNazwa", e.target.value)} placeholder="Starostwo Powiatowe w Płońsku" />
            </Group>
            <Group label="Adres starostwa *">
              <input className="wz-input" value={form.starostwoAdres} onChange={(e) => set("starostwoAdres", e.target.value)} placeholder="ul. Płocka 39, 09-100 Płońsk" />
            </Group>
          </Row>
        </Section>

        <Section label="Nieruchomość">
          <Row>
            <Group label="Identyfikator działki (TERYT)">
              <input className="wz-input" value={form.parcelId} onChange={(e) => set("parcelId", e.target.value)} placeholder="141906_5.0029.60" style={{ fontFamily: "monospace" }} />
            </Group>
            <Group label="Nr działki ewidencyjnej">
              <input className="wz-input" value={form.parcelObreb} onChange={(e) => set("parcelObreb", e.target.value)} placeholder="60" />
            </Group>
            <Group label="Obręb">
              <input className="wz-input" value={form.parcelGmina} onChange={(e) => set("parcelGmina", e.target.value)} placeholder="Szapsk" />
            </Group>
          </Row>
          <Row>
            <Group label="Gmina">
              <input className="wz-input" value={form.parcelPowiat} onChange={(e) => set("parcelPowiat", e.target.value)} placeholder="Baboszewo" />
            </Group>
            <Group label="Powiat">
              <input className="wz-input" value={form.voivodeship} onChange={(e) => set("voivodeship", e.target.value)} placeholder="płoński" />
            </Group>
            <Group label="Nr KW (opcjonalnie)">
              <input className="wz-input" value={form.kwNumber} onChange={(e) => set("kwNumber", e.target.value)} placeholder="WA1M/00012345/6" style={{ fontFamily: "monospace" }} />
            </Group>
          </Row>
        </Section>

        <Section label="Data i miejscowość">
          <Row>
            <Group label="Miejscowość">
              <input className="wz-input" value={form.miejscowosc} onChange={(e) => set("miejscowosc", e.target.value)} placeholder="Warszawa" />
            </Group>
            <Group label="Data wniosku">
              <input className="wz-input" type="date" value={form.dataWniosku} onChange={(e) => set("dataWniosku", e.target.value)} />
            </Group>
          </Row>
        </Section>
      </>
    ),

    operator_wezwanie: (
      <>
        <Section label="Wnioskodawca / Właściciel">
          <Row>
            <Group label="Wybierz klienta" span={2}>
              <select className="wz-input" value={form.clientId} onChange={(e) => fillFromClient(e.target.value)}>
                <option value="">— wybierz lub wpisz ręcznie —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.caseNumber ? ` (${c.caseNumber})` : ""}</option>
                ))}
              </select>
            </Group>
          </Row>
          <Row>
            <Group label="Imię i Nazwisko *">
              <input className="wz-input" value={form.clientName} onChange={(e) => set("clientName", e.target.value)} placeholder="Jan Kowalski" />
            </Group>
            <Group label="Adres *">
              <input className="wz-input" value={form.clientAddress} onChange={(e) => set("clientAddress", e.target.value)} placeholder="ul. Polna 1, 00-001 Warszawa" />
            </Group>
          </Row>
        </Section>
        <Section label="Operator (adresat)">
          <Row>
            <Group label="Nazwa operatora *">
              <input className="wz-input" value={form.operatorNazwa} onChange={(e) => set("operatorNazwa", e.target.value)} placeholder="PGE Dystrybucja S.A." />
            </Group>
            <Group label="Adres operatora *">
              <input className="wz-input" value={form.operatorAdres} onChange={(e) => set("operatorAdres", e.target.value)} placeholder="ul. Garbarska 21A, 20-340 Lublin" />
            </Group>
          </Row>
        </Section>
        <Section label="Nieruchomość">
          <Row>
            <Group label="Identyfikator działki">
              <input className="wz-input" value={form.parcelId} onChange={(e) => set("parcelId", e.target.value)} placeholder="141906_5.0029.60" style={{ fontFamily: "monospace" }} />
            </Group>
            <Group label="Nr KW">
              <input className="wz-input" value={form.kwNumber} onChange={(e) => set("kwNumber", e.target.value)} placeholder="WA1M/00012345/6" style={{ fontFamily: "monospace" }} />
            </Group>
            <Group label="Gmina">
              <input className="wz-input" value={form.parcelGmina} onChange={(e) => set("parcelGmina", e.target.value)} placeholder="Baboszewo" />
            </Group>
          </Row>
        </Section>
        <Section label="Data i miejscowość">
          <Row>
            <Group label="Miejscowość">
              <input className="wz-input" value={form.miejscowosc} onChange={(e) => set("miejscowosc", e.target.value)} placeholder="Warszawa" />
            </Group>
            <Group label="Data pisma">
              <input className="wz-input" type="date" value={form.dataWniosku} onChange={(e) => set("dataWniosku", e.target.value)} />
            </Group>
          </Row>
        </Section>
      </>
    ),

    kw_odpis: (
      <>
        <Section label="Wnioskodawca">
          <Row>
            <Group label="Wybierz klienta" span={2}>
              <select className="wz-input" value={form.clientId} onChange={(e) => fillFromClient(e.target.value)}>
                <option value="">— wybierz lub wpisz ręcznie —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                ))}
              </select>
            </Group>
          </Row>
          <Row>
            <Group label="Imię i Nazwisko *">
              <input className="wz-input" value={form.clientName} onChange={(e) => set("clientName", e.target.value)} placeholder="Jan Kowalski" />
            </Group>
            <Group label="Adres *">
              <input className="wz-input" value={form.clientAddress} onChange={(e) => set("clientAddress", e.target.value)} placeholder="ul. Polna 1, 00-001 Warszawa" />
            </Group>
          </Row>
        </Section>
        <Section label="Nieruchomość">
          <Row>
            <Group label="Nr Księgi Wieczystej *">
              <input className="wz-input" value={form.kwNumber} onChange={(e) => set("kwNumber", e.target.value)} placeholder="WA1M/00012345/6" style={{ fontFamily: "monospace", fontSize: "1.05em", letterSpacing: "1px" }} />
            </Group>
            <Group label="Działka / Adres nieruchomości">
              <input className="wz-input" value={form.parcelId} onChange={(e) => set("parcelId", e.target.value)} placeholder="Działka nr 60, obr. Szapsk, gm. Baboszewo" />
            </Group>
          </Row>
        </Section>
        <Section label="Data i miejscowość">
          <Row>
            <Group label="Miejscowość">
              <input className="wz-input" value={form.miejscowosc} onChange={(e) => set("miejscowosc", e.target.value)} placeholder="Warszawa" />
            </Group>
            <Group label="Data wniosku">
              <input className="wz-input" type="date" value={form.dataWniosku} onChange={(e) => set("dataWniosku", e.target.value)} />
            </Group>
          </Row>
        </Section>
      </>
    ),
  };

  return (
    <div className="wz-form-wrap">
      <div className="wz-form-header">
        <div className="wz-form-title">{TEMPLATES.find((t) => t.id === template)?.title}</div>
        <div className="wz-form-sub">Wypełnij pola — podgląd dokumentu aktualizuje się na bieżąco</div>
      </div>
      {fields[template]}
      <div className="wz-form-actions">
        <button className="wz-btn wz-btn-primary" onClick={() => onGenerate(template, form)}>
          👁 Podgląd i wydruk
        </button>
      </div>
    </div>
  );
}

// ── Document generators ───────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return "……………";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
  } catch { return iso; }
}

function generateDocument(templateId, f) {
  const parcelDesc = [
    f.parcelId && `nr ew. ${f.parcelObreb || f.parcelId}`,
    f.parcelGmina && `obr. ${f.parcelGmina}`,
    f.parcelPowiat && `gm. ${f.parcelPowiat}`,
    f.voivodeship && `pow. ${f.voivodeship}`,
  ].filter(Boolean).join(", ") || "……………………";

  const styles = `
    <style>
      body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.6; color: #111; margin: 0; padding: 0; }
      .page { max-width: 700px; margin: 0 auto; padding: 40px 50px; }
      .header-right { text-align: right; margin-bottom: 30px; }
      .adresat { margin-bottom: 30px; }
      h2 { font-size: 13pt; text-align: center; text-transform: uppercase; margin: 30px 0 20px; letter-spacing: 0.5px; }
      p { margin: 0 0 12px; text-align: justify; }
      .indent { text-indent: 2em; }
      .section-title { font-weight: bold; margin-top: 20px; margin-bottom: 4px; }
      ol { margin: 10px 0 10px 20px; }
      li { margin-bottom: 6px; }
      .podpis { margin-top: 50px; text-align: right; }
      .zalaczniki { margin-top: 30px; font-size: 11pt; }
      .podstawa { font-size: 10pt; color: #555; margin-top: 20px; font-style: italic; }
      @media print { body { font-size: 12pt; } .page { padding: 20px 30px; } }
    </style>
  `;

  if (templateId === "starostwo_tytul") {
    return `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>Wniosek do starostwa</title>${styles}</head><body><div class="page">

<div class="header-right">
  <strong>${f.clientName || "……………………………………"}</strong><br>
  ${f.clientAddress || "……………………………………………………"}<br><br>
  ${f.miejscowosc || "……………………"}, dnia ${fmtDate(f.dataWniosku)}
</div>

<div class="adresat">
  <strong>${f.starostwoNazwa || "Starostwo Powiatowe w ………………"}</strong><br>
  ${f.starostwoAdres || "……………………………………………………"}
</div>

<h2>Wniosek o udzielenie informacji o tytule prawnym<br>do korzystania z nieruchomości przez urządzenia przesyłowe</h2>

<p class="indent">Działając jako właściciel nieruchomości gruntowej oznaczonej jako działka ewidencyjna ${parcelDesc}${f.kwNumber ? `, dla której prowadzona jest Księga Wieczysta nr <strong>${f.kwNumber}</strong>` : ""}, niniejszym zwracam się z wnioskiem o udzielenie informacji oraz udostępnienie dokumentów dotyczących urządzeń infrastruktury technicznej (przesyłowej) posadowionych na opisanej powyżej nieruchomości.</p>

<p class="section-title">I. Przedmiot wniosku</p>
<p class="indent">W związku z faktem, iż przez wskazaną nieruchomość przebiegają urządzenia przesyłowe (linie elektroenergetyczne, gazociągi lub inne sieci infrastruktury), wnoszę o udzielenie informacji oraz udostępnienie dokumentów w poniższym zakresie:</p>

<ol>
  <li>Czy Starostwo posiada w swoich zasobach archiwalnych jakiekolwiek <strong>decyzje administracyjne</strong> (pozwolenia na budowę, decyzje o lokalizacji inwestycji celu publicznego, decyzje wywłaszczeniowe lub inne), na podstawie których urządzenia przesyłowe zostały wybudowane na opisanej nieruchomości lub przez nią poprowadzone?</li>
  <li>Czy zostały wydane jakiekolwiek <strong>decyzje o zezwoleniu na realizację inwestycji</strong> lub inne akty administracyjne ustanawiające tytuł prawny do korzystania z ww. nieruchomości przez operatora sieci?</li>
  <li>Czy w zasobach geodezyjnych lub archiwalnych Starostwa znajdują się <strong>mapy sytuacyjno-wysokościowe, projekty budowlane lub operaty geodezyjne</strong> związane z budową urządzeń przesyłowych na wskazanej nieruchomości?</li>
  <li>Czy Starostwo dysponuje jakimikolwiek dokumentami potwierdzającymi, że właściciel nieruchomości lub jego poprzednik prawny <strong>wyraził zgodę</strong> na posadowienie urządzeń przesyłowych na nieruchomości?</li>
</ol>

<p class="section-title">II. Podstawa prawna</p>
<p class="indent">Niniejszy wniosek składany jest na podstawie art. 2 ust. 1 ustawy z dnia 6 września 2001 r. o dostępie do informacji publicznej (Dz.U. 2022 poz. 902 t.j.) w związku z art. 61 Konstytucji Rzeczypospolitej Polskiej, a w zakresie dotyczącym zasobów geodezyjnych — na podstawie art. 12 ust. 1 ustawy z dnia 17 maja 1989 r. Prawo geodezyjne i kartograficzne.</p>

<p class="section-title">III. Cel wniosku</p>
<p class="indent">Uzyskane dokumenty i informacje są niezbędne do ustalenia podstawy prawnej korzystania z nieruchomości przez operatora urządzeń przesyłowych, a w przypadku stwierdzenia braku tytułu prawnego — do dochodzenia wynagrodzenia za bezumowne korzystanie z nieruchomości w trybie art. 305¹–305⁴ Kodeksu cywilnego oraz art. 224–225 Kodeksu cywilnego.</p>

<p class="indent">Jednocześnie informuję, iż w przypadku braku tytułu prawnego do korzystania z nieruchomości, właściciel nieruchomości rozważa skierowanie do sądu wniosku o ustanowienie służebności przesyłu za wynagrodzeniem oraz powództwa o wynagrodzenie za bezumowne korzystanie.</p>

<p>Proszę o udzielenie odpowiedzi w ustawowym terminie 14 dni od daty otrzymania niniejszego wniosku. W przypadku, gdy żądane informacje stanowią informację publiczną przetworzoną — proszę o poinformowanie i wskazanie w jakim zakresie niezbędne jest wykazanie szczególnego interesu publicznego.</p>

<div class="podpis">
  ………………………………………<br>
  <small>${f.clientName || "Wnioskodawca"}</small>
</div>

<div class="zalaczniki">
  <strong>Załączniki:</strong><br>
  1. Odpis z ewidencji gruntów i budynków (wypis) — potwierdzający własność nieruchomości${f.kwNumber ? `<br>2. Odpis z Księgi Wieczystej nr ${f.kwNumber}` : ""}
</div>

<div class="podstawa">
Dokument wygenerowany przez System KSWS · SZUWARA Kancelaria Prawno-Podatkowa · ${new Date().toLocaleDateString("pl-PL")}
</div>

</div></body></html>`;
  }

  if (templateId === "operator_wezwanie") {
    return `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>Wezwanie do zapłaty</title>${styles}</head><body><div class="page">

<div class="header-right">
  <strong>${f.clientName || "……………………………………"}</strong><br>
  ${f.clientAddress || "……………………………………………………"}<br><br>
  ${f.miejscowosc || "……………………"}, dnia ${fmtDate(f.dataWniosku)}
</div>

<div class="adresat">
  <strong>${f.operatorNazwa || "…………………………………………………"}</strong><br>
  ${f.operatorAdres || "……………………………………………………"}
</div>

<h2>Przedsądowe wezwanie do zawarcia umowy służebności przesyłu<br>i zapłaty wynagrodzenia za bezumowne korzystanie z nieruchomości</h2>

<p class="indent">Działając jako właściciel nieruchomości gruntowej oznaczonej jako działka ewidencyjna ${parcelDesc}${f.kwNumber ? `, dla której prowadzona jest Księga Wieczysta nr <strong>${f.kwNumber}</strong>` : ""}, niniejszym <strong>wzywam</strong> Państwa do:</p>

<ol>
  <li><strong>Zawarcia umowy ustanowienia służebności przesyłu</strong> w formie aktu notarialnego za wynagrodzeniem ustalonym zgodnie z art. 305² § 2 Kodeksu cywilnego, odpowiednim do wartości nieruchomości i stopnia jej obciążenia;</li>
  <li><strong>Zapłaty wynagrodzenia za bezumowne korzystanie z nieruchomości</strong> za cały okres, w którym Państwa urządzenia przesyłowe są posadowione na przedmiotowej działce bez tytułu prawnego — na podstawie art. 225 w zw. z art. 224 § 2 Kodeksu cywilnego;</li>
  <li><strong>Przesłania pełnej dokumentacji</strong> potwierdzającej tytuł prawny do korzystania z nieruchomości, w szczególności: umów, decyzji administracyjnych, map sytuacyjnych urządzeń przesyłowych.</li>
</ol>

<p class="section-title">Podstawa prawna roszczenia</p>
<p class="indent">Na podstawie art. 305¹ KC właściciel nieruchomości może żądać, aby przedsiębiorca przesyłowy, który zamierza wybudować lub którego urządzenia znajdują się na nieruchomości, ustanowił służebność przesyłu za wynagrodzeniem. Zgodnie z art. 224 § 2 i art. 225 KC posiadacz w złej wierze (nieposiadający tytułu prawnego do korzystania z cudzej nieruchomości) obowiązany jest do wynagrodzenia za korzystanie z rzeczy oraz do naprawienia szkody.</p>

<p class="indent">W przypadku braku odpowiedzi lub odmowy zawarcia umowy w terminie <strong>30 dni</strong> od daty otrzymania niniejszego pisma, sprawa zostanie skierowana na drogę sądową — wniosek o ustanowienie służebności przesyłu oraz powództwo o zapłatę wynagrodzenia za bezumowne korzystanie z nieruchomości.</p>

<p>Odpowiedź proszę kierować na adres wskazany powyżej.</p>

<div class="podpis">
  ………………………………………<br>
  <small>${f.clientName || "Właściciel nieruchomości"}</small>
</div>

<div class="podstawa">
Dokument wygenerowany przez System KSWS · SZUWARA Kancelaria Prawno-Podatkowa · ${new Date().toLocaleDateString("pl-PL")}
</div>

</div></body></html>`;
  }

  if (templateId === "kw_odpis") {
    return `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>Wniosek o odpis KW</title>${styles}</head><body><div class="page">

<div class="header-right">
  <strong>${f.clientName || "……………………………………"}</strong><br>
  ${f.clientAddress || "……………………………………………………"}<br><br>
  ${f.miejscowosc || "……………………"}, dnia ${fmtDate(f.dataWniosku)}
</div>

<div class="adresat">
  <strong>Sąd Rejonowy — Wydział Ksiąg Wieczystych</strong><br>
  właściwy miejscowo dla nieruchomości
</div>

<h2>Wniosek o wydanie odpisu z Księgi Wieczystej</h2>

<p class="indent">Wnoszę o wydanie <strong>pełnego odpisu</strong> z Księgi Wieczystej nr <strong>${f.kwNumber || "……………………………"}</strong> prowadzonej dla nieruchomości${f.parcelId ? ` — ${f.parcelId}` : ""}.</p>

<p class="section-title">Rodzaj odpisu:</p>
<p>☑ Odpis zupełny (zawierający wszystkie działy, w tym wpisy wykreślone)</p>

<p class="section-title">Cel:</p>
<p class="indent">Odpis jest niezbędny do ustalenia treści wpisów dotyczących obciążeń nieruchomości, w szczególności ewentualnie ustanowionych służebności gruntowych lub przesyłu (Dział III KW), oraz do weryfikacji stanu prawnego nieruchomości w związku z roszczeniami dotyczącymi bezumownego korzystania z nieruchomości przez operatora urządzeń przesyłowych.</p>

<p class="section-title">Podstawa prawna:</p>
<p class="indent">Art. 36 ustawy z dnia 6 lipca 1982 r. o księgach wieczystych i hipotece (Dz.U. 2023 poz. 1984 t.j.). Opłata: 30 zł za odpis zupełny (§ 1 pkt 1 lit. b rozporządzenia MS z dnia 15.02.2016 r.).</p>

<div class="podpis">
  ………………………………………<br>
  <small>${f.clientName || "Wnioskodawca"}</small>
</div>

<div class="zalaczniki">
  <strong>Załączniki:</strong><br>
  1. Potwierdzenie uiszczenia opłaty sądowej — 30 zł
</div>

<div class="podstawa">
Dokument wygenerowany przez System KSWS · SZUWARA Kancelaria Prawno-Podatkowa · ${new Date().toLocaleDateString("pl-PL")}
</div>

</div></body></html>`;
  }

  return "<html><body><p>Brak szablonu</p></body></html>";
}

// ── Helper components ─────────────────────────────────────────────────────────
function Section({ label, children }) {
  return (
    <div className="wz-section">
      <div className="wz-section-label">{label}</div>
      {children}
    </div>
  );
}
function Row({ children }) {
  return <div className="wz-row">{children}</div>;
}
function Group({ label, children, span }) {
  return (
    <div className="wz-group" style={span ? { gridColumn: `span ${span}` } : {}}>
      <label className="wz-label">{label}</label>
      {children}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function WzoryPage() {
  const [active, setActive] = useState(null); // selected template id
  const [previewHtml, setPreviewHtml] = useState(null);
  const iframeRef = useRef(null);

  function handleGenerate(templateId, form) {
    const html = generateDocument(templateId, form);
    setPreviewHtml(html);
  }

  function handlePrint() {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  }

  function handleDownload() {
    if (!previewHtml) return;
    const tmpl = TEMPLATES.find((t) => t.id === active);
    const blob = new Blob([previewHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tmpl?.id || "dokument"}_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="wz-root">
      <header className="ksws-page-header">
        <h1 className="ksws-page-header-title">📝 Wzory dokumentów</h1>
        <p className="ksws-page-header-sub">Szablony pism do starostwa, operatora sieci i KW · wypełnij pola, wygeneruj dokument do druku</p>
      </header>
      <div className="wz-body">
      {/* ══ LEFT — template picker ══ */}
      <aside className="wz-sidebar">
        <div className="wz-sidebar-title">
          <span>📄</span> Wybór wzoru
        </div>
        <div className="wz-template-list">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              className={`wz-template-item ${active === t.id ? "active" : ""}`}
              onClick={() => { setActive(t.id); setPreviewHtml(null); }}
            >
              <span className="wz-tpl-icon">{t.icon}</span>
              <div className="wz-tpl-info">
                <div className="wz-tpl-cat">{t.category}</div>
                <div className="wz-tpl-title">{t.title}</div>
                <div className="wz-tpl-desc">{t.desc}</div>
              </div>
              {t.urgent && <span className="wz-tpl-badge">Ważny</span>}
            </button>
          ))}
        </div>

        <div className="wz-sidebar-info">
          <div className="wz-info-icon">ℹ️</div>
          <div className="wz-info-text">
            Wniosek do starostwa służy do ustalenia czy istnieje <strong>tytuł prawny</strong> (decyzja, zgoda, umowa) do korzystania z nieruchomości. Brak tytułu = WBK należy się od początku.
          </div>
        </div>
      </aside>

      {/* ══ RIGHT — form + preview ══ */}
      <main className="wz-main">
        {!active && (
          <div className="wz-empty">
            <div className="wz-empty-icon">📄</div>
            <div className="wz-empty-title">Wybierz wzór dokumentu</div>
            <div className="wz-empty-sub">Kliknij jeden z szablonów po lewej stronie</div>
          </div>
        )}

        {active && !previewHtml && (
          <TemplateForm template={active} onGenerate={handleGenerate} />
        )}

        {active && previewHtml && (
          <div className="wz-preview-wrap">
            <div className="wz-preview-toolbar">
              <button className="wz-btn wz-btn-outline" onClick={() => setPreviewHtml(null)}>
                ← Wróć do formularza
              </button>
              <button className="wz-btn wz-btn-primary" onClick={handlePrint}>
                🖨️ Drukuj / Zapisz PDF
              </button>
              <button className="wz-btn wz-btn-outline" onClick={handleDownload}>
                ⬇ Pobierz HTML
              </button>
            </div>
            <iframe
              ref={iframeRef}
              className="wz-preview-frame"
              srcDoc={previewHtml}
              title="Podgląd dokumentu"
            />
          </div>
        )}
      </main>
      </div>
    </div>
  );
}
