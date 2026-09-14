// Recheck on activation requests: do not cache a negative result after git init.
export const memoryHasGitRepository = async (getWorkspaceUri, exists) => {
  const uri = await getWorkspaceUri()
  if (!uri.startsWith('file://')) return false
  let current = new URL(uri)
  if (!current.pathname.endsWith('/')) current.pathname += '/'
  for (;;) {
    // Both .git directories and worktree/submodule .git files indicate a repository.
    if (await exists(new URL('.git', current).href)) return true
    const parent = new URL('..', current)
    if (parent.pathname === current.pathname) return false
    current = parent
  }
}
