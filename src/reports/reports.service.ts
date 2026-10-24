import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { RepairTicket } from '../repairs/entities/repair-ticket.entity';
import { OrderStatus } from '../orders/enums/order-status.enum';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItems: Repository<OrderItem>,
    @InjectRepository(RepairTicket) private readonly repairs: Repository<RepairTicket>,
  ) {}

  async overview(period: 'day' | 'month') {
    const bucket = period === 'month' ? 'month' : 'day';
    const [registrations, revenue, repairs, topProducts] = await Promise.all([
      this.users.createQueryBuilder('user')
        .select(`DATE_TRUNC('${bucket}', user.createdAt)`, 'date')
        .addSelect('COUNT(*)', 'count')
        .groupBy('date').orderBy('date', 'ASC').getRawMany(),
      this.orders.createQueryBuilder('order')
        .select(`DATE_TRUNC('${bucket}', order.createdAt)`, 'date')
        .addSelect('COALESCE(SUM(order.total), 0)', 'total')
        .where('order.status IN (:...statuses)', { statuses: [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED] })
        .groupBy('date').orderBy('date', 'ASC').getRawMany(),
      this.repairs.createQueryBuilder('repair')
        .select(`DATE_TRUNC('${bucket}', repair.createdAt)`, 'date')
        .addSelect('COUNT(*)', 'count')
        .groupBy('date').orderBy('date', 'ASC').getRawMany(),
      this.orderItems.createQueryBuilder('item')
        .innerJoin(Order, 'order', 'order.id = item.orderId')
        .select('item.productId', 'productId')
        .addSelect('item.name', 'name')
        .addSelect('SUM(item.quantity)', 'quantity')
        .addSelect('SUM(item.lineTotal)', 'revenue')
        .where('order.status IN (:...statuses)', { statuses: [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED] })
        .groupBy('item.productId').addGroupBy('item.name')
        .orderBy('quantity', 'DESC').addOrderBy('revenue', 'DESC').limit(5).getRawMany(),
    ]);
    return {
      period,
      registrations: registrations.map((row) => ({ date: row.date, count: Number(row.count) })),
      revenue: revenue.map((row) => ({ date: row.date, total: Number(row.total) })),
      repairs: repairs.map((row) => ({ date: row.date, count: Number(row.count) })),
      topProducts: topProducts.map((row) => ({ productId: row.productId, name: row.name, quantity: Number(row.quantity), revenue: Number(row.revenue) })),
    };
  }
}
