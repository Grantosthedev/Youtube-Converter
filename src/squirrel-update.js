function isBenignSquirrelUpdateError(message) {
  if (!message) return false;
  return /command is disabled|cannot be executed/i.test(message);
}

module.exports = {
  isBenignSquirrelUpdateError,
};
