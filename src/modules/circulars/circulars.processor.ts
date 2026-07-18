import { Processor, WorkerHost } from '@nestjs/bullmq';
import * as dotenv from 'dotenv';
dotenv.config();
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';
import { StorageService } from '../../core/storage/storage.service';
import { PdfService } from '../../core/pdf/pdf.service';
import { AiService } from '../../core/ai/ai.service';
import { DatabaseService } from '../../core/database/database.service';

@Processor('circulars', { 
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '1', 10),
  prefix: process.env.BULL_PREFIX || 'bull'
})
export class CircularsProcessor extends WorkerHost {
  private readonly logger = new Logger(CircularsProcessor.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly pdfService: PdfService,
    private readonly aiService: AiService,
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    // In local development (ENABLE_SCRAPER=false), skip all jobs to avoid
    // consuming from the shared production Redis queue.
    if (process.env.ENABLE_SCRAPER === 'false') {
      this.logger.warn(`[CircularsProcessor] ENABLE_SCRAPER=false — skipping job ${job.name} (ID: ${job.id}) in dev mode.`);
      return;
    }
    this.logger.log(`[CircularsProcessor] Received job: ${job.name} (Job ID: ${job.id})`);
    try {
      if (job.name === 'processCircularFiles') {
        return await this.processCircularFiles(job.data);
      }
      // Default: 'processCircular' — scraped circulars with a single pdf_url
      return await this.processCircular(job.data);
    } catch (err) {
      this.logger.error(`[CircularsProcessor] Job ${job.name} (ID: ${job.id}) failed with error`, err);
      throw err;
    }
  }

  // ─── Handler: manual upload (multiple files by MinIO URL) ───────────────────
  private async processCircularFiles(data: { circularId: number; fileUrls: string[] }): Promise<void> {
    this.logger.log(`[CircularsProcessor] processCircularFiles started for Circular ID: ${data.circularId}, Files: ${data.fileUrls.length}`);
    
    // Check if withdrawn
    const circularData = await this.db.query(`SELECT is_withdrawn FROM circular WHERE id = $1`, [data.circularId]);
    if (circularData.rows[0]?.is_withdrawn) {
      this.logger.log(`[CircularsProcessor] Circular ${data.circularId} is withdrawn. Skipping AI extraction.`);
      await this.logProgress(data.circularId, 'COMPLETED', `Circular is withdrawn. No tasks will be created.`);
      return;
    }

    await this.logProgress(data.circularId, 'PROCESSING', `Starting to process ${data.fileUrls.length} file(s)`);
    let savedCount = 0;
    let allExtractedText = '';

    for (const fileUrl of data.fileUrls) {
      const fileName = fileUrl.split('/').pop()!;
      try {
        this.logger.log(`[CircularsProcessor] Processing file: ${fileName}`);
        await this.logProgress(data.circularId, 'PROCESSING', `Downloading ${fileName}...`);
        
        const buffer = await this.downloadFile(fileUrl);
        this.logger.log(`[CircularsProcessor] Downloaded ${fileName} (${buffer.length} bytes)`);

        await this.logProgress(data.circularId, 'PROCESSING', `Extracting OCR text from ${fileName}...`);
        const text = await this.pdfService.extractText(buffer);
        allExtractedText += '\n' + text;
        this.logger.log(`[CircularsProcessor] Extracted ${text.length} characters of text from ${fileName}`);
        
        if (text.length < 50) {
           this.logger.warn(`[CircularsProcessor] Extracted text is unusually short (${text.length} chars). Maybe OCR failed or PDF is image-only?`);
        }

        await this.logProgress(data.circularId, 'PROCESSING', `Querying LLM to extract tasks from ${fileName}...`);
        const startTime = performance.now();
        const extractedData = await this.aiService.extractTasksFromText(text, data.circularId);
        const tasks = extractedData.tasks || [];
        const processingTimeMs = Math.round(performance.now() - startTime);

        this.logger.log(`[CircularsProcessor] AI extracted metadata and ${tasks.length} tasks from ${fileName} in ${processingTimeMs}ms`);
        await this.logProgress(data.circularId, 'PROCESSING', `Found metadata and ${tasks.length} tasks in ${fileName}`);

        let extractedTitle = extractedData.title || null;
        let extractedDesc = extractedData.description || null;

        // Fallback: If title is missing/null but description is a short title-like string, use description as title
        if (!extractedTitle && extractedDesc && extractedDesc.length < 180) {
          this.logger.log(`[Fallback] Title is null but description is short (${extractedDesc.length} chars). Using description as title.`);
          extractedTitle = extractedDesc;
        }

        await this.db.query(
          `UPDATE circular SET 
            reference_no = COALESCE($1, reference_no), 
            priority = COALESCE($2, priority),
            circular_type = COALESCE($3, circular_type),
            description = COALESCE($4, description),
            is_penalty_applicable = COALESCE($5, is_penalty_applicable),
            penalty_amount = COALESCE($6, penalty_amount),
            penalty_description = COALESCE($7, penalty_description),
            title = COALESCE($8, title),
            published_date = COALESCE($10, published_date)
           WHERE id = $9`,
          [
            extractedData.reference_no || (extractedData as any).referenceNo || null,
            extractedData.priority,
            extractedData.circular_type,
            extractedDesc || 'Automated scrape from RBI website',
            extractedData.is_penalty_applicable,
            extractedData.penalty_amount,
            extractedData.penalty_description,
            extractedTitle || null,
            data.circularId,
            extractedData.published_date || null
          ]
        );
        
        await this.db.query(
          `UPDATE circular_file SET processing_time_ms = $1 WHERE circular_id = $2 AND file_name = $3`,
          [processingTimeMs, data.circularId, fileName]
        );
        await this.logProgress(data.circularId, 'PROCESSING', `Completed processing file ${fileName} (Time taken: ${processingTimeMs}ms)`);

        // Generate tasks automatically through AI
        for (const task of tasks) {
          if (await this.saveTask(data.circularId, task.description)) savedCount++;
        }
      } catch (err: any) {
        this.logger.error(`[CircularsProcessor] Error processing file ${fileName}`, err);
        await this.logProgress(data.circularId, 'PROCESSING', `Failed to process file ${fileName}: ${err.message}`);
        // Continue with remaining files — one bad file should not abort the whole job
      }
    }

    // ── Amendment Detection ──────────────────────────────────────────────────
    if (allExtractedText.trim().length > 50) {
      await this.logProgress(data.circularId, 'PROCESSING', `🔍 Checking if this circular is an amendment...`);
      try {
        const amendmentResult = await this.aiService.detectAmendment(allExtractedText);

        if (amendmentResult.isAmendment) {
          await this.logProgress(data.circularId, 'PROCESSING',
            `✏️ Amendment detected. Looking for original circular(s)...\nNotes: ${amendmentResult.notes || 'N/A'}`
          );

          let foundCount = 0;
          let notFoundCount = 0;
          const refs = amendmentResult.originalReferences || [];
          
          for (const ref of refs) {
            // Try to find the original circular
            const originalCircular = await this.findOriginalCircular(
              ref.referenceNo,
              ref.title,
              data.circularId
            );

            if (originalCircular) {
              // Link them in circular_amendment table
              await this.db.query(
                `INSERT INTO circular_amendment (original_circular_id, amendment_circular_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [originalCircular.id, data.circularId]
              );
              foundCount++;
              await this.logProgress(data.circularId, 'PROCESSING',
                `✅ Amendment linked to original circular #${originalCircular.id}: "${originalCircular.title}"`
              );
            } else {
              notFoundCount++;
              await this.logProgress(data.circularId, 'PROCESSING',
                `⚠️ Original circular NOT found for Reference: ${ref.referenceNo || 'N/A'}, Title: ${ref.title || 'N/A'}`
              );
            }
          }

          if (foundCount > 0) {
            // Mark this circular as an amendment
            await this.db.query(
              `UPDATE circular SET circular_nature = 'AMENDMENT', amendment_notes = $1 WHERE id = $2`,
              [amendmentResult.notes || null, data.circularId]
            );
          } else {
            // No originals found
            await this.db.query(
              `UPDATE circular SET circular_nature = 'AMENDMENT_NOT_FOUND', amendment_notes = $1 WHERE id = $2`,
              [amendmentResult.notes || null, data.circularId]
            );
          }
        } else {
          await this.logProgress(data.circularId, 'PROCESSING', `✅ Circular is original (not an amendment).`);
        }
      } catch (amendErr: any) {
        this.logger.warn(`[CircularsProcessor] Amendment detection failed: ${amendErr.message}`);
        await this.logProgress(data.circularId, 'PROCESSING', `⚠️ Amendment detection skipped: ${amendErr.message}`);
      }
    }

    this.logger.log(`[CircularsProcessor] processCircularFiles finished. Saved ${savedCount} tasks total.`);
    await this.logProgress(data.circularId, 'COMPLETED', `Finished processing. ${savedCount} task(s) saved.`);
  }

  /**
   * Find the original circular being amended — pure SQL, zero vectors, zero AI calls.
   *
   * Tier 1: Exact match on reference_no (most reliable for regulatory circulars)
   * Tier 2: Normalized ref-number pattern match (handles spacing/formatting differences)
   * Tier 3: PostgreSQL full-text search on title (built-in, free, fast)
   */
  private async findOriginalCircular(
    refNo?: string,
    title?: string,
    excludeId?: number
  ): Promise<{ id: number; title: string } | null> {
    const exclude = excludeId ?? 0;

    // ── Tier 1: Exact reference_no match ──────────────────────────────────────
    if (refNo) {
      const exactResult = await this.db.query(
        `SELECT id, title FROM circular
         WHERE LOWER(REPLACE(reference_no, ' ', '')) = LOWER(REPLACE($1, ' ', ''))
           AND id != $2
         LIMIT 1`,
        [refNo.trim(), exclude]
      );
      if (exactResult.rows.length > 0) {
        this.logger.log(`[findOriginalCircular] Tier1 hit: #${exactResult.rows[0].id}`);
        return exactResult.rows[0];
      }

      // ── Tier 2: Partial reference_no match (handles truncated refs) ──────────
      // e.g. "RBI/2025-26/150" stored as "RBI/2025-26/150/DOR.RET.REC..." still matches
      const partialResult = await this.db.query(
        `SELECT id, title FROM circular
         WHERE reference_no ILIKE $1
           AND id != $2
         ORDER BY published_date DESC
         LIMIT 1`,
        [`%${refNo.trim().replace(/[\/\-]/g, '%')}%`, exclude]
      );
      if (partialResult.rows.length > 0) {
        this.logger.log(`[findOriginalCircular] Tier2 hit: #${partialResult.rows[0].id}`);
        return partialResult.rows[0];
      }
    }

    // ── Tier 3: PostgreSQL full-text search on title ───────────────────────────
    // Strip amendment-specific words, then use ts_query for relevance ranking
    if (title) {
      const cleanWords = title
        .replace(/\b(amendment|amending|amend|directions|circular|guidelines|master|rbi|dated|january|february|march|april|may|june|july|august|september|october|november|december|\d{4})\b/gi, '')
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (cleanWords.length > 3) {
        const tsQuery = cleanWords.split(' ')
          .filter(w => w.length > 2)
          .slice(0, 6)
          .join(' & ');

        const ftsResult = await this.db.query(
          `SELECT id, title,
                  ts_rank(to_tsvector('english', title), to_tsquery('english', $1)) AS rank
           FROM circular
           WHERE to_tsvector('english', title) @@ to_tsquery('english', $1)
             AND id != $2
           ORDER BY rank DESC, published_date DESC
           LIMIT 1`,
          [tsQuery, exclude]
        );
        if (ftsResult.rows.length > 0) {
          this.logger.log(`[findOriginalCircular] Tier3 FTS hit: #${ftsResult.rows[0].id}`);
          return ftsResult.rows[0];
        }
      }
    }

    return null;
  }

  // ─── Handler: scraper pipeline (single circular with pdf_url) ───────────────
  private async processCircular(circular: any): Promise<void> {
    await this.logProgress(circular.id, 'PROCESSING', `Starting scraper pipeline for circular: ${circular.title}`);

    // Check if withdrawn
    const circularData = await this.db.query(`SELECT is_withdrawn FROM circular WHERE id = $1`, [circular.id]);
    if (circularData.rows[0]?.is_withdrawn) {
      this.logger.log(`[CircularsProcessor] Circular ${circular.id} is withdrawn. Skipping AI extraction.`);
      await this.logProgress(circular.id, 'COMPLETED', `Circular is withdrawn. No tasks will be created.`);
      return;
    }

    try {
      await this.logProgress(circular.id, 'PROCESSING', `Downloading PDF...`);
      const buffer = await this.downloadFile(circular.pdf_url);

      await this.logProgress(circular.id, 'PROCESSING', `Extracting text...`);
      const text = await this.pdfService.extractText(buffer);

      await this.logProgress(circular.id, 'PROCESSING', `Extracting tasks via Qwen...`);
      const extractedData = await this.aiService.extractTasksFromText(text);
      const tasks = extractedData.tasks || [];
      await this.logProgress(circular.id, 'PROCESSING', `Found metadata and ${tasks.length} tasks`);

      let extractedTitle = extractedData.title || null;
      let extractedDesc = extractedData.description || null;

      // Fallback: If title is missing/null but description is a short title-like string, use description as title
      if (!extractedTitle && extractedDesc && extractedDesc.length < 180) {
        this.logger.log(`[Fallback] Title is null but description is short (${extractedDesc.length} chars). Using description as title.`);
        extractedTitle = extractedDesc;
      }

      await this.db.query(
        `UPDATE circular SET 
          reference_no = COALESCE($1, reference_no), 
          priority = COALESCE($2, priority),
          circular_type = COALESCE($3, circular_type),
          description = COALESCE($4, description),
          is_penalty_applicable = COALESCE($5, is_penalty_applicable),
          penalty_amount = COALESCE($6, penalty_amount),
          penalty_description = COALESCE($7, penalty_description),
          title = COALESCE($8, title),
          published_date = COALESCE($10, published_date)
         WHERE id = $9`,
        [
          extractedData.reference_no || (extractedData as any).referenceNo || null,
          extractedData.priority,
          extractedData.circular_type,
          extractedDesc || 'Automated scrape from RBI website',
          extractedData.is_penalty_applicable,
          extractedData.penalty_amount,
          extractedData.penalty_description,
          extractedTitle || null,
          circular.id,
          extractedData.published_date || null
        ]
      );

      // Generate tasks automatically through AI
      let savedCount = 0;
      for (const task of tasks) {
        if (await this.saveTask(circular.id, task.description)) savedCount++;
      }

      await this.logProgress(circular.id, 'COMPLETED', `Finished circular processing: AI metadata updated and ${savedCount} tasks generated successfully`);
    } catch (error: any) {
      await this.logProgress(circular.id, 'FAILED', `Processing failed: ${error.message}`);
      throw error; // rethrow so BullMQ retries the job
    }
  }

  // ─── Shared helpers ──────────────────────────────────────────────────────────

  private async logProgress(circularId: number, status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED', message: string): Promise<void> {
    this.logger.log(`[Circular ${circularId}] ${status}: ${message}`);
    
    // Broadcast immediately to SSE listeners
    this.eventEmitter.emit(`ai.stream.${circularId}`, { status, message });
    
    // Log history
    await this.db.query(
      `INSERT INTO circular_log (circular_id, status, message) VALUES ($1, $2, $3)`,
      [circularId, status, message]
    );

    // Always update the overall status during transitions
    await this.db.query(
      `UPDATE circular SET ai_processing_status = $1 WHERE id = $2`,
      [status, circularId]
    );
  }

  private async downloadFile(fileUrl: string): Promise<Buffer> {
    const stream = await this.storageService.getFileStream(fileUrl);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  private async saveTask(circularId: number, rawDescription: string | undefined): Promise<boolean> {
    const description = rawDescription?.trim();
    if (!description) return false;

    try {
      const embedding = await this.aiService.generateEmbedding(description);
      const embeddingString = `[${embedding.join(',')}]`;

      const discardedIds = await this.aiService.detectAndFlagAmendments(description, embedding);
      if (discardedIds.length > 0) {
        await this.db.query(
          `UPDATE compliance_task SET is_discarded = TRUE, status = 'DISCARDED' WHERE id = ANY($1::int[])`,
          [discardedIds],
        );
        this.logger.log(`Discarded superseded tasks: [${discardedIds.join(', ')}]`);
      }

      await this.db.query(
        `INSERT INTO compliance_task (circular_id, description, status, embedding)
         VALUES ($1, $2, 'PENDING', $3)`,
        [circularId, description, embeddingString],
      );
      return true;
    } catch (taskErr: any) {
      // Embedding failed — save task without vector so it's not lost
      this.logger.warn(`Saving task without embedding (${taskErr.message}): ${description.substring(0, 60)}`);
      try {
        await this.db.query(
          `INSERT INTO compliance_task (circular_id, description, status)
           VALUES ($1, $2, 'PENDING')`,
          [circularId, description],
        );
        return true;
      } catch (saveErr: any) {
        this.logger.error(`Failed to save task: ${saveErr.message}`);
        return false;
      }
    }
  }
}
