import { Controller, Get, Post, Delete, Param, Req, BadRequestException, NotFoundException, Sse, MessageEvent, Query } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, fromEvent } from 'rxjs';
import { map } from 'rxjs/operators';
import { CircularsService, CircularUploadFile } from './circulars.service';
import { AiService } from '../../core/ai/ai.service';
import type { FastifyRequest } from 'fastify';

@Controller('circulars')
export class CircularsController {
  constructor(
    private readonly circularsService: CircularsService,
    private readonly aiService: AiService,
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
  ) {
    return this.circularsService.findAllPaginated({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search,
      hasTasks: hasTasks === 'true'
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
