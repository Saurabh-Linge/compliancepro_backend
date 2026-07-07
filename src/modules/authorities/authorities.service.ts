import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';
import { CreateAuthorityDto } from './dto/create-authority.dto';
import { UpdateAuthorityDto } from './dto/update-authority.dto';

@Injectable()
export class AuthoritiesService {
  constructor(private readonly db: DatabaseService) {}

  async create(createAuthorityDto: CreateAuthorityDto) {
    const query = `
      INSERT INTO authority (name, source_url)
      VALUES ($1, $2)
      RETURNING *
    `;
    const result = await this.db.query(query, [
      createAuthorityDto.name,
      createAuthorityDto.source_url || null,
    ]);
    return result.rows[0];
  }

  async findAll() {
    const result = await this.db.query(`SELECT * FROM authority ORDER BY id ASC`);
    return result.rows;
  }

  async findOne(id: number) {
    const result = await this.db.query(`SELECT * FROM authority WHERE id = $1`, [id]);
    return result.rows[0];
  }

  async update(id: number, updateAuthorityDto: UpdateAuthorityDto) {
    const query = `
      UPDATE authority
      SET name = COALESCE($1, name),
          source_url = COALESCE($2, source_url)
      WHERE id = $3
      RETURNING *
    `;
    const result = await this.db.query(query, [
      updateAuthorityDto.name || null,
      updateAuthorityDto.source_url || null,
      id
    ]);
    return result.rows[0];
  }

  async remove(id: number) {
    await this.db.query(`DELETE FROM authority WHERE id = $1`, [id]);
    return { deleted: true };
  }
}
