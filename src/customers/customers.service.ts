import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { buildUpdateSet, toDateOrNull } from '../database/rawsql/sql.helpers';

type CustomerWithUserRow = RowDataPacket & {
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
  order_id: number | null;
  order_customerId: number | null;
  order_orderNo: string | null;
  order_status: string | null;
  order_totalAmount: string | null;
  order_createdAt: Date | null;
  order_updatedAt: Date | null;
};

@Injectable()
export class CustomersService {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: Pool,
  ) {}

  async create(dto: CreateCustomerDto): Promise<any> {
    const [result] = await this.db.query<ResultSetHeader>(
      `
        INSERT INTO \`customer\`
          (
            \`userId\`, \`phone\`, \`address\`, \`city\`, \`province\`,
            \`country\`, \`gender\`, \`dob\`, \`photo\`, \`updatedAt\`
          )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
      `,
      [
        dto.userId,
        dto.phone ?? null,
        dto.address ?? null,
        dto.city ?? null,
        dto.province ?? null,
        dto.country ?? 'Cambodia',
        dto.gender ?? null,
        toDateOrNull(dto.dob),
        dto.photo ?? null,
      ],
    );

    return await this.findCustomer(result.insertId, false);
  }

  async findAll(): Promise<any> {
    const [rows] = await this.db.query<CustomerWithUserRow[]>(
      this.customerSelectSql('ORDER BY c.`id` DESC'),
    );

    return this.mapCustomers(rows, true);
  }

  async findOne(id: number): Promise<any> {
    const customer = await this.findCustomer(id, true);

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async update(id: number, dto: UpdateCustomerDto): Promise<any> {
    const data = {
      phone: dto.phone,
      address: dto.address,
      city: dto.city,
      province: dto.province,
      country: dto.country,
      gender: dto.gender,
      dob: dto.dob === undefined ? undefined : toDateOrNull(dto.dob),
      photo: dto.photo,
    };
    const update = buildUpdateSet(data, [
      'phone',
      'address',
      'city',
      'province',
      'country',
      'gender',
      'dob',
      'photo',
    ]);

    const [result] = await this.db.query<ResultSetHeader>(
      `UPDATE \`customer\` SET ${update.sql} WHERE \`id\` = ?`,
      [...update.values, id],
    );

    if (result.affectedRows === 0) {
      throw new NotFoundException('Customer not found');
    }

    return await this.findCustomer(id, false);
  }

  async remove(id: number): Promise<any> {
    const customer = await this.findOne(id);

    await this.db.query<ResultSetHeader>(
      'DELETE FROM `customer` WHERE `id` = ?',
      [id],
    );

    return customer;
  }

  private async findCustomer(id: number, includeOrders: boolean) {
    const [rows] = await this.db.query<CustomerWithUserRow[]>(
      this.customerSelectSql('WHERE c.`id` = ?'),
      [id],
    );

    return this.mapCustomers(rows, includeOrders)[0] ?? null;
  }

  private customerSelectSql(whereOrOrder: string) {
    return `
      SELECT
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
        u.\`updatedAt\` AS user_updatedAt,
        o.\`id\` AS order_id,
        o.\`customerId\` AS order_customerId,
        o.\`orderNo\` AS order_orderNo,
        o.\`status\` AS order_status,
        o.\`totalAmount\` AS order_totalAmount,
        o.\`createdAt\` AS order_createdAt,
        o.\`updatedAt\` AS order_updatedAt
      FROM \`customer\` c
      INNER JOIN \`user\` u ON u.\`id\` = c.\`userId\`
      LEFT JOIN \`order\` o ON o.\`customerId\` = c.\`id\`
      ${whereOrOrder}
    `;
  }

  private mapCustomers(rows: CustomerWithUserRow[], includeOrders: boolean) {
    const customers = new Map<number, any>();

    for (const row of rows) {
      if (!customers.has(row.customer_id)) {
        customers.set(row.customer_id, {
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
          ...(includeOrders ? { orders: [] } : {}),
        });
      }

      if (includeOrders && row.order_id) {
        customers.get(row.customer_id).orders.push({
          id: row.order_id,
          customerId: row.order_customerId,
          orderNo: row.order_orderNo,
          status: row.order_status,
          totalAmount: row.order_totalAmount,
          createdAt: row.order_createdAt,
          updatedAt: row.order_updatedAt,
        });
      }
    }

    return [...customers.values()];
  }
}
