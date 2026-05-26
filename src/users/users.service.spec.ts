import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: { user: { findMany: jest.Mock; create: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a user', async () => {
    const data: CreateUserDto = {
      name: 'John',
      email: 'john@example.com',
      password: 'secret123',
      role: 'user',
    };

    prisma.user.create.mockResolvedValue(data);

    await expect(service.create(data)).resolves.toEqual(data);
    expect(prisma.user.create).toHaveBeenCalledWith({ data });
  });

  it('throws conflict when email already exists', async () => {
    const data: CreateUserDto = {
      name: 'John',
      email: 'john@example.com',
      password: 'secret123',
      role: 'user',
    };

    prisma.user.create.mockRejectedValue({ code: 'P2002' });

    await expect(service.create(data)).rejects.toBeInstanceOf(ConflictException);
  });
});
