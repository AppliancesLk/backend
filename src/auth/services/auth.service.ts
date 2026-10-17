import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../../users/services/users.service';
import { User } from '../../users/entities/user.entity';
import { AuthSession } from '../entities/auth-session.entity';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { sessionDuration } from '../session.config';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    @InjectRepository(AuthSession)
    private readonly sessions: Repository<AuthSession>,
  ) {}

  publicUser(user: User) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };
  }

  async register(dto: RegisterDto) {
    if (
      (await this.usersService.findByEmail(dto.email)) ||
      (await this.usersService.findByUsername(dto.username))
    ) {
      throw new ConflictException('Username or email is already registered');
    }
    // bcrypt only handles up to 72 bytes, including multi-byte characters.
    if (Buffer.byteLength(dto.password, 'utf8') > 72)
      throw new ConflictException('Password must be at most 72 bytes');
    const hash = await bcrypt.hash(dto.password, 12);
    try {
      const user = await this.usersService.createCustomer(
        dto.email,
        dto.username,
        hash,
      );
      return await this.createSession(user);
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('Username or email is already registered');
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = dto.username.includes('@')
      ? await this.usersService.findByEmail(dto.username)
      : await this.usersService.findByUsername(dto.username);
    if (
      !user ||
      !user.isActive ||
      Buffer.byteLength(dto.password, 'utf8') > 72 ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid username or password');
    }
    return this.createSession(user);
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async createSession(user: User) {
    await this.sessions.delete({ expiresAt: LessThan(new Date()) });
    const token = randomBytes(32).toString('hex');
    await this.sessions.save(
      this.sessions.create({
        tokenHash: this.hash(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + sessionDuration()),
      }),
    );
    return { token, user: this.publicUser(user) };
  }

  async authenticate(token?: string) {
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException('Please sign in');
    const session = await this.sessions.findOne({
      where: { tokenHash: this.hash(token) },
      relations: { user: true },
    });
    if (
      !session ||
      session.expiresAt.getTime() <= Date.now() ||
      !session.user.isActive
    ) {
      if (session) await this.sessions.delete({ tokenHash: session.tokenHash });
      throw new UnauthorizedException(
        'Your session has expired. Please sign in again',
      );
    }
    return this.publicUser(session.user);
  }

  async logout(token?: string) {
    if (token) await this.sessions.delete({ tokenHash: this.hash(token) });
  }
}
