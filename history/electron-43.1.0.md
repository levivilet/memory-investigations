> Historical investigation using Electron 43.1.0. See [current findings](../findings.md) for Electron 44.3.0.

# Why LVCE exceeds basic Electron in the plain-file benchmark

The headline result is **582.9 MiB PSS for LVCE versus 295.6 MiB for basic Electron**
on the same CI runner and the exact same Electron 43.1.0 runtime: a **287.3 MiB gap**.
Both applications passed all three trials. [Raw matched trials](https://github.com/levivilet/memory-investigations/blob/1fd14ab8641651807a73eba7c04834511c0580c9/data/matched.json).

## What explains the difference

| Process role | LVCE PSS MiB | Basic PSS MiB |
| --- | ---: | ---: |
| Four Node utility services | 173.8 | 0 |
| Renderer, including web workers | 187.4 | 57.7 |
| Main process | 88.4 | 84.4 |
| GPU process | 87.4 | 92.7 |
| Network service | 23.3 | 29.1 |
| Zygotes | 22.1 | 30.8 |

Independent role medians do not sum exactly to whole-app medians. Additional processes
change shared-page apportionment, so a removed process's full PSS is not a guaranteed
saving. The large positive terms are Node services and the renderer, not main-process
JavaScript. RSS exaggerates the gap by counting shared mappings repeatedly.

A separate diagnostic identifies the four Node utilities as **shared-process,
File System Process, File Watcher Process and Extension builtin.git: Git**. The
renderer starts **17 dedicated workers**, including two Git workers. These are
threads/isolates inside the renderer, not 17 extra OS processes. The app turns the
single-file CLI argument into a URL that also specifies its parent as a workspace.
Consequently, a plain-file workload still activates workspace/Git infrastructure.
[Named process/worker probe](https://github.com/levivilet/memory-investigations/blob/1fd14ab8641651807a73eba7c04834511c0580c9/data/diagnostic-ci.json).

## Hypotheses and interventions

1. **Service activation:** if Git startup contributes memory, disabling the packaged
   Git extension should remove its Node runtime and worker targets. Observed: LVCE
   falls from **582.6 to 536.9 MiB PSS**, processes **10 → 9**, workers **17 → 15**.
   This passes all edit/save checks. Basic control drifts downward **3.1 MiB**, so
   the raw **45.7 MiB** reduction should be interpreted with that uncertainty.
   Proposed product direction: cheap repository detection and selective activation,
   preserving Git commands, status, initialization and decorations. This experiment
   removes functionality and is not itself a shipping patch.
2. **Worker fixed cost:** if isolates/threads matter beyond loaded application code,
   adding empty workers to basic Electron should increase renderer memory without
   increasing process count. Observed: **20 workers add 38.6 MiB PSS**, with **6
   processes unchanged**. Real-worker consolidation needs its own functional and
   latency tests; multiplying this cost by 17 is not an exact savings prediction.
3. **Unminified source:** if whitespace/identifiers dominate the excess, minifying
   the shipped app should significantly reduce memory. Observed: source shrinks
   **44.0 → 27.4 MiB (37.8%)**, but LVCE changes **+2.2 MiB PSS** while its unchanged
   basic control changes **+2.0 MiB**. No meaningful RAM improvement is established.
   We used esbuild 0.25.10 with names retained, preserved module boundaries, no
   rebundling, no dependency removal and no code splitting. This does not rule out
   savings from different lazy-loading or build strategies.
4. **Electron version:** the published benchmark compared LVCE's Electron **43.1.0**
   with basic Electron **40.0.0**. Matching the runtime leaves a large gap and makes
   the basic app smaller in these measurements. Version differences cannot explain
   the application's extra footprint. The old-vs-new runtime delta is cross-run and
   is not an isolated runtime benchmark.
5. **Large live JS heap / too much code:** the release has 1,431 JS files totaling
   about 44 MiB, but its main-process bundle is only about 226 KiB. Largest optional
   dependencies on disk are not evidence of loaded/retained code. Worker heap
   diagnostics find considerably less retained JS than renderer PSS would imply.

Each intervention has three fresh unmodified controls and three changed trials per
app on its own runner. All results are from
[Actions run 34813990112](https://github.com/levivilet/memory-investigations/actions/runs/34813990112).
Controls precede interventions; trial order is shuffled within blocks. Cache and
host drift remain limitations, and ranges are not confidence intervals.

## What worker heap numbers do and do not prove

The first diagnostic showed roughly 12 MiB used in extension management. This was
allocated heap, not proof of live retained objects. A later separate diagnostic
showed **5.1 → 0.9 MiB** after forced collection, with all 17 worker heaps totaling
about **11.8 MiB after GC**. There is substantial temporary allocation and spare
capacity; no leak is established by these captures.

The renderer also contains native V8/Blink structures, thread stacks, code, backing
storage, caches, graphics resources and allocator retention. JS heap is a subset of
renderer memory, not a separate amount to add. Debugger attachment changes memory,
and its sample timing differs; these probes are deliberately excluded from baseline
comparisons. Electron main heap statistics use KiB; CDP heap statistics use bytes.
[GC diagnostic](https://github.com/levivilet/memory-investigations/blob/1fd14ab8641651807a73eba7c04834511c0580c9/data/diagnostic-gc.json).

## What to improve first

1. Avoid activating the whole Git runtime for a non-repository plain file. Validate
   repository discovery, nesting, init, status/decoration updates and explicit commands.
2. Prototype consolidating lightweight UI workers, while retaining heavy editor work
   isolation. Measure typing latency, startup, contention and lifecycle correctness.
3. Experiment with filesystem/watcher service consolidation. Do not block Electron
   main with synchronous filesystem work. Test backpressure, crash recovery,
   cancellation, huge trees and multiple windows. Useful state must move somewhere;
   deleting a process does not save its entire present PSS.
4. Investigate extension metadata caching/cloning and startup allocation bursts using
   allocation profiles and retaining paths; large pre-GC heaps alone are insufficient.
5. Treat minification as a packaging/startup experiment with measured benefits, not a
   presumed hundred-megabyte memory fix. Test lazy imports and code splitting separately.
6. Trace native allocations and repeated worker/view/workspace lifecycle operations.
   Explain the remaining renderer footprint before claiming an exact byte-level model.

The Git ablation still leaves LVCE around **537 MiB**, above the published Zed result
of **374.7 MiB**. This investigation does not achieve or guarantee a below-Zed build.
It establishes specific measurable targets for follow-up product changes. Savings
from overlapping interventions must not be summed without a combined test.

## Accounting and benchmark scope

The old basic-app **316.8 MiB** is uncapped idle PSS. Its **133 MiB** result is the
lowest tested cgroup cap surviving a specific no-swap launch/edit/save protocol.
These are different accounting systems and are not universal minimum host RAM or
an architectural lower bound. File pages may be charged outside the app group after
archive extraction while still contributing to process PSS. Shared pages are charged
once by cgroups but apportioned by PSS. MiB = 1,048,576 bytes.

The historical published capture is dated September 13, 2026; it differs from the
provided screenshot. It uses different runners for different editors. These new
paired interventions compare apps on the same runner, but their results still only
cover a 2,600-byte text file, Xvfb and software rendering. Real GPUs, large projects,
language servers, multiple windows, startup peaks and long sessions need additional
workloads. No physical GPU VRAM or X server/desktop memory is included.

Primary references: [Linux /proc](https://www.kernel.org/doc/html/latest/filesystems/proc.html),
[cgroup v2](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html),
[Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model),
[app.getAppMetrics](https://www.electronjs.org/docs/latest/api/app#appgetappmetrics),
[pinned LVCE build helper](https://github.com/lvce-editor/lvce-editor/blob/v0.114.2/packages/build/src/parts/BundleJs/BundleJs.ts).
