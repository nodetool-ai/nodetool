import pytest
from nodetool.dsl.graph import graph_result
from nodetool.dsl.nodetool.math import Add, Multiply, Sine, Power, Sqrt, Divide
from nodetool.dsl.nodetool.output import FloatOutput

# Example 1: Basic arithmetic (2 + 3) * 4
basic_arithmetic = FloatOutput(
    name="basic_arithmetic",
    value=Multiply(a=Add(a=2, b=3), b=4),
)

# Example 2: Trigonometric calculation with power: sin(π/4)²
trig_calculation = FloatOutput(
    name="trig_calculation",
    value=Power(base=Sine(angle_rad=3.14159 / 4), exponent=2),
)

# Example 3: Complex formula: √(a² + b²) - Pythagorean theorem
pythagorean = FloatOutput(
    name="pythagorean",
    value=Sqrt(x=Add(a=Power(base=3, exponent=2), b=Power(base=4, exponent=2))),
)

# Example 4: Nested operations: (10 + 5) / (2 * 3)
nested_operations = FloatOutput(
    name="nested_operations",
    value=Divide(a=Add(a=10, b=5), b=Multiply(a=2, b=3)),
)

# Example 5: Combining multiple operations: sin(x²) + √(x)
combined_operations = FloatOutput(
    name="combined_operations",
    value=Add(a=Sine(angle_rad=Power(base=2, exponent=2)), b=Sqrt(x=2)),
)


@pytest.mark.asyncio
async def test_basic_arithmetic():
    result = await graph_result(basic_arithmetic)
    assert result == 20  # (2 + 3) * 4 = 20


@pytest.mark.asyncio
async def test_pythagorean():
    result = await graph_result(pythagorean)
    assert pytest.approx(result, 0.0001) == 5.0  # √(3² + 4²) = 5


@pytest.mark.asyncio
async def test_nested_operations():
    result = await graph_result(nested_operations)
    assert result == 2.5  # (10 + 5) / (2 * 3) = 15 / 6 = 2.5


@pytest.mark.asyncio
async def test_trig_calculation():
    result = await graph_result(trig_calculation)
    assert pytest.approx(result, 0.0001) == 0.5  # sin(π/4)² ≈ 0.5


@pytest.mark.asyncio
async def test_combined_operations():
    result = await graph_result(combined_operations)
    assert result > 0
