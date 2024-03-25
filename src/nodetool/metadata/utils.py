from enum import EnumMeta
import inspect
from typing import Any, Union, get_args, get_origin
from types import UnionType
from collections.abc import Generator, AsyncGenerator


def is_generator_type(t):
    """
    Check if a type is a generator.

    Args:
        t: The type to check.

    Returns:
        True if the type is a generator, False otherwise.
    """
    return get_origin(t) is Generator


def is_async_generator_type(t):
    """
    Check if a type is an async generator.

    Args:
        t: The type to check.

    Returns:
        True if the type is an async generator, False otherwise.
    """
    return get_origin(t) is AsyncGenerator


def is_optional_type(t):
    """
    Check if a type is an optional type.

    Args:
        t: The type to check.

    Returns:
        True if the type is an optional type, False otherwise.
    """
    return (
        get_origin(t) is Union and len(get_args(t)) == 2 and type(None) in get_args(t)
    )


def is_enum_type(t):
    """
    Check if a type is an enum.

    Args:
        t: The type to check.

    Returns:
        True if the type is an enum, False otherwise.
    """
    return isinstance(t, EnumMeta)


def is_union_type(t):
    """
    Check if a type is a union.

    Args:
        t: The type to check.

    Returns:
        True if the type is a union, False otherwise.
    """
    return get_origin(t) is Union or isinstance(t, UnionType)


def is_list_type(t):
    """
    Check if a type is a list.

    Args:
        t: The type to check.

    Returns:
        True if the type is a list, False otherwise.
    """
    return t is list or get_origin(t) is list


def is_dict_type(t):
    """
    Check if a type is a dictionary.

    Args:
        t: The type to check.

    Returns:
        True if the type is a dictionary, False otherwise.
    """
    return t is dict or get_origin(t) is dict


def is_number_type(t):
    """
    Check if a type is a number.

    Args:
        t: The type to check.

    Returns:
        True if the type is a number, False otherwise.
    """
    from nodetool.metadata.types import Tensor

    return is_union_type(t) and all(
        [arg in [int, float, Tensor] for arg in get_args(t)]
    )


def is_class(obj: Any) -> bool:
    return inspect.isclass(obj)
