/**
 * Polyfill for Promise.withResolvers
 * Required by matrix-js-sdk >= 44.0.0 on Node.js < 22 runtimes.
 */
if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function () {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
