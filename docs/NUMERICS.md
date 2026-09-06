# Numerical conventions and implementation notes

This document describes the actual source in version 1.0.0. The Float64 CPU kernel is the numerical reference. It does not assert that the GPU implementation has passed hardware validation; see TEST-REPORT.md.

## 1. Coordinates, surfaces, and units

Optical coordinates are `(x, y, z)` with the initial propagation direction toward positive z. Surfaces share one rotational axis. The first vertex is z=0; each subsequent vertex adds the preceding surface's `thickness`. Thickness is a **signed global-z spacing**, not a positive distance along the current ray. Reflection reverses the nominal axial propagation direction, so the following gap is negative after an odd number of mirrors. The UI normalizes gap signs when toggling a mirror.

`glass` is the medium **after a refracting surface** in sequence order. Mirrors keep the current medium. The initial reference medium is AIR with index exactly 1. The last surface is a planar detector and does not refract. Surface intersections are processed in prescription order; this is not a non-sequential nearest-object tracer.

Lengths and optical paths are in mm. Stored wavelengths are in µm. Angular fields are degrees; their direction is `normalize([tan(fieldX), tan(fieldY), 1])`. This is a tangent-angle convention, not successive Euler rotations. Fields are limited to ±45° by validation. There is no finite object-distance parameter.

The UI accepts explicit length/angle/wavelength units using a strict numeric parser, never `eval`. A blank suffix means the displayed field's base unit. `0`, `inf`, `infinity`, `plane`, and `∞` in a radius field denote a plane. A4, A6, A8 and A10 have units mm^-3, mm^-5, mm^-7 and mm^-9 respectively. This is dimensional input validation/conversion, not a symbolic unit algebra system.

Circular apertures require equal semi-diameters. Rectangular apertures use independent x/y half-widths. A nonzero `inner` adds a central circular exclusion; pupil generation treats a circular annulus with equal-area radial sampling. A rectangular pupil is sampled over its outer rectangle and any central obstruction is handled by clipping. The reported geometric transmission is the fraction of the sampled incident pupil rays reaching the image, not radiometric power.

## 2. Sag and intersections

With `c = 1/R` (or zero for a plane), `r² = x² + y²`, and `q = 1 - (1+k)c²r²`, the implemented even-asphere sag is:

```text
z(r) = c r² / (1 + sqrt(q)) + A4 r⁴ + A6 r⁶ + A8 r⁸ + A10 r¹⁰
(1/r) dz/dr = c / sqrt(q) + 4 A4 r² + 6 A6 r⁴ + 8 A8 r⁶ + 10 A10 r⁸
normal = normalize([-x g, -y g, 1])
```

A standard surface uses k=0 and no polynomial terms. An asphere can have nonzero conic and polynomial coefficients. The validator requires the entire clear aperture to lie on the real, single-valued conic cap with a margin `q > 1e-10`; corners determine the radial extent of a rectangular aperture. This avoids the infinite slope at the conic rim. It does not prove that arbitrary polynomial coefficients produce a physically sensible lens.

For a pure quadric, substitution of the ray into the implicit conic produces a quadratic. The solver uses a cancellation-resistant root form and a near-linear branch. Candidate intersections must have forward propagation parameter within numerical tolerance and must agree with the intended sag branch, rejecting the unwanted back side of a sphere.

A polynomial asphere first uses the underlying conic intersection as an initial estimate. It performs damped Newton iterations with analytic slope and step backtracking. If needed, it constructs a sampled radial sag envelope, searches finite z-parameter brackets, and bisects a detected sign change. The fallback uses 64 radial intervals, 96 ray-parameter intervals, and a finite bisection budget. This is robust for the included ordinary optical caps but is **not a globally certified root-isolation algorithm**. Tangential roots, multiple forward intersections, very rapidly oscillating high-order profiles, and extreme grazing geometry can be missed or select a non-earliest root. CPU/GPU tolerances also differ. Such designs require further verification or a stronger interval-based kernel.

The CPU records an intersection residual per ray; failure is explicit rather than silently replacing the ray with a plausible point. Apertures clip the intersection in surface coordinates. Geometry diagnostics sample adjacent cap clearances at 41 radii; these are warnings, not a proof of manufacturability or nonintersection over all radii.

## 3. Reflection, refraction, and ray status

The normal is oriented against the incident unit direction `d`. Set `ci = -dot(d, normal)`, `eta = n1/n2`:

```text
k = 1 - eta² (1 - ci²)
d_refracted = normalize(eta d + (eta ci - sqrt(k)) normal)
d_reflected = normalize(d + 2 ci normal)
```

Negative k means total internal reflection. At a refracting surface this yields an explicit TIR failure status; it does not spawn a reflected secondary ray or change the subsequent sequential path. Mirror surfaces use ideal specular reflection with unit geometric survival. There are no Fresnel or coating losses.

Ray status values are 0=transmitted, 1=surface miss, 2=aperture clipped, 3=TIR, 4=stop aiming failed. Spot statistics and throughput use only spot rays, not fan/reference rays. All-vignetted fields have null RMS, not zero. A partially vignetted design can have misleadingly small surviving-ray RMS; always examine the accompanying transmission and status counts.

## 4. Physical-stop aiming and sampling

The entrance launch plane is placed before the first optical cap. For every angular field and wavelength, the incident direction is fixed and the origin is solved so the ray reaches a requested physical stop coordinate. A two-variable finite-difference Jacobian and damped Newton updates solve this internal-stop aiming problem. A first-surface stop has a direct construction. The iteration count and backtracking are finite; failures are retained as failed rays.

Spot pupils use deterministic Hammersley-style sampling: uniformly distributed squared radius and radical-inverse azimuth for disks/annuli, or a uniform rectangular map. Sampling is reproducible and independent of wall-clock timing. Each configured field/wavelength also receives a virtual center chief ray; each fan has 65 coordinates across its corresponding pupil axis. Layout previews use nine meridional rays per field/wavelength, traced with the same CPU kernel. Layout preview density is separate from analysis sampling.

**Reference chief rays ignore clipping** to define a usable reference for centrally obscured stops. They are not counted as physical transmitted rays. A clicked or explicitly probed physical stop-center ray still undergoes normal clipping.

## 5. Dispersion

The library implements:

```text
constant:   n(λ) = n
Cauchy:     n(λ) = A + B/λ² + C/λ⁴
Sellmeier:  n(λ)² = 1 + Σ[j=1..3] Bj λ² / (λ² - Cj)
```

λ is in µm. Sellmeier C coefficients therefore have units µm². A custom glass includes its model, coefficients, wavelength interval, and safe unique name in the project file. Evaluation rejects out-of-interval wavelengths, singular terms, and nonfinite/unphysical indices. Validation checks the configured operating wavelengths and a representative interval point; it is not a symbolic proof of physical behavior throughout an arbitrary user-supplied interval. The dispersion plot leaves invalid sample points undefined.

The included SCHOTT materials use the following nominal coefficients:

| Material | B1, B2, B3 | C1, C2, C3 | Application interval, µm |
|---|---|---|---|
| N-BK7 | 1.03961212, 0.231792344, 1.01046945 | 0.00600069867, 0.0200179144, 103.560653 | 0.300–2.500 |
| F2 | 1.34533359, 0.209073176, 0.937357162 | 0.00997743871, 0.0470450767, 111.886764 | 0.365–2.500 |
| N-SF11 | 1.73759695, 0.313747346, 1.89878101 | 0.013188707, 0.0623068142, 155.23629 | 0.370–2.500 |

**F2 is not N-F2.** The distinction is preserved in the project and UI. Catalog refractive indices are nominal relative-to-air values; AIR=1 is the implementation's reference convention. Temperature, pressure, thermal dispersion, melt data, transmission/absorption, and birefringence are not modeled. The ideal n=1.5 material is an analytical fixture, not a manufactured catalog glass.

## 6. Geometric analysis and first-order metrics

For a field, all successful wavelength samples contribute to one polychromatic centroid with the configured wavelength weights. RMS radius is the square root of the weighted average squared distance to that centroid. The overall displayed RMS is the field-weighted root-mean-square of those field RMS values. The geometric radius is the maximum surviving-ray distance to the centroid. Monochromatic RMS is independently centered per wavelength. Field coordinates in the spot plots are centered for visualization; ray exports preserve absolute intercepts.

Ray fans report detector transverse error relative to the primary-wavelength chief intercept. They are not Seidel coefficient fits. Paraxial focal quantities are obtained by tracing a small on-axis parallel probe with launch height 1e-4 mm. EFL is `-height / outputSlope`, and BFL follows the paraxial ray's axis crossing relative to the final optical vertex, using propagation-oriented axial distance. The entrance pupil size comes from a small-angle/height stop-aiming mapping. The displayed F-number is `abs(EFL / EPD)`, not an exact finite-conjugate numerical-aperture calculation. For a rectangular stop, the single diameter metric is based on the configured x semi-width.

Quick focus fits a common detector shift in the final homogeneous medium. Each exiting ray's transverse intercept varies linearly with axial shift; minimizing weighted centered variance therefore gives a one-variable least-squares solution. Earlier aperture losses remain relevant. The new detector gap must still pass prescription validation. Changing focus can alter image-plane clipping, so the subsequent full trace is the authoritative displayed result.

## 7. Optical path and reference-sphere OPD

Every traversed segment accumulates `n * geometricLength`. Oblique infinite-object launch rays include the incident plane-wave phase `dx * originX + dy * originY` on the common launch plane; without that phase, differences between different launch points would not describe one incident wavefront.

For each wavelength/field, the reference sphere is centered at that chief ray's detector intercept and passes through its last optical-surface exit point. A real exiting ray is intersected with this sphere using its final-medium direction, allowing signed extrapolation. The nearer signed sphere root is chosen. OPD is:

```text
OPD_mm = exitEikonal_real + n_exit * signedDistanceToSphere
         - exitEikonal_chief
OPD_waves = OPD_mm / (wavelength_um / 1000)
```

Missing chief references, rays that do not reach the image, degenerate sphere radii, or invalid sphere intersections produce undefined OPD. Wavefront RMS removes pupil piston; peak-to-valley is computed across valid sampled OPD values. Tilt is not separately fitted away, and defocus is not automatically removed. These are geometric wavefront samples, not diffraction propagation, a PSF, Strehl ratio, or MTF. The wavefront view forces a fresh Float64 calculation even when GPU geometric tracing is selected.

## 8. Merit function, sweeps, and optimization

Merit operands are normalized by their user tolerance and weighted. A zero-target RMS operand expands to a fixed-size vector of centered x/y ray residuals; nonzero RMS targets use field scalar residuals. EFL/BFL/TRACK operands supply scalar residuals. Fixed-size failure penalties, a lost-ray-fraction penalty, and sampled cap-clearance penalties discourage a deceptively good merit from invalid or vignetted prescriptions. These penalties make the objective nonsmooth near clipping and geometric feasibility boundaries.

Optimization is bounded, scaled Levenberg–Marquardt. Each variable is normalized by its scale; finite-difference perturbations operate in those coordinates. Central differences are used where possible, one-sided differences near a bound or invalid trial. The algorithm forms damped normal equations and solves them with a partial-pivoted dense linear solve. Accepted decreases reduce damping; rejected trials increase it. It terminates on projected gradient, relative merit improvement, damping/singularity conditions, cancellation, or iteration budget. Normal equations can be poorly conditioned for highly correlated variables; parameter scaling and independent verification remain important. There is no SVD regularizer, automatic glass substitution, global search, or global-optimum guarantee.

Optimization uses 48 pupil samples by default for cost control; sweeps use 128, with optional 64-sample refocus. The resulting candidate is separately retraced at the UI sampling density after explicit application. A sweep samples the specified finite interval, retaining failed prescriptions as diagnostic rows. Its “best” candidate is only the best unvignetted sampled point, not a continuous optimum.

## 9. GPU precision, execution, and buffers

The browser CPU uses IEEE-754 double-precision JavaScript numbers and Float64Array ray records. The WGSL path uses f32. It aims rays and prepares material indices on the CPU, then dispatches real intersection/refraction/reflection work on the GPU with 128 invocations per workgroup. Storage and readback buffers grow geometrically and are reused; submissions sharing a tracer are serialized to prevent buffer overwrite while readback is pending. Device loss triggers an explicit fallback.

Input rays occupy two vec4f records (32 bytes): origin xyz plus incident eikonal, then direction xyz plus wavelength/virtual-chief flags. Each compiled surface occupies four vec4f records (64 bytes): shape/mode, aperture, polynomial coefficients, and wavelength-specific n1/n2. Results occupy five vec4f records (80 bytes): image xyz/eikonal, output direction/status, last exit xyz/eikonal, exit direction/index, and diagnostics. The CPU uses the equivalent 20-number result stride. Result records for failed rays must be interpreted through their status.

Approximately 64 rays per GPU batch are recalculated with Float64. Different status or a maximum detector-position difference >=0.002 mm fails the audit and replaces the displayed result with full CPU analysis. Optical-path disagreement is logged, but is not a GPU acceptance criterion. This deliberately conservative distinction is why all OPD views, focus, sweeps, and optimization use Float64. A sampled GPU pass does not certify unsampled rays, every geometry, submicrometre accuracy, or a physical GPU speedup. No GPU hardware measurements were obtained in the supplied test environment.

The GPU layout renderer batches actual line/triangle geometry, uses four-sample antialiasing, and redraws on invalidation rather than running an idle animation loop. Geometry tessellation is for visualization, not a watertight manufacturing solid. Transparent surfaces are a visualization approximation rather than a physically correct light-transport render. CPU ray layouts and Canvas projection remain available without WebGPU.

## Primary references

These references inform conventions or supply factual glass data; the implementation and analytic tests are original. No proprietary application code or optical prescription files were copied.

1. Ansys, *Exploring Sequential Mode in OpticStudio*: https://optics.ansys.com/hc/en-us/articles/42661713256723-Exploring-Sequential-Mode-in-OpticStudio
2. Ansys, *Aspheric Surfaces — Part 1*: https://optics.ansys.com/hc/en-us/articles/42661802686355-Aspheric-Surfaces-Part-1-Introduction-to-Aspherical-Surfaces-in-Optical-Design
3. SCHOTT, *N-BK7 Optical Glass Datasheet*: https://media.schott.com/api/public/content/41e799d0bf874807a0bb8e702fbb75b5?v=54856406
4. SCHOTT, *F2 Optical Glass Datasheet*: https://media.schott.com/api/public/content/4c96933ddb2a4a06adf062d635f0b35d?v=1cf0e068
5. SCHOTT, *N-SF11 Optical Glass Datasheet*: https://media.schott.com/api/public/content/78e83df5ca2c4da4ad4490a52c80a146?v=1a468147
6. SCHOTT, *TIE-29: Refractive Index and Dispersion*: https://media.schott.com/api/public/content/aaa572afd854434fb7b3faa4bc46103f?v=c0f4fa52
7. W3C, *WebGPU specification*: https://www.w3.org/TR/webgpu/
8. W3C, *WebGPU Shading Language*: https://www.w3.org/TR/WGSL/
9. MDN, *WebGPU API*: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
