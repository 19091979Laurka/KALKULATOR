import streamlit as st
import asyncio
import plotly.express as px
from backend.modules.property import PropertyAggregator
from backend.core.valuation import calculate_compensation

st.set_page_config(page_title="TEIS - System Odszkodowań", layout="wide")

# --- UI Header ---
st.title("⚖️ Transmission Easement Intelligence System")
st.markdown("---")

parcel_id = st.text_input("Wpisz identyfikator działki (np. 142003_2.0006.74/4)", "142003_2.0006.74/4")

if st.button("Generuj Raport i Wycenę"):
    with st.spinner("Analizuję dane z GUGiK..."):
        agg = PropertyAggregator()
        report = asyncio.run(agg.generate_master_record(parcel_id))
        
        if report.get("status") == "ERROR":
            st.error(f"Błąd: {report.get('message')}")
        else:
            # 1. Dashboard Kafelki
            col1, col2, col3 = st.columns(3)
            val = report.get("valuation", {})
            col1.metric("Wartość roszczeń", f"{val.get('total_claim', 0):,.2f} PLN")
            col2.metric("Liczba kolizji", val.get('count', 0))
            col3.metric("Status", "ANALIZA REALNA")

            # 2. Wykres kołowy (Doughnut) - Struktura roszczeń
            if val.get('lines'):
                data_df = pd.DataFrame([line['compensation'] for line in val['lines']])
                fig = px.pie(names=['Służebność', 'Deprecjacja', 'Korzystanie', 'Odsetki'], 
                             values=[val['total_compensation'], val['total_depreciation'], 0, 0],
                             hole=0.4, title="Struktura Roszczenia")
                st.plotly_chart(fig, use_container_width=True)

            # 3. Tabela szczegółowa
            st.subheader("Szczegóły techniczne")
            st.json(report)
            
            # 4. Eksport
            st.download_button("Pobierz Raport JSON", str(report), "raport.json")

st.sidebar.info("System operacyjny: Spec v3.0 (Strict Real Data)")