const ACTIONABLE_UPDATE_STATES = new Set(['available', 'downloaded']);

function selectAppUpdateState(current, incoming) {
  if (!incoming?.status) return current;
  if (current?.status === 'downloaded' && incoming.status !== 'downloaded') return current;
  if (
    current?.status === 'available'
    && !ACTIONABLE_UPDATE_STATES.has(incoming.status)
  ) {
    return current;
  }
  return incoming;
}

module.exports = {
  selectAppUpdateState,
};
