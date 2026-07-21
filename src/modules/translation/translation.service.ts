import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';

@Injectable()
export class TranslationService implements OnModuleInit {
  private readonly logger = new Logger(TranslationService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    this.logger.log('Ensuring language_master and label_master tables exist in database...');
    try {
      // 1. Create language_master table
      await this.databaseService.query(`
        CREATE TABLE IF NOT EXISTS language_master (
          id SERIAL PRIMARY KEY,
          code VARCHAR(10) UNIQUE NOT NULL,
          name VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. Create label_master table
      await this.databaseService.query(`
        CREATE TABLE IF NOT EXISTS label_master (
          id SERIAL PRIMARY KEY,
          english_text TEXT NOT NULL,
          language_id INT REFERENCES language_master(id) ON DELETE CASCADE,
          translated_text TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uniq_english_language_label UNIQUE (english_text, language_id)
        );
      `);

      // 3. Seed default languages if they don't exist
      await this.databaseService.query(`
        INSERT INTO language_master (code, name) 
        VALUES ('en', 'English'), ('mr', 'Marathi')
        ON CONFLICT (code) DO NOTHING;
      `);

      // 4. Safe migration from old tables (language -> language_master, language_label -> label_master)
      this.logger.log('Migrating data from old language tables if they exist...');
      await this.databaseService.query(`
        DO $$
        BEGIN
          -- Migrate language to language_master
          IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'language') THEN
            INSERT INTO language_master (code, name, created_at)
            SELECT code, name, created_at FROM language
            ON CONFLICT (code) DO NOTHING;
          END IF;
          
          -- Migrate language_label to label_master
          IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'language_label') 
             AND EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'language') THEN
            INSERT INTO label_master (english_text, language_id, translated_text, created_at)
            SELECT ll.english_text, lm.id, ll.translated_text, ll.created_at
            FROM language_label ll
            JOIN language l ON l.id = ll.language_id
            JOIN language_master lm ON lm.code = l.code
            ON CONFLICT (english_text, language_id) DO NOTHING;
          END IF;
        END $$;
      `);

      this.logger.log('Language master and label master tables verified/seeded/migrated successfully.');
    } catch (err) {
      this.logger.error('Failed to verify/create/migrate translation master tables', err);
    }
  }

  async translate(text: string | string[], srcLang: string, tgtLang: string): Promise<string | string[]> {
    const targetCode = tgtLang.toLowerCase().trim() === 'marathi' ? 'mr' : tgtLang.toLowerCase().trim();
    const languageId = await this.getLanguageId(targetCode);

    if (!languageId) {
      this.logger.warn(`Language code "${tgtLang}" not found in database. Returning original text.`);
      return text;
    }

    if (Array.isArray(text)) {
      return this.translateBatch(text, languageId);
    } else {
      return this.translateSingle(text, languageId);
    }
  }

  private async getLanguageId(code: string): Promise<number | null> {
    try {
      const row = await this.databaseService.findOne(
        'SELECT id FROM language_master WHERE code = $1',
        [code]
      );
      return row ? row.id : null;
    } catch (err) {
      this.logger.error(`Error looking up language ID for code "${code}"`, err);
      return null;
    }
  }

  private async translateSingle(text: string, languageId: number): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return text;

    try {
      // 1. Check database for existing translation
      const cached = await this.databaseService.findOne(
        'SELECT translated_text FROM label_master WHERE english_text = $1 AND language_id = $2',
        [trimmed, languageId]
      );

      if (cached) {
        return cached.translated_text;
      }

      // If not cached in the database, return original text as-is
      return text;
    } catch (error) {
      this.logger.error(`Database lookup failed for "${trimmed}":`, error);
      return text;
    }
  }

  private async translateBatch(texts: string[], languageId: number): Promise<string[]> {
    const trimmedTexts = texts.map(t => t.trim());
    const uniqueTexts = Array.from(new Set(trimmedTexts)).filter(t => t.length > 0);

    if (uniqueTexts.length === 0) {
      return texts;
    }

    try {
      // 1. Bulk lookup all cached translations
      const queryResult = await this.databaseService.query(
        'SELECT english_text, translated_text FROM label_master WHERE english_text = ANY($1) AND language_id = $2',
        [uniqueTexts, languageId]
      );

      const cacheMap = new Map<string, string>();
      for (const row of queryResult.rows) {
        cacheMap.set(row.english_text, row.translated_text);
      }

      // 2. Map back to original input array order (return DB translation or fallback to original text)
      return trimmedTexts.map(text => cacheMap.get(text) || text);
    } catch (error) {
      this.logger.error('Batch translation database query failed:', error);
      return texts;
    }
  }

  async getAllTranslations(target: string): Promise<Record<string, string>> {
    const targetCode = target.toLowerCase().trim() === 'marathi' ? 'mr' : target.toLowerCase().trim();
    const languageId = await this.getLanguageId(targetCode);

    if (!languageId) {
      return {};
    }

    try {
      const queryResult = await this.databaseService.query(
        'SELECT english_text, translated_text FROM label_master WHERE language_id = $1',
        [languageId]
      );

      const dictionary: Record<string, string> = {};
      for (const row of queryResult.rows) {
        dictionary[row.english_text] = row.translated_text;
      }
      return dictionary;
    } catch (error) {
      this.logger.error(`Failed to get all translations for target "${target}":`, error);
      return {};
    }
  }
}
