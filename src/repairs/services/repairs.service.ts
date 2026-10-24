import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { NotificationService } from '../../notification/notification.service';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CreateRepairTicketDto } from '../dto/create-repair-ticket.dto';
import type { RepairTicketResponseDto } from '../dto/repair-ticket-response.dto';
import type { AdminRepairTicketResponseDto } from '../dto/admin-repair-ticket-response.dto';
import type { RepairerRepairTicketResponseDto } from '../dto/repairer-repair-ticket-response.dto';
import { RepairTicket } from '../entities/repair-ticket.entity';
import { RepairStatus } from '../enums/repair-status.enum';
import { validateRepairerStatusTransition } from '../utils/status-transition.util';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';

@Injectable()
export class RepairsService {
  private readonly logger = new Logger(RepairsService.name);

  constructor(
    @InjectRepository(RepairTicket)
    private readonly tickets: Repository<RepairTicket>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly notifications: NotificationService,
  ) {}

  async create(
    customerId: string,
    dto: CreateRepairTicketDto,
  ): Promise<RepairTicketResponseDto> {
    try {
      this.validatePurchaseDate(dto.device.purchaseDate);
      const ticket = await this.saveWithUniqueReference(customerId, dto);
      this.logger.log({
        operation: 'repairs.create',
        customerId,
        repairTicketId: ticket.id,
        reference: ticket.reference,
        outcome: 'created',
      });
      await this.notifications.sendRepairRequestCreatedEmail(ticket);
      return this.response(ticket);
    } catch (error: unknown) {
      const context = {
        operation: 'repairs.create',
        customerId,
        outcome: 'failed',
        statusCode: error instanceof HttpException ? error.getStatus() : 500,
      };
      if (error instanceof HttpException) this.logger.warn(context);
      else this.logger.error(context);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Unable to create repair ticket. Please try again',
      );
    }
  }

  private async saveWithUniqueReference(
    customerId: string,
    dto: CreateRepairTicketDto,
  ): Promise<RepairTicket> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ticket = this.tickets.create({
        reference: this.reference(),
        customerId,
        assignedRepairerId: null,
        device: {
          deviceType: dto.device.deviceType,
          brand: dto.device.brand,
          model: dto.device.model,
          ...(dto.device.serialNumber
            ? { serialNumber: dto.device.serialNumber }
            : {}),
          ...(dto.device.purchaseDate
            ? { purchaseDate: dto.device.purchaseDate }
            : {}),
        },
        problemDescription: dto.problemDescription,
        status: RepairStatus.PENDING,
        reviewedAt: null,
      });
      try {
        return await this.tickets.save(ticket);
      } catch (error: unknown) {
        const driver =
          error instanceof QueryFailedError
            ? (error.driverError as { code?: string; constraint?: string })
            : null;
        if (
          driver?.code !== '23505' ||
          driver.constraint !== 'UQ_repair_tickets_reference' ||
          attempt === 2
        )
          throw error;
      }
    }
    throw new Error('Repair reference generation failed');
  }

  private validatePurchaseDate(value?: string): void {
    if (!value) return;
    const purchaseDate = new Date(value);
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    if (purchaseDate >= tomorrow)
      throw new BadRequestException('purchaseDate cannot be in the future');
  }

  private reference(): string {
    const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `RPR-${day}-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private response(ticket: RepairTicket): RepairTicketResponseDto {
    return {
      id: ticket.id,
      reference: ticket.reference,
      customerId: ticket.customerId,
      assignedRepairerId: ticket.assignedRepairerId,
      device: ticket.device,
      problemDescription: ticket.problemDescription,
      status: ticket.status,
      reviewedAt: ticket.reviewedAt,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  }

  // Admin methods
  async findAll(): Promise<AdminRepairTicketResponseDto[]> {
    try {
      const tickets = await this.tickets.find({
        relations: { customer: true, assignedRepairer: true },
        order: { createdAt: 'DESC' },
      });
      return tickets.map((ticket) => this.adminResponse(ticket));
    } catch (error: unknown) {
      this.logger.error({
        operation: 'repairs.findAll',
        outcome: 'failed',
      });
      throw new InternalServerErrorException(
        'Unable to retrieve repair tickets. Please try again',
      );
    }
  }

  async findOne(id: string): Promise<AdminRepairTicketResponseDto> {
    try {
      const ticket = await this.tickets.findOne({
        where: { id },
        relations: { customer: true, assignedRepairer: true },
      });
      if (!ticket) {
        throw new NotFoundException('Repair ticket not found');
      }
      return this.adminResponse(ticket);
    } catch (error: unknown) {
      const context = {
        operation: 'repairs.findOne',
        repairTicketId: id,
        outcome: 'failed',
        statusCode: error instanceof HttpException ? error.getStatus() : 500,
      };
      if (error instanceof HttpException) this.logger.warn(context);
      else this.logger.error(context);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Unable to retrieve repair ticket. Please try again',
      );
    }
  }

  async approve(id: string): Promise<AdminRepairTicketResponseDto> {
    try {
      const ticket = await this.tickets.findOne({
        where: { id },
        relations: { customer: true },
      });

      if (!ticket) {
        throw new NotFoundException('Repair ticket not found');
      }

      if (ticket.status !== RepairStatus.PENDING) {
        throw new BadRequestException(
          `Cannot approve repair with status ${ticket.status}. Only PENDING repairs can be approved.`,
        );
      }

      ticket.status = RepairStatus.APPROVED;
      ticket.reviewedAt = new Date();

      const updated = await this.tickets.save(ticket);

      this.logger.log({
        operation: 'repairs.approve',
        repairTicketId: ticket.id,
        reference: ticket.reference,
        customerId: ticket.customerId,
        previousStatus: RepairStatus.PENDING,
        newStatus: RepairStatus.APPROVED,
        outcome: 'approved',
      });
      await this.notifications.sendRepairApprovedEmail(updated);
      return this.adminResponse(updated);
    } catch (error: unknown) {
      const context = {
        operation: 'repairs.approve',
        repairTicketId: id,
        outcome: 'failed',
        statusCode: error instanceof HttpException ? error.getStatus() : 500,
      };
      if (error instanceof HttpException) this.logger.warn(context);
      else this.logger.error(context);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Unable to approve repair ticket. Please try again',
      );
    }
  }

  async reject(
    id: string,
    rejectionReason?: string,
  ): Promise<AdminRepairTicketResponseDto> {
    try {
      const ticket = await this.tickets.findOne({
        where: { id },
        relations: { customer: true },
      });

      if (!ticket) {
        throw new NotFoundException('Repair ticket not found');
      }

      if (ticket.status !== RepairStatus.PENDING) {
        throw new BadRequestException(
          `Cannot reject repair with status ${ticket.status}. Only PENDING repairs can be rejected.`,
        );
      }

      ticket.status = RepairStatus.REJECTED;
      ticket.reviewedAt = new Date();

      const updated = await this.tickets.save(ticket);

      this.logger.log({
        operation: 'repairs.reject',
        repairTicketId: ticket.id,
        reference: ticket.reference,
        customerId: ticket.customerId,
        previousStatus: RepairStatus.PENDING,
        newStatus: RepairStatus.REJECTED,
        rejectionReason: rejectionReason ?? 'Not provided',
        outcome: 'rejected',
      });
      await this.notifications.sendRepairRejectedEmail(updated);
      return this.adminResponse(updated);
    } catch (error: unknown) {
      const context = {
        operation: 'repairs.reject',
        repairTicketId: id,
        outcome: 'failed',
        statusCode: error instanceof HttpException ? error.getStatus() : 500,
      };
      if (error instanceof HttpException) this.logger.warn(context);
      else this.logger.error(context);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Unable to reject repair ticket. Please try again',
      );
    }
  }

  async assign(
    id: string,
    repairerId: string,
  ): Promise<AdminRepairTicketResponseDto> {
    try {
      const [ticket, repairer] = await Promise.all([
        this.tickets.findOne({
          where: { id },
          relations: { customer: true, assignedRepairer: true },
        }),
        this.users.findOne({ where: { id: repairerId } }),
      ]);

      if (!ticket) throw new NotFoundException('Repair ticket not found');
      if (!repairer || repairer.role !== UserRole.REPAIRER || !repairer.isActive || repairer.deactivatedAt) {
        throw new BadRequestException('An active repairer account is required');
      }
      if (![RepairStatus.APPROVED, RepairStatus.ASSIGNED].includes(ticket.status)) {
        throw new BadRequestException(
          `Cannot assign repair with status ${ticket.status}. Approve it first.`,
        );
      }

      ticket.assignedRepairerId = repairer.id;
      ticket.status = RepairStatus.ASSIGNED;
      const updated = await this.tickets.save(ticket);
      updated.assignedRepairer = repairer;

      this.logger.log({
        operation: 'repairs.assign',
        repairTicketId: ticket.id,
        repairerId: repairer.id,
        customerId: ticket.customerId,
        outcome: 'assigned',
      });
      return this.adminResponse(updated);
    } catch (error: unknown) {
      const context = {
        operation: 'repairs.assign',
        repairTicketId: id,
        repairerId,
        outcome: 'failed',
        statusCode: error instanceof HttpException ? error.getStatus() : 500,
      };
      if (error instanceof HttpException) this.logger.warn(context);
      else this.logger.error(context);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Unable to assign repair ticket. Please try again',
      );
    }
  }

  private adminResponse(ticket: RepairTicket): AdminRepairTicketResponseDto {
    return {
      id: ticket.id,
      reference: ticket.reference,
      customer: {
        id: ticket.customer.id,
        username: ticket.customer.username,
        email: ticket.customer.email,
      },
      assignedRepairerId: ticket.assignedRepairerId,
      assignedRepairer: ticket.assignedRepairer
        ? {
            id: ticket.assignedRepairer.id,
            username: ticket.assignedRepairer.username,
            email: ticket.assignedRepairer.email,
          }
        : null,
      device: ticket.device,
      problemDescription: ticket.problemDescription,
      status: ticket.status,
      reviewedAt: ticket.reviewedAt,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  }

  // Customer methods
  async findAllForCustomer(
    customerId: string,
  ): Promise<RepairTicketResponseDto[]> {
    try {
      const tickets = await this.tickets.find({
        where: { customerId },
        order: { createdAt: 'DESC' },
      });
      return tickets.map((ticket) => this.response(ticket));
    } catch (error: unknown) {
      this.logger.error({
        operation: 'repairs.findAllForCustomer',
        customerId,
        outcome: 'failed',
      });
      throw new InternalServerErrorException(
        'Unable to retrieve your repair tickets. Please try again',
      );
    }
  }

  async findOneForCustomer(
    id: string,
    customerId: string,
  ): Promise<RepairTicketResponseDto> {
    try {
      const ticket = await this.tickets.findOne({
        where: { id },
      });

      if (!ticket) {
        throw new NotFoundException('Repair ticket not found');
      }

      if (ticket.customerId !== customerId) {
        throw new ForbiddenException(
          'You do not have permission to access this repair ticket',
        );
      }

      return this.response(ticket);
    } catch (error: unknown) {
      const context = {
        operation: 'repairs.findOneForCustomer',
        repairTicketId: id,
        customerId,
        outcome: 'failed',
        statusCode: error instanceof HttpException ? error.getStatus() : 500,
      };
      if (error instanceof HttpException) this.logger.warn(context);
      else this.logger.error(context);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Unable to retrieve repair ticket. Please try again',
      );
    }
  }

  // Repairer methods
  async findAllForRepairer(
    repairerId: string,
  ): Promise<RepairerRepairTicketResponseDto[]> {
    try {
      const tickets = await this.tickets.find({
        where: { assignedRepairerId: repairerId },
        relations: { customer: true },
        order: { createdAt: 'DESC' },
      });
      return tickets.map((ticket) => this.repairerResponse(ticket));
    } catch (error: unknown) {
      this.logger.error({
        operation: 'repairs.findAllForRepairer',
        repairerId,
        outcome: 'failed',
      });
      throw new InternalServerErrorException(
        'Unable to retrieve assigned repair tickets. Please try again',
      );
    }
  }

  async findOneForRepairer(
    id: string,
    repairerId: string,
  ): Promise<RepairerRepairTicketResponseDto> {
    try {
      const ticket = await this.tickets.findOne({
        where: { id },
        relations: { customer: true },
      });

      if (!ticket) {
        throw new NotFoundException('Repair ticket not found');
      }

      if (ticket.assignedRepairerId !== repairerId) {
        throw new ForbiddenException(
          'You do not have permission to access this repair ticket',
        );
      }

      return this.repairerResponse(ticket);
    } catch (error: unknown) {
      const context = {
        operation: 'repairs.findOneForRepairer',
        repairTicketId: id,
        repairerId,
        outcome: 'failed',
        statusCode: error instanceof HttpException ? error.getStatus() : 500,
      };
      if (error instanceof HttpException) this.logger.warn(context);
      else this.logger.error(context);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Unable to retrieve repair ticket. Please try again',
      );
    }
  }

  async updateRepairStatus(
    id: string,
    repairerId: string,
    newStatus: RepairStatus,
  ): Promise<RepairerRepairTicketResponseDto> {
    try {
      const ticket = await this.tickets.findOne({
        where: { id },
        relations: { customer: true },
      });

      if (!ticket) {
        throw new NotFoundException('Repair ticket not found');
      }

      if (ticket.assignedRepairerId !== repairerId) {
        throw new ForbiddenException(
          'You do not have permission to update this repair ticket',
        );
      }

      const previousStatus = ticket.status;

      // Validate the status transition
      validateRepairerStatusTransition(previousStatus, newStatus);

      ticket.status = newStatus;
      const updated = await this.tickets.save(ticket);

      this.logger.log({
        operation: 'repairs.updateStatus',
        repairTicketId: ticket.id,
        reference: ticket.reference,
        repairerId,
        customerId: ticket.customerId,
        previousStatus,
        newStatus,
        outcome: 'updated',
      });
      if (newStatus === RepairStatus.READY_FOR_COLLECTION)
        await this.notifications.sendRepairReadyForCollectionEmail(updated);
      else await this.notifications.sendRepairStatusUpdatedEmail(updated);
      return this.repairerResponse(updated);
    } catch (error: unknown) {
      const context = {
        operation: 'repairs.updateStatus',
        repairTicketId: id,
        repairerId,
        newStatus,
        outcome: 'failed',
        statusCode: error instanceof HttpException ? error.getStatus() : 500,
      };
      if (error instanceof HttpException) this.logger.warn(context);
      else this.logger.error(context);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Unable to update repair status. Please try again',
      );
    }
  }

  private repairerResponse(
    ticket: RepairTicket,
  ): RepairerRepairTicketResponseDto {
    return {
      id: ticket.id,
      reference: ticket.reference,
      customer: {
        id: ticket.customer.id,
        username: ticket.customer.username,
        email: ticket.customer.email,
      },
      device: ticket.device,
      problemDescription: ticket.problemDescription,
      status: ticket.status,
      reviewedAt: ticket.reviewedAt,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  }
}
