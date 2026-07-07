import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from './core/database/database.module';
import { IdModule } from './core/id/id.module';
import { EmailModule } from './core/email/email.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthoritiesModule } from './modules/authorities/authorities.module';
import { BranchesModule } from './modules/branches/branches.module';
import { TaskSetsModule } from './modules/task-sets/task-sets.module';
import { CircularsModule } from './modules/circulars/circulars.module';
import { StorageModule } from './core/storage/storage.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AiModule } from './core/ai/ai.module';
import { PdfModule } from './core/pdf/pdf.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { TaskHeadersModule } from './modules/task-headers/task-headers.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditAreasModule } from './modules/audit-areas/audit-areas.module';
import { JwtAuthGuard } from './core/auth/jwt-auth.guard';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { ScraperModule } from './modules/scraper/scraper.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventEmitterModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),
    DatabaseModule,
    StorageModule,
    PdfModule,
    AiModule,

    CircularsModule,
    AssignmentsModule,
    NotificationsModule,
    IdModule,
    EmailModule,
    UsersModule,
    AuthModule,
    AuthoritiesModule,
    BranchesModule,
    TaskSetsModule,
    TasksModule,
    TaskHeadersModule,
    DashboardModule,
    AuditAreasModule,
    ScheduleModule.forRoot(),
    ScraperModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
