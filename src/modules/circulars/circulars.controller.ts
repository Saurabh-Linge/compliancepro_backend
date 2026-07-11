import { Controller, Get, Post, Delete, Patch, Param, Req, BadRequestException, NotFoundException, Sse, MessageEvent, Query } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, fromEvent } from 'rxjs';
import { map } from 'rxjs/operators';
import { CircularsService, CircularUploadFile } from './circulars.service';
import { AiService } from '../../core/ai/ai.service';
import { PdfService } from '../../core/pdf/pdf.service';
import type { FastifyRequest } from 'fastify';

@Controller('circulars')
export class CircularsController {
  constructor(
    private readonly circularsService: CircularsService,
    private readonly aiService: AiService,
    private readonly pdfService: PdfService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  @Post()
  async create(@Req() req: FastifyRequest) {
    const fastifyReq = req as any;
    const isMultipart = typeof fastifyReq.isMultipart === 'function' && fastifyReq.isMultipart();
    console.log(`[CircularsController] create() - isMultipart: ${isMultipart}`);
    
    let payload: any;
    try {
      payload = isMultipart ? await this.extractMultipartPayload(fastifyReq) : (req.body || {});
      console.log(`[CircularsController] Extracted payload keys:`, Object.keys(payload));
      if (isMultipart) {
        console.log(`[CircularsController] Files received:`, payload.files?.length || 0);
        payload.files?.forEach((f: any, i: number) => {
          console.log(`  File ${i + 1}: ${f.filename}, ${f.mimetype}, size: ${f.buffer?.length}`);
        });
      }
    } catch (err) {
      console.error(`[CircularsController] Error extracting payload:`, err);
      throw err;
    }

    if (!payload.authority_id || !payload.title || !payload.published_date) {
      console.error(`[CircularsController] Missing required fields. authority_id=${payload.authority_id}, title=${payload.title}, published_date=${payload.published_date}`);
      throw new BadRequestException('Missing required fields: authority_id, title, published_date');
    }

    const authorityId = parseInt(payload.authority_id, 10);
    const circularType = payload.circular_type ? parseInt(payload.circular_type, 10) : 6;

    if (isNaN(authorityId)) {
      throw new BadRequestException('authority_id must be a valid number');
    }

    const input = {
      authority_id: authorityId,
      reference_no: payload.reference_no || null,
      title: payload.title,
      published_date: payload.published_date,
      priority: payload.priority || 'Medium',
      circular_type: isNaN(circularType) ? 6 : circularType,
      description: payload.description || null,
      portal_website: payload.portal_website || null,
      is_penalty_applicable: this.toBoolean(payload.is_penalty_applicable),
      penalty_amount: payload.penalty_amount !== undefined && payload.penalty_amount !== null && payload.penalty_amount !== ''
        ? Number(payload.penalty_amount)
        : null,
      penalty_description: payload.penalty_description || null,
      pdf_url: payload.pdf_url || null,
      is_applicable: payload.is_applicable !== undefined ? this.toBoolean(payload.is_applicable) : true,
      is_active: payload.is_active !== undefined ? this.toBoolean(payload.is_active) : true,
    };

    if (isMultipart) {
      console.log(`[CircularsController] Delegating to createWithFiles...`);
      return this.circularsService.createWithFiles(input, payload.files || []);
    }

    console.log(`[CircularsController] Delegating to create (no files)...`);
    return this.circularsService.create(input);
  }

  @Get()
  findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('has_tasks') hasTasks?: string,
    @Query('authority_id') authorityId?: string,
    @Query('is_active') isActive?: string,
    @Query('is_applicable') isApplicable?: string,
  ) {
    return this.circularsService.findAllPaginated({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search,
      hasTasks: hasTasks === 'true',
      authority_id: authorityId ? parseInt(authorityId, 10) : undefined,
      is_active: isActive !== undefined ? isActive === 'true' : undefined,
      is_applicable: isApplicable !== undefined ? isApplicable === 'true' : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.circularsService.findOne(+id);
  }

  @Get(':id/tasks')
  getTasks(@Param('id') id: string) {
    return this.circularsService.getTasksForCircular(+id);
  }

  @Get(':id/amendment-chain')
  getAmendmentChain(@Param('id') id: string) {
    return this.circularsService.getAmendmentChain(+id);
  }

  @Get(':id/logs')
  getLogs(@Param('id') id: string) {
    return this.circularsService.getLogsForCircular(+id);
  }

  @Sse(':id/logs/stream')
  streamLogs(@Param('id') id: string): Observable<MessageEvent> {
    const circularId = parseInt(id, 10);
    if (isNaN(circularId)) {
      throw new BadRequestException('Invalid circular id');
    }
    return fromEvent(this.eventEmitter, `ai.stream.${circularId}`).pipe(
      map((payload: any) => ({
        data: payload,
      })),
    );
  }

  @Post(':id/chat')
  async chatWithCircular(@Param('id') id: string, @Req() req: any) {
    const question = req.body?.question;
    if (!question) {
      throw new BadRequestException('Missing question field');
    }
    const result = await this.aiService.chatWithCircular(parseInt(id, 10), question);
    // result contains { thoughts, response } — thoughts may be empty string if model didn't think
    return result;
  }

  @Post('extract-metadata')
  async extractMetadata(@Req() req: FastifyRequest) {
    const fastifyReq = req as any;
    if (typeof fastifyReq.isMultipart !== 'function' || !fastifyReq.isMultipart()) {
      throw new BadRequestException('Request must be multipart/form-data');
    }

    const payload = await this.extractMultipartPayload(fastifyReq);
    const files = payload.files || [];
    if (files.length === 0) {
      throw new BadRequestException('No PDF file uploaded');
    }

    const file = files[0];
    try {
      console.log(`[CircularsController] Extracting metadata from uploaded file: ${file.filename}`);
      const text = await this.pdfService.extractText(file.buffer);
      const metadata = await this.aiService.extractMetadata(text);
      console.log(`[CircularsController] Extracted metadata:`, metadata);
      return {
        reference_no: metadata.reference_no || null,
        title: metadata.title || null,
        published_date: metadata.published_date || null
      };
    } catch (err: any) {
      console.error('[CircularsController] extract-metadata error:', err);
      throw new BadRequestException(`Failed to extract metadata: ${err.message}`);
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Req() req: FastifyRequest) {
    const body = req.body as any;
    const input: any = {};

    if (body.authority_id !== undefined) input.authority_id = parseInt(body.authority_id, 10);
    if (body.reference_no !== undefined) input.reference_no = body.reference_no;
    if (body.title !== undefined) input.title = body.title;
    if (body.published_date !== undefined) input.published_date = body.published_date;
    if (body.priority !== undefined) input.priority = body.priority;
    if (body.circular_type !== undefined) input.circular_type = parseInt(body.circular_type, 10);
    if (body.description !== undefined) input.description = body.description;
    if (body.portal_website !== undefined) input.portal_website = body.portal_website;
    if (body.is_penalty_applicable !== undefined) input.is_penalty_applicable = this.toBoolean(body.is_penalty_applicable);
    if (body.penalty_amount !== undefined) {
      input.penalty_amount = body.penalty_amount !== null && body.penalty_amount !== '' ? Number(body.penalty_amount) : null;
    }
    if (body.penalty_description !== undefined) input.penalty_description = body.penalty_description;
    if (body.is_withdrawn !== undefined) input.is_withdrawn = this.toBoolean(body.is_withdrawn);
    if (body.is_applicable !== undefined) input.is_applicable = this.toBoolean(body.is_applicable);
    if (body.is_active !== undefined) input.is_active = this.toBoolean(body.is_active);

    const updated = await this.circularsService.update(+id, input);
    if (!updated) throw new NotFoundException(`Circular ${id} not found`);
    return updated;
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    const deleted = await this.circularsService.delete(+id);
    if (!deleted) throw new NotFoundException(`Circular ${id} not found`);
    return { success: true };
  }

  private async extractMultipartPayload(req: any) {
    const payload: any = { files: [] as CircularUploadFile[] };
    console.log(`[CircularsController] extractMultipartPayload started`);

    if (typeof req.parts !== 'function') {
      console.error(`[CircularsController] req.parts is not a function`);
      throw new BadRequestException('Multipart parser is not available');
    }

    try {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          console.log(`[CircularsController] Found file part: ${part.filename}`);
          const buffer = await part.toBuffer();
          payload.files.push({
            buffer,
            filename: part.filename,
            mimetype: part.mimetype || 'application/octet-stream',
          });
        } else {
          console.log(`[CircularsController] Found field part: ${part.fieldname} = ${part.value}`);
          payload[part.fieldname] = part.value;
        }
      }
    } catch (err) {
      console.error(`[CircularsController] Error iterating req.parts():`, err);
      throw err;
    }

    console.log(`[CircularsController] extractMultipartPayload finished. Extracted ${payload.files.length} files.`);
    return payload;
  }

  private toBoolean(value: any): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
      return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
    }
    return false;
  }
}
