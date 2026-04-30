import {EpochPeriod} from '../types'

export const VALIDATION_COUNTDOWN_NOTICE_LEAD_MS = 5 * 60 * 1000

export function getMsUntilValidation(nextValidation, now = Date.now()) {
  if (!nextValidation) {
    return null
  }

  const validationStartMs = new Date(nextValidation).getTime()

  if (!Number.isFinite(validationStartMs)) {
    return null
  }

  return Math.max(0, validationStartMs - now)
}

export function isValidationCountdownNoticeWindow({
  currentPeriod,
  nextValidation = null,
  msUntilValidation = null,
  now = Date.now(),
  leadMs = VALIDATION_COUNTDOWN_NOTICE_LEAD_MS,
} = {}) {
  if (currentPeriod !== EpochPeriod.FlipLottery) {
    return false
  }

  const remainingMs = Number.isFinite(msUntilValidation)
    ? msUntilValidation
    : getMsUntilValidation(nextValidation, now)

  return (
    Number.isFinite(remainingMs) && remainingMs >= 0 && remainingMs <= leadMs
  )
}
