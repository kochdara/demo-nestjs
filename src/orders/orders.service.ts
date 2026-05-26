import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaService } from '../database/prisma/prisma.service';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrderDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const productIds = [...new Set(dto.items.map((item) => item.productId))];

    const products = await this.prisma.product.findMany({
      where: {
        id: {
          in: productIds,
        },
      },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('Some products not found');
    }

    let totalAmount = 0;

    const orderItems = dto.items.map((item) => {
      const product = products.find((p) => p.id === item.productId);

      if (!product) {
        throw new BadRequestException(`Product ${item.productId} not found`);
      }

      const price = Number(product.price);
      const subtotal = price * item.quantity;

      totalAmount += subtotal;

      return {
        productId: item.productId,
        quantity: item.quantity,
        price,
        subtotal,
      };
    });

    return await this.prisma.order.create({
      data: {
        customerId: dto.customerId,
        orderNo: `ORD-${Date.now()}`,
        status: dto.status ?? 'pending',
        totalAmount,
        items: {
          create: orderItems,
        },
      },
      include: {
        ...this.orderInclude,
      },
    });
  }

  async findAll() {
    return await this.prisma.order.findMany({
      include: {
        ...this.orderInclude,
      },
      orderBy: {
        id: 'desc',
      },
    });
  }

  async findOne(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        ...this.orderInclude,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async update(id: number, dto: UpdateOrderDto) {
    await this.findOne(id);

    if (dto.customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: dto.customerId },
      });

      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
    }

    let totalAmount: number | undefined;
    let orderItems:
      | {
          productId: number;
          quantity: number;
          price: number;
          subtotal: number;
        }[]
      | undefined;

    if (dto.items) {
      const productIds = [...new Set(dto.items.map((item) => item.productId))];
      const products = await this.prisma.product.findMany({
        where: {
          id: {
            in: productIds,
          },
        },
      });

      if (products.length !== productIds.length) {
        throw new BadRequestException('Some products not found');
      }

      let recalculatedTotal = 0;
      orderItems = dto.items.map((item) => {
        const product = products.find((p) => p.id === item.productId);

        if (!product) {
          throw new BadRequestException(`Product ${item.productId} not found`);
        }

        const price = Number(product.price);
        const subtotal = price * item.quantity;

        recalculatedTotal += subtotal;

        return {
          productId: item.productId,
          quantity: item.quantity,
          price,
          subtotal,
        };
      });
      totalAmount = recalculatedTotal;
    }

    return await this.prisma.order.update({
      where: { id },
      data: {
        customerId: dto.customerId,
        status: dto.status,
        totalAmount,
        items: orderItems
          ? {
              deleteMany: {},
              create: orderItems,
            }
          : undefined,
      },
      include: {
        ...this.orderInclude,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    return await this.prisma.order.delete({
      where: { id },
    });
  }

  private readonly orderInclude = {
    customer: {
      include: {
        user: true,
      },
    },
    items: {
      include: {
        product: true,
      },
    },
  };
}
