import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';

@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService) { }

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
      const authoritiesRes = await this.db.query("SELECT id, name FROM authority ORDER BY name ASC");
      const circularsRes = await this.db.query("SELECT id, COALESCE(title, reference_no, '') as label FROM circular ORDER BY title ASC");

      const authorityOptions = [
        { value: 'all', label: 'Please select authority' },
        ...authoritiesRes.rows.map(r => ({ value: String(r.id), label: r.name }))
      ];
      const circularOptions = [
        { value: 'all', label: 'Please select circular' },
        ...circularsRes.rows.map(r => ({ value: String(r.id), label: r.label }))
      ];

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
          authority_id: 'all',
          circular_id: 'all',
          circular_nature: 'all',
          status: 'all'
        },
        filters: [
          {
            key: 'authority_id',
            label: 'Compliance Authority',
            type: 'select',
            options: authorityOptions
          },
          {
            key: 'circular_id',
            label: 'Circulars',
            type: 'select',
            options: circularOptions
          },
          {
            key: 'circular_nature',
            label: 'Applicability',
            type: 'select',
            options: [
              { value: 'all', label: 'Please select applicability' },
              { value: 'Applicable', label: 'Applicable' },
              { value: 'Information', label: 'Information' }
            ]
          },
          {
            key: 'status',
            label: 'Status',
            type: 'select',
            options: [
              { value: 'all', label: 'Please select status' },
              { value: 'Active', label: 'Active' },
              { value: 'Withdrawn', label: 'Withdrawn' }
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

    if (reportSlug === 'authority-pending-tasks-report') {
      const authoritiesResult = await this.db.query('SELECT id, name FROM authority ORDER BY name ASC');
      const authorityOptions = [
        { value: 'all', label: 'All Authorities' },
        ...authoritiesResult.rows.map(row => ({ value: String(row.id), label: row.name }))
      ];

      return {
        slug: 'authority-pending-tasks-report',
        title: 'Authority Wise Pending Tasks Report',
        category: 'Master Reports',
        page: 'A4L',
        fileName: 'authority-wise-pending-tasks',
        brand: {
          logoUrl: '/assets/images/logos/kredpool_logo.png',
          bankName: this.getBankName(),
        },
        defaultFilters: {
          authority_id: 'all',
          priority: 'all'
        },
        filters: [
          {
            key: 'authority_id',
            label: 'Select Authority',
            type: 'select',
            options: authorityOptions
          },
          {
            key: 'priority',
            label: 'Select Priority',
            type: 'select',
            options: [
              { value: 'all', label: 'All Priorities' },
              { value: 'Critical', label: 'Critical' },
              { value: 'High', label: 'High' },
              { value: 'Medium', label: 'Medium' },
              { value: 'Low', label: 'Low' }
            ]
          }
        ],
        columns: [
          { key: 'sr_no', label: 'Sr. No.', width: '5%', align: 'center' },
          { key: 'authority_name', label: 'Issuing Authority', width: '13%', align: 'left' },
          { key: 'reference_no', label: 'Circular Reference', width: '12%', align: 'left' },
          { key: 'circular_name', label: 'Circular Name', width: '20%', align: 'left' },
          { key: 'task_description', label: 'Pending Task Description', width: '25%', align: 'left' },
          { key: 'branch_name', label: 'Assigned Branch', width: '10%', align: 'center' },
          { key: 'priority', label: 'Priority', width: '8%', align: 'center' },
          { key: 'due_date', label: 'Due Date', type: 'date', width: '7%', align: 'center' }
        ]
      };
    }

    if (reportSlug === 'compliance-status-report') {
      const circularsRes = await this.db.query("SELECT id, COALESCE(title, reference_no, '') as label FROM circular ORDER BY title ASC");
      const authoritiesRes = await this.db.query("SELECT id, name FROM authority ORDER BY name ASC");
      const branchesRes = await this.db.query("SELECT id, name FROM branch_dept ORDER BY name ASC");

      const circularOptions = [
        { value: 'all', label: 'Please select circular' },
        ...circularsRes.rows.map(r => ({ value: String(r.id), label: r.label }))
      ];
      const authorityOptions = [
        { value: 'all', label: 'Please select authority' },
        ...authoritiesRes.rows.map(r => ({ value: String(r.id), label: r.name }))
      ];
      const branchOptions = [
        { value: 'all', label: 'Please select compliance unit' },
        ...branchesRes.rows.map(r => ({ value: String(r.id), label: r.name }))
      ];

      return {
        slug: 'compliance-status-report',
        title: 'Compliance Status Report',
        category: 'Advanced Reports',
        page: 'A4L',
        fileName: 'compliance-status-report',
        brand: {
          logoUrl: '/assets/images/logos/kredpool_logo.png',
          bankName: this.getBankName(),
        },
        defaultFilters: {
          startDate: '2024-04-01',
          endDate: '2025-03-31',
          circular_id: 'all',
          authority_id: 'all',
          frequency: 'all',
          status: 'all',
          branch_id: 'all'
        },
        filters: [
          { key: 'startDate', label: 'Start Date', type: 'date' },
          { key: 'endDate', label: 'End Date', type: 'date' },
          {
            key: 'circular_id',
            label: 'Select Circular',
            type: 'select',
            options: circularOptions
          },
          {
            key: 'authority_id',
            label: 'Select Authority',
            type: 'select',
            options: authorityOptions
          },
          {
            key: 'frequency',
            label: 'Frequency',
            type: 'select',
            options: [
              { value: 'all', label: 'Please select frequency' },
              { value: 'Monthly', label: 'Monthly' },
              { value: 'Quarterly', label: 'Quarterly' },
              { value: 'Half Yearly', label: 'Half-Yearly' },
              { value: 'Yearly', label: 'Yearly' },
              { value: 'Ad-hoc', label: 'Ad-hoc / Once' }
            ]
          },
          {
            key: 'status',
            label: 'Status',
            type: 'select',
            options: [
              { value: 'all', label: 'Please select status' },
              { value: 'PENDING', label: 'Pending' },
              { value: 'COMPLIED', label: 'Complied' },
              { value: 'NOT_COMPLIED', label: 'Not Complied' }
            ]
          },
          {
            key: 'branch_id',
            label: 'Compliance Units',
            type: 'select',
            options: branchOptions
          }
        ],
        columns: [
          { key: 'sr_no', label: 'Sr. No.', width: '4%', align: 'center' },
          { key: 'authority_name', label: 'Authority', width: '8%', align: 'left' },
          { key: 'reference_no', label: 'Form / Return No.', width: '10%', align: 'left' },
          { key: 'published_date', label: 'Circular Date', type: 'date', width: '8%', align: 'center' },
          { key: 'task_set_name', label: 'Task Set Name', width: '12%', align: 'left' },
          { key: 'branch_name', label: 'Assigned To', width: '10%', align: 'left' },
          { key: 'frequency', label: 'Frequency', width: '8%', align: 'center' },
          { key: 'compliance_period', label: 'Compliance Period', width: '12%', align: 'center' },
          { key: 'reporting_date', label: 'Reporting Date', type: 'date', width: '7%', align: 'center' },
          { key: 'due_date', label: 'Due Date', type: 'date', width: '7%', align: 'center' },
          { key: 'submission_date', label: 'Submission Date', type: 'date', width: '7%', align: 'center' },
          { key: 'status', label: 'Compliance Status', type: 'status', width: '7%', align: 'center' },
          { key: 'remarks', label: 'Remark', width: '12%', align: 'left' }
        ]
      };
    }

    if (reportSlug === 'compliance-summary-report') {
      const authoritiesRes = await this.db.query("SELECT id, name FROM authority ORDER BY name ASC");
      const circularsRes = await this.db.query("SELECT id, COALESCE(title, reference_no, '') as label FROM circular ORDER BY title ASC");
      const taskSetsRes = await this.db.query("SELECT id, name FROM task_set ORDER BY name ASC");
      const branchesRes = await this.db.query("SELECT id, name FROM branch_dept ORDER BY name ASC");

      const authorityOptions = [
        { value: 'all', label: 'Please select compliance Authority' },
        ...authoritiesRes.rows.map(r => ({ value: String(r.id), label: r.name }))
      ];
      const circularOptions = [
        { value: 'all', label: 'Please select circulars' },
        ...circularsRes.rows.map(r => ({ value: String(r.id), label: r.label }))
      ];
      const taskSetOptions = [
        { value: 'all', label: 'Please select compliance task' },
        ...taskSetsRes.rows.map(r => ({ value: String(r.id), label: r.name }))
      ];
      const branchOptions = [
        { value: 'all', label: 'Please select Audit Units' },
        ...branchesRes.rows.map(r => ({ value: String(r.id), label: `${r.name} - ( BR. ${r.id} )` }))
      ];

      return {
        slug: 'compliance-summary-report',
        title: 'Compliance Summary Report',
        category: 'Advanced Reports',
        page: 'A4L',
        fileName: 'compliance-summary-report',
        brand: {
          logoUrl: '/assets/images/logos/kredpool_logo.png',
          bankName: this.getBankName(),
        },
        defaultFilters: {
          authority_id: 'all',
          circular_id: 'all',
          task_set_id: 'all',
          branch_id: 'all'
        },
        filters: [
          {
            key: 'authority_id',
            label: 'Compliance Authority',
            type: 'select',
            options: authorityOptions
          },
          {
            key: 'circular_id',
            label: 'Circulars',
            type: 'select',
            options: circularOptions
          },
          {
            key: 'task_set_id',
            label: 'Task Set',
            type: 'select',
            options: taskSetOptions
          },
          {
            key: 'branch_id',
            label: 'Period wise Audit Units',
            type: 'select',
            options: branchOptions
          }
        ],
        columns: []
      };
    }

    if (reportSlug === 'compliance-report' || reportSlug === 'cco-compliance-report') {
      const authoritiesRes = await this.db.query("SELECT id, name FROM authority ORDER BY name ASC");
      const circularsRes = await this.db.query("SELECT id, COALESCE(title, reference_no, '') as label FROM circular ORDER BY title ASC");
      const taskSetsRes = await this.db.query("SELECT id, name FROM task_set ORDER BY name ASC");
      const branchesRes = await this.db.query("SELECT id, name FROM branch_dept ORDER BY name ASC");

      const authorityOptions = [
        { value: 'all', label: 'Please select compliance Authority' },
        ...authoritiesRes.rows.map(r => ({ value: String(r.id), label: r.name }))
      ];
      const circularOptions = [
        { value: 'all', label: 'Please select circulars' },
        ...circularsRes.rows.map(r => ({ value: String(r.id), label: r.label }))
      ];
      const taskSetOptions = [
        { value: 'all', label: 'Please select compliance task' },
        ...taskSetsRes.rows.map(r => ({ value: String(r.id), label: r.name }))
      ];
      const statusOptions = [
        { value: 'all', label: 'Please select status' },
        { value: 'PENDING', label: 'PENDING' },
        { value: 'COMPLETED', label: 'COMPLETED' },
        { value: 'COMPLIED', label: 'COMPLIED' },
        { value: 'NEEDS_REDO', label: 'NEEDS REDO' },
        { value: 'APPROVED', label: 'APPROVED' }
      ];
      const branchOptions = [
        { value: 'all', label: 'Please select compliance unit' },
        ...branchesRes.rows.map(r => ({ value: String(r.id), label: `${r.name} - ( BR. ${r.id} )` }))
      ];

      return {
        slug: reportSlug,
        title: 'Compliance Report',
        category: 'Advanced Reports',
        page: 'A4L',
        fileName: 'compliance-report',
        brand: {
          logoUrl: '/assets/images/logos/kredpool_logo.png',
          bankName: this.getBankName(),
        },
        defaultFilters: {
          authority_id: 'all',
          circular_id: 'all',
          task_set_id: 'all',
          status: 'all',
          branch_id: 'all'
        },
        filters: [
          {
            key: 'authority_id',
            label: 'Compliance Authority',
            type: 'select',
            options: authorityOptions
          },
          {
            key: 'circular_id',
            label: 'Circulars',
            type: 'select',
            options: circularOptions
          },
          {
            key: 'task_set_id',
            label: 'Task Set',
            type: 'select',
            options: taskSetOptions
          },
          {
            key: 'status',
            label: 'Status',
            type: 'select',
            options: statusOptions
          },
          {
            key: 'branch_id',
            label: 'Compliance Units',
            type: 'select',
            options: branchOptions
          }
        ],
        columns: [
          { key: 'authority', label: 'Authority', width: '8%', align: 'left' },
          { key: 'circular', label: 'Circular', width: '12%', align: 'left' },
          { key: 'task_set', label: 'Task Set', width: '12%', align: 'left' },
          { key: 'branch', label: 'Branch', width: '10%', align: 'left' },
          { key: 'period', label: 'Period', width: '10%', align: 'center' },
          { key: 'reporting_date', label: 'Reporting Date', type: 'date', width: '8%', align: 'center' },
          { key: 'due_date', label: 'Due Date', type: 'date', width: '8%', align: 'center' },
          { key: 'status', label: 'Status', type: 'status', width: '8%', align: 'center' },
          { key: 'header', label: 'Header', width: '10%', align: 'left' },
          { key: 'observation', label: 'Observation', width: '14%', align: 'left' },
          { key: 'compliance', label: 'Compliance', width: '14%', align: 'left' },
          { key: 'cco_remark', label: 'CCO Remark', width: '14%', align: 'left' }
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
      const authId = query.authority_id || 'all';
      const circularId = query.circular_id || 'all';
      const filterNature = query.circular_nature || 'all';
      const statusFilter = query.status || 'all';

      let sql = `
        SELECT 
          COALESCE(a.name, 'N/A') as authority_name, 
          COALESCE(c.reference_no, '-') as reference_no, 
          COALESCE(c.title, 'N/A') as title, 
          COALESCE(c.circular_nature, '-') as circular_nature,
          CASE WHEN c.is_withdrawn = true THEN 'Withdrawn' ELSE 'Active' END as status
        FROM circular c
        LEFT JOIN authority a ON c.authority_id = a.id
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (authId !== 'all') {
        sql += ` AND c.authority_id = $${paramIndex}`;
        params.push(parseInt(authId, 10));
        paramIndex++;
      }

      if (circularId !== 'all') {
        sql += ` AND c.id = $${paramIndex}`;
        params.push(parseInt(circularId, 10));
        paramIndex++;
      }

      if (filterNature !== 'all') {
        sql += ` AND c.circular_nature = $${paramIndex}`;
        params.push(filterNature);
        paramIndex++;
      }

      if (statusFilter !== 'all') {
        if (statusFilter.toLowerCase() === 'withdrawn') {
          sql += ` AND c.is_withdrawn = true`;
        } else if (statusFilter.toLowerCase() === 'active') {
          sql += ` AND (c.is_withdrawn = false OR c.is_withdrawn IS NULL)`;
        }
      }

      sql += ` ORDER BY c.published_date DESC, c.id DESC`;
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

    if (reportSlug === 'authority-pending-tasks-report') {
      const authId = query.authority_id || 'all';
      const priority = query.priority || 'all';

      let sql = `
        SELECT 
          auth.name as authority_name,
          c.reference_no,
          c.title as circular_name,
          ct.description as task_description,
          bd.name as branch_name,
          c.priority,
          a.proposed_timeline::TEXT as due_date
        FROM assignment_task at
        JOIN compliance_task ct ON at.task_id = ct.id
        JOIN circular c ON ct.circular_id = c.id
        JOIN authority auth ON c.authority_id = auth.id
        JOIN assignment a ON at.assignment_id = a.id
        JOIN branch_dept bd ON a.branch_id = bd.id
        WHERE at.compliance_status = 'PENDING'
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (authId !== 'all') {
        sql += ` AND c.authority_id = $${paramIndex}`;
        params.push(parseInt(authId, 10));
        paramIndex++;
      }

      if (priority !== 'all') {
        sql += ` AND c.priority = $${paramIndex}`;
        params.push(priority);
        paramIndex++;
      }

      sql += ` ORDER BY a.proposed_timeline ASC, c.reference_no ASC`;

      const result = await this.db.query(sql, params);
      return result.rows.map((row, index) => ({
        ...row,
        sr_no: index + 1
      }));
    }

    if (reportSlug === 'compliance-status-report') {
      const start = query.startDate || null;
      const end = query.endDate || null;
      const circularId = query.circular_id || 'all';
      const authId = query.authority_id || 'all';
      const freq = query.frequency || 'all';
      const status = query.status || 'all';
      const branchId = query.branch_id || 'all';

      let sql = `
        SELECT 
          COALESCE(auth.name, 'N/A') as authority_name,
          COALESCE(c.reference_no, 'N/A') as reference_no,
          COALESCE(c.published_date::TEXT, 'N/A') as published_date,
          ts.name as task_set_name,
          bd.name as branch_name,
          ts.frequency,
          COALESCE(ts.start_date::TEXT, '') || ' to ' || COALESCE(ts.end_date::TEXT, '') as compliance_period,
          a.proposed_timeline::TEXT as reporting_date,
          ts.default_due_date::TEXT as due_date,
          at.completed_at::TEXT as submission_date,
          at.compliance_status as status,
          at.remarks
        FROM assignment_task at
        JOIN compliance_task ct ON at.task_id = ct.id
        LEFT JOIN circular c ON ct.circular_id = c.id
        LEFT JOIN authority auth ON c.authority_id = auth.id
        JOIN assignment a ON at.assignment_id = a.id
        JOIN task_set ts ON ts.id = a.task_set_id
        JOIN branch_dept bd ON a.branch_id = bd.id
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (start) {
        sql += ` AND a.proposed_timeline >= $${paramIndex}`;
        params.push(start);
        paramIndex++;
      }

      if (end) {
        sql += ` AND a.proposed_timeline <= $${paramIndex}`;
        params.push(end);
        paramIndex++;
      }

      if (circularId !== 'all') {
        sql += ` AND c.id = $${paramIndex}`;
        params.push(parseInt(circularId, 10));
        paramIndex++;
      }

      if (authId !== 'all') {
        sql += ` AND c.authority_id = $${paramIndex}`;
        params.push(parseInt(authId, 10));
        paramIndex++;
      }

      if (freq !== 'all') {
        sql += ` AND ts.frequency = $${paramIndex}`;
        params.push(freq);
        paramIndex++;
      }

      if (status !== 'all') {
        sql += ` AND at.compliance_status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (branchId !== 'all') {
        sql += ` AND a.branch_id = $${paramIndex}`;
        params.push(parseInt(branchId, 10));
        paramIndex++;
      }

      sql += ` ORDER BY a.proposed_timeline ASC, c.reference_no ASC`;

      const result = await this.db.query(sql, params);
      return result.rows.map((row, index) => ({
        ...row,
        sr_no: index + 1
      }));
    }

    if (reportSlug === 'compliance-summary-report') {
      const authId = query.authority_id || 'all';
      const circularId = query.circular_id || 'all';
      const taskSetId = query.task_set_id || 'all';
      const branchId = query.branch_id || 'all';

      let sql = `
        SELECT 
          c.id as circular_id,
          COALESCE(auth.name, 'N/A') as circular_authority,
          COALESCE(c.title, 'N/A') as circular_name,
          COALESCE(c.description, 'N/A') as circular_description,
          COALESCE(c.published_date::TEXT, 'N/A') as circular_date,

          ts.id as task_set_id,
          ts.name as task_set_name,
          COALESCE(ts.name, 'N/A') as task_set_description,
          CASE ts.frequency
            WHEN '1' THEN 'Fortnight (Every 15 Days)'
            WHEN '2' THEN 'Monthly'
            WHEN '3' THEN 'Quarterly'
            WHEN '4' THEN 'Semi-Annually'
            WHEN '5' THEN 'Yearly'
            WHEN '6' THEN '1 Time Use'
            ELSE COALESCE(ts.frequency, '1 Time Use')
          END as frequency,
          COALESCE(ts.start_date::TEXT, '') || ' to ' || COALESCE(ts.end_date::TEXT, '') as compliance_period,

          bd.id as branch_id,
          bd.name as department_name,
          bd.id::TEXT as branch_code,

          at.id as assignment_task_id,
          COALESCE(th.name, '-') as header,
          COALESCE(ct.description, 'N/A') as observations,
          COALESCE(at.remarks, '') as current_compliance_remark,
          COALESCE(at.review_remark, '') as current_reviewer_remark,
          at.compliance_status,
          at.review_status
        FROM assignment_task at
        JOIN compliance_task ct ON at.task_id = ct.id
        LEFT JOIN task_header th ON ct.header_id = th.id
        JOIN assignment a ON at.assignment_id = a.id
        JOIN task_set ts ON a.task_set_id = ts.id
        LEFT JOIN circular c ON ts.circular_id = c.id
        LEFT JOIN authority auth ON c.authority_id = auth.id
        JOIN branch_dept bd ON a.branch_id = bd.id
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (authId !== 'all') {
        sql += ` AND c.authority_id = $${paramIndex}`;
        params.push(parseInt(authId, 10));
        paramIndex++;
      }

      if (circularId !== 'all') {
        sql += ` AND c.id = $${paramIndex}`;
        params.push(parseInt(circularId, 10));
        paramIndex++;
      }

      if (taskSetId !== 'all') {
        sql += ` AND ts.id = $${paramIndex}`;
        params.push(parseInt(taskSetId, 10));
        paramIndex++;
      }

      if (branchId !== 'all') {
        sql += ` AND a.branch_id = $${paramIndex}`;
        params.push(parseInt(branchId, 10));
        paramIndex++;
      }

      sql += ` ORDER BY c.id ASC, ts.id ASC, bd.name ASC, at.id ASC`;

      const result = await this.db.query(sql, params);

      if (result.rows.length === 0) {
        return [];
      }

      // Fetch iterative remarks history for all assignment tasks returned
      const taskIds = result.rows.map(r => r.assignment_task_id);
      let remarksHistoryMap: Record<number, { role: string; username: string; remark: string; created_at: string }[]> = {};

      if (taskIds.length > 0) {
        const historyRes = await this.db.query(
          `SELECT assignment_task_id, role, username, remark, created_at::TEXT
           FROM assignment_task_remarks_history
           WHERE assignment_task_id = ANY($1::int[])
           ORDER BY created_at ASC`,
          [taskIds]
        );
        for (const row of historyRes.rows) {
          if (!remarksHistoryMap[row.assignment_task_id]) {
            remarksHistoryMap[row.assignment_task_id] = [];
          }
          remarksHistoryMap[row.assignment_task_id].push(row);
        }
      }

      // Group rows by Circular -> Task Set -> Department
      const groupedMap: Record<string, any> = {};

      for (const row of result.rows) {
        const groupKey = `${row.circular_id}_${row.task_set_id}`;
        if (!groupedMap[groupKey]) {
          groupedMap[groupKey] = {
            circular_authority: row.circular_authority,
            circular_name: row.circular_name,
            circular_description: row.circular_description,
            circular_date: row.circular_date,
            task_set_name: row.task_set_name,
            task_set_description: row.task_set_description,
            departments: {}
          };
        }

        const deptKey = row.branch_id;
        if (!groupedMap[groupKey].departments[deptKey]) {
          groupedMap[groupKey].departments[deptKey] = {
            department_name: row.department_name,
            branch_code: row.branch_code,
            frequency: row.frequency,
            compliance_period: row.compliance_period,
            tasks: []
          };
        }

        // Build iterative comments trail for compliance and reviewer
        const historyList = remarksHistoryMap[row.assignment_task_id] || [];
        const complierHistory = historyList.filter(h => h.role === 'COMPLIER');
        const reviewerHistory = historyList.filter(h => h.role !== 'COMPLIER');

        let complianceText = row.current_compliance_remark || '';
        if (complierHistory.length > 0) {
          const iterComments = complierHistory.map(h => {
            const dateStr = h.created_at ? new Date(h.created_at).toLocaleDateString('en-GB') : '';
            return `${h.remark}${dateStr ? ' (' + dateStr + ')' : ''}`;
          }).join('\n');
          complianceText = iterComments;
        }

        let reviewerText = row.current_reviewer_remark || '';
        if (reviewerHistory.length > 0) {
          const iterComments = reviewerHistory.map(h => {
            const dateStr = h.created_at ? new Date(h.created_at).toLocaleDateString('en-GB') : '';
            const userStr = h.username ? ` [${h.username}]` : '';
            return `${h.remark}${userStr}${dateStr ? ' (' + dateStr + ')' : ''}`;
          }).join('\n');
          reviewerText = iterComments;
        }

        const deptTasks = groupedMap[groupKey].departments[deptKey].tasks;
        deptTasks.push({
          sr_no: deptTasks.length + 1,
          header: row.header,
          observations: row.observations,
          compliance: complianceText,
          reviewer_comment: reviewerText,
          compliance_status: row.compliance_status,
          review_status: row.review_status,
          history: historyList
        });
      }

      // Convert grouped object structure into array format
      const finalReportData = Object.values(groupedMap).map((g: any) => ({
        ...g,
        departments: Object.values(g.departments)
      }));

      return finalReportData;
    }

    if (reportSlug === 'compliance-report' || reportSlug === 'cco-compliance-report') {
      const authId = query.authority_id || 'all';
      const circularId = query.circular_id || 'all';
      const taskSetId = query.task_set_id || 'all';
      const status = query.status || 'all';
      const branchId = query.branch_id || 'all';

      let sql = `
        SELECT 
          COALESCE(auth.name, 'N/A') as authority,
          COALESCE(c.title, 'N/A') as circular,
          COALESCE(ts.name, 'N/A') as task_set,
          bd.name || ' - ( BR. ' || bd.id::TEXT || ' )' as branch,
          COALESCE(ts.start_date::TEXT, '') || ' - ' || COALESCE(ts.end_date::TEXT, '') as period,
          COALESCE(ts.end_date::TEXT, '-') as reporting_date,
          COALESCE(ts.default_due_date::TEXT, ts.start_date::TEXT, '-') as due_date,
          COALESCE(at.compliance_status, at.status, 'PENDING') as status,
          COALESCE(th.name, '-') as header,
          COALESCE(ct.description, 'N/A') as observation,
          COALESCE(at.remarks, '') as current_compliance_remark,
          COALESCE(at.review_remark, '') as current_reviewer_remark,
          at.id as assignment_task_id
        FROM assignment_task at
        JOIN compliance_task ct ON at.task_id = ct.id
        LEFT JOIN task_header th ON ct.header_id = th.id
        JOIN assignment a ON at.assignment_id = a.id
        JOIN task_set ts ON a.task_set_id = ts.id
        LEFT JOIN circular c ON ts.circular_id = c.id
        LEFT JOIN authority auth ON c.authority_id = auth.id
        JOIN branch_dept bd ON a.branch_id = bd.id
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (authId !== 'all') {
        sql += ` AND c.authority_id = $${paramIndex}`;
        params.push(parseInt(authId, 10));
        paramIndex++;
      }

      if (circularId !== 'all') {
        sql += ` AND c.id = $${paramIndex}`;
        params.push(parseInt(circularId, 10));
        paramIndex++;
      }

      if (taskSetId !== 'all') {
        sql += ` AND ts.id = $${paramIndex}`;
        params.push(parseInt(taskSetId, 10));
        paramIndex++;
      }

      if (status !== 'all') {
        sql += ` AND (at.compliance_status = $${paramIndex} OR at.status = $${paramIndex})`;
        params.push(status);
        paramIndex++;
      }

      if (branchId !== 'all') {
        sql += ` AND a.branch_id = $${paramIndex}`;
        params.push(parseInt(branchId, 10));
        paramIndex++;
      }

      sql += ` ORDER BY c.id ASC, ts.id ASC, bd.name ASC, at.id ASC`;

      const result = await this.db.query(sql, params);

      if (result.rows.length === 0) {
        return [];
      }

      // Fetch iterative remarks history for all assignment tasks returned
      const taskIds = result.rows.map(r => r.assignment_task_id);
      let remarksHistoryMap: Record<number, { role: string; username: string; remark: string; created_at: string }[]> = {};

      if (taskIds.length > 0) {
        const historyRes = await this.db.query(
          `SELECT assignment_task_id, role, username, remark, created_at::TEXT
           FROM assignment_task_remarks_history
           WHERE assignment_task_id = ANY($1::int[])
           ORDER BY created_at ASC`,
          [taskIds]
        );
        for (const row of historyRes.rows) {
          if (!remarksHistoryMap[row.assignment_task_id]) {
            remarksHistoryMap[row.assignment_task_id] = [];
          }
          remarksHistoryMap[row.assignment_task_id].push(row);
        }
      }

      return result.rows.map((row, index) => {
        const historyList = remarksHistoryMap[row.assignment_task_id] || [];
        const complierHistory = historyList.filter(h => h.role === 'COMPLIER');
        const reviewerHistory = historyList.filter(h => h.role !== 'COMPLIER');

        let complianceText = row.current_compliance_remark || '';
        if (complierHistory.length > 0) {
          complianceText = complierHistory.map(h => {
            const dateStr = h.created_at ? new Date(h.created_at).toLocaleDateString('en-GB') : '';
            return `${h.remark}${dateStr ? ' (' + dateStr + ')' : ''}`;
          }).join('\n');
        }

        let ccoRemarkText = row.current_reviewer_remark || '';
        if (reviewerHistory.length > 0) {
          ccoRemarkText = reviewerHistory.map(h => {
            const dateStr = h.created_at ? new Date(h.created_at).toLocaleDateString('en-GB') : '';
            const userStr = h.username ? ` [${h.username}]` : '';
            return `${h.remark}${userStr}${dateStr ? ' (' + dateStr + ')' : ''}`;
          }).join('\n');
        }

        return {
          sr_no: index + 1,
          authority: row.authority,
          circular: row.circular,
          task_set: row.task_set,
          branch: row.branch,
          period: row.period,
          reporting_date: row.reporting_date,
          due_date: row.due_date,
          status: row.status,
          header: row.header,
          observation: row.observation,
          compliance: complianceText || '-',
          cco_remark: ccoRemarkText || '-'
        };
      });
    }

    throw new NotFoundException(`Report dataset for ${reportSlug} not found.`);
  }
}
