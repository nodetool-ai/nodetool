// Integrate an elliptical pixel footprint along its major axis. The remaining
// isotropic footprint selects the mip level. Work is bounded to sixteen taps.
vec4 sampleAnisotropic16(sampler2D map, vec2 uv) {
    vec2 dimensions = vec2(textureSize(map, 0));
    vec2 dx = dFdx(uv) * dimensions;
    vec2 dy = dFdy(uv) * dimensions;
    float xx = dx.x * dx.x + dy.x * dy.x;
    float yy = dx.y * dx.y + dy.y * dy.y;
    float xy = dx.x * dx.y + dy.x * dy.y;
    float discriminant = length(vec2(xx - yy, 2.0 * xy));
    float majorSquared = max(0.0, 0.5 * (xx + yy + discriminant));
    // det(J)^2 / lambdaMajor avoids cancellation in the smaller eigenvalue.
    float determinant = dx.x * dy.y - dx.y * dy.x;
    float minorSquared = determinant * determinant / max(majorSquared, 1e-20);
    float major = sqrt(majorSquared);
    float minor = max(1.0, max(sqrt(minorSquared), major / 16.0));
    vec2 axis = abs(xy) > 1e-10
        ? normalize(vec2(xy, majorSquared - xx))
        : (xx >= yy ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
    int taps = clamp(int(ceil(major / minor)), 1, 16);
    vec2 span = axis * major / dimensions;
    float lod = log2(minor);
    vec4 result = vec4(0.0);
    for (int i = 0; i < 16; ++i) {
        if (i >= taps) { break; }
        float offset = (float(i) + 0.5) / float(taps) - 0.5;
        result += textureLod(map, uv + span * offset, lod);
    }
    return result / float(taps);
}
