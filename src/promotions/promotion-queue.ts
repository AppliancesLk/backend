// Applications sharing a database can isolate their workers (e.g. mocked SMTP tests).
export function promotionQueueKey() {
  return process.env.PROMOTION_QUEUE_KEY?.trim().slice(0, 80) || 'live';
}
