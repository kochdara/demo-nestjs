import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let db: {
    query: jest.Mock;
  };

  beforeEach(async () => {
    db = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: 'DATABASE_CONNECTION',
          useValue: db,
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

    db.query
      .mockResolvedValueOnce([{ insertId: 3 }])
      .mockResolvedValueOnce([[{ id: 3, ...data }]]);

    await expect(service.create(data)).resolves.toEqual({ id: 3, ...data });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO `user`'),
      ['John', 'john@example.com', 'secret123', 'user'],
    );
  });

  it('throws conflict when email already exists', async () => {
    const data: CreateUserDto = {
      name: 'John',
      email: 'john@example.com',
      password: 'secret123',
      role: 'user',
    };

    db.query.mockRejectedValue({ code: 'ER_DUP_ENTRY' });

    await expect(service.create(data)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('updates a user', async () => {
    const data = {
      name: 'Koch-Makara',
      email: 'kochmakara@gmail.com',
      role: 'user',
    };

    db.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 3, ...data }]]);

    await expect(service.update(3, data)).resolves.toEqual({ id: 3, ...data });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE `user` SET'),
      ['Koch-Makara', 'kochmakara@gmail.com', 'user', 3],
    );
  });

  it('deletes a user', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 3 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await expect(service.remove(3)).resolves.toEqual({ id: 3 });
    expect(db.query).toHaveBeenCalledWith(
      'DELETE FROM `user` WHERE `id` = ?',
      [3],
    );
  });
});
