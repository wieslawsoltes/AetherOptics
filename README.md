# Aether Optics

An independent, local-first sequential optical-design workbench in plain HTML, CSS, and JavaScript. It includes a Float64 reference ray tracer, a WGSL/WebGPU Float32 tracing path, WebGPU layout rendering, and an explicit CPU/Canvas compatibility path.

**This is an executable optical-design implementation, not a static interface or prerecorded simulation.** Lens edits change the prescription used by ray tracing, analysis, focus, sweeps, and optimization. The ribbon, lens table, system tree, and linked analysis panes use an OpticStudio-inspired workflow with original branding and styling. This is not a pixel-identical copy or a full commercial OpticStudio replacement.

[Open Aether Optics on GitHub Pages](https://wieslawsoltes.github.io/AetherOptics/)

[![Test and deploy](https://github.com/wieslawsoltes/AetherOptics/actions/workflows/pages.yml/badge.svg)](https://github.com/wieslawsoltes/AetherOptics/actions/workflows/pages.yml)

## Run

Node.js 20 or newer; no package installation, build step, framework, CDN, account, or runtime dependency is required.

```sh
cd AetherOptics
npm start
```

Open **http://localhost:8080**. To use another port, set the `PORT` environment variable; for example, `PORT=9000 npm start` on a Unix shell or `$env:PORT=9000; npm start` in PowerShell.

```sh
npm test                  # 40 automated Node tests
npm run build             # create dist/index.html, a self-contained application
node tools/serve.mjs --dist
node tools/export-examples.mjs  # regenerate examples and numerical reports
```

The supplied `dist/index.html` contains the full application, styles, and embedded worker source. It can be copied to a static host or opened directly. **Use localhost or HTTPS for the WebGPU path.** Direct-file or restricted contexts may fall back to CPU computation and memory-only storage. The application identifies the active backend and storage mode; a missing GPU never turns the ray calculation into a mock.

The development server listens on all interfaces and has no authentication. Use it on a trusted machine/network; deploy only the intended application files behind an appropriate HTTPS host for public use.

## Implemented workflows

| Area | Working functionality |
|---|---|
| Lens prescription | Stable surface identities; editable radius, thickness, glass, semi-diameter, conic and even-asphere coefficients; insert, duplicate, delete, add lens; stop selection; ideal mirrors; unit-aware input |
| Optical model | Sequential coaxial refracting and reflecting surfaces; spherical, planar, conic, A4/A6/A8/A10 aspheres; circular, annular, and rectangular aperture clipping; infinite-object angular fields; planar detector |
| Materials | AIR, ideal constant index, SCHOTT N-BK7/F2/N-SF11, and custom constant/Cauchy/Sellmeier dispersion; explicit wavelength validity checks and an editable material catalogue |
| Ray tracing | Stable analytic quadric intersections, sag-branch checks, analytic normals, iterative polynomial-asphere intersections, Snell refraction, reflection, TIR detection, physical internal-stop ray aiming, ray-failure diagnostics |
| Analysis | Geometric spot diagrams, weighted polychromatic centroid and RMS, monochromatic statistics, ray fans, optical path/eikonal probes, reference-sphere OPD, field/wavelength filtering, first-order focal and pupil metrics |
| Layout | Actual traced 2D meridional and 3D ray geometry; WebGPU line/triangle batches, MSAA, orbit/pan/zoom/fit, Canvas compatibility renderer, SVG layout export |
| Design studies | Least-squares image focus; bounded, scaled Levenberg–Marquardt merit minimization; RMS/EFL/BFL/TRACK operands; progress and cancellation; real parameter sweeps; explicit undoable candidate application |
| Project lifecycle | Validated transactional edits, 100-step undo/redo, revision-aware asynchronous results, JSON import/export, IndexedDB autosave with a recovery generation, fallback storage, CSV and report exports |

The input limits are 64 surfaces including the detector, 8 wavelengths, 9 angular fields, 16 optimization variables, and 32 merit operands. Sampling supports 16–16,384 rays per field/wavelength, with a 300,000 spot-ray total cap. Chief and fan rays are additional. These are validation limits, **not a claim that every supported-size problem is interactive on every device**.

## First design session

Open the supplied Aurora air-spaced crown/flint example. Edit the crown front radius in the lens table, for example from `62` to `7 cm`, and observe the newly calculated focal length and spot pattern. Undo restores both the prescription and its calculated results.

Select **Quick focus** to move the detector to the least-squares geometric image plane. Switch between Spot diagram, Ray fans, and Wavefront; wavefront analysis deliberately uses Float64. Click a spot for a surface-by-surface ray probe. Select a wavelength or field to filter the layout.

Click **V** beside a supported surface parameter to mark it variable, then open **Merit function** to set bounds, scales, operands, targets, and tolerances. Optimization produces a candidate without silently replacing the working prescription. **Apply candidate** commits one undoable edit and starts a full displayed trace. Parameter sweeps use the same explicit-application workflow.

Use the File controls to export portable `.aether.json` projects. Autosave is a convenience, not a substitute for exported backups. Browser storage can be unavailable, cleared, or evicted; memory-only mode is explicitly shown.

### Keyboard and navigation

| Action | Shortcut |
|---|---|
| Export/open project | Ctrl/Cmd+S, Ctrl/Cmd+O |
| Undo/redo outside text editing | Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z; Ctrl+Y |
| Trace / quick focus | Ctrl/Cmd+Enter / Ctrl/Cmd+Shift+F |
| Fit / 2D / 3D | F / 2 / 3 |
| Layout navigation | Drag to pan in 2D; drag to orbit in 3D; Shift-drag to pan; wheel to zoom; double-click to fit |

## Reproducible examples and actual results

`examples/` contains four validated, portable prescriptions. The refractive examples have been quick-focused with 128 samples per field/wavelength; the reported results below are **subsequent 512-sample Float64 traces**, three fields and three wavelengths. The examples are illustrative starting designs, not certified or globally optimized commercial lens prescriptions.

| Example | EFL, mm | Weighted polychromatic RMS radius, µm | Transmitted spot rays |
|---|---:|---:|---:|
| Aurora crown/flint doublet | 107.847870287 | 30.162123 | 4,608 / 4,608 |
| Vega spherical singlet | 54.049137893 | 83.736072 | 4,608 / 4,608 |
| Nova even-asphere singlet | 54.049137893 | 65.795760 | 4,608 / 4,608 |
| Parabola, including off-axis fields | 100.000000000 | 7.548885 | 4,608 / 4,608 |

The paraboloid's **on-axis** geometric spot approaches numerical zero at its exact 100 mm focus. The nonzero aggregate figure above includes off-axis fields. Neither figure is a diffraction-limited spot-size prediction. See [the complete computed results](docs/example-results.json).

## Verification and precision

**40/40 automated Node tests and 33/33 browser interaction checks passed in the supplied execution environment.** The 28 reusable numerical benchmarks also run inside the application. They include catalog-index checks, Snell's law, TIR, reciprocity, spherical-cap selection, asphere slopes/residuals, plate optical path, aperture behavior, the thick-lens lensmaker relation, an exact paraboloid, internal-stop aiming, focus, history, and bounded optimization.

**Important verification boundary:** the available browser environment denied navigation/worker execution and did not expose usable WebGPU. Browser checks therefore executed the real Float64 **main-thread fallback**, Canvas layouts, and memory-only persistence. The WGSL compute and WebGPU graphics paths are implemented, but their shader compilation, rendering, numerical agreement, hardware throughput, and device-specific behavior **were not executed or measured here**. Browser module-worker loading and IndexedDB persistence were also not end-to-end tested here. A separate Node worker-thread test did exercise the shared worker message protocol and kernel.

In normal Auto mode, GPU output is audited against approximately 64 Float64 reference rays per batch. A status disagreement or image-position disagreement of 0.002 mm or more selects a full Float64 recalculation. This is a **sampled diagnostic gate, not a precision guarantee for every ray**. Wavefront, optimization, focus, and sweeps use Float64 independently of that gate. Choose Float64 explicitly for sensitive work. The Engine dialog includes a GPU cross-check command for all four templates.

Read [TEST-REPORT.md](docs/TEST-REPORT.md) for the exact exercised and unexercised paths, and [NUMERICS.md](docs/NUMERICS.md) for numerical conventions and limitations.

## Source map

```text
index.html, style.css    Workbench structure, responsive layout, original icons
src/model.js             Validated prescription, examples, history
src/glass.js             Dispersion models and catalog coefficients
src/math.js              Vector operations and dense linear solve
src/optics.js             Float64 tracing, aiming, analysis, merit, LM, sweep
src/gpu.js                WGSL compute kernel, GPU packing and reusable buffers
src/tasks.js             Shared computation dispatch and sampled GPU audit
src/worker.js             Worker protocol and cooperative study cancellation
src/project.js           Worker client, fallback, persistence, units, CSV
src/render.js            Actual optical geometry, WebGPU/Canvas layout renderers
src/charts.js            Spot, fan, OPD, convergence and sweep plots
src/app.js               Editor, commands, dialogs, analysis synchronization
src/benchmarks.js        28 reusable numerical/behavioral benchmarks
/tests                   Node tests, worker-thread harness
/tools                   Server, bundler, example export, browser integration
/docs                    Numerical notes and test evidence
/examples                Portable prescriptions
/dist                    Self-contained browser build
```

For direct engine use, import `createExample` from `src/model.js` and `analyze`, `bestFocus`, or `optimize` from `src/optics.js`. These modules do not require the browser DOM.

```js
import { createExample } from './src/model.js';
import { analyze, bestFocus } from './src/optics.js';

const initial = createExample('achromat');
const focused = bestFocus(initial).model;
const result = analyze(focused, { samples: 512 });
console.log({ eflMm: result.paraxial.efl, rmsMm: result.rms,
              transmitted: result.valid, total: result.total });
```

The browser exposes `aether.model` (a clone), `aether.setModel(model)`, `aether.calculate()`, `aether.result`, and `aether.gpuChecks()` for inspection and automation. Call the latter only when the Engine dialog reports an initialized GPU tracer.

## Model boundaries

This release does not include finite-conjugate objects, tilted/decentered coordinate breaks, freeforms, gradient-index media, non-sequential scattering/ghost tracing, polarization, coatings/Fresnel throughput, diffraction PSF/MTF, thermal/pressure compensation, manufacturing tolerancing, or native ZMX/ZOS import/export. Its layouts are optical visualizations, not a mechanical CAD solid model. Extremely pathological high-order aspheres can defeat the finite bracketing/intersection strategy; the implementation does not claim globally certified intersections or optimization.

Validate real engineering designs independently. Published analytic benchmarks demonstrate specific properties of this implementation, not commercial-product equivalence or certification.

## License and provenance

Original source: MIT, see [LICENSE](LICENSE). Manufacturer glass coefficients are attributed in [NUMERICS.md](docs/NUMERICS.md). No proprietary program code, manufacturer catalogs/PDF files, branded UI assets, bundled font files, or third-party runtime libraries are redistributed. Aether Optics is not affiliated with Ansys, Zemax, or SCHOTT.


## GitHub Pages

The `.github/workflows/pages.yml` workflow runs the numerical/application tests, builds the self-contained application, and publishes `dist/` to GitHub Pages. Pull requests run the same tests and build without publishing. Deployment uses the `github-pages` environment and repository-scoped permissions.

The Pages publishing source must be enabled for this repository under **Settings → Pages → Build and deployment → Source → GitHub Actions**. No third-party hosting account, API key, or runtime dependency is required.
