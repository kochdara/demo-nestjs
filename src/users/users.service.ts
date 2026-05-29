import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { buildUpdateSet } from '../database/rawsql/sql.helpers';

type UserRow = RowDataPacket & {
  id: number;
  name: string;
  email: string;
  password: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class UsersService {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: Pool,
  ) {}

  async findAll() {
    const [rows] = await this.db.query<UserRow[]>(
      'SELECT * FROM `user` ORDER BY `id` DESC',
    );

    return rows;
  }

  async findOne(id: number) {
    const user = await this.findUserById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async create(data: CreateUserDto): Promise<UserRow> {
    try {
      const [result] = await this.db.query<ResultSetHeader>(
        `
          INSERT INTO \`user\`
            (\`name\`, \`email\`, \`password\`, \`role\`, \`updatedAt\`)
          VALUES (?, ?, ?, ?, NOW(3))
        `,
        [data.name, data.email, data.password, data.role ?? 'user'],
      );

      return await this.findOne(result.insertId);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Email already exists');
      }

      throw error;
    }
  }

  async update(id: number, data: UpdateUserDto) {
    const update = buildUpdateSet(data, ['name', 'email', 'password', 'role']);

    try {
      const [result] = await this.db.query<ResultSetHeader>(
        `UPDATE \`user\` SET ${update.sql} WHERE \`id\` = ?`,
        [...update.values, id],
      );

      if (result.affectedRows === 0) {
        throw new NotFoundException('User not found');
      }

      return await this.findOne(id);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Email already exists');
      }

      throw error;
    }
  }

  async remove(id: number) {
    const user = await this.findOne(id);

    await this.db.query<ResultSetHeader>('DELETE FROM `user` WHERE `id` = ?', [
      id,
    ]);

    return user;
  }

  private async findUserById(id: number) {
    const [rows] = await this.db.query<UserRow[]>(
      'SELECT * FROM `user` WHERE `id` = ? LIMIT 1',
      [id],
    );

    return rows[0] ?? null;
  }

  private isUniqueConstraintError(error: unknown): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ER_DUP_ENTRY'
    );
  }
}
