import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
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

@Injectable()
export class ProductsService {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: Pool,
  ) {}

  async create(dto: CreateProductDto) {
    const [result] = await this.db.query<ResultSetHeader>(
      `
        INSERT INTO \`product\`
          (\`name\`, \`description\`, \`price\`, \`stock\`, \`image\`, \`status\`, \`updatedAt\`)
        VALUES (?, ?, ?, ?, ?, ?, NOW(3))
      `,
      [
        dto.name,
        dto.description ?? null,
        dto.price,
        dto.stock ?? 0,
        dto.image ?? null,
        dto.status ?? 'active',
      ],
    );

    return await this.findOne(result.insertId);
  }

  async findAll() {
    const [rows] = await this.db.query<ProductRow[]>(
      'SELECT * FROM `product` ORDER BY `id` DESC',
    );

    return rows;
  }

  async findOne(id: number) {
    const [rows] = await this.db.query<ProductRow[]>(
      'SELECT * FROM `product` WHERE `id` = ? LIMIT 1',
      [id],
    );
    const product = rows[0];

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async update(id: number, dto: UpdateProductDto) {
    const update = buildUpdateSet(dto, [
      'name',
      'description',
      'price',
      'stock',
      'image',
      'status',
    ]);

    const [result] = await this.db.query<ResultSetHeader>(
      `UPDATE \`product\` SET ${update.sql} WHERE \`id\` = ?`,
      [...update.values, id],
    );

    if (result.affectedRows === 0) {
      throw new NotFoundException('Product not found');
    }

    return await this.findOne(id);
  }

  async remove(id: number) {
    const product = await this.findOne(id);

    await this.db.query<ResultSetHeader>(
      'DELETE FROM `product` WHERE `id` = ?',
      [id],
    );

    return product;
  }
}
