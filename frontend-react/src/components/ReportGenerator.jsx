import React, { useState } from 'react';

/**
 * ReportGenerator - Generuje raport HTML z danymi działki
 * Obsługuje: Generowanie PDF, HTML, eksport danych
 *
 * Props:
 * - parcelData: Object with complete parcel analysis data
 * - onDownload: Callback function when report is generated
 */

const ReportGenerator = ({ parcelData, onDownload = null }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportFormat, setReportFormat] = useState('pdf');

  const generateHTMLReport = (data) => {
    const formatCurrency = (value) => {
      return (Math.round(value * 100) / 100).toLocaleString('pl-PL', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    };

    const formatNumber = (value) => {
      return value.toLocaleString('pl-PL');
    };

    const parcelId = data.parcel_id || '—';
    const area = data.data?.geometry?.area_m2 || 0;
    const commune = data.data?.parcel_metadata?.commune || '—';
    const county = data.data?.parcel_metadata?.county || '—';
    const region = data.data?.parcel_metadata?.region || '—';
    const perimeter = data.data?.geometry?.perimeter_m || 0;
    const shapeClass = data.data?.geometry?.shape_class || '—';
    const landClass = data.data?.egib?.primary_class || '—';
    const landType = data.data?.egib?.land_type || '—';
    const buildingCount = data.data?.buildings?.count || 0;
    const unitPrice = data.data?.market_data?.average_price_m2 || 0;
    const priceSource = data.data?.market_data?.price_source || '—';
    const transactions = data.data?.market_data?.transactions_count || 0;
    const propertyValue = data.data?.ksws?.property_value_total || 0;
    const voltage = data.data?.infrastructure?.power_lines?.voltage || '—';
    const lineLength = data.data?.infrastructure?.power_lines?.length_m || 0;
    const occupiedArea = data.data?.infrastructure?.power?.occupied_area_m2 || 0;
    const coeffS = data.data?.ksws?.coeffs?.S || 0;
    const coeffK = data.data?.ksws?.coeffs?.k || 0;
    const coeffR = data.data?.ksws?.coeffs?.R || 0;
    const coeffU = data.data?.ksws?.coeffs?.u || 0;
    const obnValue = data.data?.compensation?.track_a?.obn || 0;
    const trackA_wsp = data.data?.compensation?.track_a?.wsp || 0;
    const trackA_wbk = data.data?.compensation?.track_a?.wbk || 0;
    const trackA_obn = data.data?.compensation?.track_a?.obn || 0;
    const trackA_total = data.data?.compensation?.track_a?.total || 0;
    const trackA_years = data.data?.compensation?.track_a?.years || 10;
    const trackB_total = data.data?.compensation?.track_b?.total || 0;
    const trackB_years = data.data?.compensation?.track_b?.total ? trackA_years : 10;
    const multiplier = data.data?.compensation?.track_b?.multiplier || 1.56;
    const infraDetected = data.data?.infrastructure?.power_lines?.detected || false;

    const html = `
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Raport KSWS - ${parcelId}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f5f7fa;
            color: #2c3e50;
            line-height: 1.6;
        }
        .report-container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 40px 20px;
            background: white;
        }
        .report-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            border-radius: 12px;
            margin-bottom: 30px;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
        }
        .report-header h1 { font-size: 2.5rem; margin-bottom: 10px; }
        .report-header p { font-size: 1.1rem; opacity: 0.95; margin-bottom: 5px; }
        .report-meta {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 20px;
            margin-top: 20px;
            font-size: 0.95rem;
            opacity: 0.9;
        }
        .meta-item { display: flex; flex-direction: column; }
        .meta-label { font-weight: 600; margin-bottom: 5px; }
        .content-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin-bottom: 30px;
        }
        .card {
            background: white;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
            border: 1px solid #ecf0f1;
        }
        .card h2 {
            font-size: 1.5rem;
            color: #2c3e50;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 3px solid #667eea;
        }
        .card h3 {
            font-size: 1.1rem;
            color: #34495e;
            margin-top: 20px;
            margin-bottom: 15px;
        }
        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
        }
        .data-table tr { border-bottom: 1px solid #ecf0f1; }
        .data-table td {
            padding: 12px 0;
            display: flex;
            justify-content: space-between;
        }
        .data-table .label {
            font-weight: 600;
            color: #7f8c8d;
        }
        .data-table .value {
            color: #2c3e50;
            font-weight: 500;
        }
        .data-table .value.highlight {
            color: #e74c3c;
            font-weight: 700;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin: 20px 0;
        }
        .stat-box {
            background: linear-gradient(135deg, #ecf0f1 0%, #bdc3c7 100%);
            padding: 20px;
            border-radius: 10px;
            text-align: center;
            border-left: 4px solid #95a5a6;
        }
        .stat-box.success {
            background: linear-gradient(135deg, #d5f4e6 0%, #a9dfbf 100%);
            border-left-color: #27ae60;
        }
        .stat-label {
            font-size: 0.85rem;
            color: #7f8c8d;
            font-weight: 500;
            margin-bottom: 8px;
        }
        .stat-value {
            font-size: 2rem;
            font-weight: 700;
            color: #2c3e50;
        }
        .stat-value.success { color: #27ae60; }
        .full-width { grid-column: 1 / -1; }
        .track-comparison {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin: 20px 0;
        }
        .track-box {
            padding: 20px;
            border-radius: 10px;
            border-left: 5px solid #667eea;
        }
        .track-box.track-a {
            background: #ecf0f1;
            border-left-color: #2c3e50;
        }
        .track-box.track-b {
            background: #fff3cd;
            border-left-color: #f39c12;
        }
        .track-title {
            font-size: 1.1rem;
            font-weight: 700;
            margin-bottom: 15px;
        }
        .track-value {
            font-size: 2.2rem;
            font-weight: 700;
            color: #2c3e50;
            margin: 10px 0;
        }
        .warning-box {
            background: #fff3cd;
            border: 2px solid #f39c12;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            color: #7d6608;
        }
        .warning-box h4 { margin-bottom: 10px; }
        .success-box {
            background: #d5f4e6;
            border: 2px solid #27ae60;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            color: #196f3d;
        }
        .footer {
            text-align: center;
            padding: 30px;
            color: #95a5a6;
            font-size: 0.85rem;
            border-top: 1px solid #ecf0f1;
            margin-top: 60px;
        }
        @media print {
            body { background: white; }
            .card { box-shadow: none; border: 1px solid #ecf0f1; page-break-inside: avoid; }
            .report-container { padding: 20px; }
        }
    </style>
</head>
<body>
    <div class="report-container">
        <div class="report-header">
            <h1>📊 Raport Analiza KSWS</h1>
            <p>Metodologia Wyceny Odszkodowań dla Transmission Infrastructure Impact</p>
            <div class="report-meta">
                <div class="meta-item">
                    <span class="meta-label">🏗️ ID Działki:</span>
                    <span>${parcelId}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">📍 Lokalizacja:</span>
                    <span>${commune}, ${county}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">📅 Data Raportu:</span>
                    <span>${new Date().toLocaleDateString('pl-PL')}</span>
                </div>
            </div>
        </div>

        <div class="content-grid">
            <div class="card">
                <h2>📋 Dane Działki</h2>
                <h3>Lokalizacja i Identyfikacja</h3>
                <table class="data-table">
                    <tr><td><span class="label">ID Działki (TERYT):</span><span class="value">${parcelId}</span></td></tr>
                    <tr><td><span class="label">Gmina:</span><span class="value">${commune}</span></td></tr>
                    <tr><td><span class="label">Powiat:</span><span class="value">${county}</span></td></tr>
                    <tr><td><span class="label">Województwo:</span><span class="value">${region}</span></td></tr>
                </table>
                <h3>Parametry Geometryczne</h3>
                <table class="data-table">
                    <tr><td><span class="label">Powierzchnia:</span><span class="value highlight">${formatNumber(area.toFixed(2))} m²</span></td></tr>
                    <tr><td><span class="label">Obwód:</span><span class="value">${formatNumber(perimeter.toFixed(1))} m</span></td></tr>
                    <tr><td><span class="label">Klasa kształtu:</span><span class="value">${shapeClass}</span></td></tr>
                </table>
            </div>

            <div class="card">
                <h2>💰 Wycena Nieruchomości</h2>
                <h3>Cena Gruntu</h3>
                <table class="data-table">
                    <tr><td><span class="label">Cena jednostkowa:</span><span class="value highlight">${unitPrice} zł/m²</span></td></tr>
                    <tr><td><span class="label">Źródło ceny:</span><span class="value">${priceSource}</span></td></tr>
                    <tr><td><span class="label">Transakcje lokalne:</span><span class="value">${transactions}</span></td></tr>
                </table>
                <h3>Wartość Całkowita</h3>
                <div class="stats-grid">
                    <div class="stat-box success">
                        <div class="stat-label">💵 Wartość Gruntu</div>
                        <div class="stat-value success">${formatCurrency(propertyValue)} zł</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">📐 Pow. m²</div>
                        <div class="stat-value">${formatNumber((area / 1000).toFixed(1))} tys.</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card full-width">
            <h2>📊 Analiza KSWS - Współczynniki</h2>
            ${infraDetected ? '' : '<div class="warning-box"><h4>⚠️ Uwaga</h4><p>Dane linii energetycznej nie zostały automatycznie pobrane. Wartości bazują na teoretycznych założeniach.</p></div>'}
            <div class="stats-grid">
                <div class="stat-box">
                    <div class="stat-label">S (Wpływ społeczny)</div>
                    <div class="stat-value">${coeffS}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">k (Strata pożyteczności)</div>
                    <div class="stat-value">${coeffK}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">R (Strata wartości)</div>
                    <div class="stat-value">${coeffR}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">u (Faktor użytkowania)</div>
                    <div class="stat-value">${coeffU}</div>
                </div>
            </div>
            <h3>Infrastruktura</h3>
            <table class="data-table">
                <tr><td><span class="label">Napięcie:</span><span class="value">${voltage}</span></td></tr>
                <tr><td><span class="label">Długość linii:</span><span class="value highlight">${formatNumber(lineLength)} m</span></td></tr>
                <tr><td><span class="label">Zajęta powierzchnia:</span><span class="value">${formatNumber(occupiedArea.toFixed(2))} m²</span></td></tr>
            </table>
        </div>

        <div class="card full-width">
            <h2>💸 Odszkodowanie - Track A vs Track B</h2>
            <div class="track-comparison">
                <div class="track-box track-a">
                    <div class="track-title">⚖️ TRACK A - Sądowe</div>
                    <table class="data-table" style="border: none;">
                        <tr><td style="border: none;"><span class="label">WSP:</span><span class="value">${formatCurrency(trackA_wsp)} zł</span></td></tr>
                        <tr><td style="border: none;"><span class="label">WBK:</span><span class="value">${formatCurrency(trackA_wbk)} zł</span></td></tr>
                        <tr><td style="border: none;"><span class="label">OBN:</span><span class="value">${formatCurrency(trackA_obn)} zł</span></td></tr>
                    </table>
                    <div class="track-value">${formatCurrency(trackA_total)} zł</div>
                    <p style="color: #7f8c8d; font-size: 0.9rem;">za ${trackA_years} lat</p>
                </div>
                <div class="track-box track-b">
                    <div class="track-title">💼 TRACK B - Negocjacyjny</div>
                    <p style="color: #7f8c8d; font-size: 0.9rem; margin-bottom: 15px;">Mnożnik: ${multiplier}×</p>
                    <div class="track-value">${formatCurrency(trackB_total)} zł</div>
                    <p style="color: #7f8c8d; font-size: 0.9rem;">za ${trackB_years} lat</p>
                    <p style="margin-top: 10px; font-size: 0.85rem; color: #f39c12;">+${((multiplier - 1) * 100).toFixed(0)}% wyższe od Track A</p>
                </div>
            </div>
        </div>

        <div class="footer">
            <p>© 2026 KALKULATOR KSWS v3.0</p>
            <p>Metodologia zgodna z polskim prawem odszkodowań dla obiektów liniowych</p>
            <p style="margin-top: 20px; color: #7f8c8d;">
                <strong>Ważne:</strong> Ten raport jest szacunkiem. Ostateczne odszkodowanie musi być uzgodnione między stronami.
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
      const htmlContent = generateHTMLReport(parcelData);

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
        const newWindow = window.open('', '_blank');
        newWindow.document.write(htmlContent);
        newWindow.document.close();
        newWindow.focus();
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
      <h3 style={{ marginBottom: '15px', color: '#2c3e50' }}>📄 Generuj Raport</h3>

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
