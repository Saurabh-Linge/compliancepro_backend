import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './core/database/database.service';
import { IdService } from './core/id/id.service';

describe('AppController', () => {
  let app: TestingModule;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: DatabaseService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({ currentTime: '2026-01-01 00:00:00' }),
          },
        },
        {
          provide: IdService,
          useValue: {
            generate: jest.fn().mockReturnValue('1234567890'),
          },
        },
      ],
    }).compile();
  });

  describe('getHello', () => {
    it('should return status payload', async () => {
      const appController = app.get(AppController);
      await expect(appController.getHello()).resolves.toMatchObject({
        message: 'Database service is active!',
      });
    });
  });
});
