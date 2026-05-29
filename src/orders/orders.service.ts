import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise';
import { buildUpdateSet } from '../database/rawsql/sql.helpers';

type ProductRow = RowDataPacket & {
  id: number;
  name: string;
  description: string | null;
  price: string;
  stock: number;
  image: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type OrderRow = RowDataPacket & {
  order_id: number;
  order_customerId: number;
  order_orderNo: string;
  order_status: string;
  order_totalAmount: string;
  order_createdAt: Date;
  order_updatedAt: Date;
  customer_id: number;
  customer_userId: number;
  customer_phone: string | null;
  customer_address: string | null;
  customer_city: string | null;
  customer_province: string | null;
  customer_country: string | null;
  customer_gender: string | null;
  customer_dob: Date | null;
  customer_photo: string | null;
  customer_createdAt: Date;
  customer_updatedAt: Date;
  user_id: number;
  user_name: string;
  user_email: string;
  user_password: string;
  user_role: string;
  user_createdAt: Date;
  user_updatedAt: Date;
};

type OrderItemRow = RowDataPacket & {
  item_id: number;
  item_orderId: number;
  item_productId: number;
  item_quantity: number;
  item_price: string;
  item_subtotal: string;
  item_createdAt: Date;
  item_updatedAt: Date;
  product_id: number;
  product_name: string;
  product_description: string | null;
  product_price: string;
  product_stock: number;
  product_image: string | null;
  product_status: string;
  product_createdAt: Date;
  product_updatedAt: Date;
};

@Injectable()
export class OrdersService {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: Pool,
  ) {}

  async create(dto: CreateOrderDto) {
    const customer = await this.findCustomerById(dto.customerId);

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = await this.findProductsByIds(productIds);

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

    const connection = await this.db.getConnection();

    try {
      await connection.beginTransaction();

      const [result] = await connection.query<ResultSetHeader>(
        `
          INSERT INTO \`order\`
            (\`customerId\`, \`orderNo\`, \`status\`, \`totalAmount\`, \`updatedAt\`)
          VALUES (?, ?, ?, ?, NOW(3))
        `,
        [
          dto.customerId,
          `ORD-${Date.now()}`,
          dto.status ?? 'pending',
          totalAmount,
        ],
      );

      await this.insertOrderItems(connection, result.insertId, orderItems);
      await connection.commit();

      return await this.findOne(result.insertId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async findAll() {
    const [orders] = await this.db.query<OrderRow[]>(
      `${this.orderSelectSql()} ORDER BY o.\`id\` DESC`,
    );

    return await this.hydrateOrderItems(orders);
  }

  async findOne(id: number) {
    const [orders] = await this.db.query<OrderRow[]>(
      `${this.orderSelectSql()} WHERE o.\`id\` = ?`,
      [id],
    );
    const order = (await this.hydrateOrderItems(orders))[0];

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async update(id: number, dto: UpdateOrderDto) {
    await this.findOne(id);

    if (dto.customerId) {
      const customer = await this.findCustomerById(dto.customerId);

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
      const products = await this.findProductsByIds(productIds);

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

    const connection = await this.db.getConnection();

    try {
      await connection.beginTransaction();

      const update = buildUpdateSet(
        {
          customerId: dto.customerId,
          status: dto.status,
          totalAmount,
        },
        ['customerId', 'status', 'totalAmount'],
      );

      await connection.query<ResultSetHeader>(
        `UPDATE \`order\` SET ${update.sql} WHERE \`id\` = ?`,
        [...update.values, id],
      );

      if (orderItems) {
        await connection.query<ResultSetHeader>(
          'DELETE FROM `orderitem` WHERE `orderId` = ?',
          [id],
        );
        await this.insertOrderItems(connection, id, orderItems);
      }

      await connection.commit();

      return await this.findOne(id);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async remove(id: number) {
    const order = await this.findOne(id);

    await this.db.query<ResultSetHeader>('DELETE FROM `order` WHERE `id` = ?', [
      id,
    ]);

    return order;
  }

  private async findCustomerById(customerId: number) {
    const [rows] = await this.db.query<RowDataPacket[]>(
      'SELECT `id` FROM `customer` WHERE `id` = ? LIMIT 1',
      [customerId],
    );

    return rows[0] ?? null;
  }

  private async findProductsByIds(productIds: number[]) {
    if (productIds.length === 0) {
      return [];
    }

    const [rows] = await this.db.query<ProductRow[]>(
      'SELECT * FROM `product` WHERE `id` IN (?)',
      [productIds],
    );

    return rows;
  }

  private async insertOrderItems(
    connection: PoolConnection,
    orderId: number,
    orderItems: {
      productId: number;
      quantity: number;
      price: number;
      subtotal: number;
    }[],
  ) {
    if (orderItems.length === 0) {
      return;
    }

    await connection.query<ResultSetHeader>(
      `
        INSERT INTO \`orderitem\`
          (\`orderId\`, \`productId\`, \`quantity\`, \`price\`, \`subtotal\`, \`updatedAt\`)
        VALUES ?
      `,
      [
        orderItems.map((item) => [
          orderId,
          item.productId,
          item.quantity,
          item.price,
          item.subtotal,
          new Date(),
        ]),
      ],
    );
  }

  private orderSelectSql() {
    return `
      SELECT
        o.\`id\` AS order_id,
        o.\`customerId\` AS order_customerId,
        o.\`orderNo\` AS order_orderNo,
        o.\`status\` AS order_status,
        o.\`totalAmount\` AS order_totalAmount,
        o.\`createdAt\` AS order_createdAt,
        o.\`updatedAt\` AS order_updatedAt,
        c.\`id\` AS customer_id,
        c.\`userId\` AS customer_userId,
        c.\`phone\` AS customer_phone,
        c.\`address\` AS customer_address,
        c.\`city\` AS customer_city,
        c.\`province\` AS customer_province,
        c.\`country\` AS customer_country,
        c.\`gender\` AS customer_gender,
        c.\`dob\` AS customer_dob,
        c.\`photo\` AS customer_photo,
        c.\`createdAt\` AS customer_createdAt,
        c.\`updatedAt\` AS customer_updatedAt,
        u.\`id\` AS user_id,
        u.\`name\` AS user_name,
        u.\`email\` AS user_email,
        u.\`password\` AS user_password,
        u.\`role\` AS user_role,
        u.\`createdAt\` AS user_createdAt,
        u.\`updatedAt\` AS user_updatedAt
      FROM \`order\` o
      INNER JOIN \`customer\` c ON c.\`id\` = o.\`customerId\`
      INNER JOIN \`user\` u ON u.\`id\` = c.\`userId\`
    `;
  }

  private async hydrateOrderItems(orderRows: OrderRow[]) {
    const orders = orderRows.map((row) => ({
      id: row.order_id,
      customerId: row.order_customerId,
      orderNo: row.order_orderNo,
      status: row.order_status,
      totalAmount: row.order_totalAmount,
      createdAt: row.order_createdAt,
      updatedAt: row.order_updatedAt,
      customer: {
        id: row.customer_id,
        userId: row.customer_userId,
        phone: row.customer_phone,
        address: row.customer_address,
        city: row.customer_city,
        province: row.customer_province,
        country: row.customer_country,
        gender: row.customer_gender,
        dob: row.customer_dob,
        photo: row.customer_photo,
        createdAt: row.customer_createdAt,
        updatedAt: row.customer_updatedAt,
        user: {
          id: row.user_id,
          name: row.user_name,
          email: row.user_email,
          password: row.user_password,
          role: row.user_role,
          createdAt: row.user_createdAt,
          updatedAt: row.user_updatedAt,
        },
      },
      items: [] as any[],
    }));

    if (orders.length === 0) {
      return orders;
    }

    const [items] = await this.db.query<OrderItemRow[]>(
      `
        SELECT
          oi.\`id\` AS item_id,
          oi.\`orderId\` AS item_orderId,
          oi.\`productId\` AS item_productId,
          oi.\`quantity\` AS item_quantity,
          oi.\`price\` AS item_price,
          oi.\`subtotal\` AS item_subtotal,
          oi.\`createdAt\` AS item_createdAt,
          oi.\`updatedAt\` AS item_updatedAt,
          p.\`id\` AS product_id,
          p.\`name\` AS product_name,
          p.\`description\` AS product_description,
          p.\`price\` AS product_price,
          p.\`stock\` AS product_stock,
          p.\`image\` AS product_image,
          p.\`status\` AS product_status,
          p.\`createdAt\` AS product_createdAt,
          p.\`updatedAt\` AS product_updatedAt
        FROM \`orderitem\` oi
        INNER JOIN \`product\` p ON p.\`id\` = oi.\`productId\`
        WHERE oi.\`orderId\` IN (?)
        ORDER BY oi.\`id\` ASC
      `,
      [orders.map((order) => order.id)],
    );

    const ordersById = new Map(orders.map((order) => [order.id, order]));

    for (const item of items) {
      ordersById.get(item.item_orderId)?.items.push({
        id: item.item_id,
        orderId: item.item_orderId,
        productId: item.item_productId,
        quantity: item.item_quantity,
        price: item.item_price,
        subtotal: item.item_subtotal,
        createdAt: item.item_createdAt,
        updatedAt: item.item_updatedAt,
        product: {
          id: item.product_id,
          name: item.product_name,
          description: item.product_description,
          price: item.product_price,
          stock: item.product_stock,
          image: item.product_image,
          status: item.product_status,
          createdAt: item.product_createdAt,
          updatedAt: item.product_updatedAt,
        },
      });
    }

    return orders;
  }
}
