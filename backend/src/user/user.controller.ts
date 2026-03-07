import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type';
import {
  UpdateProfileDto,
  ChangePasswordDto,
  UpdatePermissionsDto,
  UpdateBehaviorSyncDto,
} from './dto/user.dto';

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  async getProfile(@Request() req: AuthenticatedRequest) {
    return this.userService.getProfile(req.user.id);
  }

  @Patch('profile')
  async updateProfile(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(req.user.id, dto);
  }

  @Patch('password')
  async changePassword(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.userService.changePassword(req.user.id, dto);
  }

  @Get('permissions')
  async getPermissions(@Request() req: AuthenticatedRequest) {
    return this.userService.getPermissions(req.user.id);
  }

  @Patch('permissions')
  async updatePermissions(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdatePermissionsDto,
  ) {
    return this.userService.updatePermissions(req.user.id, dto);
  }

  @Get('behavior-sync')
  async getBehaviorSync(@Request() req: AuthenticatedRequest) {
    return this.userService.getBehaviorSync(req.user.id);
  }

  @Patch('behavior-sync')
  async updateBehaviorSync(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateBehaviorSyncDto,
  ) {
    return this.userService.updateBehaviorSync(req.user.id, dto);
  }
}
