import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, JwtPayload } from './types';

export interface GoogleProfileInput {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private get allowedDomain(): string {
    return (
      this.config.get<string>('ALLOWED_EMAIL_DOMAIN') ?? 'w3itsolutions.net'
    ).toLowerCase();
  }

  private get adminEmails(): string[] {
    return (this.config.get<string>('ADMIN_EMAILS') ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }

  /**
   * Valida el login de Google: solo dominio de la empresa, una cuenta por email.
   * Hace upsert y asigna rol ADMIN si el email esta en ADMIN_EMAILS.
   */
  async validateGoogleLogin(profile: GoogleProfileInput): Promise<User> {
    const email = profile.email.toLowerCase();
    if (!email.endsWith(`@${this.allowedDomain}`)) {
      throw new UnauthorizedException(
        `Solo se permiten cuentas @${this.allowedDomain}`,
      );
    }

    const role: Role = this.adminEmails.includes(email)
      ? Role.ADMIN
      : Role.USER;

    return this.prisma.user.upsert({
      where: { email },
      create: {
        email,
        googleId: profile.googleId,
        name: profile.name,
        avatarUrl: profile.avatarUrl ?? null,
        role,
      },
      update: {
        googleId: profile.googleId,
        name: profile.name,
        avatarUrl: profile.avatarUrl ?? null,
        role,
      },
    });
  }

  signToken(user: Pick<User, 'id' | 'email' | 'role'>): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwt.sign(payload);
  }

  async findById(id: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
    };
  }
}
