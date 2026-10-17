import { RepairStatus } from '../enums/repair-status.enum';
import { BadRequestException } from '@nestjs/common';

/**
 * Defines valid repair status transitions for repairers
 * Each status maps to an array of valid next statuses
 */
const REPAIRER_VALID_TRANSITIONS: Record<RepairStatus, RepairStatus[]> = {
  [RepairStatus.PENDING]: [],
  [RepairStatus.APPROVED]: [RepairStatus.IN_PROGRESS],
  [RepairStatus.REJECTED]: [],
  [RepairStatus.ASSIGNED]: [RepairStatus.IN_PROGRESS],
  [RepairStatus.IN_PROGRESS]: [
    RepairStatus.AWAITING_PARTS,
    RepairStatus.READY_FOR_COLLECTION,
  ],
  [RepairStatus.AWAITING_PARTS]: [RepairStatus.IN_PROGRESS],
  [RepairStatus.READY_FOR_COLLECTION]: [RepairStatus.COMPLETED],
  [RepairStatus.COMPLETED]: [],
  [RepairStatus.CANCELLED]: [],
};

/**
 * Validates if a status transition is allowed for a repairer
 * @param currentStatus - The current repair status
 * @param newStatus - The desired new status
 * @throws BadRequestException if the transition is invalid
 */
export function validateRepairerStatusTransition(
  currentStatus: RepairStatus,
  newStatus: RepairStatus,
): void {
  const validNextStatuses = REPAIRER_VALID_TRANSITIONS[currentStatus];

  if (!validNextStatuses || validNextStatuses.length === 0) {
    throw new BadRequestException(
      `Cannot update repair from status ${currentStatus}`,
    );
  }

  if (!validNextStatuses.includes(newStatus)) {
    throw new BadRequestException(
      `Invalid status transition from ${currentStatus} to ${newStatus}. Valid transitions: ${validNextStatuses.join(', ')}`,
    );
  }
}

/**
 * Gets the list of valid next statuses for a given current status
 * @param currentStatus - The current repair status
 * @returns Array of valid next statuses
 */
export function getValidNextStatuses(
  currentStatus: RepairStatus,
): RepairStatus[] {
  return REPAIRER_VALID_TRANSITIONS[currentStatus] || [];
}
