import math
import torch
from .utils import AnyType
import comfy.model_management
from nodes import MAX_RESOLUTION

any = AnyType("*")

class SimpleMathFloat:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "value": ("FLOAT", { "default": 0.0, "min": -0xffffffffffffffff, "max": 0xffffffffffffffff, "step": 0.05 }),
            },
        }

    RETURN_TYPES = ("FLOAT", )
    FUNCTION = "execute"
    CATEGORY = "essentials/utilities"

    def execute(self, value):
        return (float(value), )

class SimpleMathPercent:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "value": ("FLOAT", { "default": 0.0, "min": 0, "max": 1, "step": 0.05 }),
            },
        }

    RETURN_TYPES = ("FLOAT", )
    FUNCTION = "execute"
    CATEGORY = "essentials/utilities"

    def execute(self, value):
        return (float(value), )

class SimpleMathInt:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "value": ("INT", { "default": 0, "min": -0xffffffffffffffff, "max": 0xffffffffffffffff, "step": 1 }),
            },
        }

    RETURN_TYPES = ("INT",)
    FUNCTION = "execute"
    CATEGORY = "essentials/utilities"

    def execute(self, value):
        return (int(value), )

class SimpleMathSlider:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "value": ("FLOAT", { "display": "slider", "default": 0.5, "min": 0.0, "max": 1.0, "step": 0.001 }),
            },
        }

    RETURN_TYPES = ("FLOAT",)
    FUNCTION = "execute"
    CATEGORY = "essentials/utilities"

    def execute(self, value):
        return (value, )

class SimpleMathBoolean:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "value": ("BOOLEAN", { "default": False }),
            },
        }

    RETURN_TYPES = ("BOOLEAN",)
    FUNCTION = "execute"
    CATEGORY = "essentials/utilities"

    def execute(self, value):
        return (value, )

class SimpleMath:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "optional": {
                "a": (any, { "default": 0.0 }),
                "b": (any, { "default": 0.0 }),
                "c": (any, { "default": 0.0 }),
            },
            "required": {
                "value": ("STRING", { "multiline": False, "default": "" }),
            },
        }

    RETURN_TYPES = ("INT", "FLOAT", )
    FUNCTION = "execute"
    CATEGORY = "essentials/utilities"

    def execute(self, value, a = 0.0, b = 0.0, c = 0.0):
        import ast
        import operator as op

        a = float(a)
        b = float(b)
        c = float(c)

        operators = {
            ast.Add: op.add,
            ast.Sub: op.sub,
            ast.Mult: op.mul,
            ast.Div: op.truediv,
            ast.FloorDiv: op.floordiv,
            ast.Pow: op.pow,
            ast.BitXor: op.xor,
            ast.USub: op.neg,
            ast.Mod: op.mod,
            ast.Eq: op.eq,
            ast.NotEq: op.ne,
            ast.Lt: op.lt,
            ast.LtE: op.le,
            ast.Gt: op.gt,
            ast.GtE: op.ge,
            #ast.And: op.and_,
            #ast.Or: op.or_,
            ast.Not: op.not_
        }

        op_functions = {
            'min': min,
            'max': max,
            'round': round,
            'sum': sum,
            'len': len,
        }

        def eval_(node):
            if isinstance(node, ast.Num): # number
                return node.n
            elif isinstance(node, ast.Name): # variable
                if node.id == "a":
                    return a
                if node.id == "b":
                    return b
                if node.id == "c":
                    return c
            elif isinstance(node, ast.BinOp): # <left> <operator> <right>
                return operators[type(node.op)](eval_(node.left), eval_(node.right))
            elif isinstance(node, ast.UnaryOp): # <operator> <operand> e.g., -1
                return operators[type(node.op)](eval_(node.operand))
            elif isinstance(node, ast.Compare):  # comparison operators
                left = eval_(node.left)
                for op, comparator in zip(node.ops, node.comparators):
                    if not operators[type(op)](left, eval_(comparator)):
                        return 0
                return 1
            elif isinstance(node, ast.BoolOp):  # boolean operators (And, Or)
                if isinstance(node.op, ast.And):
                    return all(eval_(value) for value in node.values)
                elif isinstance(node.op, ast.Or):
                    return any(eval_(value) for value in node.values)
            elif isinstance(node, ast.Call): # custom function
                if node.func.id in op_functions:
                    args =[eval_(arg) for arg in node.args]
                    return op_functions[node.func.id](*args)
            elif isinstance(node, ast.Subscript): # indexing or slicing
                value = eval_(node.value)
                if isinstance(node.slice, ast.Constant):
                    return value[node.slice.value]
                else:
                    return 0
            else:
                return 0

        result = eval_(ast.parse(value, mode='eval').body)

        if math.isnan(result):
            result = 0.0
        
        return (round(result), result, )

class SimpleMathCondition:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "optional": {
                "a": (any, { "default": 0.0 }),
                "b": (any, { "default": 0.0 }),
                "c": (any, { "default": 0.0 }),
            },
            "required": {
                "evaluate": (any, {"default": 0}),
                "on_true": ("STRING", { "multiline": False, "default": "" }),
                "on_false": ("STRING", { "multiline": False, "default": "" }),
            },
        }
    
    RETURN_TYPES = ("INT", "FLOAT", )
    FUNCTION = "execute"
    CATEGORY = "essentials/utilities"

    def execute(self, evaluate, on_true, on_false, a = 0.0, b = 0.0, c = 0.0):
        return SimpleMath().execute(on_true if evaluate else on_false, a, b, c)

class SimpleCondition:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "evaluate": (any, {"default": 0}),
                "on_true": (any, {"default": 0}),
            },
            "optional": {
                "on_false": (any, {"default": 0}),
            },
        }

    RETURN_TYPES = (any,)
    RETURN_NAMES = ("value",)
    FUNCTION = "execute"

    CATEGORY = "essentials/utilities"

    def execute(self, evaluate, on_true, on_false=0):
        return (on_true if evaluate else on_false,)

class SimpleComparison:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "a": (any, {"default": 0}),
                "b": (any, {"default": 0}),
                "comparison": (["==", "!=", "<", "<=", ">", ">="],),
            },
        }

    RETURN_TYPES = ("BOOLEAN",)
    FUNCTION = "execute"

    CATEGORY = "essentials/utilities"

    def execute(self, a, b, comparison):
        if comparison == "==":
            return (a == b,)
        elif comparison == "!=":
            return (a != b,)
        elif comparison == "<":
            return (a < b,)
        elif comparison == "<=":
            return (a <= b,)
        elif comparison == ">":
            return (a > b,)
        elif comparison == ">=":
            return (a >= b,)

class ConsoleDebug:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "value": (any, {}),
            },
            "optional": {
                "prefix": ("STRING", { "multiline": False, "default": "Value:" })
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "execute"
    CATEGORY = "essentials/utilities"
    OUTPUT_NODE = True

    def execute(self, value, prefix):
        print(f"\033[96m{prefix} {value}\033[0m")

        return (None,)

class DebugTensorShape:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "tensor": (any, {}),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "execute"
    CATEGORY = "essentials/utilities"
    OUTPUT_NODE = True

    def execute(self, tensor):
        shapes = []
        def tensorShape(tensor):
            if isinstance(tensor, dict):
                for k in tensor:
                    tensorShape(tensor[k])
            elif isinstance(tensor, list):
                for i in range(len(tensor)):
                    tensorShape(tensor[i])
            elif hasattr(tensor, 'shape'):
                shapes.append(list(tensor.shape))

        tensorShape(tensor)

        print(f"\033[96mShapes found: {shapes}\033[0m")

        return (None,)

class BatchCount:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "batch": (any, {}),
            },
        }

    RETURN_TYPES = ("INT",)
    FUNCTION = "execute"
    CATEGORY = "essentials/utilities"

    def execute(self, batch):
        count = 0
        if hasattr(batch, 'shape'):
            count = batch.shape[0]
        elif isinstance(batch, dict) and 'samples' in batch:
            count = batch['samples'].shape[0]
        elif isinstance(batch, list) or isinstance(batch, dict):
            count = len(batch)

        return (count, )

class ModelCompile():
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model": ("MODEL",),
                "fullgraph": ("BOOLEAN", { "default": False }),
                "dynamic": ("BOOLEAN", { "default": False }),
                "mode": (["default", "reduce-overhead", "max-autotune", "max-autotune-no-cudagraphs"],),
            },
        }

    RETURN_TYPES = ("MODEL", )
    FUNCTION = "execute"
    CATEGORY = "essentials/utilities"

    def execute(self, model, fullgraph, dynamic, mode):
        work_model = model.clone()
        torch._dynamo.config.suppress_errors = True
        work_model.model.diffusion_model = torch.compile(work_model.model.diffusion_model, dynamic=dynamic, fullgraph=fullgraph, mode=mode)
        return (work_model, )

class RemoveLatentMask:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": { "samples": ("LATENT",),}}
    RETURN_TYPES = ("LATENT",)
    FUNCTION = "execute"

    CATEGORY = "essentials/utilities"

    def execute(self, samples):
        s = samples.copy()
        if "noise_mask" in s:
            del s["noise_mask"]

        return (s,)

class SDXLEmptyLatentSizePicker:
    def __init__(self):
        self.device = comfy.model_management.intermediate_device()

    @classmethod
    def INPUT_TYPES(s):
        return {"required": {
            "resolution": (["704x1408 (0.5)","704x1344 (0.52)","768x1344 (0.57)","768x1280 (0.6)","832x1216 (0.68)","832x1152 (0.72)","896x1152 (0.78)","896x1088 (0.82)","960x1088 (0.88)","960x1024 (0.94)","1024x1024 (1.0)","1024x960 (1.07)","1088x960 (1.13)","1088x896 (1.21)","1152x896 (1.29)","1152x832 (1.38)","1216x832 (1.46)","1280x768 (1.67)","1344x768 (1.75)","1344x704 (1.91)","1408x704 (2.0)","1472x704 (2.09)","1536x640 (2.4)","1600x640 (2.5)","1664x576 (2.89)","1728x576 (3.0)",], {"default": "1024x1024 (1.0)"}),
            "batch_size": ("INT", {"default": 1, "min": 1, "max": 4096}),
            "width_override": ("INT", {"default": 0, "min": 0, "max": MAX_RESOLUTION, "step": 8}),
            "height_override": ("INT", {"default": 0, "min": 0, "max": MAX_RESOLUTION, "step": 8}),
            }}

    RETURN_TYPES = ("LATENT","INT","INT",)
    RETURN_NAMES = ("LATENT","width","height",)
    FUNCTION = "execute"
    CATEGORY = "essentials/utilities"

    def execute(self, resolution, batch_size, width_override=0, height_override=0):
        width, height = resolution.split(" ")[0].split("x")
        width = width_override if width_override > 0 else int(width)
        height = height_override if height_override > 0 else int(height)

        latent = torch.zeros([batch_size, 4, height // 8, width // 8], device=self.device)

        return ({"samples":latent}, width, height,)

MISC_CLASS_MAPPINGS = {
    "BatchCount+": BatchCount,
    "ConsoleDebug+": ConsoleDebug,
    "DebugTensorShape+": DebugTensorShape,
    "ModelCompile+": ModelCompile,
    "RemoveLatentMask+": RemoveLatentMask,
    "SDXLEmptyLatentSizePicker+": SDXLEmptyLatentSizePicker,
    "SimpleComparison+": SimpleComparison,
    "SimpleCondition+": SimpleCondition,
    "SimpleMath+": SimpleMath,
    "SimpleMathCondition+": SimpleMathCondition,
    "SimpleMathBoolean+": SimpleMathBoolean,
    "SimpleMathFloat+": SimpleMathFloat,
    "SimpleMathInt+": SimpleMathInt,
    "SimpleMathPercent+": SimpleMathPercent,
    "SimpleMathSlider+": SimpleMathSlider,
}

MISC_NAME_MAPPINGS = {
    "BatchCount+": "🔧 Batch Count",
    "ConsoleDebug+": "🔧 Console Debug",
    "DebugTensorShape+": "🔧 Debug Tensor Shape",
    "ModelCompile+": "🔧 Model Compile",
    "RemoveLatentMask+": "🔧 Remove Latent Mask",
    "SDXLEmptyLatentSizePicker+": "🔧 Empty Latent Size Picker",
    "SimpleComparison+": "🔧 Simple Comparison",
    "SimpleCondition+": "🔧 Simple Condition",
    "SimpleMath+": "🔧 Simple Math",
    "SimpleMathCondition+": "🔧 Simple Math Condition",
    "SimpleMathBoolean+": "🔧 Simple Math Boolean",
    "SimpleMathFloat+": "🔧 Simple Math Float",
    "SimpleMathInt+": "🔧 Simple Math Int",
    "SimpleMathPercent+": "🔧 Simple Math Percent",
    "SimpleMathSlider+": "🔧 Simple Math Slider",
}