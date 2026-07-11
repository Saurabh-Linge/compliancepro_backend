import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';

@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService) {}

  private getBankName(defaultName = 'KREDPOOL SOLUTIONS PVT LTD.'): string {
    return process.env.BANK_NAME || defaultName;
  }

  async getReportDefinition(reportSlug: string) {
    if (reportSlug === 'compliance-authority-report') {
      return {
        slug: 'compliance-authority-report',
        title: 'Compliance Authority Report',
        category: 'Master Reports',
        page: 'A4',
        fileName: 'compliance-authority-report',
        brand: {
          logoUrl: '/assets/images/logos/kredpool_logo.png',
          bankName: this.getBankName(),
        },
        defaultFilters: {},
        filters: [],
        columns: [
          { key: 'sr_no', label: 'Sr. No.', width: '10%', align: 'center' },
          { key: 'name', label: 'Authority', width: '70%', align: 'left' },
          { key: 'status', label: 'Status', width: '20%', align: 'center', type: 'status' }
        ]
      };
    }

    if (reportSlug === 'compliance-circulars-report') {
      return {
        slug: 'compliance-circulars-report',
        title: 'Compliance Circulars Report',
        category: 'Master Reports',
        page: 'A4L',
        fileName: 'compliance-circulars-report',
        brand: {
          logoUrl: '/assets/images/logos/kredpool_logo.png',
          bankName: this.getBankName(),
        },
        defaultFilters: {
          circular_nature: 'all'
        },
        filters: [
          {
            key: 'circular_nature',
            label: 'Select Circular Applicability',
            type: 'select',
            options: [
              { value: 'all', label: 'Please select applicability' },
              { value: 'Applicable', label: 'Applicable' },
              { value: 'Information', label: 'Information' }
            ]
          }
        ],
        columns: [
          { key: 'sr_no', label: 'Sr. No.', width: '8%', align: 'center' },
          { key: 'authority_name', label: 'Authority', width: '15%', align: 'left' },
          { key: 'reference_no', label: 'Circular Reference', width: '20%', align: 'left' },
          { key: 'title', label: 'Circular Name', width: '40%', align: 'left' },
          { key: 'circular_nature', label: 'Applicability', width: '10%', align: 'center' },
          { key: 'status', label: 'Status', width: '7%', align: 'center', type: 'status' }
        ]
      };
    }

    if (reportSlug === 'compliance-implementation-report') {
      return {
        slug: 'compliance-implementation-report',
        title: 'Compliance Implementation Report',
        category: 'Master Reports',
        page: 'A4L',
        fileName: 'compliance-implementation-report',
        brand: {
          logoUrl: '/assets/images/logos/kredpool_logo.png',
          bankName: this.getBankName(),
        },
        defaultFilters: {
          startDate: '2024-04-01',
          endDate: '2025-03-31'
        },
        filters: [
          { key: 'startDate', label: 'Start Date', type: 'date' },
          { key: 'endDate', label: 'End Date', type: 'date' }
        ],
        columns: [
          { key: 'sr_no', label: 'Sr. No.', width: '8%', align: 'center' },
          { key: 'authority_name', label: 'Issuing Authority', width: '15%', align: 'left' },
          { key: 'reference_no', label: 'Circular Reference', width: '17%', align: 'left' },
          { key: 'circular_name', label: 'Circular Name', width: '35%', align: 'left' },
          { key: 'fully_implemented', label: 'Fully Implemented', width: '10%', align: 'center', type: 'status' },
          { key: 'pct_implementation', label: '% Implementation', width: '8%', align: 'right' },
          { key: 'pct_remaining', label: '% Remaining Compliance', width: '7%', align: 'right' }
        ]
      };
    }

    if (reportSlug === 'compliance-initiation-report') {
      return {
        slug: 'compliance-initiation-report',
        title: 'Compliance Initiation Report',
        category: 'Master Reports',
        page: 'A4L',
        fileName: 'compliance-initiation-report',
        brand: {
          logoUrl: '/assets/images/logos/kredpool_logo.png',
          bankName: this.getBankName(),
        },
        defaultFilters: {
          startDate: '2024-04-01',
          endDate: '2025-03-31'
        },
        filters: [
          { key: 'startDate', label: 'Start Date', type: 'date' },
          { key: 'endDate', label: 'End Date', type: 'date' }
        ],
        columns: [
          { key: 'sr_no', label: 'Sr. No.', width: '8%', align: 'center' },
          { key: 'authority_name', label: 'Issuing Authority', width: '15%', align: 'left' },
          { key: 'reference_no', label: 'Circular Reference', width: '20%', align: 'left' },
          { key: 'circular_name', label: 'Circular Name', width: '45%', align: 'left' },
          { key: 'initiated', label: 'Initiated', width: '12%', align: 'center', type: 'status' }
        ]
      };
    }

    throw new NotFoundException(`Report definition for ${reportSlug} not found.`);
  }

  async getReportData(reportSlug: string, query: any) {
    if (reportSlug === 'compliance-authority-report') {
      const sql = `
        SELECT name, 'Active' as status 
        FROM authority 
        ORDER BY name ASC
      `;
      const result = await this.db.query(sql);
      return result.rows.map((row, index) => ({
        ...row,
        sr_no: index + 1
      }));
    }

    if (reportSlug === 'compliance-circulars-report') {
      const filterNature = query.circular_nature || 'all';
      let sql = `
        SELECT 
          a.name as authority_name, 
          c.reference_no, 
          c.title, 
          c.circular_nature,
          CASE WHEN c.is_withdrawn = true THEN 'Withdrawn' ELSE 'Active' END as status
        FROM circular c
        LEFT JOIN authority a ON c.authority_id = a.id
        WHERE 1=1
      `;
      const params: any[] = [];
      if (filterNature !== 'all') {
        sql += ` AND c.circular_nature = $1`;
        params.push(filterNature);
      }
      sql += ` ORDER BY c.published_date DESC`;
      const result = await this.db.query(sql, params);
      return result.rows.map((row, index) => ({
        ...row,
        sr_no: index + 1
      }));
    }

    if (reportSlug === 'compliance-implementation-report') {
      const start = query.startDate || null;
      const end = query.endDate || null;
      
      const sql = `
        SELECT 
          auth.name as authority_name,
          c.reference_no,
          c.title as circular_name,
          CASE WHEN COUNT(at.id) > 0 AND SUM(CASE WHEN at.compliance_status = 'COMPLIED' THEN 1 ELSE 0 END) = COUNT(at.id) THEN 'Yes' ELSE 'No' END as fully_implemented,
          CASE WHEN COUNT(at.id) > 0 THEN ROUND((SUM(CASE WHEN at.compliance_status = 'COMPLIED' THEN 1 ELSE 0 END) * 100.0) / COUNT(at.id)) ELSE 0 END as pct_implementation,
          CASE WHEN COUNT(at.id) > 0 THEN 100 - ROUND((SUM(CASE WHEN at.compliance_status = 'COMPLIED' THEN 1 ELSE 0 END) * 100.0) / COUNT(at.id)) ELSE 100 END as pct_remaining
        FROM circular c
        LEFT JOIN authority auth ON c.authority_id = auth.id
        LEFT JOIN compliance_task ct ON ct.circular_id = c.id
        LEFT JOIN assignment_task at ON at.task_id = ct.id
        WHERE ($1::DATE IS NULL OR c.published_date >= $1)
          AND ($2::DATE IS NULL OR c.published_date <= $2)
        GROUP BY c.id, auth.name, c.reference_no, c.title
        ORDER BY c.published_date DESC
      `;
      const result = await this.db.query(sql, [start, end]);
      return result.rows.map((row, index) => ({
        ...row,
        sr_no: index + 1,
        pct_implementation: `${row.pct_implementation}%`,
        pct_remaining: `${row.pct_remaining}%`
      }));
    }

    if (reportSlug === 'compliance-initiation-report') {
      const start = query.startDate || null;
      const end = query.endDate || null;

      const sql = `
        SELECT 
          auth.name as authority_name,
          c.reference_no,
          c.title as circular_name,
          CASE WHEN COUNT(at.id) > 0 THEN 'YES' ELSE 'NO' END as initiated
        FROM circular c
        LEFT JOIN authority auth ON c.authority_id = auth.id
        LEFT JOIN compliance_task ct ON ct.circular_id = c.id
        LEFT JOIN assignment_task at ON at.task_id = ct.id
        WHERE ($1::DATE IS NULL OR c.published_date >= $1)
          AND ($2::DATE IS NULL OR c.published_date <= $2)
        GROUP BY c.id, auth.name, c.reference_no, c.title
        ORDER BY c.published_date DESC
      `;
      const result = await this.db.query(sql, [start, end]);
      return result.rows.map((row, index) => ({
        ...row,
        sr_no: index + 1
      }));
    }

    throw new NotFoundException(`Report dataset for ${reportSlug} not found.`);
  }
}
