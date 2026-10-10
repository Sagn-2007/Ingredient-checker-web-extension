import sys
import os
import pytest

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from checker import check_product

def test_1_vegetarian_conflict():
    res = check_product("Test", ["wheat flour", "sugar", "gelatin"], "Vegetarian", [])
    assert res["verdict"] == "conflicts"
    assert any(i["ingredient"] == "gelatin" and i["status"] == "conflicts" for i in res["flagged_ingredients"])

def test_2_vegetarian_fits():
    res = check_product("Test", ["rice", "salt", "sunflower oil"], "Vegetarian", [])
    assert res["verdict"] == "fits"

def test_3_vegan_doubtful():
    res = check_product("Test", ["sugar", "natural flavours"], "Vegan", [])
    assert res["verdict"] == "doubtful"

def test_4_jain_conflict():
    res = check_product("Test", ["potato", "onion powder"], "Jain", [])
    assert res["verdict"] == "conflicts"

def test_5_common_ingredients_fits():
    res = check_product("Test", ["corn grits", "sliced almond", "iodized salt", "dextrose"], "Vegetarian", [])
    assert res["verdict"] == "fits"

def test_6_vitamins_doubtful():
    res = check_product("Test", ["corn grits", "sliced almond", "vitamins"], "Vegetarian", [])
    assert res["verdict"] == "doubtful"

def test_7_conflict_priority():
    res = check_product("Test", ["gelatin", "natural flavours"], "Vegan", [])
    assert res["verdict"] == "conflicts"

def test_8_custom_avoid():
    res = check_product("Test", ["rice", "sugar", "peanuts"], "Vegetarian", ["peanuts"])
    assert res["verdict"] == "conflicts"
    assert any(i["ingredient"] == "peanuts" and i["status"] == "conflicts" and i["source"] == "custom" for i in res["flagged_ingredients"])

# Test 9 (Allergen UI logic) is handled in popup.js, so we don't test it here as check_product doesn't do allergen extraction.

def test_9_custom_avoid_word_boundaries():
    # If we avoid 'pea', it should NOT flag 'peanut' due to word boundaries.
    res = check_product("Test", ["rice", "peanut"], "Vegetarian", ["pea"])
    # "peanut" might be checked by OpenRouter if not in KNOWN_INGREDIENTS, but deterministic shouldn't flag it as custom.
    # If OpenRouter is offline, it will be "doubtful".
    # Just check it didn't match the custom rule:
    custom_matches = [i for i in res["flagged_ingredients"] if i["source"] == "custom"]
    assert len(custom_matches) == 0

def test_10_custom_avoid_exact():
    # But it should flag exact 'pea'
    res = check_product("Test", ["pea protein", "salt"], "Vegetarian", ["pea"])
    assert any(i["ingredient"] == "pea protein" and i["status"] == "conflicts" and i["source"] == "custom" for i in res["flagged_ingredients"])

def test_11_llm_malformed_response_handled(monkeypatch):
    from checker import client
    if client is None:
        pytest.skip("OpenRouter client not configured")
        
    class MockMessage:
        content = "This is some weird non-json text"
    class MockChoice:
        message = MockMessage()
    class MockResponse:
        choices = [MockChoice()]
        
    def mock_create(*args, **kwargs):
        return MockResponse()
        
    monkeypatch.setattr(client.chat.completions, "create", mock_create)
    
    # "unknown_alien_ingredient" is unknown
    res = check_product("Test", ["unknown_alien_ingredient"], "Vegetarian", [])
    
    # It should not crash, it should gracefully mark as doubtful because JSON parse fails
    assert res["ai_error"] is True
    assert res["verdict"] == "doubtful"
    assert any(i["status"] == "doubtful" for i in res["flagged_ingredients"])

def test_15_custom_diet_profile():
    # An unknown diet name should be safely ignored by deterministic rules, 
    # but also_avoid should be respected.
    res = check_product("Test Custom Diet", ["sugar", "peanuts", "apple"], "Dad's Diet", ["peanuts", "sugar"])
    assert res["verdict"] == "conflicts"
    custom_matches = [i for i in res["flagged_ingredients"] if i["source"] == "custom"]
    assert any(i["ingredient"] == "peanuts" for i in custom_matches)
    assert any(i["ingredient"] == "sugar" for i in custom_matches)

def test_16_custom_diet_profile_no_avoid():
    # Custom diet with no avoid items
    res = check_product("Test Diet", ["apple", "banana"], "My Diet", [])
    # Since "My Diet" is unknown, deterministic engine will skip diet checks.
    # LLM might evaluate it, but if OpenRouter is offline it'll be doubtful/fits.
    # We mainly test that it doesn't crash.
    assert res["verdict"] in ["fits", "doubtful"]
