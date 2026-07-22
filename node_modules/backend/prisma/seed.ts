import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const users = [
    { name: 'Admin User', email: 'admin@example.com', passwordHash, role: Role.ADMIN },
    { name: 'Sales User', email: 'sales@example.com', passwordHash, role: Role.SALES },
    { name: 'Warehouse User', email: 'warehouse@example.com', passwordHash, role: Role.WAREHOUSE },
    { name: 'Accounts User', email: 'accounts@example.com', passwordHash, role: Role.ACCOUNTS }
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: user
    });
  }

  const products = [
    { name: 'Steel Rod', sku: 'ST-001', category: 'Metal', unitPrice: 120, currentStock: 100, minStockAlert: 20, warehouseLocation: 'A1' },
    { name: 'Cable Wire', sku: 'CW-002', category: 'Electrical', unitPrice: 85, currentStock: 40, minStockAlert: 10, warehouseLocation: 'B3' },
    { name: 'Paint Bucket', sku: 'PB-003', category: 'Paint', unitPrice: 260, currentStock: 15, minStockAlert: 8, warehouseLocation: 'C2' }
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { sku: product.sku },
      update: {},
      create: product
    });
  }

  const customers = [
    { name: 'Ravi Kumar', mobile: '9876543210', email: 'ravi@example.com', businessName: 'Kumar Traders', gstNumber: '29ABCDE1234F1Z5', customerType: 'WHOLESALE' as const, address: 'Bengaluru', status: 'ACTIVE' as const, followUpDate: new Date('2026-07-25') },
    { name: 'Nisha Rao', mobile: '9123456780', email: 'nisha@example.com', businessName: 'Rao Industries', gstNumber: null, customerType: 'RETAIL' as const, address: 'Hyderabad', status: 'LEAD' as const, followUpDate: new Date('2026-07-22') }
  ];

  for (const customer of customers) {
    await prisma.customer.upsert({
      where: { id: (await prisma.customer.findFirst({ where: { mobile: customer.mobile } }))?.id ?? -1 },
      update: {},
      create: customer
    });
  }

  console.log('Seed completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
