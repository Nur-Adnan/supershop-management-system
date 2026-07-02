import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CustomerGroupsController } from "./customer-groups.controller";
import { CustomerGroupsRepository } from "./customer-group.repository";
import { CustomerGroup, CustomerGroupSchema } from "./customer-group.schema";
import { CustomerGroupsService } from "./customer-groups.service";
import { CustomersController } from "./customers.controller";
import { CustomersRepository } from "./customer.repository";
import { Customer, CustomerSchema } from "./customer.schema";
import { CustomersService } from "./customers.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: CustomerGroup.name, schema: CustomerGroupSchema },
    ]),
  ],
  controllers: [CustomersController, CustomerGroupsController],
  providers: [
    CustomersService,
    CustomersRepository,
    CustomerGroupsService,
    CustomerGroupsRepository,
  ],
  exports: [CustomersService, CustomerGroupsService, CustomersRepository, CustomerGroupsRepository],
})
export class CustomersModule {}
