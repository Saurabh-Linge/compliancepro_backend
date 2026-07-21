import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly db: DatabaseService) { }

  async create(createBranchDto: CreateBranchDto) {
    const query = `
      INSERT INTO branch_dept (name, type)
      VALUES ($1, $2)
      RETURNING *
    `;
    const result = await this.db.query(query, [
      createBranchDto.name,
      createBranchDto.type,
    ]);
    return result.rows[0];
  }

  async findAll(userRole?: string, userId?: string) {
    // Currently, COs should be able to see and assign task sets to all branches. 
    // If strict branch-to-CO mapping is needed later, this can be restored once the Admin UI supports mapping.
    const result = await this.db.query(`SELECT * FROM branch_dept ORDER BY id DESC`);
    return result.rows;
  }

  async findOne(id: number) {
    const result = await this.db.query(`SELECT * FROM branch_dept WHERE id = $1`, [id]);
    return result.rows[0];
  }

  async update(id: number, updateBranchDto: UpdateBranchDto) {
    const query = `
      UPDATE branch_dept
      SET name = COALESCE($1, name),
          type = COALESCE($2, type)
      WHERE id = $3
      RETURNING *
    `;
    const result = await this.db.query(query, [
      updateBranchDto.name || null,
      updateBranchDto.type || null,
      id
    ]);
    return result.rows[0];
  }

  async remove(id: number) {
    await this.db.query(`DELETE FROM branch_dept WHERE id = $1`, [id]);
    return { deleted: true };
  }
}
