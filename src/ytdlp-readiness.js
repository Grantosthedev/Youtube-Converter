function nextEngineReadinessError(previousError, updateResult) {
  if (updateResult?.success) return null;
  if (!previousError) return null;
  return updateResult?.error || previousError;
}

module.exports = { nextEngineReadinessError };
