Vendored from https://github.com/levivilet/lvce-memory-benchmark at
03c3570986eb4c6574d36283361557e50920b902 (MIT; LICENSE retained).
Local changes: process command line / parent / thread metadata and anonymous/file/shared
PSS; preserve real HOME while isolating XDG state; matched-runtime baseline; optional
post-measurement CDP diagnostics. Only scripts used by the investigation are retained.

Electron update: the installer preserves LVCE application resources while replacing
the complete runtime using the checksum-pinned override in editors.lock.json.
It verifies the installed runtime version; basic-app preparation requires matching pins.

Production-patch follow-up: the installer now clears an extracted app before unpacking, preventing generated patch files from leaking into subsequent controls. The observer accepts `--workspace-kind git` for a small committed Git fixture; the default plain-file workload is unchanged. The fixture is created before timing and remains inside the isolated profile directory.
