import json

import pytest

from bluetape_recipe_worker.extract import extract_recipe_schema
from bluetape_recipe_worker.security import UnsafeSourceUrl, validate_public_url


def test_extracts_recipe_json_ld() -> None:
    payload = {
        "@context": "https://schema.org",
        "@type": "Recipe",
        "name": "Rice",
        "recipeIngredient": ["1 cup rice", "2 cups water"],
        "recipeInstructions": [{"@type": "HowToStep", "text": "Cook the rice."}],
    }
    html = f'<script type="application/ld+json">{json.dumps(payload)}</script>'
    recipe = extract_recipe_schema(html)
    assert recipe is not None
    assert recipe.title == "Rice"
    assert recipe.steps == ["Cook the rice."]


@pytest.mark.parametrize("url", ["http://127.0.0.1/a", "http://localhost/a", "file:///tmp/a"])
def test_rejects_non_public_sources(url: str) -> None:
    with pytest.raises(UnsafeSourceUrl):
        validate_public_url(url)
