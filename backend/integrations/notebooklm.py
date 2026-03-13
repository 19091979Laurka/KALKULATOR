"""
NotebookLM Enterprise API Integration
======================================
Endpoint base: https://discoveryengine.googleapis.com/v1alpha/
Auth: Google OAuth2 User Token (refresh_token flow)

Required env vars:
  GOOGLE_OAUTH_REFRESH_TOKEN  — OAuth2 refresh token for the user account
  GOOGLE_OAUTH_CLIENT_ID      — OAuth2 Desktop App client ID
  GOOGLE_OAUTH_CLIENT_SECRET  — OAuth2 Desktop App client secret
  GOOGLE_PROJECT_NUMBER       — Google Cloud project number (e.g. "384217730250")
  GOOGLE_PROJECT_ID           — Google Cloud project ID (e.g. "kalkulator-488708")

Optional:
  NOTEBOOKLM_LOCATION         — location (default: "global")
"""

import os
import json
import time
import logging
import urllib.request
import urllib.parse
import urllib.error
from typing import Optional, List

logger = logging.getLogger(__name__)

DISCOVERY_ENGINE_BASE = "https://discoveryengine.googleapis.com/v1alpha"

# ─── Token cache ─────────────────────────────────────────────────────────────
_token_cache: dict = {"access_token": None, "expires_at": 0.0}


def _load_credentials() -> dict:
    """Load OAuth2 credentials from env vars or fallback file."""
    refresh_token = os.environ.get("GOOGLE_OAUTH_REFRESH_TOKEN")
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")

    if refresh_token and client_id and client_secret:
        return {
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret,
        }

    # Fallback: load from secrets file
    secrets_file = os.path.join(os.path.dirname(__file__), "../secrets/oauth_tokens.json")
    if os.path.exists(secrets_file):
        with open(secrets_file) as f:
            data = json.load(f)
        return {
            "refresh_token": data.get("refresh_token"),
            "client_id": data.get("client_id"),
            "client_secret": data.get("client_secret"),
        }

    raise RuntimeError(
        "Google OAuth2 credentials not configured. "
        "Set GOOGLE_OAUTH_REFRESH_TOKEN, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET "
        "or place oauth_tokens.json in backend/secrets/."
    )


def _get_access_token() -> str:
    """Get a valid access token, refreshing if necessary."""
    now = time.time()
    if _token_cache["access_token"] and _token_cache["expires_at"] > now + 60:
        return _token_cache["access_token"]

    creds = _load_credentials()
    data = urllib.parse.urlencode({
        "refresh_token": creds["refresh_token"],
        "client_id": creds["client_id"],
        "client_secret": creds["client_secret"],
        "grant_type": "refresh_token",
    }).encode()

    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=data,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req) as resp:
        token_data = json.loads(resp.read())

    _token_cache["access_token"] = token_data["access_token"]
    _token_cache["expires_at"] = now + token_data.get("expires_in", 3600)
    return _token_cache["access_token"]


def _headers() -> dict:
    project_id = os.environ.get("GOOGLE_PROJECT_ID", "kalkulator-488708")
    return {
        "Authorization": f"Bearer {_get_access_token()}",
        "Content-Type": "application/json",
        "x-goog-user-project": project_id,
    }


def _parent() -> str:
    project_number = os.environ.get("GOOGLE_PROJECT_NUMBER", "384217730250")
    location = os.environ.get("NOTEBOOKLM_LOCATION", "global")
    return f"projects/{project_number}/locations/{location}"


def _api(method: str, path: str, body: dict = None) -> dict:
    """Make an authenticated API request."""
    url = f"{DISCOVERY_ENGINE_BASE}/{_parent()}/{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=_headers())
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read()
            return json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        try:
            msg = json.loads(err_body).get("error", {}).get("message", err_body)
        except Exception:
            msg = err_body
        raise Exception(f"NotebookLM API {e.code}: {msg}")


# ─── Notebooks ──────────────────────────────────────────────────────────────

def create_notebook(title: str) -> dict:
    """Create a new notebook. Returns notebook resource with URL."""
    result = _api("POST", "notebooks", {"title": title})
    nb_id = result.get("notebookId")
    project_number = os.environ.get("GOOGLE_PROJECT_NUMBER", "384217730250")
    return {
        "notebookId": nb_id,
        "title": result.get("title"),
        "name": result.get("name"),
        "url": f"https://notebooklm.cloud.google.com/global/notebook/{nb_id}?project={project_number}",
    }


def get_notebook(notebook_id: str) -> dict:
    """Retrieve a notebook by its ID."""
    result = _api("GET", f"notebooks/{notebook_id}")
    nb_id = result.get("notebookId")
    project_number = os.environ.get("GOOGLE_PROJECT_NUMBER", "384217730250")
    return {
        "notebookId": nb_id,
        "title": result.get("title"),
        "name": result.get("name"),
        "url": f"https://notebooklm.cloud.google.com/global/notebook/{nb_id}?project={project_number}",
    }


def list_notebooks(page_size: int = 50) -> dict:
    """List recently viewed notebooks."""
    result = _api("GET", f"notebooks:listRecentlyViewed?pageSize={page_size}")
    project_number = os.environ.get("GOOGLE_PROJECT_NUMBER", "384217730250")
    notebooks = result.get("notebooks", [])
    return {
        "notebooks": [
            {
                "notebookId": nb.get("notebookId"),
                "title": nb.get("title"),
                "url": f"https://notebooklm.cloud.google.com/global/notebook/{nb.get('notebookId')}?project={project_number}",
            }
            for nb in notebooks
        ]
    }


def delete_notebook(notebook_id: str) -> dict:
    """Delete a notebook."""
    parent = _parent()
    result = _api("POST", "notebooks:batchDelete", {"names": [f"{parent}/notebooks/{notebook_id}"]})
    return result if result else {"deleted": True}


# ─── Sources ────────────────────────────────────────────────────────────────

def add_text_source(notebook_id: str, title: str, content: str) -> dict:
    """Add a plain-text source to a notebook."""
    payload = {
        "requests": [
            {
                "source": {
                    "displayName": title,
                    "inlineSource": {
                        "content": content,
                        "mimeType": "text/plain",
                    },
                }
            }
        ]
    }
    return _api("POST", f"notebooks/{notebook_id}/sources:batchCreate", payload)


def add_url_source(notebook_id: str, url_to_add: str, source_name: str = "") -> dict:
    """Add a web URL source to a notebook."""
    source = {"urlSource": {"uri": url_to_add}}
    if source_name:
        source["displayName"] = source_name
    payload = {"requests": [{"source": source}]}
    return _api("POST", f"notebooks/{notebook_id}/sources:batchCreate", payload)


# ─── Audio Overview (Podcast) ───────────────────────────────────────────────

def generate_audio_overview(
    notebook_id: str,
    episode_focus: str = "",
    language_code: str = "pl",
    source_ids: Optional[List[str]] = None,
) -> dict:
    """
    Trigger generation of an audio overview (podcast) for a notebook.
    Returns an AudioOverview resource. Poll get_audio_overview() for status.
    """
    generation_options: dict = {
        "episodeFocus": episode_focus or "Podsumuj kluczowe fakty prawne i finansowe tej sprawy.",
        "languageCode": language_code,
    }
    if source_ids:
        generation_options["sourceIds"] = [{"sourceId": sid} for sid in source_ids]

    payload = {
        "generationOptions": generation_options,
        "languageCode": language_code,
    }
    return _api("POST", f"notebooks/{notebook_id}/audioOverviews", payload)


def get_audio_overview(notebook_id: str, audio_overview_id: str) -> dict:
    """Get the status and download URL of an audio overview."""
    return _api("GET", f"notebooks/{notebook_id}/audioOverviews/{audio_overview_id}")


# ─── Utility ─────────────────────────────────────────────────────────────────

def notebook_url(notebook_id: str) -> str:
    """Build the browser URL for a notebook."""
    project_number = os.environ.get("GOOGLE_PROJECT_NUMBER", "384217730250")
    location = os.environ.get("NOTEBOOKLM_LOCATION", "global")
    return f"https://notebooklm.cloud.google.com/{location}/notebook/{notebook_id}?project={project_number}"


def is_configured() -> bool:
    """Check if the NotebookLM integration is properly configured."""
    try:
        _get_access_token()
        return True
    except Exception:
        return False


def get_status() -> dict:
    """Get the configuration status of the integration."""
    has_env = bool(
        os.environ.get("GOOGLE_OAUTH_REFRESH_TOKEN")
        and os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
        and os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")
    )
    secrets_file = os.path.join(os.path.dirname(__file__), "../secrets/oauth_tokens.json")
    has_file = os.path.exists(secrets_file)
    configured = has_env or has_file

    return {
        "configured": configured,
        "auth_method": "oauth2_user_token",
        "project_id": os.environ.get("GOOGLE_PROJECT_ID", "kalkulator-488708"),
        "project_number": os.environ.get("GOOGLE_PROJECT_NUMBER", "384217730250"),
        "credentials_source": "env_vars" if has_env else ("file" if has_file else "none"),
    }
