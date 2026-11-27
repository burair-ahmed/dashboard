from starlette.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_get_symbols():
    response = client.get("/api/symbols")
    assert response.status_code == 200
    data = response.json()
    assert "symbols" in data
    assert "SPY" in data["symbols"]

def test_get_levels_mock():
    response = client.get("/api/levels/SPY")
    assert response.status_code == 200
    data = response.json()
    assert data["symbol"] == "SPY"
    assert "call_wall" in data
    assert "put_wall" in data
    assert "gamma_flip" in data
    assert "bull_trigger" in data
    assert "bear_trigger" in data
    assert "strikes" in data and len(data["strikes"]) > 0
    assert "compact_string" in data

def test_get_levels_futures_conversion():
    response = client.get("/api/levels/ES1!")
    assert response.status_code == 200
    data = response.json()
    assert data["symbol"] == "SPY"
    assert data["target_symbol"] == "ES1!"
    # With SPY base ~585 and mult 10 + 15 basis, call wall should be ~5000+
    assert data["call_wall"] > 4000
    assert data["underlying_price"] > 4000
    assert data["bull_trigger"] > 4000
    assert data["bear_trigger"] > 4000
    assert any(s["strike"] > 4000 for s in data["strikes"])
