import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CircularsController } from '../src/modules/circulars/circulars.controller';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Bootstrapping NestJS application context...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const controller = app.get(CircularsController);
  
  const filePath = path.join(__dirname, '..', 'uploads', 'circulars', '2026', '06', 'NT16738E653AADCEC4217BEFFA92C050F69AD_c173b3e284eeda12.PDF');
  console.log(`Reading test file: ${filePath}`);
  if (!fs.existsSync(filePath)) {
    console.error(`File does not exist at path: ${filePath}`);
    await app.close();
    return;
  }
  const buffer = fs.readFileSync(filePath);
  
  const mockReq = {
    isMultipart: () => true,
    file: async () => ({
      toBuffer: async () => buffer
    })
  };
  
  try {
    console.log('Calling compareStoredCirculars directly on the controller...');
    const result = await controller.compareStoredCirculars('2838', 2844);
    console.log('SUCCESS! Result:');
    console.log(result);
  } catch (err) {
    console.error('ERROR occurred in compareCirculars:');
    console.error(err);
  } finally {
    await app.close();
  }
}

main().catch(err => {
  console.error('Fatal bootstrap error:', err);
});
