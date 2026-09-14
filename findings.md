# Memory findings with Electron 44.3.0

Both LVCE and the basic app now run **Electron 44.3.0**, from the same verified
archive. LVCE's v0.114.2 application resources remain unchanged; its bundled
Electron 43.1.0 runtime is replaced only inside the benchmark installation.
The report labels this as a runtime override rather than an unmodified official build.

The matched CI result is **589.7 MiB PSS for LVCE versus 294.9 MiB for basic Electron**,
a **294.8 MiB gap**. Both apps passed all three fresh launch/edit/save trials.
[Raw matched evidence](data/matched.json) ·
[Successful experiment run](https://github.com/levivilet/memory-investigations/actions/runs/34815358324).

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

1. Test selective Git activation after cheap repository detection or an explicit
   command. Preserve init, nested repository detection, status updates and decorations.
2. Prototype consolidating lightweight UI workers, while retaining isolation for
   heavy work. Measure typing latency, contention, startup and cleanup alongside memory.
3. Evaluate filesystem/watcher service consolidation with cancellation, backpressure,
   crash recovery, large-tree and multi-window coverage. Avoid synchronous work in main.
4. Investigate extension metadata cloning and temporary startup allocation using
   allocation traces and retaining paths. Do not treat a pre-GC heap as a leak finding.
5. Test lazy imports and bundle splitting independently of minification.

These measurements do not yet establish a below-Zed build. Disabling Git still leaves
LVCE at roughly 551 MiB PSS. Independent interventions overlap and their savings
cannot safely be added without a combined experiment.

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
