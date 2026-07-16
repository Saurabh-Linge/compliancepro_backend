import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { PdfService } from '../pdf/pdf.service';
import * as fs from 'fs';
import * as path from 'path';

export interface ExtractedTask {
  description: string;
}

export interface ExtractedData {
  reference_no: string | null;
  title?: string | null;
  published_date?: string | null;
  priority: string;
  circular_type: number | null;
  description: string;
  is_penalty_applicable: boolean;
  penalty_amount: number | null;
  penalty_description: string | null;
  tasks: ExtractedTask[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private ollamaUrl: string;
  private embedModelName: string;

  private provider: string;
  private baseUrl: string;
  private apiKey: string;
  private modelName: string;

  constructor(
    private configService: ConfigService,
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
    private readonly pdfService: PdfService,
  ) {
    this.ollamaUrl = this.configService.get('OLLAMA_URL', 'http://localhost:11434');
    this.embedModelName = this.configService.get('OLLAMA_EMBED_MODEL', 'nomic-embed-text');

    this.provider = this.configService.get('AI_PROVIDER', 'ollama').toLowerCase();
    
    if (this.provider === 'groq') {
      this.baseUrl = 'https://api.groq.com/openai/v1';
      this.apiKey = this.configService.get('GROQ_API_KEY', '');
      this.modelName = this.configService.get('AI_MODEL', 'llama-3.1-8b-instant');
    } else {
      this.baseUrl = `${this.ollamaUrl}/v1`;
      this.apiKey = 'ollama'; // Ollama doesn't require an API key, but we send a dummy one
      this.modelName = this.configService.get('AI_MODEL', 'llama3');
    }
  }

  private async fetchWithRetry(url: string, options: any, retries = 3): Promise<Response> {
    for (let i = 0; i < retries; i++) {
      const response = await fetch(url, options);
      if (response.status === 429) {
        const errorText = await response.clone().text();
        let waitTime = 3000;
        // Try to parse wait time from groq error e.g. "Please try again in 3.04s."
        const match = errorText.match(/in ([\d.]+)s/);
        if (match && match[1]) {
          waitTime = parseFloat(match[1]) * 1000 + 500; // Add 500ms buffer
        } else {
          waitTime = waitTime * Math.pow(2, i); // Exponential backoff fallback
        }
        this.logger.warn(`Rate limit hit (429). Retrying in ${Math.round(waitTime)}ms... (Attempt ${i + 1}/${retries})`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }
      return response;
    }
    return fetch(url, options); // Final attempt
  }

  // ─── Task Extraction ────────────────────────────────────────────────────────

  async extractTasksFromText(text: string, circularId?: number): Promise<ExtractedData> {
    const messages = [
      {
        role: 'system',
        content: `You are a compliance analyst. Read the following regulatory circular and extract metadata and actionable compliance tasks.
IMPORTANT: This includes any regulatory amendments, rule changes, procedural updates, or new guidelines that a bank or organization must review or implement.

Return ONLY a valid JSON object matching this exact schema:
{
  "reference_no": "string (The official circular reference number, e.g. RBI/2023-24/123 or DOR.ACC.REC.102/21.04.018/2025-26. Look closely at the header and first page, do not return null if a reference number is mentioned) or null",
  "title": "string (The official name/subject of the circular, e.g. Information Technology Governance in Banks. Do not return null if a title is mentioned) or null",
  "published_date": "string (The official publication date from the circular in YYYY-MM-DD format, e.g. 2026-06-24. Look at the header or near the reference number) or null",
  "priority": "High, Medium, or General",
  "circular_type": null,
  "description": "A short 1-2 sentence summary of the circular",
  "is_penalty_applicable": boolean,
  "penalty_amount": number (or null),
  "penalty_description": "string (or null)",
  "tasks": [
    { "description": "task 1" }
  ]
}
No explanation, no markdown, no extra text. Only the JSON object.`,
      },
      {
        role: 'user',
        content: `Circular Text:\n${text.substring(0, 10000)}\n\nJSON:`,
      },
    ];

    console.log(`[AI STAGE 1] Preparing to call ${this.provider.toUpperCase()} /chat/completions (stream: true)...`);
    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.modelName,
          messages,
          response_format: { type: 'json_object' },
          stream: true,
          temperature: 0.1,
        }),
      });

      console.log(`[AI STAGE 2] Received response from ${this.provider}. Status: ${response.status}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${this.provider} API error: ${response.statusText} - ${errorText}`);
      }

      if (circularId) {
        const promptLogMsg = `Sending prompt to Groq AI:\n\nSYSTEM: ${messages[0].content}\n\nUSER: ${messages[1].content}`;
        await this.db.query(
          `INSERT INTO circular_log (circular_id, status, message) VALUES ($1, $2, $3)`,
          [circularId, 'PROCESSING', promptLogMsg]
        );
        this.eventEmitter.emit(`ai.stream.${circularId}`, { status: 'PROCESSING', message: promptLogMsg });
        this.eventEmitter.emit(`ai.stream.${circularId}`, { status: 'START' });
      }

      const reader = (response as any).body?.getReader();
      if (!reader) throw new Error('No stream reader available');

      const decoder = new TextDecoder();
      let fullThinking = ''; 
      let fullContent = '';
      let lineBuffer = '';

      console.log(`[AI STAGE 3] Streaming chunks from ${this.provider}...`);

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('[AI STAGE 4] Stream complete.');
          break;
        }

        lineBuffer += decoder.decode(value, { stream: true });

        let newlineIndex;
        while ((newlineIndex = lineBuffer.indexOf('\n')) !== -1) {
          let line = lineBuffer.slice(0, newlineIndex).trim();
          lineBuffer = lineBuffer.slice(newlineIndex + 1);
          
          if (!line) continue;
          if (line.startsWith('data: ')) {
             line = line.substring(6);
          }
          if (line === '[DONE]') continue;

          try {
            const chunk = JSON.parse(line);
            const contentToken: string = chunk.choices?.[0]?.delta?.content || '';

            if (contentToken) {
              fullContent += contentToken;
              if (circularId) {
                // Broadcast content tokens (the actual JSON being generated)
                this.eventEmitter.emit(`ai.stream.${circularId}`, { chunk: contentToken });
              }
            }
          } catch (e) {
            // Ignore malformed chunk lines
          }
        }
      }

      // Flush any remaining buffer
      if (lineBuffer.trim()) {
        try {
          const chunk = JSON.parse(lineBuffer.trim());
          const contentToken: string = chunk.message?.content || '';
          if (contentToken) fullContent += contentToken;
        } catch (_) {}
      }

      if (circularId) {
        // Save thinking chain to DB so it shows in the permanent logs
        if (fullThinking.trim()) {
          await this.db.query(
            `INSERT INTO circular_log (circular_id, status, message) VALUES ($1, $2, $3)`,
            [circularId, 'PROCESSING', `🧠 AI Chain of Thought:\n${fullThinking.trim()}`]
          );
          this.eventEmitter.emit(`ai.stream.${circularId}`, {
            status: 'PROCESSING',
            message: `🧠 AI Chain of Thought:\n${fullThinking.trim()}`
          });
        }
        // Save final AI output to DB
        if (fullContent.trim()) {
          await this.db.query(
            `INSERT INTO circular_log (circular_id, status, message) VALUES ($1, $2, $3)`,
            [circularId, 'PROCESSING', `📤 AI Output:\n${fullContent.trim()}`]
          );
          this.eventEmitter.emit(`ai.stream.${circularId}`, {
            status: 'PROCESSING',
            message: `📤 AI Output:\n${fullContent.trim()}`
          });
        }
        this.eventEmitter.emit(`ai.stream.${circularId}`, { status: 'END' });
      }

      console.log('\n\n--- RAW THINKING START ---');
      console.log(fullThinking);
      console.log('--- RAW THINKING END ---');
      console.log('\n--- RAW CONTENT START ---');
      console.log(fullContent);
      console.log('--- RAW CONTENT END ---\n\n');

      console.log('[AI STAGE 5] Extracting JSON from content...');
      let jsonToParse = fullContent.trim();

      // Strip markdown code blocks if model added them
      const markdownMatch = jsonToParse.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (markdownMatch) {
        console.log('[AI DEBUG] Markdown block found.');
        jsonToParse = markdownMatch[1].trim();
      } else {
        // Fallback: find the first { ... } block
        const firstBracket = jsonToParse.indexOf('{');
        const lastBracket = jsonToParse.lastIndexOf('}');
        if (firstBracket !== -1 && lastBracket > firstBracket) {
          console.log(`[AI DEBUG] Bracket extraction: [${firstBracket}..${lastBracket}]`);
          jsonToParse = jsonToParse.substring(firstBracket, lastBracket + 1);
        } else {
          console.log('[AI DEBUG] No valid brackets found!');
        }
      }

      console.log('[AI STAGE 6] Parsing JSON...');
      console.log(jsonToParse);

      try {
        const parsed = JSON.parse(jsonToParse);
        console.log('[AI STAGE 7] JSON parsed successfully!');
        
        return {
          reference_no: parsed.reference_no || null,
          title: parsed.title || null,
          published_date: parsed.published_date || null,
          priority: parsed.priority || 'General',
          circular_type: parsed.circular_type || null,
          description: parsed.description || '',
          is_penalty_applicable: !!parsed.is_penalty_applicable,
          penalty_amount: parsed.penalty_amount || null,
          penalty_description: parsed.penalty_description || null,
          tasks: Array.isArray(parsed.tasks) ? parsed.tasks.map((item: any) => ({ description: String(item.description || '').trim() })) : []
        };
      } catch (err) {
        console.log('[AI STAGE 7 ERROR] JSON Parse failed!');
        console.error(err);
        this.logger.error(`Failed to parse LLM JSON. Content was:\n${fullContent}`);
        if (circularId) {
          await this.db.query(
            `INSERT INTO circular_log (circular_id, status, message) VALUES ($1, $2, $3)`,
            [circularId, 'FAILED', `JSON Parse Error. AI Output:\n${fullContent.substring(0, 2000)}`]
          );
        }
        return {
          reference_no: null,
          priority: 'General',
          circular_type: null,
          description: '',
          is_penalty_applicable: false,
          penalty_amount: null,
          penalty_description: null,
          tasks: []
        };
      }
    } catch (error) {
      console.log('[AI GLOBAL ERROR]');
      console.error(error);
      this.logger.error('Failed to extract tasks from text', error);
      throw error;
    }
  }

  // ─── Amendment Detection ─────────────────────────────────────────────────────

  /**
   * Detects whether a circular is an amendment to an existing one.
   * Uses fast non-streaming call with think:false for speed.
   */
  async detectAmendment(text: string): Promise<{
    isAmendment: boolean;
    originalReferences?: { referenceNo: string; title: string }[];
    notes?: string;
  }> {
    const messages = [
      {
        role: 'system',
        content: `You are a compliance document analyst. Analyze the given regulatory circular and determine if it is an amendment or modification to previously issued circulars.
Return ONLY a valid JSON object with these fields:
{
  "isAmendment": true or false,
  "originalReferences": [
    {
      "referenceNo": "the reference number of the original circular being amended (e.g. RBI/2025-26/150)",
      "title": "the title or subject of the original circular being amended"
    }
  ],
  "notes": "brief description of what this amendment changes, or null"
}
If it is not an amendment, return an empty array for originalReferences.
No explanation, no markdown. Only the JSON object.`,
      },
      {
        role: 'user',
        content: `Circular Text:\n${text.substring(0, 4000)}`,
      },
    ];

    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.modelName,
          messages,
          response_format: { type: 'json_object' },
          stream: false,
          temperature: 0,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${this.provider} API error: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      const raw = (data.choices?.[0]?.message?.content || '').trim();

      // Extract JSON from response
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      const jsonStr = firstBrace !== -1 && lastBrace > firstBrace
        ? raw.substring(firstBrace, lastBrace + 1)
        : raw;

      const parsed = JSON.parse(jsonStr);
      const extractStr = (val: any) => {
        if (!val || val === 'null' || val === 'None' || val === 'N/A') return undefined;
        return String(val).trim();
      };
      return {
        isAmendment: !!parsed.isAmendment,
        originalReferences: Array.isArray(parsed.originalReferences) ? parsed.originalReferences : [],
        notes: extractStr(parsed.notes),
      };
    } catch (err) {
      this.logger.error('Failed to detect amendment', err);
      return { isAmendment: false };
    }
  }

  // ─── Embeddings (nomic-embed-text) ──────────────────────────────────────────

  /**
   * Generates a 768-dim embedding vector using nomic-embed-text.
   * Uses Ollama's /api/embed endpoint (v0.1.26+).
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.fetchWithRetry(`${this.ollamaUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embedModelName,
          input: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Embedding API error: ${response.statusText}`);
      }

      const data = await response.json();
      // /api/embed returns { embeddings: [[...]] }
      const vec = data.embeddings?.[0] ?? data.embedding;
      if (!vec || !Array.isArray(vec)) throw new Error('Empty embedding returned');
      return vec;
    } catch (err) {
      this.logger.error('Embedding generation failed', err);
      throw err;
    }
  }

  // ─── RAG Chat (nomic-embed-text + Qwen3) ────────────────────────────────────

  /**
   * Full RAG pipeline:
   * 1. Embed the question with nomic-embed-text
   * 2. Vector-search top-K relevant tasks via pgvector cosine distance
   * 3. Fetch circular metadata
   * 4. Ask Qwen3 with focused context → return clean answer
   */
  async chatWithCircular(circularId: number, question: string): Promise<{ thoughts: string; response: string }> {
    // ── Step 1: Embed the question ──────────────────────────────────────────
    let questionEmbedding: number[];
    let useVectorSearch = true;

    try {
      questionEmbedding = await this.generateEmbedding(question);
    } catch (err) {
      this.logger.warn('Embedding failed, falling back to full task context');
      useVectorSearch = false;
    }

    // ── Step 2: Retrieve relevant tasks ────────────────────────────────────
    let contextTasks: string[] = [];

    if (useVectorSearch) {
      try {
        const vectorStr = '[' + questionEmbedding!.join(',') + ']';
        // Use cosine distance — fetch top 8 tasks with stored embeddings
        // Fall back to non-vector rows if embedding column is null
        const vectorResult = await this.db.query(
          `SELECT description,
                  1 - (embedding <=> $1::vector) AS similarity
           FROM compliance_task
           WHERE circular_id = $2
             AND is_discarded = FALSE
             AND embedding IS NOT NULL
           ORDER BY embedding <=> $1::vector
           LIMIT 8`,
          [vectorStr, circularId],
        );

        if (vectorResult.rows.length > 0) {
          // Only keep tasks above similarity threshold (>0.3) for quality
          contextTasks = vectorResult.rows
            .filter((r: any) => r.similarity > 0.3)
            .map((r: any) => r.description);

          // If filtering removed everything, keep top 5 regardless
          if (contextTasks.length === 0) {
            contextTasks = vectorResult.rows.slice(0, 5).map((r: any) => r.description);
          }
        }
      } catch (err) {
        this.logger.warn('Vector search failed, using full task list');
        useVectorSearch = false;
      }
    }

    // If vector search unavailable or no embedded tasks, use all tasks (up to 30)
    if (!useVectorSearch || contextTasks.length === 0) {
      const fallback = await this.db.query(
        `SELECT description FROM compliance_task
         WHERE circular_id = $1 AND is_discarded = FALSE
         ORDER BY id LIMIT 30`,
        [circularId],
      );
      contextTasks = fallback.rows.map((r: any) => r.description);
    }

    // ── Step 3: Fetch circular metadata ────────────────────────────────────
    const circularResult = await this.db.query(
      `SELECT c.title, c.description, c.published_date, c.priority,
              a.name AS authority_name
       FROM circular c
       LEFT JOIN authority a ON c.authority_id = a.id
       WHERE c.id = $1`,
      [circularId],
    );
    const circ = circularResult.rows[0];
    const circularInfo = circ
      ? [
          `Title: ${circ.title}`,
          `Authority: ${circ.authority_name ?? 'N/A'}`,
          `Date: ${circ.published_date}`,
          circ.description ? `Summary: ${circ.description}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '';

    let pdfText = '';
    if (contextTasks.length === 0) {
      try {
        const fileResult = await this.db.query('SELECT file_url FROM circular_file WHERE circular_id = $1 LIMIT 1', [circularId]);
        if (fileResult.rows.length > 0) {
          const fileUrl = fileResult.rows[0].file_url;
          let cleanPath = fileUrl;
          if (fileUrl.startsWith('http')) {
            cleanPath = new URL(fileUrl).pathname;
          }
          cleanPath = cleanPath.replace(/^\/+/, '');
          const absolutePath = path.join(process.cwd(), cleanPath);
          
          if (fs.existsSync(absolutePath)) {
            const buffer = fs.readFileSync(absolutePath);
            pdfText = await this.pdfService.extractText(buffer);
            if (pdfText.length > 25000) {
              pdfText = pdfText.substring(0, 25000) + '\\n... [TRUNCATED]';
            }
          }
        }
      } catch (err) {
        this.logger.warn('Failed to extract raw PDF text on the fly', err);
      }
    }

    const contextBlock =
      contextTasks.length > 0
        ? contextTasks.map((t, i) => `${i + 1}. ${t}`).join('\n')
        : (pdfText ? `RAW PDF TEXT:\n${pdfText}` : 'No compliance tasks or PDF text could be retrieved for this circular.');

    // ── Step 4: Ask Qwen3 ──────────────────────────────────────────────────
    const messages = [
      {
        role: 'system',
        content: `You are a precise Compliance Assistant. You help compliance officers understand regulatory circulars.

CIRCULAR DETAILS:
${circularInfo}

RELEVANT COMPLIANCE TASKS OR PDF CONTENT:
${contextBlock}

Instructions:
- Answer using the Circular Details and Context provided above.
- If the user asks about the summary, title, or authority, answer using the CIRCULAR DETAILS.
- If the user asks about specific rules, deadlines, or penalties, and the information is not in the context above, clearly state that the information is not present in the extracted summary or tasks.
- Do not make up deadlines, amounts, or rules that are not stated.`
      },
      {
        role: 'user',
        content: question
      }
    ];

    const response = await this.fetchWithRetry(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.modelName,
        messages,
        stream: false,
        temperature: 0.2,   // Low temperature = factual, less hallucination
        max_tokens: 1024,
        top_p: 0.9,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${this.provider} Chat API error: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const raw = (data.choices?.[0]?.message?.content || '') as string;

    // Extract <think>...</think> as separate thoughts, clean the answer
    const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/i);
    const thoughts = thinkMatch ? thinkMatch[1].trim() : '';
    const answer = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    return { thoughts, response: answer };
  }

  // ─── Amendment Detection (nomic-embed-text + Qwen3) ─────────────────────────

  async detectAndFlagAmendments(newTaskDescription: string, newEmbedding: number[]): Promise<number[]> {
    try {
      const vectorStr = '[' + newEmbedding.join(',') + ']';

      // Find top 3 similar non-discarded tasks
      const result = await this.db.query(
        `SELECT id, description,
                1 - (embedding <=> $1::vector) AS similarity
         FROM compliance_task
         WHERE is_discarded = FALSE
           AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT 3`,
        [vectorStr],
      );

      const discardedIds: number[] = [];

      for (const oldTask of result.rows) {
        // Only check tasks that are genuinely similar (>0.82 cosine similarity)
        if (oldTask.similarity < 0.82) continue;

        const messages = [
          {
            role: 'system',
            content: 'You are a compliance analyst comparing two compliance tasks.'
          },
          {
            role: 'user',
            content: `OLD TASK: "${oldTask.description}"
NEW TASK: "${newTaskDescription}"

Does the NEW TASK completely amend, supersede, or replace the OLD TASK?
Reply with only one word: YES or NO.`
          }
        ];

        const response = await this.fetchWithRetry(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: this.modelName,
            messages,
            stream: false,
            temperature: 0,
            max_tokens: 5,
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          const answer = this.stripThinkTags(data.choices?.[0]?.message?.content || '').trim().toUpperCase();
          if (answer.startsWith('YES')) {
            this.logger.log(`Task ${oldTask.id} (similarity: ${oldTask.similarity.toFixed(3)}) superseded. Flagging for discard.`);
            discardedIds.push(oldTask.id);
          }
        }
      }

      return discardedIds;
    } catch (error) {
      this.logger.error('Failed to detect amendments', error);
      return [];
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Remove Qwen3 <think>...</think> reasoning blocks from output */
  private stripThinkTags(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }

  async extractMetadata(text: string): Promise<{ reference_no: string | null; title: string | null; published_date: string | null }> {
    const messages = [
      {
        role: 'system',
        content: `You are a compliance analyst. Read the following regulatory circular text and extract key metadata.
Return ONLY a valid JSON object matching this exact schema:
{
  "reference_no": "string (the official reference number, e.g. RBI/2023-24/123 or DOR.ACC.REC.102) or null",
  "title": "string (the official clean title/subject of the circular, e.g. Information Technology Governance in Banks) or null",
  "published_date": "string (YYYY-MM-DD format, e.g. 2025-12-15) or null"
}
No explanation, no markdown, no extra text. Only the JSON object.`,
      },
      {
        role: 'user',
        content: `Circular Text:\n${text.substring(0, 12000)}\n\nJSON:`,
      },
    ];

    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.modelName,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI API error: ${response.statusText}`);
      }

      const resJson = await response.json();
      const content = this.stripThinkTags(resJson.choices?.[0]?.message?.content || '{}');
      const parsed = JSON.parse(content);
      return {
        reference_no: parsed.reference_no || parsed.referenceNo || null,
        title: parsed.title || null,
        published_date: parsed.published_date || parsed.publishedDate || null,
      };
    } catch (err) {
      this.logger.error('[AiService] Failed to extract metadata', err);
      return { reference_no: null, title: null, published_date: null };
    }
  }
}
