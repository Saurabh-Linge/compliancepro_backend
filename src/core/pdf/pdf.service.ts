import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(private configService: ConfigService) {}

  async extractText(buffer: Buffer): Promise<string> {
    try {
      this.logger.debug(`Extracting text using unpdf (pdfjs-dist)`);
      const unpdf = await import('unpdf');
      // unpdf strictly requires a Uint8Array, not a Node.js Buffer
      const uint8Array = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const data = await unpdf.extractText(uint8Array);
      const textOutput = Array.isArray(data.text) ? data.text.join('\\n') : data.text;
      this.logger.debug(`Successfully extracted ${textOutput.length} chars from PDF`);
      return textOutput;
    } catch (error) {
      this.logger.error('Failed to extract text using unpdf', error);
      throw error;
    }
  }
}
