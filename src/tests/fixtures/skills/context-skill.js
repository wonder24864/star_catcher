/**
 * Test fixture: Context Skill
 * Returns the execution context and config to verify they are passed correctly.
 */
module.exports.execute = async function (input, ctx) {
  return {
    receivedInput: input,
    studentId: ctx.context.studentId,
    locale: ctx.context.locale,
    traceId: ctx.context.traceId,
    config: JSON.parse(JSON.stringify(ctx.config)),
  };
};
