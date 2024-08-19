from nodetool.common.environment import Environment
from IPython import start_ipython
import dotenv

dotenv.load_dotenv()

start_ipython(
    argv=[],
    user_ns={
        "env": Environment,
    },
)
