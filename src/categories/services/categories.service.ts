import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { Category } from '../entities/category.entity';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
  ) {}

  async findAll(
    includeInactive = false,
    manager?: EntityManager,
  ): Promise<Category[]> {
    const repository =
      manager?.getRepository(Category) ?? this.categoriesRepository;
    const categories = await repository.find({
      relations: {
        parent: true,
      },
    });
    if (includeInactive) return categories;
    const byId = new Map(
      categories.map((category) => [category.categoryID, category]),
    );
    return categories.filter((category) => {
      let current: Category | undefined = category;
      const visited = new Set<string>();
      while (current) {
        if (!current.isActive || visited.has(current.categoryID)) return false;
        visited.add(current.categoryID);
        current = current.parent
          ? byId.get(current.parent.categoryID)
          : undefined;
      }
      return true;
    });
  }

  async findById(categoryID: string): Promise<Category> {
    const category = await this.categoriesRepository.findOne({
      where: { categoryID },
      relations: {
        parent: true,
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    let parent: Category | null = null;

    if (createCategoryDto.parentID) {
      parent = await this.findById(createCategoryDto.parentID);
    }

    const category = this.categoriesRepository.create({
      imageUrl: createCategoryDto.imageUrl ?? null,
      name: createCategoryDto.name,
      isActive: createCategoryDto.isActive ?? true,
      parent,
    });

    return this.persist(category, 'create');
  }

  async update(
    categoryID: string,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<Category> {
    const category = await this.findById(categoryID);

    if (
      updateCategoryDto.parentID &&
      updateCategoryDto.parentID === categoryID
    ) {
      throw new BadRequestException('A category cannot be its own parent');
    }

    if (updateCategoryDto.name !== undefined) {
      category.name = updateCategoryDto.name;
    }
    if (updateCategoryDto.imageUrl !== undefined)
      category.imageUrl = updateCategoryDto.imageUrl;

    if (updateCategoryDto.isActive !== undefined) {
      category.isActive = updateCategoryDto.isActive;
    }

    if (updateCategoryDto.parentID !== undefined) {
      if (updateCategoryDto.parentID) {
        const all = await this.findAll(true);
        const byId = new Map(all.map((item) => [item.categoryID, item]));
        const visited = new Set([categoryID]);
        let next: string | undefined = updateCategoryDto.parentID;
        while (next) {
          if (visited.has(next))
            throw new BadRequestException(
              'Category hierarchy cannot contain a cycle',
            );
          visited.add(next);
          next = byId.get(next)?.parent?.categoryID;
        }
        category.parent = await this.findById(updateCategoryDto.parentID);
      } else category.parent = null;
    }

    return this.persist(category, 'update');
  }
  private async persist(category: Category, operation: 'create' | 'update') {
    try {
      const saved = await this.categoriesRepository.save(category);
      this.logger.log(`Category ${operation}: categoryId=${saved.categoryID}`);
      return saved;
    } catch (error) {
      this.logger.error(
        `Category ${operation} failed: categoryId=${category.categoryID ?? 'new'}`,
      );
      throw error;
    }
  }
}
