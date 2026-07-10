import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { DashboardService } from './src/modules/dashboard/dashboard.service';

async function main() {
  try {
    console.log('Booting NestJS application context...');
    const app = await NestFactory.createApplicationContext(AppModule);
    console.log('NestJS application context booted!');
    
    const dashboardService = app.get(DashboardService);
    const stats = await dashboardService.getStats({ role: 'ADMIN', sub: 'admin-id-123' });
    console.log('STATS SUCCESS:', JSON.stringify(stats, null, 2));
    
    await app.close();
  } catch (err) {
    console.error('NEST ERROR:', err);
  }
}

main();
