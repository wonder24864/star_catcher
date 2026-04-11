/**
 * Test fixture: Error Skill
 * Throws an error during execution.
 */
module.exports.execute = async function (_input, _ctx) {
  throw new Error("Skill execution failed intentionally");
};
