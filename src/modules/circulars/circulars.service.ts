import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';
import { StorageService } from '../../core/storage/storage.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface CircularUploadFile {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

@Injectable()
export class CircularsService {
  private readonly logger = new Logger(CircularsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storageService: StorageService,
    @InjectQueue('circulars') private readonly circularsQueue: Queue
  ) { }

  async create(input: {
    authority_id: number;
    reference_no?: string;
    title: string;
    published_date: string;
    priority?: string;
    circular_type?: number;
    description?: string;
    portal_website?: string;
    is_penalty_applicable?: boolean;
    penalty_amount?: number | null;
    penalty_description?: string;
    pdf_url?: string | null;
    is_withdrawn?: boolean;
    is_applicable?: boolean;
    is_active?: boolean;
  }, options: { emitProcessing?: boolean } = { emitProcessing: true }) {
    const query = `
      INSERT INTO circular (
        authority_id,
        reference_no,
        title,
        published_date,
        priority,
        circular_type,
        description,
        portal_website,
        is_penalty_applicable,
        penalty_amount,
        penalty_description,
        pdf_url,
        is_withdrawn,
        is_applicable,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;
    const result = await this.db.query(query, [
      input.authority_id,
      input.reference_no || null,
      input.title,
      input.published_date,
      input.priority || 'General',
      input.circular_type ?? 6,
      input.description || null,
      input.portal_website || null,
      input.is_penalty_applicable ?? false,
      input.penalty_amount ?? null,
      input.penalty_description || null,
      input.pdf_url || null,
      input.is_withdrawn ?? false,
      input.is_applicable ?? true,
      input.is_active ?? true,
    ]);
    const circular = result.rows[0];

    // Trigger async job to process the PDF and extract tasks
    if (options.emitProcessing !== false && circular.pdf_url) {
      await this.circularsQueue.add('processCircular', circular);
    }

    return circular;
  }

  async createWithFiles(input: {
    authority_id: number;
    reference_no?: string;
    title: string;
    published_date: string;
    priority?: string;
    circular_type?: number;
    description?: string;
    portal_website?: string;
    is_penalty_applicable?: boolean;
    penalty_amount?: number | null;
    penalty_description?: string;
    is_withdrawn?: boolean;
    is_applicable?: boolean;
    is_active?: boolean;
  }, files: CircularUploadFile[]) {
    this.logger.log(`[createWithFiles] Started for title: ${input.title} with ${files.length} files`);

    // 1. Upload all files to MinIO (fast — just storage, no OCR/AI)
    const storedFiles: { file_name: string; file_url: string; mime_type: string }[] = [];

    for (const file of files) {
      this.logger.log(`[createWithFiles] Uploading file to MinIO: ${file.filename} (${file.buffer.length} bytes)`);
      try {
        const fileUrl = await this.storageService.uploadFile(file.buffer, file.filename, file.mimetype, input.published_date);
        this.logger.log(`[createWithFiles] Successfully uploaded ${file.filename} -> ${fileUrl}`);
        storedFiles.push({
          file_name: file.filename,
          file_url: fileUrl,
          mime_type: file.mimetype,
        });
      } catch (err) {
        this.logger.error(`[createWithFiles] Failed to upload ${file.filename} to MinIO`, err);
        throw err;
      }
    }

    // 2. Insert circular record with first file as pdf_url
    this.logger.log(`[createWithFiles] Creating circular record in DB...`);
    const circular = await this.create({
      ...input,
      pdf_url: storedFiles[0]?.file_url || null,
    }, { emitProcessing: false });
    this.logger.log(`[createWithFiles] Circular record created with ID: ${circular.id}`);

    // 3. Insert circular_file join records
    if (storedFiles.length > 0) {
      this.logger.log(`[createWithFiles] Inserting ${storedFiles.length} file records into circular_file...`);
      for (const file of storedFiles) {
        await this.db.query(
          `INSERT INTO circular_file (circular_id, file_name, file_url, mime_type)
           VALUES ($1, $2, $3, $4)`,
          [circular.id, file.file_name, file.file_url, file.mime_type],
        );
      }
    }

    // 4. Enqueue async BullMQ job — OCR + AI runs in background, not blocking HTTP
    if (storedFiles.length > 0) {
      this.logger.log(`[createWithFiles] Enqueueing BullMQ processCircularFiles job for circular ${circular.id}`);
      try {
        await this.circularsQueue.add('processCircularFiles', {
          circularId: circular.id,
          fileUrls: storedFiles.map(f => f.file_url),
        });
        this.logger.log(`[createWithFiles] Successfully enqueued processCircularFiles job`);
      } catch (err) {
        this.logger.error(`[createWithFiles] Failed to enqueue BullMQ job`, err);
        throw err;
      }
    } else {
      this.logger.warn(`[createWithFiles] No files to process. Skipping AI extraction queue.`);
    }

    return {
      ...circular,
      files: storedFiles,
      task_count: 0,                                              // tasks extracted asynchronously
      ai_processing_status: storedFiles.length > 0 ? 'QUEUED' : 'SKIPPED',
    };
  }



  async findAll() {
    const query = `
      SELECT 
        c.*,
        a.name as authority_name,
        CASE c.circular_type
          WHEN 1 THEN 'Regulatory & Statutory Compliance'
          WHEN 2 THEN 'Supervisory Compliance'
          WHEN 3 THEN 'Compliances to Advisories'
          WHEN 4 THEN 'Compliances to Custom Requirements'
          WHEN 5 THEN 'Compliances to Policy Guidelines, SOPs'
          WHEN 6 THEN 'General Compliances'
          ELSE 'General Compliances'
        END as circular_type_name
      FROM circular c
      LEFT JOIN authority a ON c.authority_id = a.id
      ORDER BY c.id DESC
    `;
    const result = await this.db.query(query);
    return result.rows;
  }

  async findAllPaginated(params: {
    page: number;
    limit: number;
    search?: string;
    hasTasks?: boolean;
    authority_id?: number;
    is_active?: boolean;
    is_applicable?: boolean;
    startDate?: string;
    endDate?: string;
  }) {
    const { page, limit, search, hasTasks } = params;
    const offset = (page - 1) * limit;

    let conditions = ['1=1'];
    const values: any[] = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(c.title ILIKE $${paramIndex} OR c.description ILIKE $${paramIndex} OR a.name ILIKE $${paramIndex} OR c.reference_no ILIKE $${paramIndex})`);
      values.push(`%${search}%`);
      paramIndex++;
    }

    if (hasTasks) {
      conditions.push(`EXISTS (SELECT 1 FROM compliance_task ct WHERE ct.circular_id = c.id)`);
    }

    if (params.authority_id) {
      conditions.push(`c.authority_id = $${paramIndex}`);
      values.push(params.authority_id);
      paramIndex++;
    }

    if (params.startDate) {
      conditions.push(`c.published_date >= $${paramIndex}`);
      values.push(params.startDate);
      paramIndex++;
    }

    if (params.endDate) {
      conditions.push(`c.published_date <= $${paramIndex}`);
      values.push(params.endDate);
      paramIndex++;
    }

    if (params.is_active !== undefined) {
      conditions.push(`c.is_active = $${paramIndex}`);
      values.push(params.is_active);
      paramIndex++;
    }

    if (params.is_applicable !== undefined) {
      conditions.push(`c.is_applicable = $${paramIndex}`);
      values.push(params.is_applicable);
      paramIndex++;
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*)
      FROM circular c
      LEFT JOIN authority a ON c.authority_id = a.id
      ${whereClause}
    `;
    const countResult = await this.db.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count, 10);

    const query = `
      SELECT 
        c.*,
        a.name as authority_name,
        CASE c.circular_type
          WHEN 1 THEN 'Regulatory & Statutory Compliance'
          WHEN 2 THEN 'Supervisory Compliance'
          WHEN 3 THEN 'Compliances to Advisories'
          WHEN 4 THEN 'Compliances to Custom Requirements'
          WHEN 5 THEN 'Compliances to Policy Guidelines, SOPs'
          WHEN 6 THEN 'General Compliances'
          ELSE 'General Compliances'
        END as circular_type_name
      FROM circular c
      LEFT JOIN authority a ON c.authority_id = a.id
      ${whereClause}
      ORDER BY CASE WHEN c.ai_processing_status = 'COMPLETED' THEN 1 ELSE 2 END ASC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    values.push(limit, offset);
    const result = await this.db.query(query, values);

    return {
      data: result.rows,
      total,
      page,
      limit
    };
  }

  async findOne(id: number) {
    const query = `
      SELECT 
        c.*,
        a.name as authority_name,
        CASE c.circular_type
          WHEN 1 THEN 'Regulatory & Statutory Compliance'
          WHEN 2 THEN 'Supervisory Compliance'
          WHEN 3 THEN 'Compliances to Advisories'
          WHEN 4 THEN 'Compliances to Custom Requirements'
          WHEN 5 THEN 'Compliances to Policy Guidelines, SOPs'
          WHEN 6 THEN 'General Compliances'
          ELSE 'General Compliances'
        END as circular_type_name
      FROM circular c
      LEFT JOIN authority a ON c.authority_id = a.id
      WHERE c.id = $1
    `;
    const result = await this.db.query(query, [id]);
    return result.rows[0];
  }

  async getTasksForCircular(circularId: number) {
    const query = `
      SELECT * FROM compliance_task WHERE circular_id = $1
    `;
    const result = await this.db.query(query, [circularId]);
    return result.rows;
  }

  async getLogsForCircular(circularId: number) {
    const query = `
      SELECT * FROM circular_log 
      WHERE circular_id = $1 
      ORDER BY created_at ASC
    `;
    const result = await this.db.query(query, [circularId]);
    return result.rows;
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM circular WHERE id = $1 RETURNING id`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Returns the full amendment chain for any circular (original or amendment).
   * Resolves the root original first, then fetches all its amendments.
   */
  async getAmendmentChain(id: number) {
    // Step 1: Walk UP the chain to find the root original
    let rootId = id;
    const visited = new Set<number>();
    while (true) {
      if (visited.has(rootId)) break;
      visited.add(rootId);
      const parentResult = await this.db.query(
        `SELECT original_circular_id FROM circular_amendment WHERE amendment_circular_id = $1 LIMIT 1`,
        [rootId]
      );
      if (parentResult.rows.length === 0) break;
      rootId = parentResult.rows[0].original_circular_id;
    }

    // Step 2: Fetch the root circular
    const rootResult = await this.db.query(
      `SELECT id, title, reference_no, published_date, circular_nature, amendment_notes, ai_processing_status, pdf_url
       FROM circular WHERE id = $1`,
      [rootId]
    );
    const original = rootResult.rows[0] || null;

    // Step 3: Fetch all amendments of this root (recursively via WITH RECURSIVE)
    const amendmentsResult = await this.db.query(
      `WITH RECURSIVE chain AS (
         SELECT ca.amendment_circular_id, 1 AS depth
         FROM circular_amendment ca
         WHERE ca.original_circular_id = $1
         UNION ALL
         SELECT ca2.amendment_circular_id, chain.depth + 1
         FROM circular_amendment ca2
         JOIN chain ON chain.amendment_circular_id = ca2.original_circular_id
       )
       SELECT c.id, c.title, c.reference_no, c.published_date,
              c.circular_nature, c.amendment_notes, c.ai_processing_status, c.pdf_url,
              ch.depth
       FROM chain ch
       JOIN circular c ON c.id = ch.amendment_circular_id
       ORDER BY ch.depth ASC, c.published_date ASC`,
      [rootId]
    );

    return {
      original,
      amendments: amendmentsResult.rows,
      isOriginal: rootId === id,
    };
  }

  async update(id: number, input: {
    authority_id?: number;
    reference_no?: string | null;
    title?: string;
    published_date?: string;
    priority?: string;
    circular_type?: number;
    description?: string | null;
    portal_website?: string | null;
    is_penalty_applicable?: boolean;
    penalty_amount?: number | null;
    penalty_description?: string | null;
    is_withdrawn?: boolean;
    is_applicable?: boolean;
    is_active?: boolean;
  }) {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      return this.findOne(id);
    }

    values.push(id);
    const query = `
      UPDATE circular 
      SET ${fields.join(', ')} 
      WHERE id = $${paramIndex} 
      RETURNING *
    `;
    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async reprocessAll(): Promise<{ success: boolean; message: string }> {
    const circulars = await this.findAll();
    let count = 0;
    for (const c of circulars) {
      const filesResult = await this.db.query(
        `SELECT file_url FROM circular_file WHERE circular_id = $1`,
        [c.id]
      );
      const fileUrls = filesResult.rows.map(f => f.file_url);
      if (fileUrls.length > 0) {
        await this.circularsQueue.add('processCircularFiles', {
          circularId: c.id,
          fileUrls,
        });

        // Reset processing status back to QUEUED
        await this.db.query(
          `UPDATE circular SET ai_processing_status = 'QUEUED' WHERE id = $1`,
          [c.id]
        );
        count++;
      }
    }
    return { success: true, message: `Enqueued re-processing jobs for ${count} circular(s).` };
  }

  async reprocessSingle(id: number): Promise<{ success: boolean; message: string }> {
    const filesResult = await this.db.query(
      `SELECT file_url FROM circular_file WHERE circular_id = $1`,
      [id]
    );
    const fileUrls = filesResult.rows.map(f => f.file_url);
    if (fileUrls.length > 0) {
      await this.circularsQueue.add(
        'processCircularFiles',
        { circularId: id, fileUrls },
        { priority: 1 }
      );

      // Reset processing status back to QUEUED
      await this.db.query(
        `UPDATE circular SET ai_processing_status = 'QUEUED' WHERE id = $1`,
        [id]
      );
      return { success: true, message: `Enqueued high-priority re-processing job for circular ${id}.` };
    }
    return { success: false, message: `No files found for circular ${id}.` };
  }
}
