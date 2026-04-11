/**
 * Test fixture: Memory Skill
 * Reads and writes via ctx.readMemory / ctx.writeMemory.
 */
module.exports.execute = async function (input, ctx) {
  // Write to memory
  await ctx.writeMemory("updateMasteryState", {
    studentId: ctx.context.studentId,
    knowledgePointId: input.knowledgePointId,
    transition: "CORRECTED",
  });

  // Read from memory
  var state = await ctx.readMemory("getMasteryState", {
    studentId: ctx.context.studentId,
    knowledgePointId: input.knowledgePointId,
  });

  return { wrote: true, state: state };
};
