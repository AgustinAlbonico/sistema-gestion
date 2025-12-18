/**
 * Módulo de clientes
 * Agrupa todos los componentes relacionados con la gestión de clientes
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Customer } from './entities/customer.entity';
import { CustomerCategory } from './entities/customer-category.entity';

// Controllers
import { CustomersController } from './customers.controller';
import { CustomerCategoriesController } from './customer-categories.controller';

// Services
import { CustomersService } from './customers.service';
import { CustomerCategoriesService } from './customer-categories.service';

// Repositories
import { CustomersRepository } from './customers.repository';
import { CustomerCategoriesRepository } from './customer-categories.repository';

// Módulos externos
import { ConfigurationModule } from '../configuration/configuration.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Customer, CustomerCategory]),
        ConfigurationModule,
    ],
    controllers: [CustomersController, CustomerCategoriesController],
    providers: [
        CustomersService,
        CustomerCategoriesService,
        CustomersRepository,
        CustomerCategoriesRepository,
    ],
    exports: [CustomersService, CustomerCategoriesService],
})
export class CustomersModule { }

