/**
 * Test fixture: AI Call Skill
 * Calls ctx.callAI and returns the result.
 */
module.exports.execute = async function (input, ctx) {
  var result = await ctx.callAI("GRADE_ANSWER", { question: input.question });
  return result;
};
