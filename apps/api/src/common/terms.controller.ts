import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('System')
@Controller('public/terms')
export class PublicTermsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Public, unauthenticated copy of the published Terms & Conditions. */
  @Public()
  @Get()
  async get() {
    const settings = await this.prisma.systemSetting.findMany({
      where: { key: { in: ['terms.title', 'terms.content'] } },
    });
    const map = new Map(settings.map((s) => [s.key, s.value ?? '']));
    return {
      title: map.get('terms.title') || 'Terms & Conditions',
      content: map.get('terms.content') || '',
    };
  }
}