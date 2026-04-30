import {
  isValidationCountdownNoticeWindow,
  VALIDATION_COUNTDOWN_NOTICE_LEAD_MS,
} from './validation-notice'
import {shouldShowUpcomingValidationNotification} from './utils'
import {EpochPeriod} from '../types'

describe('validation countdown notices', () => {
  it('recognizes only the final five minutes of FlipLottery as the notice window', () => {
    expect(
      isValidationCountdownNoticeWindow({
        currentPeriod: EpochPeriod.FlipLottery,
        msUntilValidation: VALIDATION_COUNTDOWN_NOTICE_LEAD_MS,
      })
    ).toBe(true)

    expect(
      isValidationCountdownNoticeWindow({
        currentPeriod: EpochPeriod.FlipLottery,
        msUntilValidation: VALIDATION_COUNTDOWN_NOTICE_LEAD_MS + 1,
      })
    ).toBe(false)

    expect(
      isValidationCountdownNoticeWindow({
        currentPeriod: EpochPeriod.ShortSession,
        msUntilValidation: 60 * 1000,
      })
    ).toBe(false)
  })

  it('suppresses the desktop validation notification until the notice window', () => {
    const nextValidation = '2026-04-30T12:05:00.000Z'

    expect(
      shouldShowUpcomingValidationNotification(
        {
          currentPeriod: EpochPeriod.FlipLottery,
          epoch: 10,
          nextValidation,
        },
        0,
        {now: new Date('2026-04-30T11:59:59.999Z').getTime()}
      )
    ).toBe(false)

    expect(
      shouldShowUpcomingValidationNotification(
        {
          currentPeriod: EpochPeriod.FlipLottery,
          epoch: 10,
          nextValidation,
        },
        0,
        {now: new Date('2026-04-30T12:00:00.000Z').getTime()}
      )
    ).toBe(true)
  })
})
