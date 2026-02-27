# Wdrażanie aplikacji KALKULATOR na Google Cloud Run

Ten dokument opisuje proces przeniesienia aplikacji z lokalnego środowiska deweloperskiego do chmury Google Cloud Platform (GCP) przy użyciu usługi Cloud Run.

## 1. Wymagania wstępne
1.  **Konto Google Cloud**: Utwórz projekt na [console.cloud.google.com](https://console.cloud.google.com/).
2.  **Google Cloud SDK (gcloud)**: Zainstaluj lokalnie lub skorzystaj z Cloud Shell.
3.  **Włączone API**:
    *   Cloud Run API
    *   Cloud Build API
    *   Artifact Registry API

## 2. Przygotowanie lokalne
Upewnij się, że jesteś w głównym folderze projektu (`KALKULATOR`) i przeprowadź autoryzację:

```bash
# Logowanie
gcloud auth login

# Ustawienie aktywnego projektu
gcloud config set project [TWOJE_ID_PROJEKTU]
```

## 3. Budowanie obrazu kontenera
Używamy usługi Cloud Build, aby zbudować obraz Docker na serwerach Google (nie musisz mieć Dockera u siebie):

```bash
gcloud builds submit --tag gcr.io/[TWOJE_ID_PROJEKTU]/kalkulator
```

## 4. Wdrożenie na Cloud Run
Uruchom aplikację publicznie w regionie Warszawa (`europe-central2`):

```bash
gcloud run deploy kalkulator \
  --image gcr.io/[TWOJE_ID_PROJEKTU]/kalkulator \
  --platform managed \
  --region europe-central2 \
  --allow-unauthenticated
```

## 5. Zmienne środowiskowe (Opcjonalne)
Jeśli projekt wymaga kluczy API, dodaj je podczas wdrażania za pomocą flagi `--set-env-vars` lub przez konsolę www.

## 6. Automatyzacja (CI/CD)
W folderze znajduje się również plik `cloudbuild.yaml`, który pozwala na automatyczne budowanie obrazu po podpięciu repozytorium GitHub pod Google Cloud Build.
