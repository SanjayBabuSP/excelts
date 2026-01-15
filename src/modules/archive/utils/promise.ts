export function suppressUnhandledRejection(promise: Promise<unknown>): void {
  promise.catch(() => {});
}
