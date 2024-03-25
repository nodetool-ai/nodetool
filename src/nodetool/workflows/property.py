from nodetool.metadata.types import TypeMetadata

import annotated_types
from pydantic import BaseModel
from pydantic.fields import FieldInfo

from typing import Any, Optional


class Property(BaseModel):
    """
    Property of a node.
    """

    name: str
    type: TypeMetadata
    default: Optional[Any] = None
    title: Optional[str] = None
    description: Optional[str] = None
    min: Optional[float] = None
    max: Optional[float] = None

    def get_json_schema(self):
        """
        Returns a JSON schema for the self.
        """
        schema = self.type.get_json_schema()
        schema["description"] = self.description
        if self.min:
            schema["minimum"] = self.min
        if self.max:
            schema["maximum"] = self.max
        return schema

    @staticmethod
    def from_field(name: str, type_: TypeMetadata, field: FieldInfo):
        metadata = {type(f): f for f in field.metadata}

        ge = metadata.get(annotated_types.Ge, None)
        le = metadata.get(annotated_types.Le, None)

        if field.title is None:
            title = name.replace("_", " ").title()
        else:
            title = field.title
        return Property(
            name=name,
            type=type_,
            default=field.default,
            title=title,
            description=field.description,
            min=ge.ge if ge is not None else None,
            max=le.le if le is not None else None,
        )
