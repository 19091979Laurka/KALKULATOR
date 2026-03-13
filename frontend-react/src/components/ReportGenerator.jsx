import React, { useState } from 'react';

/**
 * ReportGenerator - Generuje piękny raport HTML z danymi działki
 * Obsługuje: Generowanie PDF, HTML, eksport danych
 * Design: Kolorowe boxy inspirowane Dashboard template
 *
 * Props:
 * - parcelData: Object with complete parcel analysis data
 * - onDownload: Callback function when report is generated
 */

const ReportGenerator = ({ parcelData, onDownload = null }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportFormat, setReportFormat] = useState('pdf');
  const [darkMode, setDarkMode] = useState(false);

  const generateHTMLReport = (data, isDark = false) => {
    if (!data) {
      return `<html><body><h1>Brak danych do wygenerowania raportu</h1></body></html>`;
    }

    // WAŻNE: Dane mogą mieć strukturę result.master_record lub result.data
    const masterRecord = data.master_record || data.data || data;

    // DEBUG
    console.log('📊 ReportGenerator - Dane wejściowe:', data);
    console.log('📊 Master Record:', masterRecord);

    const formatCurrency = (value) => {
      if (!value || isNaN(value)) return '0,00';
      return (Math.round(value * 100) / 100).toLocaleString('pl-PL', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    };

    const formatNumber = (value) => {
      if (!value || isNaN(value)) return '0';
      return Number(value).toLocaleString('pl-PL');
    };

    const colors = {
      bg: '#edeff3',
      bgCard: 'white',
      text: '#2c3e50',
      textSecondary: '#7f8c8d',
      border: '#e1e4f0',
      headerGradient: 'linear-gradient(135deg, #1a1a2e, #2c3e50)',
      headerText: 'white',
      accent: '#b8963e',
      accentAlt: '#e74c3c',
      success: '#27ae60',
      warning: '#f39c12',
      warningBg: '#fff8ee',
      successBg: '#e8f5e9',
      successText: '#2e7d32'
    };

    const parcelId = data.parcel_id || '—';
    const area = masterRecord?.geometry?.area_m2 || 0;
    const commune = masterRecord?.parcel_metadata?.commune || '—';
    const county = masterRecord?.parcel_metadata?.county || '—';
    const region = masterRecord?.parcel_metadata?.region || '—';
    const perimeter = masterRecord?.geometry?.perimeter_m || 0;
    const shapeClass = masterRecord?.geometry?.shape_class || '—';
    const landClass = masterRecord?.egib?.primary_class || '—';
    const landType = masterRecord?.egib?.land_type || '—';
    const buildingCount = masterRecord?.buildings?.count || 0;
    const unitPrice = masterRecord?.market_data?.average_price_m2 || 0;
    const priceSource = masterRecord?.market_data?.price_source || '—';
    const transactions = masterRecord?.market_data?.transactions_count || 0;
    const propertyValue = masterRecord?.ksws?.property_value_total || 0;
    const voltage = masterRecord?.infrastructure?.power_lines?.voltage || '—';
    const lineLength = masterRecord?.infrastructure?.power_lines?.length_m || 0;
    const occupiedArea = masterRecord?.infrastructure?.power?.occupied_area_m2 || 0;
    const coeffS = masterRecord?.ksws?.coeffs?.S || 0;
    const coeffK = masterRecord?.ksws?.coeffs?.k || 0;
    const coeffR = masterRecord?.ksws?.coeffs?.R || 0;
    const coeffU = masterRecord?.ksws?.coeffs?.u || 0;
    const obnValue = masterRecord?.compensation?.track_a?.obn || 0;
    const trackA_wsp = masterRecord?.compensation?.track_a?.wsp || 0;
    const trackA_wbk = masterRecord?.compensation?.track_a?.wbk || 0;
    const trackA_obn = masterRecord?.compensation?.track_a?.obn || 0;
    const trackA_total = masterRecord?.compensation?.track_a?.total || 0;
    const trackA_years = masterRecord?.compensation?.track_a?.years || 10;
    const trackB_total = masterRecord?.compensation?.track_b?.total || 0;
    const trackB_years = masterRecord?.compensation?.track_b?.total ? trackA_years : 10;
    const multiplier = masterRecord?.compensation?.track_b?.multiplier || 1.56;
    const infraDetected = masterRecord?.infrastructure?.power_lines?.detected || false;

    // DEBUG KPI values
    console.log('📍 KPI Values:', {
      area, propertyValue, trackA_total, trackB_total,
      commune, county, region, parcelId
    });

    const html = `
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Raport KSWS - Kalkulator Roszczeń Przesyłowych</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            background: ${colors.bg};
            color: ${colors.text};
            line-height: 1.7;
            height: 100%;
        }
        .report-container {
            max-width: 900px;
            margin: 0 auto;
            padding: 50px 40px;
            background: ${colors.bg};
        }
        .report-header {
            background: ${colors.headerGradient};
            color: ${colors.headerText};
            padding: 50px;
            border-radius: 0;
            margin: -50px -40px 50px -40px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
            text-align: center;
        }
        .report-header h1 {
            font-size: 2.8rem;
            margin-bottom: 8px;
            font-weight: 700;
            letter-spacing: -0.5px;
        }
        .report-header p {
            font-size: 1rem;
            opacity: 0.9;
            margin-bottom: 0;
            font-weight: 400;
        }
        .report-meta {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 30px;
            margin-top: 30px;
            font-size: 0.9rem;
            opacity: 0.85;
        }
        .meta-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }
        .meta-label {
            font-weight: 700;
            margin-bottom: 6px;
            font-size: 0.9rem;
        }
        .content-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            margin-bottom: 40px;
            margin-left: 0;
            margin-right: 0;
        }
        .card {
            background: ${colors.bgCard};
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
            border: 1px solid ${colors.border};
            page-break-inside: avoid;
        }
        .card h2 {
            font-size: 1.6rem;
            color: ${colors.accent};
            margin-bottom: 28px;
            padding-bottom: 16px;
            border-bottom: 3px solid ${colors.accent};
            font-weight: 700;
        }
        .card h3 {
            font-size: 1.05rem;
            color: ${colors.text};
            margin-top: 28px;
            margin-bottom: 16px;
            font-weight: 700;
        }
        .card h3:first-child {
            margin-top: 0;
        }
        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin: 0 0 24px 0;
        }
        .data-table tr {
            border-bottom: 1px solid ${colors.border};
        }
        .data-table tr:last-child {
            border-bottom: none;
        }
        .data-table td {
            padding: 14px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .data-table .label {
            font-weight: 600;
            color: ${colors.textSecondary};
            flex: 1;
            font-size: 0.95rem;
        }
        .data-table .value {
            color: ${colors.text};
            font-weight: 600;
            font-size: 0.95rem;
            text-align: right;
        }
        .data-table .value.highlight {
            color: ${colors.accent};
            font-weight: 700;
            font-size: 1rem;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin: 24px 0;
        }
        .stat-box {
            background: ${isDark ? 'rgba(0, 212, 255, 0.08)' : '#f8f9fa'};
            padding: 24px;
            border-radius: 8px;
            text-align: center;
            border: 1px solid ${isDark ? 'rgba(0, 212, 255, 0.2)' : '#e9ecef'};
            border-top: 4px solid ${colors.accent};
        }
        .stat-box.success {
            background: ${isDark ? 'rgba(38, 208, 124, 0.08)' : '#ecfdf5'};
            border-top-color: ${colors.success};
            border-color: ${isDark ? 'rgba(38, 208, 124, 0.2)' : '#d1f2eb'};
        }
        .stat-label {
            font-size: 0.85rem;
            color: ${colors.textSecondary};
            font-weight: 600;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .stat-value {
            font-size: 1.8rem;
            font-weight: 700;
            color: ${colors.text};
        }
        .stat-value.success {
            color: ${colors.success};
        }
        .full-width { grid-column: 1 / -1; }
        .track-comparison {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin: 24px 0;
        }
        .track-box {
            padding: 32px;
            border-radius: 8px;
            border-left: 5px solid ${colors.accent};
            page-break-inside: avoid;
        }
        .track-box.track-a {
            background: ${isDark ? 'rgba(102, 126, 234, 0.08)' : '#eef4ff'};
            border-left-color: ${colors.accent};
        }
        .track-box.track-b {
            background: ${isDark ? 'rgba(255, 165, 0, 0.08)' : '#fff8ee'};
            border-left-color: ${colors.warning};
        }
        .track-title {
            font-size: 1.2rem;
            font-weight: 700;
            margin-bottom: 20px;
            color: ${colors.text};
        }
        .track-value {
            font-size: 2.4rem;
            font-weight: 700;
            color: ${colors.accent};
            margin: 12px 0;
            line-height: 1.1;
        }
        .track-box.track-b .track-value {
            color: ${colors.warning};
        }
        .warning-box {
            background: ${colors.warningBg};
            border: 2px solid ${colors.warning};
            border-radius: 8px;
            padding: 20px;
            margin: 24px 0;
            color: ${isDark ? colors.warning : '#7d6608'};
        }
        .warning-box h4 {
            margin-bottom: 8px;
            font-size: 1rem;
            font-weight: 700;
        }
        .warning-box p {
            margin: 0;
            font-size: 0.9rem;
        }
        .success-box {
            background: ${colors.successBg};
            border: 2px solid ${colors.success};
            border-radius: 8px;
            padding: 20px;
            margin: 24px 0;
            color: ${colors.successText};
        }
        .footer {
            text-align: center;
            padding: 40px 0;
            color: ${colors.textSecondary};
            font-size: 0.85rem;
            border-top: 1px solid ${colors.border};
            margin-top: 60px;
        }
        .footer p {
            margin: 8px 0;
        }
        .track-compare-value {
            font-size: 0.9rem;
            color: ${colors.textSecondary};
            margin-top: 12px;
            font-weight: 500;
        }
        .track-box.track-b .track-compare-value {
            color: ${colors.warning};
            font-weight: 700;
        }
        .kpi-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr 1fr;
            gap: 20px;
            margin: 30px 0;
        }
        .kpi-box {
            padding: 24px;
            border-radius: 10px;
            text-align: left;
            border: none;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
            page-break-inside: avoid;
            position: relative;
            overflow: hidden;
        }
        .kpi-box::after {
            content: '§';
            position: absolute;
            right: 10px;
            bottom: -10px;
            font-size: 60px;
            font-weight: 900;
            opacity: 0.1;
        }
        .kpi-box.blue {
            background: linear-gradient(135deg, #1e88e5, #42a5f5);
            color: white;
        }
        .kpi-box.green {
            background: linear-gradient(135deg, #43a047, #66bb6a);
            color: white;
        }
        .kpi-box.orange {
            background: linear-gradient(135deg, #f39c12, #e67e22);
            color: white;
        }
        .kpi-box.purple {
            background: linear-gradient(135deg, #3d2319, #5d3b27);
            color: white;
        }
        .kpi-label {
            font-size: 0.8rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
            opacity: 0.85;
        }
        .kpi-value {
            font-size: 1.8rem;
            font-weight: 900;
            line-height: 1.2;
        }
        .kpi-sub {
            font-size: 0.75rem;
            opacity: 0.8;
            margin-top: 4px;
        }
        .methodology-box {
            background: #f8f9fa;
            border: 2px solid #667eea;
            border-radius: 10px;
            padding: 24px;
            margin: 24px 0;
            border-left: 6px solid #667eea;
        }
        .methodology-box h4 {
            color: #667eea;
            font-weight: 700;
            margin-bottom: 12px;
        }
        .methodology-box p {
            font-size: 0.9rem;
            line-height: 1.6;
            margin: 8px 0;
            color: #555;
        }
        @media print {
            html, body { background: white; }
            .report-container { padding: 40px; }
            .card { box-shadow: none; border: 1px solid #ddd; page-break-inside: avoid; }
            .report-header { margin: 0; padding: 40px; }
            .content-grid { gap: 30px; }
            .kpi-grid { gap: 15px; }
        }
    </style>
</head>
<body>
    <div class="report-container">
        <div class="report-header">
            <div class="report-header-main">
                <h1>Raport KSWS — Analiza Działki</h1>
                <p class="sub">Szacunkowa wartość odszkodowania z tytułu infrastruktury przesyłowej</p>
                <div class="report-meta">
                    <div class="meta-item"><span class="meta-label">Identyfikator działki</span><span class="meta-value">${parcelId}</span></div>
                    <div class="meta-item"><span class="meta-label">Lokalizacja</span><span class="meta-value">${commune}, ${county}, ${region}</span></div>
                    <div class="meta-item"><span class="meta-label">Data analizy</span><span class="meta-value">${new Date().toLocaleDateString('pl-PL')}</span></div>
                </div>
            </div>
            <div class="logo-col">
                <div style="font-weight: 800; font-size: 24px; letter-spacing: -0.5px; color: #b8963e;">KSWS</div>
                <div style="opacity: 0.9; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Kalkulator Roszczeń</div>
                <div class="logo-badge" style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);">✓ Dane zweryfikowane</div>
            </div>
        </div>


        <div class="content-grid">
            <div class="card">
                <h2>📋 Dane Nieruchomości</h2>
                <table class="data-table">
                    <tr><td><span class="label">ID Działki (TERYT):</span><span class="value">${parcelId}</span></td></tr>
                    <tr><td><span class="label">Powierzchnia:</span><span class="value highlight">${formatNumber(area.toFixed(2))} m²</span></td></tr>
                    <tr><td><span class="label">Cena za m²:</span><span class="value">${unitPrice} PLN/m²</span></td></tr>
                    <tr><td><span class="label">Wartość nieruchomości:</span><span class="value highlight">${formatCurrency(propertyValue)} PLN</span></td></tr>
                    <tr><td><span class="label">Źródło ceny:</span><span class="value">${priceSource}</span></td></tr>
                </table>
            </div>

            <div class="card">
                <h2>⚡ Infrastruktura Przesyłowa</h2>
                <table class="data-table">
                    <tr><td><span class="label">Wykryta infrastruktura:</span><span class="value">${hasInfrastructure ? 'TAK' : 'NIE'}</span></td></tr>
                    <tr><td><span class="label">Napięcie linii:</span><span class="value highlight">${voltage}</span></td></tr>
                    <tr><td><span class="label">Długość linii na działce:</span><span class="value highlight">${formatNumber(lineLength)} m</span></td></tr>
                    <tr><td><span class="label">Szerokość pasa ochronnego:</span><span class="value">${formatNumber(protectionZone)} m</span></td></tr>
                    <tr><td><span class="label">Powierzchnia zajęta:</span><span class="value highlight">${formatNumber(occupiedArea)} m²</span></td></tr>
                </table>
            </div>
        </div>



        <div class="footer" style="text-align: center; padding: 20px 0; color: #7f8c8d; font-size: 11px; border-top: 1px solid #e1e4f0; margin-top: 40px;">
            <p style="font-weight: 700; margin-bottom: 4px;">© ${new Date().getFullYear()} KSWS · Kalkulator Roszczeń</p>
            <p style="margin-bottom: 10px;">Wygenerowano automatycznie w systemie KSWS</p>
            <p style="color: #95a5a6; font-size: 10px; max-width: 600px; margin: 0 auto; line-height: 1.4;">
                Dokument ma charakter informacyjny i szacunkowy. Wartości zostały wyliczone na podstawie wprowadzonych parametrów i algorytmów systemu KSWS. Nie stanowi on operatu szacunkowego w rozumieniu przepisów prawa.
            </p>
        </div>
    </div>
</body>
</html>
    `;

    return html;
  };

  const handleGenerateReport = async () => {
    setIsGenerating(true);

    try {
      // Zawsze generuj z jasnym motywem dla lepszego wyglądu raportów
      const htmlContent = generateHTMLReport(parcelData, false);

      if (reportFormat === 'html') {
        // Pobierz HTML
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `raport-${parcelData.parcel_id}-${new Date().toISOString().split('T')[0]}.html`;
        link.click();
        URL.revokeObjectURL(url);
      } else if (reportFormat === 'pdf') {
        // Otwórz w nowej karcie (user może wydrukować jako PDF)
        // Użyj Blob URL zamiast document.write() - bardziej niezawodne w nowoczesnych przeglądarkach
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        const pdfWindow = window.open(blobUrl, '_blank');
        if (pdfWindow) {
          pdfWindow.onload = function() {
            // Add a print button to the generated HTML
            const printBtn = pdfWindow.document.createElement('button');
            printBtn.innerHTML = '🖨️ Drukuj / Zapisz PDF';
            printBtn.style.cssText = 'position: fixed; top: 20px; right: 20px; background: linear-gradient(135deg, #b8963e, #d4af62); color: white; border: none; padding: 10px 28px; border-radius: 50px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(184,150,62,0.4); z-index: 9999;';
            printBtn.className = 'no-print';
            printBtn.onclick = function() { pdfWindow.print(); };
            pdfWindow.document.body.appendChild(printBtn);
          };
          pdfWindow.focus();
          // Wyczyść URL po krótkim opóźnieniu
          setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
        } else {
          console.error('Nie udało się otworzyć okna podglądu PDF. Sprawdź blokady pop-upów.');
          alert('Nie udało się otworzyć podglądu PDF. Sprawdź ustawienia blokady pop-upów w przeglądarce.');
        }
      } else if (reportFormat === 'json') {
        // Pobierz dane jako JSON
        const json = JSON.stringify(parcelData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `raport-${parcelData.parcel_id}-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
      }

      if (onDownload) {
        onDownload({
          format: reportFormat,
          parcelId: parcelData.parcel_id,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error generating report:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={{
      padding: '20px',
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 4px 15px rgba(0, 0, 0, 0.08)',
      marginBottom: '30px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 style={{ margin: 0, color: '#2c3e50' }}>📄 Generuj Raport</h3>
        <div style={{ fontSize: '0.85rem', color: '#27ae60', fontWeight: '600' }}>✅ Jasny motyw z kolorowymi boxami</div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr 1fr',
        gap: '15px',
        marginBottom: '15px'
      }}>
        {[
          { value: 'html', label: '📄 HTML', icon: '📄' },
          { value: 'pdf', label: '🖨️ PDF (Preview)', icon: '🖨️' },
          { value: 'json', label: '📊 JSON', icon: '📊' }
        ].map(format => (
          <label key={format.value} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px',
            border: `2px solid ${reportFormat === format.value ? '#667eea' : '#ecf0f1'}`,
            borderRadius: '8px',
            cursor: 'pointer',
            background: reportFormat === format.value ? '#f0f4ff' : '#fff',
            transition: 'all 0.3s ease'
          }}>
            <input
              type="radio"
              value={format.value}
              checked={reportFormat === format.value}
              onChange={(e) => setReportFormat(e.target.value)}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontWeight: '500', color: '#2c3e50' }}>{format.label}</span>
          </label>
        ))}
      </div>

      <button
        onClick={handleGenerateReport}
        disabled={isGenerating}
        style={{
          width: '100%',
          padding: '14px 30px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '1rem',
          fontWeight: '600',
          cursor: isGenerating ? 'not-allowed' : 'pointer',
          opacity: isGenerating ? 0.7 : 1,
          transition: 'all 0.3s ease',
          boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)'
        }}
        onMouseEnter={(e) => {
          if (!isGenerating) {
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.4)';
          }
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = 'translateY(0)';
          e.target.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.3)';
        }}
      >
        {isGenerating ? '⏳ Generuję...' : '📥 Generuj i Pobierz'}
      </button>

      <p style={{
        marginTop: '10px',
        fontSize: '0.85rem',
        color: '#95a5a6',
        textAlign: 'center'
      }}>
        {reportFormat === 'pdf' && 'Otwiera się w nowej karcie - możesz wydrukować lub zapisać'}
        {reportFormat === 'html' && 'Pobiera plik HTML - otworz w przeglądarce'}
        {reportFormat === 'json' && 'Pobiera dane w formacie JSON do dalszej analizy'}
      </p>
    </div>
  );
};

export default ReportGenerator;
