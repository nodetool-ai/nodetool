from datetime import datetime
import pytest
from nodetool.models.prediction import Prediction
from nodetool.models.user import User


def test_prediction_find(user: User):
    prediction = Prediction.create(
        user_id=user.id,
        node_id="test_node",
        provider="test_provider",
        model="test_model",
    )

    found_prediction = Prediction.find(user.id, prediction.id)

    if found_prediction:
        assert prediction.id == found_prediction.id
    else:
        pytest.fail("Prediction not found")

    # Test finding a prediction that does not exist in the database
    not_found_prediction = Prediction.find(user.id, "invalid_id")
    assert not_found_prediction is None


def test_paginate_predictions(user: User):
    for i in range(5):
        Prediction.create(
            user_id=user.id,
            node_id="test_node",
            provider="test_provider",
            model="test_model",
        )

    predictions, last_key = Prediction.paginate(user_id=user.id, limit=3)
    assert len(predictions) > 0

    predictions, last_key = Prediction.paginate(user_id=user.id, limit=3)
    assert len(predictions) > 0


def test_paginate_predictions_by_workflow(user: User):
    for i in range(5):
        Prediction.create(
            user_id=user.id,
            workflow_id="test_workflow",
            node_id="test_node",
            provider="test_provider",
            model="test_model",
        )

    predictions, last_key = Prediction.paginate(
        user_id=user.id, workflow_id="test_workflow", limit=4
    )
    assert len(predictions) > 0

    predictions, last_key = Prediction.paginate(
        user_id=user.id, workflow_id="test_workflow", limit=3, start_key=last_key
    )
    assert len(predictions) > 0


def test_created_at(user: User):
    prediction = Prediction.create(
        user_id=user.id,
        node_id="test_node",
        provider="test_provider",
        model="test_model",
    )

    assert prediction.created_at is not None
    assert isinstance(prediction.created_at, datetime)
