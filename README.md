# Memory investigations

[Read the report](https://levivilet.github.io/memory-investigations/) ·
[Run memory experiments](https://github.com/levivilet/memory-investigations/actions/workflows/investigate.yml)

This repository investigates why LVCE v0.114.2 uses more idle memory than a basic
Electron editor and what could reduce the difference. It contains measured process
attribution, worker heap diagnostics, paired minification/Git/empty-worker experiments,
raw JSON, source inventory, and a generated interactive HTML report.
[Read the written findings](findings.md) for a concise evidence trail and recommendations.

The initial benchmark is a frozen September 13, 2026 capture, not the screenshot's
older capture. LVCE bundles Electron 43.1.0; the original basic app uses 40.0.0.
New runs use a checksum-pinned Electron 44.3.0 runtime for both LVCE and the basic
editor, preserving LVCE v0.114.2 application bytes. The bundled version in the stock
application config remains 43.1.0; the runtime override and its checksum are recorded
separately. The current report uses fresh 44.3.0 evidence; [43.1 findings](history/electron-43.1.0.md)
and `data/electron43-matched.json` retain the historical comparison.

## Build the report

Node >=24, Python >=3.11 for benchmarks. The report itself needs no runtime packages
or third-party CDN. esbuild is only used to prepare the minification experiment.

```sh
nice npm ci
npm test
npm run build
python3 -m http.server 8080 --directory .tmp/pages
```

`site/index.html` contains the prose; `scripts/report-summaries.js` derives numerical
prose from the same evidence as the tables; `scripts/build-report.js` recomputes all tables
from `data/*.json`, creates a SHA-256 manifest, and copies the evidence into Pages.
`site/app.js` enhances the pre-rendered tables with dataset and metric selectors.
The static report remains readable with JavaScript disabled.

## Run experiments

Prefer the **Memory investigation** workflow on a dedicated Ubuntu 24.04 runner.
It runs matched-runtime, minified, 20 empty workers, and Git-disabled jobs. Each job
runs one app at a time. For interventions it first runs unmodified controls on the
same machine; order within each block is shuffled once with seed 1729. Each app has
three fresh launches, ten idle samples and exact file edit/save/restore checks.
The sequential control/intervention blocks are a limitation: this is not a fully
randomized crossover trial. All raw outcomes remain available as Actions artifacts.

To run locally on a dedicated Linux system with cgroup v2 and systemd >=250:

```sh
sudo apt-get update
sudo apt-get install -y python3 curl xz-utils xvfb xauth xdotool xclip openbox \
  imagemagick mesa-utils mesa-vulkan-drivers libvulkan1 libasound2t64 \
  libgtk-3-0 libnss3 libgbm1 libxss1 libxtst6
nice npm ci
python3 vendor/benchmark/scripts/install.py --editors lvce
node scripts/prepare-experiment.js matched
bash vendor/benchmark/scripts/run.sh --editors lvce,basic-electron \
  --repeats 3 --budgets '' --refinement-iterations 0 \
  --output "$PWD/results/minified-control.json"
node scripts/prepare-experiment.js minified
bash vendor/benchmark/scripts/run.sh --editors lvce,basic-electron \
  --repeats 3 --budgets '' --refinement-iterations 0 \
  --output "$PWD/results/minified.json"
```

Replace `minified` with `workers` or `no-git` for the other interventions. Before
starting another experiment, restore the official LVCE resources by rerunning
`install.py --editors lvce`, then prepare `matched` and measure new controls.
Do not reuse a minified/disabled/diagnostically patched LVCE as the control.
The installer replaces the entire LVCE runtime with checksum-verified Electron 44.3.0,
preserving only its application resources. The preparation script copies that runtime
into an isolated basic-app directory and requires matching version/hash pins.
**Install `lvce` before preparing matched experiments**.
Download checksums, LVCE application config, per-file transformation hashes and source
inventory allow auditing the exact versions. No product repository is modified.

The observer requires sudo; applications run as the invoking non-root account.
Both XDG application state and Chromium user data are isolated, HOME is unchanged,
and Xvfb protects the real desktop. Services are stopped in a finally path. Artifacts
are outside the disposable profile. Never run the benchmark in a shared CI job with
other applications or mix results from different runs into a claimed paired effect.

## Diagnostics, separate from comparisons

```sh
python3 vendor/benchmark/scripts/install.py --editors lvce
node scripts/enable-diagnostics.js
bash vendor/benchmark/scripts/run.sh --editors lvce --repeats 1 --budgets '' \
  --refinement-iterations 0 --sample-seconds 15 \
  --output "$PWD/results/diagnostic-gc.json"
```

Instrumentation uses `app.getAppMetrics()` for named Node services and attaches the
Electron debugger recursively to worker targets. `Runtime.getHeapUsage` returns
bytes; Electron `process.getHeapStatistics()` returns KiB. Forced GC is diagnostic
only. Heap snapshots, native allocation tracing, long-term leak and multi-window
measurements remain follow-up work. A one-run probe cannot establish a memory budget.

`node scripts/inventory.js` inventories the freshly extracted release. Run it before
injecting diagnostics or minifying. `data/source-inventory.json` records unmodified
release bytes; raw benchmark JSON records host/runtime/protocol/run URL.

## Import CI evidence and deploy

Download all artifacts from one successful investigation run:

```sh
gh run download RUN_ID --repo levivilet/memory-investigations --dir .tmp/new-run
node scripts/import-results.js .tmp/new-run
npm test
npm run build
```

Review and commit the data and any resulting prose changes. Pages deploys on changes
to the report, data or analysis; new benchmark artifacts do not silently replace
published evidence. Benchmark and Pages workflows can also be manually dispatched.
The report was checked in a real browser, including metric/dataset
controls and a narrow viewport. CI checks calculation behavior and report generation.

The user-facing original hypothesis has an executable regression gate:

```sh
node scripts/check-budget.js data/matched.json 0
```

This fails while LVCE exceeds the matched basic app. A nonzero final argument sets
an allowed overhead in MiB. It refuses incomplete/failed baselines. No unachieved
memory target is represented as a passing product test.

## Interpretation

- PSS: private memory plus each process's proportional share of shared resident pages.
- USS: private resident memory. Summed RSS can count shared pages repeatedly.
- Cgroup current: charged memory, including file cache and kernel allocations.
- A passing cgroup cap is not a minimum host RAM requirement or a PSS lower bound.
- Role medians need not add exactly to the median of whole-application totals.
- Worker heaps are contained in renderer PSS and must not be added on top.
- Disabling Git removes functionality. Empty-worker costs do not predict the exact
  savings of consolidating real workers. Smaller code does not guarantee smaller RAM.
- All comparisons use one 2,600-byte plain-text file, Xvfb and software rendering;
  workload, GPU, runtime, host and cache differences can change the results.

See the report for prioritized recommendations and the exact remaining uncertainties.
Vendored benchmark code is MIT licensed; its original license and commit are preserved
in `vendor/benchmark/`. This repository's original code is also MIT licensed.

## Production monkeypatch experiments

The current Actions matrix extracts the pinned **production v0.114.2 Debian package** for each job, replaces its runtime with checksum-pinned **Electron 44.3.0**, and prepares a minimal application in a copy of that exact runtime. No production repository is changed. The installer clears the extracted installation before unpacking, so generated chunks from an earlier experiment cannot contaminate a later control.

Each job runs three unmodified trials per app, applies one patch, and runs three changed trials per app. A separate debugger/GC run checks the intended service/worker topology. `lazy-git` and `combined` also open a fresh Git repository and assert that Git activates. All profiles and application processes are isolated and disposed by the existing harness.

```sh
nice npm ci
python3 vendor/benchmark/scripts/install.py --editors lvce
node scripts/prepare-experiment.js matched
bash vendor/benchmark/scripts/run.sh --editors lvce,basic-electron --repeats 3 --budgets '' --refinement-iterations 0 --output "$PWD/results/renderer-chunks-control.json"
node scripts/patch-app.js renderer-chunks
bash vendor/benchmark/scripts/run.sh --editors lvce,basic-electron --repeats 3 --budgets '' --refinement-iterations 0 --output "$PWD/results/renderer-chunks.json"
node scripts/enable-diagnostics.js
bash vendor/benchmark/scripts/run.sh --editors lvce --repeats 1 --budgets '' --refinement-iterations 0 --sample-seconds 15 --output "$PWD/results/renderer-chunks-diagnostic.json"
node scripts/check-architecture.js renderer-chunks results/renderer-chunks-diagnostic.json
```

Repeat from installation for a different mode. Available modes:

| Mode | Intervention |
| --- | --- |
| `shared-in-main` | Original shared service in Electron main through MessageChannelMain |
| `services-in-main` | Shared and filesystem services in Electron main |
| `renderer-chunks` | Core workers and built-in Git workers as on-demand renderer modules |
| `lazy-git` | Automatic Git activation guarded by local repository detection; explicit commands remain available |
| `rollup-terser` | Rollup main entry + Terser across shipped JS; no source maps |
| `combined` | Services in main, Git guard, then renderer chunks |

These are experimental adapters, not patches ready to ship. Renderer consolidation changes event-loop contention, globals and isolation/CSP. Process consolidation needs further lifecycle and blocking-work tests. The Git guard rechecks on activation requests but does not itself watch for external repository creation. The positive Git scenario validates startup activation and edit/save, not all Git features. See the report for measured effects and remaining acceptance work.

Patch receipts record application/runtime archive hashes and changed-file hashes. `scripts/import-patch-results.js <downloaded-artifacts-directory>` validates the entire paired CI set and architecture diagnostics before copying JSON into `data/`. It rejects mixed commits/runs, incomplete trials and patches that leave the supposedly removed runtimes active. `npm run build` generates the HTML tables from those JSON files; failed prototypes never become zero-memory rows. Historical esbuild/empty-worker/Git-disabled results remain available separately.
