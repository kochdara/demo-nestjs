import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import * as promise from 'mysql2/promise';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('DATABASE_CONNECTION')
    private readonly db: promise.Pool,
  ) {}

  async findAll() {
    return await this.prisma.user.findMany();
  }

  async findOne(id: number) {
    const [rows] = await this.db.query(
      'SELECT id, name, email, createdAt FROM user WHERE id = ?',
      [id],
    );

    return rows;
  }

  async create(data: CreateUserDto): Promise<CreateUserDto> {
    try {
      return await this.prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: data.password,
          role: data.role,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Email already exists');
      }

      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
