import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaModule } from '../database/prisma/prisma.module';
import { DatabaseModule } from 'src/database/rawsql/database.module';

@Module({
  imports: [PrismaModule, DatabaseModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
