import ast
from sys import argv, stderr
from time import sleep
from openai import OpenAI
from openai.types import CompletionUsage
from openai.types.chat import ChatCompletionMessageParam
import astunparse
from genflow.common.openai_helpers import GPTModel, calculate_gpt_price_from_response
from genflow.common.environment import Environment
import dotenv

dotenv.load_dotenv()
import ast
import astunparse


def complete(
    code: str, instruction: str, model=GPTModel.GPT4, num_completions: int = 1
) -> list[str]:
    """
    Send the code to the API and return the response.

    Args:
        code: The code to send to the API.
        instruction: The instruction to send to the API.
        model: The model to use for the API.
    """
    global price_counter
    messages: list[ChatCompletionMessageParam] = [
        {
            "role": "system",
            "content": instruction,
        },
        {"role": "user", "content": code},
    ]

    client = OpenAI(api_key=Environment.get_openai_api_key())

    res = client.chat.completions.create(
        messages=messages,
        max_tokens=4000,
        model=model.value,
        n=num_completions,
    )
    return [c.message.content or "" for c in res.choices]


def get_completions_with_retry(
    code: str,
    instruction: str,
    model: GPTModel,
    num_completions: int,
    retry_count: int = 1,
) -> list[str]:
    """
    Retry get_docstring if it fails. This is needed because the API sometimes
    returns an error.

    Args:
        code: The code to send to the API.
        instruction: The instruction to send to the API.
        retry_count: The number of times the function has been called.
    """
    try:
        return complete(
            code=code,
            instruction=instruction,
            model=GPTModel.GPT4,
            num_completions=num_completions,
        )
    except Exception as e:
        print(e)
        if retry_count > 3:
            raise e
        wait_time = 2**retry_count
        print(f"Retrying in {wait_time} seconds...")
        sleep(wait_time)
        return get_completions_with_retry(code, instruction, model, retry_count + 1)


class NodeNames(ast.NodeVisitor):
    """
    Extract all node names.
    """

    names: list[str]

    def __init__(self):
        self.names = []

    def visit(self, node: ast.AST) -> ast.AST | None:
        if isinstance(node, ast.ClassDef) and node.body:
            self.names.append(node.name)

        return node
