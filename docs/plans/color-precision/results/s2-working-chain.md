# S2 working chain, stage one

Scope is A21 and A22 on film/color-s2, based on e6c9a7944c.
A23 and later tasks are not started. No host enables FP16 by default.

## A21

Extracted the alpha expressions and exposure transfer functions into shared
WGSL text helpers. The expressions preserve their distinct zero-alpha and
low-alpha policies. No operation order, clamp, parameter or Posterize changes.

The existing native-shared inverse-levels.json fixture now also contains
zero/low-alpha vectors and samples below, at and above both sRGB breakpoints.
A GPU compute test evaluates the shared text against these numerical vectors.
Native consumption of the new vector fields is not verified in this stage.

Captured every exported module's resolved WGSL from the starting source before
editing. workingFormat.test.ts compares complete strings against that fixture.
The capture switch was removed after capture so normal tests cannot rewrite it.

Verification results and the A22 module list follow in the A22 commit.
