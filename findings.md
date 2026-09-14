# Memory findings with Electron 44.3.0

Both LVCE and the basic app now run **Electron 44.3.0**, from the same verified
archive. In the unmodified control, LVCE's v0.114.2 application resources remain unchanged; its bundled
Electron 43.1.0 runtime is replaced only inside the benchmark installation.
The report labels this as a runtime override rather than an unmodified official build.

The matched CI result is **589.7 MiB PSS for LVCE versus 294.9 MiB for basic Electron**,
a **294.8 MiB gap**. Both apps passed all three fresh launch/edit/save trials.
[Raw matched evidence](data/matched.json) ·
[Successful experiment run](https://github.com/levivilet/memory-investigations/actions/runs/34815358324).

## Production-patch experiments

The extracted v0.114.2 application is patched here; production repositories are unchanged.
Every candidate and its unmodified control use Electron 44.3.0, with three fresh trials
per application per block on the same runner.

| Patch | Control PSS MiB | Patched PSS MiB | Change |
| --- | ---: | ---: | ---: |
| Shared service in main | 585.1 | 565.0 | -20.0 |
| Shared + filesystem in main | 588.0 | 536.5 | -51.5 |
| Lazy renderer chunks | 591.0 | 509.1 | -81.9 |
| Repository-aware Git | 588.0 | 554.7 | -33.3 |
| Rollup + Terser, no source maps | 588.8 | 585.0 | -3.8 |
| Combined | 587.6 | 437.5 | -150.1 |

The combined variant saves **150.1 MiB PSS (25.5%)**, reaching **437.5 MiB** versus
**294.8 MiB** for its own matched basic app: a remaining **142.7 MiB gap**. Its basic
control drifts upward by 1.1 MiB, while the other jobs’ basic controls drift downward
by 0.7–1.5 MiB. These are three-run observations, not fixed per-process costs.

Separate diagnostics confirm that shared+filesystem consolidation removes two utility
processes; renderer consolidation replaces 17 native worker targets with 17 loaded
chunks. The Git guard leaves 15 workers and no Git Node service for a plain file.
Combined, only the file-watcher Node service remains alongside Chromium’s processes:
**7 processes, 0 native workers, 15 loaded chunks**. In a Git repository, the Git service
and two Git chunks return. Every scenario passes exact edit/save and clipboard-based
selection/restoration checks.

An activation-events-only guard did **not** reduce memory (589.4 → 591.1 MiB), because
source-control provider discovery independently launched Git to ask whether it was active.
The working guard covers both paths; the failed approach is retained in
[activation-only.json](data/activation-only.json). The guard rechecks on activation
requests but does not itself watch for external repository creation.

Rollup/Terser reduces JavaScript from **44.0 to 25.7 MiB across 1,431 files**
(**41.5% smaller**) with no source maps, while PSS falls only **3.8 MiB** in its
paired run. The unchanged basic app rises 0.7 MiB. This is a small resident-memory
effect with overlapping run-median ranges (584.5–591.8 before, 583.5–588.0 after),
so three trials do not establish a reliable small saving. Disk savings do not translate
one-for-one into RAM savings. Names are retained, properties are not mangled, and
the already bundled main entry is processed by Rollup with external imports preserved.
Terser’s parser required module-aware handling of top-level await and a semantically
equivalent expansion of a namespace-default re-export. Tests cover both cases.

The minification job passed its benchmarks and architecture checks on the first
final attempt, but GitHub timed out while uploading its artifact. Only that job was
rerun at the same commit; its replacement includes a fresh paired control. Other
experiments retain their first-attempt artifacts from the same workflow run.

The adapters retain existing RPC work and separate module state, while moving execution
onto an existing event loop. Renderer chunks require explicit file-allowlist entries,
worker-global/font adapters and same-origin fetch permission in document CSP. They load
on demand, but current startup still requests the services shown above. The prototype
retains original files on disk; the extra generated copies do not imply extra loaded
modules. This is evidence for architectural overhead, not a production-ready design.

The remaining combined footprint includes roughly 118.5 MiB in main, 135.9 MiB in the
renderer and 45.8 MiB in the file-watcher service, plus Chromium platform processes.
These independently calculated role medians may not sum exactly. Main and renderer
keep useful application data after consolidation; removing a process does not eliminate
all its work or memory. The HTML report shows the residual against the matched basic app.

The positive Git trials validate activation rather than project memory: the temporary
workspace also contains untracked isolated profile files. All paired plain-file blocks
retain the same layout. Separating profile and fixture directories, real projects, heavy
editing, lifecycle/restart, multi-window behavior and supported platforms remain follow-up
work before shipping these architectural changes.

[CI evidence](https://github.com/levivilet/memory-investigations/actions/runs/34830522631),
benchmark commit `85feafbaebec51ede06540f2d2f3d4e1c4e0398e`.

## Where the memory goes

- Four Node utility services: **166.6 MiB PSS** in LVCE.
- Renderer including 17 dedicated workers: **200.6 MiB**, versus **59.0 MiB** in
  basic Electron; **141.6 MiB extra**.
- Main process: **92.7 MiB**, versus **85.2 MiB** in basic Electron.

Role medians are independent and need not sum exactly to the whole-app median.
Shared pages are redistributed across processes. Current process PSS is not the
same as the memory a future consolidation would save: useful data and work must
move somewhere.

The separate diagnostic identifies shared-process, File System Process, File Watcher
Process and the built-in Git extension's Node process. It confirms Electron 44.3.0
and captures all 17 worker heaps, including two Git workers. Workers are threads
inside the renderer, not additional OS processes.
[Diagnostic evidence](data/diagnostic-ci.json).

## Repeated, same-host interventions

| Intervention | Control PSS MiB | Changed PSS MiB | Change |
| --- | ---: | ---: | ---: |
| Disable built-in Git | 583.8 | 550.5 | −33.3 |
| Add 20 empty workers to basic Electron | 295.0 | 344.1 | +49.0 |
| Minify LVCE JavaScript | 588.2 | 590.4 | +2.2 |

Each intervention has three control trials and three changed trials per app on its
own runner. All edit/save probes passed. The same untouched basic app changes by
−2.0 MiB in the Git job and +1.0 MiB in the minification job, illustrating background
and cache drift. Control blocks precede intervention blocks; ranges are not confidence
intervals, and the experiments are not fully randomized crossover trials.

Git disablement removes one process and two workers, leaving 9 processes and 15 workers.
It is a diagnostic ablation that removes functionality, not a production fix.
Twenty empty workers leave the basic app at six processes, showing that worker
runtimes consume memory without increasing OS process count. Their cost cannot be
multiplied by the number of real LVCE workers to predict exact consolidation savings.

Minification reduces JavaScript disk size from **44.0 to 27.4 MiB (37.8%)** but does
not demonstrate a meaningful resident-memory improvement. It preserves module
boundaries and function/class names, with no lazy import changes or rebundling.

## Heap interpretation

Extension management reports **14.7 MiB used before GC and 0.7 MiB after GC** in the
instrumented run. All 17 workers together report about **11.8 MiB JS heap after GC**.
Large allocated heaps are not proof of large retained object graphs or a leak.
Debugger attachment and forced GC change memory, so diagnostic totals are excluded
from normal benchmark comparisons. CDP heap values are bytes; Electron main heap
statistics are KiB.

Native V8/Blink state, stacks, compiled code, buffers, graphics, spare heap capacity
and allocator retention also contribute to renderer memory. Worker heaps are already
contained in renderer PSS and must not be added again. Native allocation traces,
retaining paths and repeated lifecycle measurements remain follow-up work.

## What to improve next

1. Harden the measured Git guard across activation events and provider discovery.
   Preserve init, nested repository detection, status updates and decorations; detect
   external repository creation and workspace transitions.
2. Turn the renderer-chunk experiment into selective consolidation of lightweight UI
   services, retaining isolation for heavy work. Measure typing latency, contention,
   startup, optional extensions and cleanup alongside memory.
3. Evaluate filesystem/watcher service consolidation with cancellation, backpressure,
   crash recovery, large-tree and multi-window coverage. Avoid synchronous work in main.
4. Investigate extension metadata cloning and temporary startup allocation using
   allocation traces and retaining paths. Do not treat a pre-GC heap as a leak finding.
5. Test lazy imports and bundle splitting independently of minification.

These measurements do not yet establish a below-Zed build. Disabling Git still leaves
LVCE at roughly 551 MiB PSS. The new production-patch section measures a combined
variant directly because independent interventions overlap; their deltas cannot be added.

## Historical evidence and comparability

The [original Electron 43.1 investigation](history/electron-43.1.0.md) is retained,
as is its [matched baseline JSON](data/electron43-matched.json). The initial
cross-editor dataset remains frozen as [published-benchmark.json](data/published-benchmark.json),
with its original Electron 40 basic-app result and September 13 capture date.
Historical numbers have not been relabeled as Electron 44.3.0 measurements.

Differences between the 43.1 and 44.3 investigation runs are **not an isolated runtime
regression experiment**: they use different runners and times. Within each new
comparison, both apps have the same runtime and host. Tests use a 2,600-byte text
file, Xvfb, software rendering and no swap. Real GPUs, projects, language servers,
multiple windows and long sessions need additional workloads.

The historical 316.8 MiB PSS and 133 MiB passing cgroup cap describe different
accounting systems. They are neither universal minimum host RAM requirements nor
architectural lower bounds. The report explains shared-page apportionment, cgroup
first charging and why summed RSS can overstate physical memory usage.

Primary references: [Linux /proc](https://www.kernel.org/doc/html/latest/filesystems/proc.html),
[cgroup v2](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html),
[Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model),
[Electron 44.3.0 release](https://github.com/electron/electron/releases/tag/v44.3.0).
