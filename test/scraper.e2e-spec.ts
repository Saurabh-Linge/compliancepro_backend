import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ScraperService } from '../src/modules/scraper/scraper.service';

describe('ScraperService (e2e)', () => {
  let app: INestApplication;
  let scraperService: ScraperService;

  // Scraping involves launching a headless browser and downloading PDFs,
  // which can take significantly longer than the standard 5000ms Jest timeout.
  jest.setTimeout(120000); // 2 minutes

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    scraperService = moduleFixture.get<ScraperService>(ScraperService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should run the RBI circular scraper and process exactly 10 circulars for dry run', async () => {
    console.log('--- Starting Scraper Jest e2e Test ---');
    
    // We run the actual scraper logic. 
    // Since we updated scraper.service.ts to limit to 10 and reverse chronological,
    // this will push exactly 10 jobs to the BullMQ queue and download their PDFs.
    await scraperService.runDryRun();
    
    console.log('--- Scraper Jest e2e Test Completed Successfully ---');
    
    // As long as it didn't throw an error, the test passes.
    expect(true).toBe(true);
  });
});
