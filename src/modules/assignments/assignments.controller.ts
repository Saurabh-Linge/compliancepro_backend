// AssignmentsController — handles all /assignments/* routes
import { Controller, Get, Post, Put, Patch, Param, Body, Req, Query, BadRequestException, Header } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { AssignmentsSchedulerService } from './assignments-scheduler.service';
import type { FastifyRequest } from 'fastify';

@Controller('assignments')
export class AssignmentsController {
  constructor(
    private readonly assignmentsService: AssignmentsService,
    private readonly assignmentsSchedulerService: AssignmentsSchedulerService
  ) {}

  @Post('generate-assignments')
  async triggerAutoGeneration(@Body('task_set_id') taskSetId?: number) {
    return this.assignmentsSchedulerService.generateAssignmentsForActiveTaskSets(taskSetId);
  }

  @Post()
  async create(
    @Body('task_set_id') taskSetId: number,
    @Body('branch_ids') branchIds: number[],
    @Body('proposed_timeline') proposedTimeline: string
  ) {
    return this.assignmentsService.create(taskSetId, branchIds, proposedTimeline);
  }


  @Get()
  async getAssignments(
    @Query('branch_id') branchId: string, 
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Req() req: FastifyRequest,
    @Query('search') search?: string
  ) {
    const user = (req as any).user;
    let finalBranchId = branchId ? parseInt(branchId, 10) : undefined;
    
    // Temporarily removed authorization completely
    // if (user?.role === 'BRANCH' || user?.role === 'BRANCH_USER') {
    //   const bId = user.branchId || user.branch_id;
    //   if (bId) {
    //     finalBranchId = parseInt(bId, 10);
    //   }
    // }

    return this.assignmentsService.findAllPaginated({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      branchId: finalBranchId,
      search
    });
  }

  @Put(':id/status')
  async updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.assignmentsService.updateStatus(parseInt(id, 10), status);
  }

  @Get(':id/tasks')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async getAssignmentTasks(@Param('id') id: string) {
    return this.assignmentsService.getAssignmentTasks(parseInt(id, 10));
  }

  @Patch(':id/propose-timeline')
  async proposeTimeline(@Param('id') id: string, @Body('date') date: string) {
    return this.assignmentsService.proposeTimeline(parseInt(id, 10), date);
  }

  @Patch(':id/accept-timeline')
  async acceptTimeline(@Param('id') id: string) {
    return this.assignmentsService.acceptTimeline(parseInt(id, 10));
  }

  @Get(':id/evidence')
  async getEvidence(@Param('id') id: string) {
    return this.assignmentsService.getAssignmentEvidence(parseInt(id, 10));
  }

  @Post(':id/tasks/:taskId/evidence')
  async uploadTaskEvidence(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Req() req: FastifyRequest
  ) {
    const fastifyReq = req as any;
    if (!fastifyReq.isMultipart()) {
      throw new BadRequestException('Request is not multipart');
    }

    const parts = fastifyReq.parts();
    const filesData: { buffer: Buffer; filename: string }[] = [];
    let remark = 'Evidence Document';

    for await (const part of parts) {
      if (part.file) {
        const buffer = await part.toBuffer();
        filesData.push({ buffer, filename: part.filename });
      } else if (part.fieldname === 'remark') {
        remark = part.value as string;
      }
    }

    if (filesData.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    return this.assignmentsService.addTaskEvidences(
      parseInt(taskId, 10),
      parseInt(id, 10),
      filesData,
      remark
    );
  }

  @Patch(':id/tasks/:taskId/complete')
  async completeTaskDirectly(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body('compliance_status') complianceStatus: 'COMPLIED' | 'NOT_COMPLIED',
    @Body('remarks') remarks: string
  ) {
    return this.assignmentsService.completeTaskDirectly(
      parseInt(taskId, 10),
      parseInt(id, 10),
      complianceStatus,
      remarks
    );
  }

  @Put(':id/review')
  async reviewAssignment(
    @Param('id') id: string,
    @Body('action') action: 'ACCEPT' | 'REJECT' | 'ESCALATE',
    @Body('remark') remark: string
  ) {
    return this.assignmentsService.reviewAssignment(parseInt(id, 10), action, remark);
  }

  @Patch(':id/tasks/:taskId/review-status')
  async reviewTaskStatus(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body('review_status') reviewStatus: 'APPROVED' | 'NEEDS_REDO',
    @Body('review_remark') reviewRemark?: string
  ) {
    return this.assignmentsService.reviewTaskStatus(parseInt(taskId, 10), reviewStatus, reviewRemark);
  }
}
