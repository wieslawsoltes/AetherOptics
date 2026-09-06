# Verification report — Aether Optics 1.0.0

## Executed checks

| Test group | Result | Exercised path |
|---|---:|---|
| Automated Node tests | 40 / 40 passed | Float64 optics, model validation, units, history, exports, memory storage, study cancellation, Node worker protocol |
| Reusable numerical/behavioral benchmarks | 28 / 28 passed | Included within the 40 Node tests; also executed in the browser |
| Browser integration assertions | 33 / 33 passed | Real app, Float64 main-thread fallback, Canvas layout rendering, dialogs, editing and numerical workflows |

The 28 benchmarks are a **subset**, not 28 additional independent tests. The browser's benchmark assertion reruns that same suite. Test counts are not a percentage of commercial feature coverage.

Environment: Node.js v22.16.0; Chromium 144.0.7559.96 controlled through Python Playwright. The browser application was loaded from the locally built self-contained HTML into an opaque about:blank page. All screenshots in this directory were captured from this actual application, not generated artwork.

## Explicitly unverified paths

The managed browser environment did not permit URL navigation or usable WebGPU/worker execution. Therefore:

* WGSL compilation, WebGPU compute dispatch and readback, WebGPU graphics output, GPU/CPU numerical parity, device loss, and hardware performance were **not executed or measured** here.
* Browser ES-module worker loading, worker concurrency under browser event-loop conditions, and worker cancellation under browser permissions were not end-to-end validated. The same worker entrypoint was exercised through a real Node worker-thread adapter; that does not validate browser URL/CSP behavior.
* IndexedDB and localStorage durability were not end-to-end validated in a normal browser origin. Memory-only fallback/recovery semantics were tested. JSON projects and strict validation were tested as data; browser download/open dialogs were not fully automated under the restricted environment.
* No commercial OpticStudio cross-comparison, certification, optical laboratory measurement, GPU speed benchmark, Safari/Firefox test, exhaustive asphere root-isolation proof, or global optimization proof was performed.

There is no hidden success stub for these gaps. Auto tracing only uses a GPU tracer after actual adapter, device, shader and pipeline initialization; errors select the explicit CPU path. Approximately 64 CPU reference rays audit each GPU batch when available. A failed audit replaces the displayed analysis with Float64. The application exposes both the actual backend and audit values.

## Reproduce

```sh
npm test
npm run build
node tools/export-examples.mjs
```

For the same restricted-context UI checks, install Python Playwright in your own environment and make a Chromium binary available, then run:

```sh
CHROMIUM=/path/to/chromium python tools/browser-integration.py
```

The optional Python test driver is not a runtime dependency and is not installed by npm. It deliberately checks the non-WebGPU opaque-origin fallback; it is not a GPU benchmark. In a less restricted browser, a blob worker may be allowed even on about:blank, so adapt its environment assertions accordingly.

For native browser paths, run `npm start`, open the localhost page in a WebGPU-capable browser, inspect **Engine**, and run **Check all example systems**. It must report a real initialized GPU and actual status/position discrepancies; a disabled command or CPU fallback is not a GPU pass. Select Float64 explicitly for precision-sensitive comparisons. To extend validation beyond sampled audits, compare `GPUTracer.trace(prepare(model))` against `traceBatch(prepare(model))` for every output record, with independently justified geometric tolerances and attention to failed-ray flags.

## Benchmark records

The machine-readable [numerical-benchmarks.json](numerical-benchmarks.json) includes each actual value, expected value, tolerance or condition, pass flag, and execution time. The Node TAP transcript is [node-test-results.tap](node-test-results.tap). Detailed browser assertions and results are [browser-test-results.json](browser-test-results.json). Values for all four complete example analyses are in [example-results.json](example-results.json).

| Numerical benchmark | Result |
|---|---|
| SCHOTT N-BK7 d-line | PASS |
| SCHOTT F2 d-line | PASS |
| SCHOTT N-SF11 d-line | PASS |
| Cauchy dispersion | PASS |
| Snell law · 30° air / n=1.5 | PASS |
| Normal incidence preserves direction | PASS |
| Total internal reflection · glass / air | PASS |
| Specular reflection | PASS |
| Refraction reciprocity | PASS |
| Positive-radius spherical cap branch | PASS |
| Negative-radius spherical cap branch | PASS |
| Plane-parallel plate angular invariance | PASS |
| Optical path through a normal plate | PASS |
| Circular aperture clipping | PASS |
| Annular aperture central obscuration | PASS |
| Rectangle aperture corner | PASS |
| Even-asphere analytic slope | PASS |
| Polynomial asphere intersection residual | PASS |
| Thin-lens limit · n=1.5 / R=50 | PASS |
| Thick-lens lensmaker equation | PASS |
| Paraboloid · exact 100 mm focus | PASS |
| Paraboloid · equal optical paths | PASS |
| Internal-stop Newton ray aiming | PASS |
| Least-squares focus lowers spot RMS | PASS |
| Project validation rejects a non-real cap | PASS |
| Transactional undo / redo | PASS |
| Deterministic sampling / merit | PASS |
| Bounded LM improves defocus | PASS |

## Browser assertions

| Assertion | Result |
|---|---|
| Initial real calculation | PASS |
| Fallback identified honestly | PASS |
| Lens editor unit-aware change | PASS |
| Edited curvature changes computed EFL | PASS |
| Undo restores optics | PASS |
| Redo restores radius | PASS |
| Invalid cap rejected transactionally | PASS |
| 3D triangle scene generated | PASS |
| Linked ray fans | PASS |
| OPD computes real reference sphere | PASS |
| Field angles editable | PASS |
| Wavelength units converted | PASS |
| Custom Cauchy glass persisted in model | PASS |
| Dialog: properties | PASS |
| Dialog: surface-properties | PASS |
| Dialog: glass | PASS |
| Dialog: engine | PASS |
| Dialog: optimization | PASS |
| Dialog: sweep | PASS |
| Dialog: report | PASS |
| Dialog: export | PASS |
| Dialog: diagnostics | PASS |
| Dialog: help | PASS |
| Dialog: about | PASS |
| Dialog: examples | PASS |
| Live LM merit converges | PASS |
| Optimization applied and full trace improves | PASS |
| Sweep computes nonconstant results | PASS |
| Browser Float64 benchmarks | PASS |
| Surface insertion | PASS |
| Reflective exact focus visible | PASS |
| Mobile no document overflow | PASS |
| No browser JavaScript exceptions | PASS |

## Interpretation

The exact paraboloid test concerns on-axis geometrical optics; its near-zero spot and equal paths are not a physical diffraction spot prediction. A passing lensmaker check validates a paraxial relation for the tested singlet, not every surface type or parameter range. A converged bounded optimizer is a local numerical result at the chosen sampling density, not proof of a globally optimal or manufacturable system. Inspect status counts, repeat at higher density, compare reference precision, and validate engineering designs independently.
