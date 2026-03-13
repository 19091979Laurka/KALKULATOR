#!/usr/bin/env python3
"""
OAuth2 Authorization Flow for NotebookLM API
Generates a refresh token for the user account.

Usage:
  1. Set env vars (or edit the PLACEHOLDERS below):
       export OAUTH_CLIENT_ID="your_client_id"
       export OAUTH_CLIENT_SECRET="your_client_secret"
  2. Run: python3 backend/scripts/get_oauth_token.py
  3. Open the URL in browser, log in, paste the code back here.
  4. Refresh token will be saved to backend/secrets/oauth_tokens.json

NEVER commit credentials to git. Use environment variables.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
import http.server
import threading

# ─── Load credentials from env vars ─────────────────────────────────────────
CLIENT_ID = os.environ.get("OAUTH_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("OAUTH_CLIENT_SECRET", "")

if not CLIENT_ID or not CLIENT_SECRET:
    print("ERROR: Set OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET environment variables.")
    print("Example:")
    print("  export OAUTH_CLIENT_ID='your_client_id.apps.googleusercontent.com'")
    print("  export OAUTH_CLIENT_SECRET='GOCSPX-...'")
    sys.exit(1)

REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob"
SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]


def main():
    # Build authorization URL
    auth_params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
    }
    auth_url = "https://accounts.google.com/o/oauth2/auth?" + urllib.parse.urlencode(auth_params)

    print("\n" + "="*60)
    print("KROK 1: Otworz ponizszy URL w przegladarce i zaloguj sie")
    print("="*60)
    print(f"\n{auth_url}\n")
    print("="*60)

    auth_code = input("KROK 2: Wklej kod autoryzacyjny z przegladarki: ").strip()
    if not auth_code:
        print("Brak kodu. Anulowanie.")
        sys.exit(1)

    # Exchange code for tokens
    token_data = urllib.parse.urlencode({
        "code": auth_code,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    }).encode()

    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=token_data,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )

    try:
        with urllib.request.urlopen(req) as resp:
            tokens = json.loads(resp.read())
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        print("ERROR: Brak refresh_token w odpowiedzi!")
        print(json.dumps(tokens, indent=2))
        sys.exit(1)

    print("\n" + "="*60)
    print("SUKCES! Refresh token wygenerowany.")
    print("="*60)

    # Save tokens to file
    os.makedirs(os.path.join(os.path.dirname(__file__), "../secrets"), exist_ok=True)
    token_file = os.path.join(os.path.dirname(__file__), "../secrets/oauth_tokens.json")
    with open(token_file, "w") as f:
        json.dump({
            "refresh_token": refresh_token,
            "access_token": tokens.get("access_token"),
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "token_uri": "https://oauth2.googleapis.com/token",
        }, f, indent=2)
    print(f"\nTokeny zapisane do: {token_file}")
    print("Plik jest w .gitignore — nie trafi do repozytorium.")
    print("\nLub dodaj do zmiennych srodowiskowych (.env):")
    print(f"  GOOGLE_OAUTH_REFRESH_TOKEN={refresh_token}")
    print(f"  GOOGLE_OAUTH_CLIENT_ID={CLIENT_ID}")
    print(f"  GOOGLE_OAUTH_CLIENT_SECRET={CLIENT_SECRET}")
    print(f"  GOOGLE_PROJECT_ID=kalkulator-488708")
    print(f"  GOOGLE_PROJECT_NUMBER=384217730250")


if __name__ == "__main__":
    main()
