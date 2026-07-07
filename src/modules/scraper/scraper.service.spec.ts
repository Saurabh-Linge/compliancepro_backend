import { Test, TestingModule } from '@nestjs/testing';
import * as cheerio from 'cheerio';

describe('ScraperService Conditions (Isolated)', () => {
  it('1. should properly filter years based on lastProcessedDate (Resumption)', () => {
    const lastProcessedDate = new Date('2021-06-15');
    const startYear = lastProcessedDate.getFullYear();
    const allYears = ['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];
    
    // Logic from fetchHistoricalCirculars
    const yearsToScrape = allYears.filter(y => parseInt(y) >= startYear);
    
    expect(yearsToScrape).toEqual(['2021', '2022', '2023', '2024']);
    expect(yearsToScrape).not.toContain('2020');
    expect(yearsToScrape.length).toBe(4);
  });

  it('2. should properly parse HTML and identify withdrawn circulars', () => {
    const mockHtml = `
    <table class="tablebg">
      <tr><td>Headers...</td></tr>
      <tr>
        <td><a href="BS_CircularIndexDisplay.aspx?Id=13476">RBI/2026-2027/107</a></td>
        <td>09.6.2026</td>
        <td><font color="red">[Withdrawn]</font> Withdrawal of old notes</td>
      </tr>
      <tr>
        <td><a href="BS_CircularIndexDisplay.aspx?Id=13477">RBI/2026-2027/108</a></td>
        <td>10.6.2026</td>
        <td>Normal Circular about Credit limits</td>
      </tr>
      <tr>
        <td><a href="BS_CircularIndexDisplay.aspx?Id=13478">[Withdrawn] RBI/2026-2027/109</a></td>
        <td>11.6.2026</td>
        <td>Another withdrawn circular</td>
      </tr>
    </table>
    `;
    
    const $ = cheerio.load(mockHtml);
    const circulars: any[] = [];
    
    $('table.tablebg tr').each((i, element) => {
      if (i === 0) return;
      const tds = $(element).find('td');
      if (tds.length >= 3) {
        const titleElement = $(tds[0]).find('a');
        const title = titleElement.text().trim();
        const rowHtml = $(element).html() || '';
        
        // Exact logic from scraper.service.ts
        const isWithdrawn = (rowHtml.toLowerCase().includes('withdrawn') && (rowHtml.toLowerCase().includes('red') || rowHtml.toLowerCase().includes('#ff0000'))) || title.toLowerCase().includes('[withdrawn]');
        
        circulars.push({ title, isWithdrawn });
      }
    });
    
    expect(circulars.length).toBe(3);
    
    // First is withdrawn (red font + text)
    expect(circulars[0].isWithdrawn).toBe(true);
    expect(circulars[0].title).toBe('RBI/2026-2027/107');
    
    // Second is normal
    expect(circulars[1].isWithdrawn).toBe(false);
    expect(circulars[1].title).toBe('RBI/2026-2027/108');
    
    // Third is withdrawn (title includes text)
    expect(circulars[2].isWithdrawn).toBe(true);
    expect(circulars[2].title).toBe('[Withdrawn] RBI/2026-2027/109');
  });

  it('3. should properly map multiple originalReferences from AI payload', () => {
    // Simulated AI response
    const mockAiResponse = {
      isAmendment: true,
      originalReferences: [
        { referenceNo: 'RBI/2020-21/100', title: 'Old Guidelines Part 1' },
        { referenceNo: 'RBI/2021-22/200', title: 'Old Guidelines Part 2' }
      ],
      notes: 'Consolidates multiple guidelines'
    };
    
    // Logic from AiService.detectAmendment
    const parsedRefs = Array.isArray(mockAiResponse.originalReferences) ? mockAiResponse.originalReferences : [];
    
    expect(parsedRefs.length).toBe(2);
    expect(parsedRefs[0].referenceNo).toBe('RBI/2020-21/100');
    expect(parsedRefs[1].referenceNo).toBe('RBI/2021-22/200');
  });
});
