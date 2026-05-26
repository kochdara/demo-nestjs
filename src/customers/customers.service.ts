import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PrismaService } from '../database/prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCustomerDto): Promise<any> {
    return await this.prisma.customer.create({
      data: {
        userId: dto.userId,
        phone: dto.phone,
        address: dto.address,
        city: dto.city,
        province: dto.province,
        country: dto.country,
        gender: dto.gender,
        dob: dto.dob ? new Date(dto.dob) : undefined,
        photo: dto.photo,
      },
      include: {
        user: true,
      },
    });
  }

  async findAll(): Promise<any> {
    return await this.prisma.customer.findMany({
      include: {
        user: true,
        orders: true,
      },
      orderBy: {
        id: 'desc',
      },
    });
  }

  async findOne(id: number): Promise<any> {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        user: true,
        orders: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async update(id: number, dto: UpdateCustomerDto): Promise<any> {
    return await this.prisma.customer.update({
      where: { id },
      data: {
        phone: dto.phone,
        address: dto.address,
        city: dto.city,
        province: dto.province,
        country: dto.country,
        gender: dto.gender,
        dob: dto.dob ? new Date(dto.dob) : undefined,
        photo: dto.photo,
      },
      include: {
        user: true,
      },
    });
  }

  async remove(id: number): Promise<any> {
    return await this.prisma.customer.delete({
      where: { id },
    });
  }
}
