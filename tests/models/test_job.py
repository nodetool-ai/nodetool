import datetime
import pytest
from tests.conftest import make_job
from nodetool.models.job import Job
from nodetool.models.user import User


def test_find_job(user: User):
    user.verified_at = datetime.datetime.now()
    user.save()

    job = make_job(user)

    found_job = Job.find(user.id, job.id)

    if found_job:
        assert job.id == found_job.id
    else:
        pytest.fail("Job not found")

    # Test finding a job that does not exist in the database
    not_found_job = Job.find(user.id, "invalid_id")
    assert not_found_job is None


def test_create_job(user: User):
    user.verified_at = datetime.datetime.now()
    user.save()

    job = Job.create(
        workflow_id="workflow_id",
        user_id=user.id,
    )

    job = Job.find(user.id, job.id)

    assert job is not None
    assert job.id is not None
    assert job.user_id == user.id
    assert job.started_at is not None


def test_paginate_jobs(user: User):
    for i in range(12):
        Job.create(
            workflow_id="workflow_id",
            user_id=user.id,
        )

    jobs, last_evaluated_key = Job.paginate(user_id=user.id, limit=10)
    assert len(jobs) > 0

    jobs, last_evaluated_key = Job.paginate(
        user_id=user.id, start_key=last_evaluated_key
    )
    assert len(jobs) > 0


def test_paginate_jobs_by_workflow(user: User):
    for i in range(10):
        Job.create(
            workflow_id="workflow_id",
            user_id=user.id,
        )

    for i in range(10):
        Job.create(
            workflow_id="another",
            user_id=user.id,
        )

    jobs, last_evaluated_key = Job.paginate(user_id=user.id, workflow_id="workflow_id")
    assert len(jobs) == 10
