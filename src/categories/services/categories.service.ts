import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { Category } from '../entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
  ) {}

  async findAll(): Promise<Category[]> {
    return this.categoriesRepository.find({
      relations: {
        parent: true,
      },
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
      name: createCategoryDto.name,
      isActive: createCategoryDto.isActive ?? true,
      parent,
    });

    return this.categoriesRepository.save(category);
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
      throw new BadRequestException(
        'A category cannot be its own parent',
      );
    }

    if (updateCategoryDto.name !== undefined) {
      category.name = updateCategoryDto.name;
    }

    if (updateCategoryDto.isActive !== undefined) {
      category.isActive = updateCategoryDto.isActive;
    }

    if (updateCategoryDto.parentID !== undefined) {
      category.parent = await this.findById(
        updateCategoryDto.parentID,
      );
    }

    return this.categoriesRepository.save(category);
  }
}