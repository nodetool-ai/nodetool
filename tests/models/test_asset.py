from datetime import datetime
import pytest
from nodetool.models.asset import (
    Asset,
)
from nodetool.models.user import User
from tests.conftest import make_image


def test_asset_find(user: User):
    asset = make_image(user)

    found_asset = Asset.find(user.id, asset.id)

    if found_asset:
        assert asset.id == found_asset.id
    else:
        pytest.fail("Asset not found")

    # Test finding an asset that does not exist in the database
    not_found_asset = Asset.find(user.id, "invalid_id")
    assert not_found_asset is None


def test_paginate_assets(user: User):
    for i in range(5):
        Asset.create(
            user_id=user.id,
            name="test_image",
            content_type="image/jpeg",
        )

    assets, last_key = Asset.paginate(user_id=user.id, content_type="image", limit=3)
    assert len(assets) > 0

    assets, last_key = Asset.paginate(user_id=user.id, content_type="image", limit=3)
    assert len(assets) > 0


def test_paginate_assets_by_parent(user: User):
    for i in range(5):
        make_image(user)

    assets, last_key = Asset.paginate(user_id=user.id, parent_id=user.id, limit=4)
    assert len(assets) > 0

    assets, last_key = Asset.paginate(user_id=user.id, content_type="image", limit=3)
    assert len(assets) > 0


def test_create_asset(user: User):
    asset = Asset.create(
        user_id=user.id,
        name="test_asset",
        content_type="image/jpeg",
    )

    assert asset.name == "test_asset"
    assert asset.content_type == "image/jpeg"


def test_created_at(user: User):
    asset = Asset.create(
        user_id=user.id,
        name="test_asset",
        content_type="image/jpeg",
    )

    assert asset.created_at is not None
    assert isinstance(asset.created_at, datetime)
