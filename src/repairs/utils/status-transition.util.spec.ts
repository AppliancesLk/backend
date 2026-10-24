/**
 * Status Transition Utility Unit Tests
 *
 * Test Case IDs: TC-REP-U-042 through TC-REP-U-055
 *
 * These tests verify repair status transition validation logic.
 */

import { BadRequestException } from '@nestjs/common';
import { RepairStatus } from '../enums/repair-status.enum';
import {
  validateRepairerStatusTransition,
  getValidNextStatuses,
} from './status-transition.util';

describe('Status Transition Utilities', () => {
  describe('validateRepairerStatusTransition', () => {
    // TC-REP-U-042
    it('should allow ASSIGNED → IN_PROGRESS', () => {
      expect(() =>
        validateRepairerStatusTransition(
          RepairStatus.ASSIGNED,
          RepairStatus.IN_PROGRESS,
        ),
      ).not.toThrow();
    });

    // TC-REP-U-043
    it('should allow APPROVED → IN_PROGRESS', () => {
      expect(() =>
        validateRepairerStatusTransition(
          RepairStatus.APPROVED,
          RepairStatus.IN_PROGRESS,
        ),
      ).not.toThrow();
    });

    // TC-REP-U-044
    it('should allow IN_PROGRESS → AWAITING_PARTS', () => {
      expect(() =>
        validateRepairerStatusTransition(
          RepairStatus.IN_PROGRESS,
          RepairStatus.AWAITING_PARTS,
        ),
      ).not.toThrow();
    });

    // TC-REP-U-045
    it('should allow IN_PROGRESS → READY_FOR_COLLECTION', () => {
      expect(() =>
        validateRepairerStatusTransition(
          RepairStatus.IN_PROGRESS,
          RepairStatus.READY_FOR_COLLECTION,
        ),
      ).not.toThrow();
    });

    // TC-REP-U-046
    it('should allow AWAITING_PARTS → IN_PROGRESS', () => {
      expect(() =>
        validateRepairerStatusTransition(
          RepairStatus.AWAITING_PARTS,
          RepairStatus.IN_PROGRESS,
        ),
      ).not.toThrow();
    });

    // TC-REP-U-047
    it('should allow READY_FOR_COLLECTION → COMPLETED', () => {
      expect(() =>
        validateRepairerStatusTransition(
          RepairStatus.READY_FOR_COLLECTION,
          RepairStatus.COMPLETED,
        ),
      ).not.toThrow();
    });

    // TC-REP-U-048
    it('should reject transitions from PENDING', () => {
      expect(() =>
        validateRepairerStatusTransition(
          RepairStatus.PENDING,
          RepairStatus.IN_PROGRESS,
        ),
      ).toThrow(BadRequestException);
    });

    // TC-REP-U-049
    it('should reject transitions from REJECTED', () => {
      expect(() =>
        validateRepairerStatusTransition(
          RepairStatus.REJECTED,
          RepairStatus.IN_PROGRESS,
        ),
      ).toThrow('Cannot update repair from status');
    });

    // TC-REP-U-050
    it('should reject transitions from COMPLETED', () => {
      expect(() =>
        validateRepairerStatusTransition(
          RepairStatus.COMPLETED,
          RepairStatus.IN_PROGRESS,
        ),
      ).toThrow(BadRequestException);
    });

    // TC-REP-U-051
    it('should reject transitions from CANCELLED', () => {
      expect(() =>
        validateRepairerStatusTransition(
          RepairStatus.CANCELLED,
          RepairStatus.IN_PROGRESS,
        ),
      ).toThrow(BadRequestException);
    });

    // TC-REP-U-052
    it('should reject invalid transition from ASSIGNED to COMPLETED', () => {
      expect(() =>
        validateRepairerStatusTransition(
          RepairStatus.ASSIGNED,
          RepairStatus.COMPLETED,
        ),
      ).toThrow('Invalid status transition');
    });

    // TC-REP-U-053
    it('should reject skip transitions IN_PROGRESS → COMPLETED', () => {
      expect(() =>
        validateRepairerStatusTransition(
          RepairStatus.IN_PROGRESS,
          RepairStatus.COMPLETED,
        ),
      ).toThrow('Invalid status transition');
    });
  });

  describe('getValidNextStatuses', () => {
    // TC-REP-U-054
    it('should return valid transitions for IN_PROGRESS', () => {
      const validStatuses = getValidNextStatuses(RepairStatus.IN_PROGRESS);

      expect(validStatuses).toContain(RepairStatus.AWAITING_PARTS);
      expect(validStatuses).toContain(RepairStatus.READY_FOR_COLLECTION);
      expect(validStatuses).toHaveLength(2);
    });

    // TC-REP-U-055
    it('should return empty array for terminal statuses', () => {
      expect(getValidNextStatuses(RepairStatus.COMPLETED)).toEqual([]);
      expect(getValidNextStatuses(RepairStatus.REJECTED)).toEqual([]);
      expect(getValidNextStatuses(RepairStatus.CANCELLED)).toEqual([]);
    });
  });
});
