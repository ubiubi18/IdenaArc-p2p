export const REHEARSAL_NETWORK_NODE_COUNT = 9
export const REHEARSAL_NETWORK_LEAD_SECONDS = 8 * 60
export const REHEARSAL_NETWORK_ONE_DAY_LEAD_SECONDS = 24 * 60 * 60
export const REHEARSAL_NETWORK_SEED_FLIP_COUNT = 27

export function buildRehearsalNetworkPayload({
  connectApp = false,
  delayFirstSessionOneDay = false,
} = {}) {
  const delayed = delayFirstSessionOneDay === true

  return {
    nodeCount: REHEARSAL_NETWORK_NODE_COUNT,
    firstCeremonyLeadSeconds: delayed
      ? REHEARSAL_NETWORK_ONE_DAY_LEAD_SECONDS
      : REHEARSAL_NETWORK_LEAD_SECONDS,
    delayFirstSessionOneDay: delayed,
    seedFlipCount: REHEARSAL_NETWORK_SEED_FLIP_COUNT,
    connectApp,
    connectCountdownSeconds: null,
  }
}
