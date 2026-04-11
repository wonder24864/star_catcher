/**
 * Test fixture: Slow Skill
 * Hangs forever — used to test timeout enforcement.
 */
module.exports.execute = async function (_input, _ctx) {
  // Infinite loop — main thread must terminate via timeout
  while (true) {
    // Yield to event loop so the worker doesn't become unresponsive
    // (allows the termination signal to be processed)
    await new Promise(function () {});
  }
};
