"""
NotebookLM Enterprise API Integration
======================================
Endpoint base: https://discoveryengine.googleapis.com/v1alpha/
Auth: Google Service Account (JSON key) with scope:
  - https://www.googleapis.com/auth/cloud-platform
  - https://www.googleapis.com/auth/discoveryengine.readwrite

Required env vars:
  NOTEBOOKLM_PROJECT_ID   — Google Cloud project ID (e.g. "kalkulator-488708")
  NOTEBOOKLM_LOCATION     — location (e.g. "global" or "us-central1")
  GOOGLE_SA_KEY_PATH      — path to service account JSON key file
                            OR
  GOOGLE_SA_KEY_JSON      — service account JSON key as string (for env-based secrets)

IAM roles required on the project:
  - roles/discoveryengine.notebookUser  (Cloud Notebook User)
"""

import os
import json
import logging
from typing import Optional, List

import requests

logger = logging.getLogger(__name__)

DISCOVERY_ENGINE_BASE = "https://discoveryengine.googleapis.com/v1alpha"

# ─── Auth ───────────────────────────────────────────────────────────────────

def _get_access_token() -> str:
    """Obtain a short-lived OAuth2 access token from the service account credentials."""
    try:
        from google.oauth2 import service_account
        import google.auth.transport.requests as google_requests

        scopes = [
            "https://www.googleapis.com/auth/cloud-platform",
            "https://www.googleapis.com/auth/discoveryengine.readwrite",
        ]

        sa_key_path = os.environ.get("GOOGLE_SA_KEY_PATH")
        sa_key_json = os.environ.get("GOOGLE_SA_KEY_JSON")

        if sa_key_json:
            info = json.loads(sa_key_json)
            creds = service_account.Credentials.from_service_account_info(info, scopes=scopes)
        elif sa_key_path and os.path.exists(sa_key_path):
            creds = service_account.Credentials.from_service_account_file(sa_key_path, scopes=scopes)
        else:
            raise RuntimeError(
                "Service account credentials not configured. "
                "Set GOOGLE_SA_KEY_PATH or GOOGLE_SA_KEY_JSON environment variable."
            )

        request = google_requests.Request()
        creds.refresh(request)
        return creds.token

    except ImportError:
        raise RuntimeError("google-auth library not installed. Run: pip install google-auth")


def _headers() -> dict:
    token = _get_access_token()
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _parent() -> str:
    project = os.environ.get("NOTEBOOKLM_PROJECT_ID", "")
    location = os.environ.get("NOTEBOOKLM_LOCATION", "global")
    if not project:
        raise RuntimeError("NOTEBOOKLM_PROJECT_ID environment variable not set.")
    return f"projects/{project}/locations/{location}"


# ─── Notebooks ──────────────────────────────────────────────────────────────

def create_notebook(title: str) -> dict:
    """
    Create a new notebook.
    POST /v1alpha/{parent}/notebooks
    Returns the created Notebook resource.
    """
    url = f"{DISCOVERY_ENGINE_BASE}/{_parent()}/notebooks"
    payload = {"title": title}
    resp = requests.post(url, headers=_headers(), json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()


def get_notebook(notebook_id: str) -> dict:
    """
    Retrieve a notebook by its ID.
    GET /v1alpha/{parent}/notebooks/{notebookId}
    """
    url = f"{DISCOVERY_ENGINE_BASE}/{_parent()}/notebooks/{notebook_id}"
    resp = requests.get(url, headers=_headers(), timeout=30)
    resp.raise_for_status()
    return resp.json()


def list_notebooks(page_size: int = 50) -> dict:
    """
    List recently viewed notebooks.
    GET /v1alpha/{parent}/notebooks:listRecentlyViewed
    """
    url = f"{DISCOVERY_ENGINE_BASE}/{_parent()}/notebooks:listRecentlyViewed"
    resp = requests.get(url, headers=_headers(), params={"pageSize": page_size}, timeout=30)
    resp.raise_for_status()
    return resp.json()


def delete_notebook(notebook_id: str) -> dict:
    """
    Delete a notebook.
    POST /v1alpha/{parent}/notebooks:batchDelete
    """
    url = f"{DISCOVERY_ENGINE_BASE}/{_parent()}/notebooks:batchDelete"
    payload = {"names": [f"{_parent()}/notebooks/{notebook_id}"]}
    resp = requests.post(url, headers=_headers(), json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json() if resp.content else {}


# ─── Sources ────────────────────────────────────────────────────────────────

def add_text_source(notebook_id: str, title: str, content: str) -> dict:
    """
    Add a plain-text source to a notebook.
    POST /v1alpha/{parent}/notebooks/{notebookId}/sources:batchCreate
    """
    url = f"{DISCOVERY_ENGINE_BASE}/{_parent()}/notebooks/{notebook_id}/sources:batchCreate"
    payload = {
        "userContents": [
            {
                "textContent": {
                    "sourceName": title,
                    "content": content,
                }
            }
        ]
    }
    resp = requests.post(url, headers=_headers(), json=payload, timeout=60)
    resp.raise_for_status()
    return resp.json()


def add_url_source(notebook_id: str, url_to_add: str, source_name: str = "") -> dict:
    """
    Add a web URL source to a notebook.
    """
    url = f"{DISCOVERY_ENGINE_BASE}/{_parent()}/notebooks/{notebook_id}/sources:batchCreate"
    payload = {
        "userContents": [
            {
                "webContent": {
                    "url": url_to_add,
                    "sourceName": source_name or url_to_add,
                }
            }
        ]
    }
    resp = requests.post(url, headers=_headers(), json=payload, timeout=60)
    resp.raise_for_status()
    return resp.json()


def add_google_drive_source(notebook_id: str, document_id: str, mime_type: str, source_name: str = "") -> dict:
    """
    Add a Google Drive document as a source.
    mime_type: e.g. "application/vnd.google-apps.document" for Docs
    """
    url = f"{DISCOVERY_ENGINE_BASE}/{_parent()}/notebooks/{notebook_id}/sources:batchCreate"
    payload = {
        "userContents": [
            {
                "googleDriveContent": {
                    "documentId": document_id,
                    "mimeType": mime_type,
                    "sourceName": source_name,
                }
            }
        ]
    }
    resp = requests.post(url, headers=_headers(), json=payload, timeout=60)
    resp.raise_for_status()
    return resp.json()


# ─── Audio Overview (Podcast) ───────────────────────────────────────────────

def generate_audio_overview(
    notebook_id: str,
    episode_focus: str = "",
    language_code: str = "pl",
    source_ids: Optional[List[str]] = None,
) -> dict:
    """
    Trigger generation of an audio overview (podcast) for a notebook.
    POST /v1alpha/{parent}/notebooks/{notebookId}/audioOverviews
    Returns an AudioOverview resource with status AUDIO_OVERVIEW_STATUS_IN_PROGRESS.
    Poll get_audio_overview() until status == AUDIO_OVERVIEW_STATUS_COMPLETE.
    """
    url = f"{DISCOVERY_ENGINE_BASE}/{_parent()}/notebooks/{notebook_id}/audioOverviews"
    generation_options = {
        "episodeFocus": episode_focus or "Podsumuj kluczowe fakty prawne i finansowe tej sprawy.",
        "languageCode": language_code,
    }
    if source_ids:
        generation_options["sourceIds"] = [{"sourceId": sid} for sid in source_ids]

    payload = {
        "generationOptions": generation_options,
        "languageCode": language_code,
    }
    resp = requests.post(url, headers=_headers(), json=payload, timeout=60)
    resp.raise_for_status()
    return resp.json()


def get_audio_overview(notebook_id: str, audio_overview_id: str) -> dict:
    """
    Get the status and download URL of an audio overview.
    GET /v1alpha/{parent}/notebooks/{notebookId}/audioOverviews/{audioOverviewId}
    """
    url = f"{DISCOVERY_ENGINE_BASE}/{_parent()}/notebooks/{notebook_id}/audioOverviews/{audio_overview_id}"
    resp = requests.get(url, headers=_headers(), timeout=30)
    resp.raise_for_status()
    return resp.json()


# ─── Notebook URL builder ────────────────────────────────────────────────────

def notebook_url(notebook_id: str) -> str:
    """Build the browser URL for a notebook."""
    project = os.environ.get("NOTEBOOKLM_PROJECT_ID", "")
    location = os.environ.get("NOTEBOOKLM_LOCATION", "global")
    return f"https://notebooklm.cloud.google.com/{location}/notebook/{notebook_id}?project={project}"
