export class CreateUserDto {
  username: string;
  password?: string;
  full_name: string;
  email?: string;
  mobile_number?: string;
  role: string;
  branch_id?: number;
  managed_branch_ids?: number[];
  is_active?: boolean;
}

export class UpdateUserDto {
  username?: string;
  password?: string;
  full_name?: string;
  email?: string;
  mobile_number?: string;
  role?: string;
  branch_id?: number;
  managed_branch_ids?: number[];
  is_active?: boolean;
}
