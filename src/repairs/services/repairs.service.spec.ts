/**
 * RepairsService Unit Tests
 *
 * Test Case IDs: TC-REP-U-001 through TC-REP-U-040
 *
 * These tests verify repair ticket operations including:
 * - Ticket creation with validation
 * - Admin operations: findAll, findOne, approve, reject, assign
 * - Customer operations: findAllForCustomer, findOneForCustomer
 * - Repairer operations: findAllForRepairer, findOneForRepairer, updateRepairStatus
 * - Status transition validation
 * - Access control
 * - Error handling and logging
 */

import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { RepairsService } from './repairs.service';
import { RepairTicket } from '../entities/repair-ticket.entity';
import { RepairStatus } from '../enums/repair-status.enum';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { NotificationService } from '../../notification/notification.service';

describe('RepairsService', () => {
  let service: RepairsService;
  let ticketsRepo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let usersRepo: {
    findOne: jest.Mock;
  };
  let notifications: {
    sendRepairRequestCreatedEmail: jest.Mock;
    sendRepairApprovedEmail: jest.Mock;
    sendRepairRejectedEmail: jest.Mock;
    sendRepairStatusUpdatedEmail: jest.Mock;
    sendRepairReadyForCollectionEmail: jest.Mock;
  };
  let log: jest.Mock;
  let warn: jest.Mock;
  let errorLog: jest.Mock;

  const customer: User = Object.assign(new User(), {
    id: 'customer-id',
    username: 'testcustomer',
    email: 'customer@example.com',
    role: UserRole.CUSTOMER,
    isActive: true,
    deactivatedAt: null,
  });

  const repairer: User = Object.assign(new User(), {
    id: 'repairer-id',
    username: 'testrepairer',
    email: 'repairer@example.com',
    role: UserRole.REPAIRER,
    isActive: true,
    deactivatedAt: null,
  });

  const ticket: RepairTicket = Object.assign(new RepairTicket(), {
    id: 'ticket-id',
    reference: 'RPR-20240101-ABCD1234',
    customerId: 'customer-id',
    assignedRepairerId: null,
    device: {
      deviceType: 'Washing Machine',
      brand: 'Samsung',
      model: 'WM-500',
      serialNumber: 'SN12345',
      purchaseDate: '2023-01-15',
    },
    problemDescription: 'The machine makes a loud noise during spin cycle',
    status: RepairStatus.PENDING,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    customer,
    assignedRepairer: null,
  });

  const createDto = {
    device: {
      deviceType: 'Washing Machine',
      brand: 'Samsung',
      model: 'WM-500',
      serialNumber: 'SN12345',
      purchaseDate: '2023-01-15',
    },
    problemDescription: 'The machine makes a loud noise during spin cycle',
  };

  beforeEach(() => {
    jest.resetAllMocks();

    ticketsRepo = {
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    usersRepo = {
      findOne: jest.fn(),
    };

    notifications = {
      sendRepairRequestCreatedEmail: jest.fn().mockResolvedValue({}),
      sendRepairApprovedEmail: jest.fn().mockResolvedValue({}),
      sendRepairRejectedEmail: jest.fn().mockResolvedValue({}),
      sendRepairStatusUpdatedEmail: jest.fn().mockResolvedValue({}),
      sendRepairReadyForCollectionEmail: jest.fn().mockResolvedValue({}),
    };

    log = jest.fn();
    warn = jest.fn();
    errorLog = jest.fn();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(log);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(warn);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(errorLog);

    service = new RepairsService(
      ticketsRepo as never,
      usersRepo as never,
      notifications as unknown as NotificationService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('create', () => {
    // TC-REP-U-001
    it('should create a repair ticket successfully', async () => {
      ticketsRepo.save.mockResolvedValue(ticket);

      const result = await service.create('customer-id', createDto);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('reference');
      expect(result.status).toBe(RepairStatus.PENDING);
      expect(notifications.sendRepairRequestCreatedEmail).toHaveBeenCalled();
    });

    // TC-REP-U-002
    it('should generate unique reference on collision', async () => {
      const uniqueConstraintError = new QueryFailedError(
        'INSERT',
        [],
        { code: '23505', constraint: 'UQ_repair_tickets_reference' } as Error,
      );
      ticketsRepo.save
        .mockRejectedValueOnce(uniqueConstraintError)
        .mockResolvedValueOnce(ticket);

      const result = await service.create('customer-id', createDto);

      expect(result).toHaveProperty('reference');
      expect(ticketsRepo.save).toHaveBeenCalledTimes(2);
    });

    // TC-REP-U-003
    it('should reject purchase date in the future', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const futureDateStr = futureDate.toISOString().slice(0, 10);

      const futureDto = {
        ...createDto,
        device: { ...createDto.device, purchaseDate: futureDateStr },
      };

      await expect(service.create('customer-id', futureDto)).rejects.toThrow(
        'cannot be in the future',
      );
    });

    // TC-REP-U-004
    it('should allow creation without purchase date', async () => {
      const noPurchaseDateDto = {
        ...createDto,
        device: { ...createDto.device, purchaseDate: undefined },
      };
      ticketsRepo.save.mockResolvedValue({ ...ticket, device: { ...ticket.device, purchaseDate: undefined } });

      const result = await service.create('customer-id', noPurchaseDateDto);

      expect(result).toHaveProperty('id');
    });

    // TC-REP-U-005
    it('should throw InternalServerErrorException on unexpected error', async () => {
      ticketsRepo.save.mockRejectedValue(new Error('Database error'));

      await expect(service.create('customer-id', createDto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    // TC-REP-U-006
    it('should fail after 3 reference collision attempts', async () => {
      const uniqueConstraintError = new QueryFailedError(
        'INSERT',
        [],
        { code: '23505', constraint: 'UQ_repair_tickets_reference' } as Error,
      );
      ticketsRepo.save.mockRejectedValue(uniqueConstraintError);

      await expect(service.create('customer-id', createDto)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(ticketsRepo.save).toHaveBeenCalledTimes(3);
    });
  });

  describe('findAll (Admin)', () => {
    // TC-REP-U-007
    it('should return all repair tickets with customer relations', async () => {
      ticketsRepo.find.mockResolvedValue([{ ...ticket, customer }]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('customer');
      expect(ticketsRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: { customer: true, assignedRepairer: true },
        }),
      );
    });

    // TC-REP-U-008
    it('should return empty array when no tickets exist', async () => {
      ticketsRepo.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });

    // TC-REP-U-009
    it('should throw InternalServerErrorException on database error', async () => {
      ticketsRepo.find.mockRejectedValue(new Error('Database error'));

      await expect(service.findAll()).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('findOne (Admin)', () => {
    // TC-REP-U-010
    it('should return ticket with full details', async () => {
      ticketsRepo.findOne.mockResolvedValue({ ...ticket, customer });

      const result = await service.findOne('ticket-id');

      expect(result).toHaveProperty('id', 'ticket-id');
      expect(result).toHaveProperty('customer');
    });

    // TC-REP-U-011
    it('should throw NotFoundException when ticket not found', async () => {
      ticketsRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('approve', () => {
    // TC-REP-U-012
    it('should approve a pending ticket', async () => {
      const pendingTicket = { ...ticket, status: RepairStatus.PENDING, customer };
      ticketsRepo.findOne.mockResolvedValue(pendingTicket);
      ticketsRepo.save.mockResolvedValue({
        ...pendingTicket,
        status: RepairStatus.APPROVED,
        reviewedAt: expect.any(Date),
      });

      const result = await service.approve('ticket-id');

      expect(result.status).toBe(RepairStatus.APPROVED);
      expect(notifications.sendRepairApprovedEmail).toHaveBeenCalled();
    });

    // TC-REP-U-013
    it('should reject approval of non-pending ticket', async () => {
      const approvedTicket = { ...ticket, status: RepairStatus.APPROVED, customer };
      ticketsRepo.findOne.mockResolvedValue(approvedTicket);

      await expect(service.approve('ticket-id')).rejects.toThrow(
        'Only PENDING repairs can be approved',
      );
    });

    // TC-REP-U-014
    it('should throw NotFoundException when ticket not found', async () => {
      ticketsRepo.findOne.mockResolvedValue(null);

      await expect(service.approve('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('reject', () => {
    // TC-REP-U-015
    it('should reject a pending ticket', async () => {
      const pendingTicket = { ...ticket, status: RepairStatus.PENDING, customer };
      ticketsRepo.findOne.mockResolvedValue(pendingTicket);
      ticketsRepo.save.mockResolvedValue({
        ...pendingTicket,
        status: RepairStatus.REJECTED,
        reviewedAt: expect.any(Date),
      });

      const result = await service.reject('ticket-id', 'Device is out of warranty');

      expect(result.status).toBe(RepairStatus.REJECTED);
      expect(notifications.sendRepairRejectedEmail).toHaveBeenCalled();
    });

    // TC-REP-U-016
    it('should reject rejection of non-pending ticket', async () => {
      const approvedTicket = { ...ticket, status: RepairStatus.APPROVED, customer };
      ticketsRepo.findOne.mockResolvedValue(approvedTicket);

      await expect(service.reject('ticket-id')).rejects.toThrow(
        'Only PENDING repairs can be rejected',
      );
    });

    // TC-REP-U-017
    it('should throw NotFoundException when ticket not found', async () => {
      ticketsRepo.findOne.mockResolvedValue(null);

      await expect(service.reject('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assign', () => {
    // TC-REP-U-018
    it('should assign an approved ticket to a repairer', async () => {
      const approvedTicket = { ...ticket, status: RepairStatus.APPROVED, customer };
      ticketsRepo.findOne.mockResolvedValue(approvedTicket);
      usersRepo.findOne.mockResolvedValue(repairer);
      ticketsRepo.save.mockResolvedValue({
        ...approvedTicket,
        assignedRepairerId: repairer.id,
        status: RepairStatus.ASSIGNED,
      });

      const result = await service.assign('ticket-id', 'repairer-id');

      expect(result.status).toBe(RepairStatus.ASSIGNED);
      expect(result.assignedRepairerId).toBe('repairer-id');
    });

    // TC-REP-U-019
    it('should allow reassigning an already assigned ticket', async () => {
      const assignedTicket = {
        ...ticket,
        status: RepairStatus.ASSIGNED,
        assignedRepairerId: 'old-repairer',
        customer,
      };
      ticketsRepo.findOne.mockResolvedValue(assignedTicket);
      usersRepo.findOne.mockResolvedValue(repairer);
      ticketsRepo.save.mockResolvedValue({
        ...assignedTicket,
        assignedRepairerId: repairer.id,
      });

      const result = await service.assign('ticket-id', 'repairer-id');

      expect(result.assignedRepairerId).toBe('repairer-id');
    });

    // TC-REP-U-020
    it('should reject assignment of pending ticket', async () => {
      const pendingTicket = { ...ticket, status: RepairStatus.PENDING, customer };
      ticketsRepo.findOne.mockResolvedValue(pendingTicket);
      usersRepo.findOne.mockResolvedValue(repairer);

      await expect(service.assign('ticket-id', 'repairer-id')).rejects.toThrow(
        'Approve it first',
      );
    });

    // TC-REP-U-021
    it('should reject assignment to non-repairer user', async () => {
      const approvedTicket = { ...ticket, status: RepairStatus.APPROVED, customer };
      ticketsRepo.findOne.mockResolvedValue(approvedTicket);
      usersRepo.findOne.mockResolvedValue({ ...customer, role: UserRole.CUSTOMER });

      await expect(service.assign('ticket-id', 'customer-id')).rejects.toThrow(
        'active repairer account is required',
      );
    });

    // TC-REP-U-022
    it('should reject assignment to inactive repairer', async () => {
      const approvedTicket = { ...ticket, status: RepairStatus.APPROVED, customer };
      const inactiveRepairer = { ...repairer, isActive: false };
      ticketsRepo.findOne.mockResolvedValue(approvedTicket);
      usersRepo.findOne.mockResolvedValue(inactiveRepairer);

      await expect(service.assign('ticket-id', 'repairer-id')).rejects.toThrow(
        'active repairer account is required',
      );
    });

    // TC-REP-U-023
    it('should reject assignment to deactivated repairer', async () => {
      const approvedTicket = { ...ticket, status: RepairStatus.APPROVED, customer };
      const deactivatedRepairer = { ...repairer, deactivatedAt: new Date() };
      ticketsRepo.findOne.mockResolvedValue(approvedTicket);
      usersRepo.findOne.mockResolvedValue(deactivatedRepairer);

      await expect(service.assign('ticket-id', 'repairer-id')).rejects.toThrow(
        'active repairer account is required',
      );
    });

    // TC-REP-U-024
    it('should throw NotFoundException when ticket not found', async () => {
      ticketsRepo.findOne.mockResolvedValue(null);

      await expect(service.assign('missing-id', 'repairer-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAllForCustomer', () => {
    // TC-REP-U-025
    it('should return only tickets for the specific customer', async () => {
      ticketsRepo.find.mockResolvedValue([ticket]);

      const result = await service.findAllForCustomer('customer-id');

      expect(result).toHaveLength(1);
      expect(ticketsRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: 'customer-id' },
        }),
      );
    });

    // TC-REP-U-026
    it('should return empty array for customer with no tickets', async () => {
      ticketsRepo.find.mockResolvedValue([]);

      const result = await service.findAllForCustomer('new-customer');

      expect(result).toEqual([]);
    });
  });

  describe('findOneForCustomer', () => {
    // TC-REP-U-027
    it('should return ticket for owning customer', async () => {
      ticketsRepo.findOne.mockResolvedValue(ticket);

      const result = await service.findOneForCustomer('ticket-id', 'customer-id');

      expect(result).toHaveProperty('id', 'ticket-id');
    });

    // TC-REP-U-028
    it('should throw ForbiddenException for non-owning customer', async () => {
      ticketsRepo.findOne.mockResolvedValue(ticket);

      await expect(
        service.findOneForCustomer('ticket-id', 'other-customer'),
      ).rejects.toThrow(ForbiddenException);
    });

    // TC-REP-U-029
    it('should throw NotFoundException when ticket not found', async () => {
      ticketsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.findOneForCustomer('missing-id', 'customer-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAllForRepairer', () => {
    // TC-REP-U-030
    it('should return only tickets assigned to the repairer', async () => {
      const assignedTicket = {
        ...ticket,
        assignedRepairerId: 'repairer-id',
        status: RepairStatus.ASSIGNED,
        customer,
      };
      ticketsRepo.find.mockResolvedValue([assignedTicket]);

      const result = await service.findAllForRepairer('repairer-id');

      expect(result).toHaveLength(1);
      expect(ticketsRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { assignedRepairerId: 'repairer-id' },
        }),
      );
    });
  });

  describe('findOneForRepairer', () => {
    // TC-REP-U-031
    it('should return ticket for assigned repairer', async () => {
      const assignedTicket = {
        ...ticket,
        assignedRepairerId: 'repairer-id',
        customer,
      };
      ticketsRepo.findOne.mockResolvedValue(assignedTicket);

      const result = await service.findOneForRepairer('ticket-id', 'repairer-id');

      expect(result).toHaveProperty('id', 'ticket-id');
    });

    // TC-REP-U-032
    it('should throw ForbiddenException for non-assigned repairer', async () => {
      const assignedTicket = {
        ...ticket,
        assignedRepairerId: 'other-repairer',
        customer,
      };
      ticketsRepo.findOne.mockResolvedValue(assignedTicket);

      await expect(
        service.findOneForRepairer('ticket-id', 'repairer-id'),
      ).rejects.toThrow(ForbiddenException);
    });

    // TC-REP-U-033
    it('should throw NotFoundException when ticket not found', async () => {
      ticketsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.findOneForRepairer('missing-id', 'repairer-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateRepairStatus', () => {
    // TC-REP-U-034
    it('should allow valid status transition from ASSIGNED to IN_PROGRESS', async () => {
      const assignedTicket = {
        ...ticket,
        assignedRepairerId: 'repairer-id',
        status: RepairStatus.ASSIGNED,
        customer,
      };
      ticketsRepo.findOne.mockResolvedValue(assignedTicket);
      ticketsRepo.save.mockResolvedValue({
        ...assignedTicket,
        status: RepairStatus.IN_PROGRESS,
      });

      const result = await service.updateRepairStatus(
        'ticket-id',
        'repairer-id',
        RepairStatus.IN_PROGRESS,
      );

      expect(result.status).toBe(RepairStatus.IN_PROGRESS);
      expect(notifications.sendRepairStatusUpdatedEmail).toHaveBeenCalled();
    });

    // TC-REP-U-035
    it('should send special notification when status is READY_FOR_COLLECTION', async () => {
      const inProgressTicket = {
        ...ticket,
        assignedRepairerId: 'repairer-id',
        status: RepairStatus.IN_PROGRESS,
        customer,
      };
      ticketsRepo.findOne.mockResolvedValue(inProgressTicket);
      ticketsRepo.save.mockResolvedValue({
        ...inProgressTicket,
        status: RepairStatus.READY_FOR_COLLECTION,
      });

      await service.updateRepairStatus(
        'ticket-id',
        'repairer-id',
        RepairStatus.READY_FOR_COLLECTION,
      );

      expect(notifications.sendRepairReadyForCollectionEmail).toHaveBeenCalled();
      expect(notifications.sendRepairStatusUpdatedEmail).not.toHaveBeenCalled();
    });

    // TC-REP-U-036
    it('should reject invalid status transition', async () => {
      const pendingTicket = {
        ...ticket,
        assignedRepairerId: 'repairer-id',
        status: RepairStatus.PENDING,
        customer,
      };
      ticketsRepo.findOne.mockResolvedValue(pendingTicket);

      await expect(
        service.updateRepairStatus(
          'ticket-id',
          'repairer-id',
          RepairStatus.COMPLETED,
        ),
      ).rejects.toThrow('Cannot update repair from status');
    });

    // TC-REP-U-037
    it('should throw ForbiddenException for non-assigned repairer', async () => {
      const assignedTicket = {
        ...ticket,
        assignedRepairerId: 'other-repairer',
        status: RepairStatus.ASSIGNED,
        customer,
      };
      ticketsRepo.findOne.mockResolvedValue(assignedTicket);

      await expect(
        service.updateRepairStatus(
          'ticket-id',
          'repairer-id',
          RepairStatus.IN_PROGRESS,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    // TC-REP-U-038
    it('should throw NotFoundException when ticket not found', async () => {
      ticketsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateRepairStatus(
          'missing-id',
          'repairer-id',
          RepairStatus.IN_PROGRESS,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    // TC-REP-U-039
    it('should allow transition from IN_PROGRESS to AWAITING_PARTS', async () => {
      const inProgressTicket = {
        ...ticket,
        assignedRepairerId: 'repairer-id',
        status: RepairStatus.IN_PROGRESS,
        customer,
      };
      ticketsRepo.findOne.mockResolvedValue(inProgressTicket);
      ticketsRepo.save.mockResolvedValue({
        ...inProgressTicket,
        status: RepairStatus.AWAITING_PARTS,
      });

      const result = await service.updateRepairStatus(
        'ticket-id',
        'repairer-id',
        RepairStatus.AWAITING_PARTS,
      );

      expect(result.status).toBe(RepairStatus.AWAITING_PARTS);
    });

    // TC-REP-U-040
    it('should allow transition from READY_FOR_COLLECTION to COMPLETED', async () => {
      const readyTicket = {
        ...ticket,
        assignedRepairerId: 'repairer-id',
        status: RepairStatus.READY_FOR_COLLECTION,
        customer,
      };
      ticketsRepo.findOne.mockResolvedValue(readyTicket);
      ticketsRepo.save.mockResolvedValue({
        ...readyTicket,
        status: RepairStatus.COMPLETED,
      });

      const result = await service.updateRepairStatus(
        'ticket-id',
        'repairer-id',
        RepairStatus.COMPLETED,
      );

      expect(result.status).toBe(RepairStatus.COMPLETED);
    });
  });

  describe('error handling', () => {
    // TC-REP-U-041
    it('should log safe context without exposing sensitive errors', async () => {
      ticketsRepo.save.mockRejectedValue(new Error('private db error'));

      await expect(service.create('customer-id', createDto)).rejects.toThrow(
        InternalServerErrorException,
      );

      expect(errorLog).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'repairs.create',
          outcome: 'failed',
          statusCode: 500,
        }),
      );
    });
  });
});
