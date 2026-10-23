"""Live voice session endpoint with a fake OpenAI client (no network)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api.agent import get_llm_client
from app.api.live import DEFAULT_LIVE_MODEL, DEFAULT_LIVE_VOICE, MAX_SDP_CHARS
from app.config import get_settings, get_signing_key
from app.main import create_app

OFFER = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n"


class FakeLive:
    def __init__(self, error=None):
        self.error, self.calls = error, []
        self.live = SimpleNamespace(create=self._create)

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(session=SimpleNamespace(id="live_123"), transport=SimpleNamespace(type="webrtc", sdp="v=0\r\nanswer"))


@pytest.fixture
def client_for(monkeypatch):
    def build(fake, **env):
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")
        monkeypatch.setenv("PROPOSAL_SIGNING_KEY", "test-signing-key")
        for name, value in env.items():
            monkeypatch.setenv(name, value)
        get_settings.cache_clear()
        get_signing_key.cache_clear()
        app = create_app()
        app.dependency_overrides[get_llm_client] = lambda: fake
        return TestClient(app)

    yield build
    get_settings.cache_clear()
    get_signing_key.cache_clear()


def test_creates_a_client_delegation_session_and_returns_the_answer(client_for):
    fake = FakeLive()
    response = client_for(fake).post("/api/live/session", json={"sdp": OFFER, "language": "he"})
    assert response.status_code == 201
    assert response.json() == {"success": True, "data": {"sessionId": "live_123", "sdp": "v=0\r\nanswer"}}
    (call,) = fake.calls
    assert call["transport"] == {"type": "webrtc", "sdp": OFFER}
    session = call["session"]
    assert session["model"] == DEFAULT_LIVE_MODEL
    assert session["audio"] == {"output": {"voice": DEFAULT_LIVE_VOICE}}
    # The live model only talks: all design work comes back to the app through client delegation.
    assert session["delegation"] == {"type": "client"}
    assert "Confirm" in session["instructions"]
    assert "Hebrew" in session["input"][0]["content"][0]["text"]


def test_model_and_voice_are_configurable(client_for):
    fake = FakeLive()
    client_for(fake, OPENAI_LIVE_MODEL="gpt-live-x", OPENAI_LIVE_VOICE="cedar").post("/api/live/session", json={"sdp": OFFER})
    assert fake.calls[0]["session"]["model"] == "gpt-live-x"
    assert fake.calls[0]["session"]["audio"]["output"]["voice"] == "cedar"


def test_english_interface_starts_in_english(client_for):
    fake = FakeLive()
    client_for(fake).post("/api/live/session", json={"sdp": OFFER, "language": "en"})
    assert "in English" in fake.calls[0]["session"]["input"][0]["content"][0]["text"]


def test_disabled_in_chained_mode(client_for):
    fake = FakeLive()
    response = client_for(fake, VOICE_MODE="chained").post("/api/live/session", json={"sdp": OFFER, "language": "en"})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "LIVE_DISABLED"
    assert fake.calls == []


def test_unavailable_without_a_key(client_for):
    response = client_for(None).post("/api/live/session", json={"sdp": OFFER})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AGENT_UNAVAILABLE"


@pytest.mark.parametrize("body", [
    {"sdp": ""},
    {"sdp": "not an offer"},
    {"sdp": "v=0" + "x" * MAX_SDP_CHARS},
    {"sdp": OFFER, "language": "fr"},
    {"sdp": OFFER, "extra": True},
])
def test_rejects_invalid_offers_before_calling_openai(client_for, body):
    fake = FakeLive()
    assert client_for(fake).post("/api/live/session", json=body).status_code == 422
    assert fake.calls == []


def test_upstream_errors_are_not_leaked(client_for):
    fake = FakeLive(error=RuntimeError("secret upstream detail"))
    response = client_for(fake).post("/api/live/session", json={"sdp": OFFER})
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "AGENT_ERROR"
    assert "secret" not in response.text


def test_health_reports_the_voice_mode(client_for):
    assert client_for(FakeLive()).get("/api/health").json()["data"]["voice"] == "live"
    assert client_for(FakeLive(), VOICE_MODE="chained").get("/api/health").json()["data"]["voice"] == "chained"
