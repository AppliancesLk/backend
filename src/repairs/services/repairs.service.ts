import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CreateRepairTicketDto } from '../dto/create-repair-ticket.dto';
import type { RepairTicketResponseDto } from '../dto/repair-ticket-response.dto';
import { RepairTicket } from '../entities/repair-ticket.entity';
import { RepairStatus } from '../enums/repair-status.enum';

@Injectable()
export class RepairsService {
  private readonly logger = new Logger(RepairsService.name);

  constructor(
    @InjectRepository(RepairTicket)
    private readonly tickets: Repository<RepairTicket>,
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
}
