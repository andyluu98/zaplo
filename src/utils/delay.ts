/**
 * Resolve after `ms` milliseconds. Shared so timing waits read the same everywhere.
 *
 * Executor form (not Promise.withResolvers) because the electron tsconfig targets
 * ES2020, whose lib has no Promise.withResolvers — the toolchain requires it here.
 */
export function delay(ms: number): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}
