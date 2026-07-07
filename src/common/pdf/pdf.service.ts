import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import * as ejs from 'ejs';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import * as os from 'os';

const execAsync = promisify(exec);

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  /**
   * Escapes special LaTeX characters to prevent compilation errors
   */
  escapeLatex(str: any): string {
    if (str === null || str === undefined) return '';
    if (typeof str !== 'string') return String(str);

    // LaTeX special characters: & % $ # _ { } ~ ^ \
    return str.replace(/[&%$#_{}~^\\]/g, (match) => {
      switch (match) {
        case '&': case '%': case '$': case '#': case '_': case '{': case '}':
          return `\\${match}`;
        case '~':
          return '\\textasciitilde{}';
        case '^':
          return '\\textasciicircum{}';
        case '\\':
          return '\\textbackslash{}';
        default:
          return match;
      }
    });
  }

  /**
   * Renders an EJS template and compiles it to PDF using XeLaTeX
   */
  async generatePdf(templateName: string, data: any): Promise<Buffer> {
    const templatePath = path.join(process.cwd(), 'src/templates', `${templateName}.tex.ejs`);

    this.logger.log(`Generating PDF using template: ${templatePath}`);

    // 1. Render EJS template
    let texContent: string;
    try {
      texContent = await ejs.renderFile(templatePath, {
        ...data,
        escapeLatex: this.escapeLatex // Pass helper to template if needed
      });
      this.logger.log(`Template rendered. TeX length: ${texContent.length} characters`);
    } catch (err) {
      this.logger.error(`Failed to render template: ${err.message}`);
      throw new InternalServerErrorException(`Failed to render template: ${err.message}`);
    }

    // 2. Create unique temp directory
    const uniqueId = crypto.randomUUID();
    const tempDir = path.join(os.tmpdir(), `loanpro_pdf_${uniqueId}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const texFile = path.join(tempDir, 'document.tex');
    const pdfFile = path.join(tempDir, 'document.pdf');

    try {
      // 3. Write .tex file
      fs.writeFileSync(texFile, texContent);
      this.logger.log(`TeX file written to: ${texFile}. Content start: ${texContent.substring(0, 200)}...`);

      // 4. Compile with XeLaTeX
      const cmd = `xelatex -interaction=nonstopmode -output-directory="${tempDir}" "${texFile}"`;
      this.logger.log(`Executing command: ${cmd}`);

      try {
        this.logger.log(`Executing first pass...`);
        const res1 = await execAsync(cmd);
        this.logger.log(`First pass stdout: ${res1.stdout || 'none'}`);
        if (res1.stderr) this.logger.warn(`First pass stderr: ${res1.stderr}`);

        this.logger.log(`Executing second pass...`);
        const res2 = await execAsync(cmd);
        this.logger.log(`Second pass stdout: ${res2.stdout || 'none'}`);
        if (res2.stderr) this.logger.warn(`Second pass stderr: ${res2.stderr}`);
      } catch (err: any) {
        this.logger.error(`XeLaTeX Command Failed: ${err.message}`);
        if (err.stdout) this.logger.error(`Command stdout: ${err.stdout}`);
        if (err.stderr) this.logger.error(`Command stderr: ${err.stderr}`);
        
        // Extract error from .log file
        const logFile = path.join(tempDir, 'document.log');
        if (fs.existsSync(logFile)) {
           const log = fs.readFileSync(logFile, 'utf-8');
           this.logger.error(`Full LaTeX Log on Failure:\n${log}`);
        }
        throw new InternalServerErrorException(`LaTeX Error: ${err.message}`);
      }

      // Always log files and log file content for debugging 15-byte issue
      const files = fs.readdirSync(tempDir);
      this.logger.log(`Files in temp directory: ${files.join(', ')}`);
      
      const logFile = path.join(tempDir, 'document.log');
      if (fs.existsSync(logFile)) {
         const logContent = fs.readFileSync(logFile, 'utf-8');
         this.logger.log(`LaTeX Log Content (${logContent.length} bytes):\n${logContent}`);
      }

      // 5. Read resulting PDF
      if (!fs.existsSync(pdfFile)) {
        throw new InternalServerErrorException('PDF file was not generated');
      }
      
      const buffer = fs.readFileSync(pdfFile);
      
      // Sanity check: A valid PDF should be much larger than 100 bytes
      if (buffer.length < 100) {
        this.logger.error(`Generated PDF is suspiciously small (${buffer.length} bytes). This usually indicates a fatal font embedding error in XeLaTeX.`);
        throw new InternalServerErrorException(`LaTeX Compilation Error: The output PDF was corrupted (only ${buffer.length} bytes). This is likely a font issue (Invalid font: -1).`);
      }

      this.logger.log(`PDF read from disk. Size: ${buffer.length} bytes. First 100 bytes as string: ${buffer.toString('utf-8', 0, 100)}`);
      return buffer;

    } finally {
      // 6. Cleanup temp directory only on success
      // If the file is 15 bytes or missing, we keep it for debugging
      const keepFiles = !fs.existsSync(pdfFile) || fs.statSync(pdfFile).size < 100;
      
      if (!keepFiles) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (err) {
          this.logger.warn(`Failed to cleanup temp PDF directory: ${tempDir}`);
        }
      } else {
        this.logger.warn(`KEEPING temporary directory for debugging: ${tempDir}`);
      }
    }
  }
}
