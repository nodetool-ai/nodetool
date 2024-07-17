from nodetool.common.environment import Environment

from nodetool.models.asset import Asset
from nodetool.models.job import Job
from nodetool.models.message import Message
from nodetool.models.prediction import Prediction
from nodetool.models.task import Task
from nodetool.models.thread import Thread
from nodetool.models.user import User
from nodetool.models.workflow import Workflow

log = Environment.get_logger()

models = [Asset, Job, Message, Prediction, Task, Thread, User, Workflow]


def create_all_tables():
    for model in models:
        model.create_table()


def drop_all_tables():
    for model in models:
        model.drop_table()
