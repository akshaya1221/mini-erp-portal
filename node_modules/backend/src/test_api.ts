import { prisma } from './server';

const API_URL = 'http://localhost:4000';

async function runTests() {
  console.log('--- STARTING API VERIFICATION ---');

  // Helper to make requests
  async function apiCall(path: string, options: RequestInit = {}) {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    const status = res.status;
    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status, data };
  }

  // 1. Test Login & Roles
  console.log('\n1. Testing Login for all 4 roles...');
  const roles = [
    { email: 'admin@example.com', role: 'ADMIN' },
    { email: 'sales@example.com', role: 'SALES' },
    { email: 'warehouse@example.com', role: 'WAREHOUSE' },
    { email: 'accounts@example.com', role: 'ACCOUNTS' },
  ];

  const tokens: Record<string, string> = {};

  for (const { email, role } of roles) {
    const { status, data } = await apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'Password123!' }),
    });

    if (status !== 200 || !data.token) {
      throw new Error(`Login failed for ${email} with status ${status}`);
    }
    tokens[role] = data.token;
    console.log(`  ✓ Login success for ${role} (${email})`);
  }

  // 2. Verify Role-Based Access Control (RBAC)
  console.log('\n2. Verifying RBAC restrictions (should return 403 for forbidden routes)...');

  // Admin only route: Product creation
  // Test with SALES token (Should return 403)
  const productSku = `TP-${Date.now()}`;
  const productPayload = {
    name: 'Test Product X',
    sku: productSku,
    category: 'Test',
    unitPrice: 100,
    currentStock: 50,
    minStockAlert: 5,
    warehouseLocation: 'Z9',
  };

  const salesProductRes = await apiCall('/products', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.SALES}` },
    body: JSON.stringify(productPayload),
  });
  if (salesProductRes.status !== 403) {
    throw new Error(`Expected 403 when Sales user creates a product, got ${salesProductRes.status}`);
  }
  console.log('  ✓ Product creation blocked for SALES role (403)');

  // Test with ADMIN token (Should succeed 201)
  const adminProductRes = await apiCall('/products', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.ADMIN}` },
    body: JSON.stringify(productPayload),
  });
  if (adminProductRes.status !== 201) {
    throw new Error(`Expected 201 when Admin user creates a product, got ${adminProductRes.status}`);
  }
  const createdProduct = adminProductRes.data;
  console.log(`  ✓ Product creation allowed for ADMIN role (201, ID: ${createdProduct.id})`);

  // Warehouse only route: Stock Movement creation
  // Test with SALES token (Should return 403)
  const movementPayload = {
    productId: createdProduct.id,
    quantityChanged: 5,
    movementType: 'IN',
    reason: 'Test Restock',
  };
  const salesMovementRes = await apiCall('/stock-movements', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.SALES}` },
    body: JSON.stringify(movementPayload),
  });
  if (salesMovementRes.status !== 403) {
    throw new Error(`Expected 403 when Sales user logs a stock movement, got ${salesMovementRes.status}`);
  }
  console.log('  ✓ Stock movement creation blocked for SALES role (403)');

  // Test with WAREHOUSE token (Should succeed 201)
  const whMovementRes = await apiCall('/stock-movements', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.WAREHOUSE}` },
    body: JSON.stringify(movementPayload),
  });
  if (whMovementRes.status !== 201) {
    throw new Error(`Expected 201 when Warehouse user logs a stock movement, got ${whMovementRes.status}`);
  }
  console.log('  ✓ Stock movement creation allowed for WAREHOUSE role (201)');

  // Sales only route: Challan creation
  const customerList = await apiCall('/customers', {
    method: 'GET',
    headers: { Authorization: `Bearer ${tokens.SALES}` },
  });
  const customerId = customerList.data.data[0].id;

  const challanPayload = {
    customerId,
    items: [{ productId: createdProduct.id, quantity: 10 }],
  };

  const adminChallanRes = await apiCall('/challans', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.ADMIN}` },
    body: JSON.stringify(challanPayload),
  });
  if (adminChallanRes.status !== 403) {
    throw new Error(`Expected 403 when Admin user creates a challan, got ${adminChallanRes.status}`);
  }
  console.log('  ✓ Challan creation blocked for ADMIN role (403)');

  const salesChallanRes = await apiCall('/challans', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.SALES}` },
    body: JSON.stringify(challanPayload),
  });
  if (salesChallanRes.status !== 201) {
    throw new Error(`Expected 201 when Sales user creates a challan, got ${salesChallanRes.status}`);
  }
  const createdChallan = salesChallanRes.data;
  console.log(`  ✓ Challan creation allowed for SALES role (201, Number: ${createdChallan.challanNumber})`);

  // 3. Challan Business Logic, Stock rollbacks, snapshots
  console.log('\n3. Verifying Challan business logic & stock transactions...');

  // Check product stock before confirm
  const productBefore = await apiCall(`/products`, {
    headers: { Authorization: `Bearer ${tokens.SALES}` },
  });
  const initialStock = productBefore.data.data.find((p: any) => p.id === createdProduct.id).currentStock;
  console.log(`  Initial stock of product: ${initialStock}`);

  // Confirm Challan (SALES role)
  console.log('  Confirming challan...');
  const confirmRes = await apiCall(`/challans/${createdChallan.id}/confirm`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokens.SALES}` },
  });
  if (confirmRes.status !== 200) {
    throw new Error(`Expected 200 on confirm, got ${confirmRes.status}: ${JSON.stringify(confirmRes.data)}`);
  }
  console.log('  ✓ Challan confirmed successfully');

  // Verify stock is reduced
  const productAfter = await apiCall(`/products`, {
    headers: { Authorization: `Bearer ${tokens.SALES}` },
  });
  const stockAfter = productAfter.data.data.find((p: any) => p.id === createdProduct.id).currentStock;
  console.log(`  Stock after confirm: ${stockAfter}`);
  if (stockAfter !== initialStock - 10) {
    throw new Error(`Stock did not reduce correctly! Expected ${initialStock - 10}, got ${stockAfter}`);
  }
  console.log('  ✓ Stock reduced correctly');

  // Verify StockMovement log is created
  const movementsRes = await apiCall(`/products/${createdProduct.id}/movements`, {
    headers: { Authorization: `Bearer ${tokens.SALES}` },
  });
  const recentMovement = movementsRes.data.data[0];
  if (!recentMovement || recentMovement.quantityChanged !== 10 || recentMovement.movementType !== 'OUT') {
    throw new Error(`Stock movement log not verified correctly! Got: ${JSON.stringify(recentMovement)}`);
  }
  console.log(`  ✓ Stock movement log verified: ${recentMovement.reason} (Type: ${recentMovement.movementType}, Qty: ${recentMovement.quantityChanged})`);

  // Test rollback on insufficient stock
  console.log('  Testing rollback when stock is insufficient...');
  const excessChallanRes = await apiCall('/challans', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.SALES}` },
    body: JSON.stringify({
      customerId,
      items: [{ productId: createdProduct.id, quantity: stockAfter + 10 }], // Request more than we have
    }),
  });
  const excessChallan = excessChallanRes.data;
  console.log(`  Created draft excess challan ${excessChallan.challanNumber}`);

  const badConfirmRes = await apiCall(`/challans/${excessChallan.id}/confirm`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokens.SALES}` },
  });
  if (badConfirmRes.status !== 400) {
    throw new Error(`Expected 400 on insufficient stock confirm, got ${badConfirmRes.status}`);
  }
  console.log('  ✓ Failed to confirm with 400 error as expected');

  // Verify stock was NOT reduced (rollback check)
  const productAfterFailed = await apiCall(`/products`, {
    headers: { Authorization: `Bearer ${tokens.SALES}` },
  });
  const stockAfterFailed = productAfterFailed.data.data.find((p: any) => p.id === createdProduct.id).currentStock;
  if (stockAfterFailed !== stockAfter) {
    throw new Error(`Stock changed after a failed transaction! Expected ${stockAfter}, got ${stockAfterFailed}`);
  }
  console.log('  ✓ Verified transaction rolled back and stock remains intact');

  // 4. Snapshot Integrity
  console.log('\n4. Verifying Snapshot Integrity...');
  // Edit the product's unit price (Admin role)
  console.log(`  Editing source product unitPrice from 100 to 150...`);
  const editProductRes = await apiCall(`/products/${createdProduct.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokens.ADMIN}` },
    body: JSON.stringify({
      ...productPayload,
      currentStock: stockAfter,
      unitPrice: 150,
    }),
  });
  if (editProductRes.status !== 200) {
    throw new Error(`Failed to edit product: ${editProductRes.status}`);
  }

  // Get confirmed challan details
  const confirmedChallanDetails = await apiCall(`/challans/${createdChallan.id}`, {
    headers: { Authorization: `Bearer ${tokens.SALES}` },
  });
  console.log('  Debug: Confirmed Challan items:', JSON.stringify(confirmedChallanDetails.data.items));
  const snapshotPrice = confirmedChallanDetails.data.items[0].unitPriceSnapshot;
  console.log(`  Snapshot price in confirmed challan: ${snapshotPrice}`);
  if (snapshotPrice !== 100) {
    throw new Error(`Snapshot price changed! Expected 100, got ${snapshotPrice}`);
  }
  console.log('  ✓ Snapshot integrity verified (price remains 100)');

  // 5. Cancel Challan (Restocking)
  console.log('\n5. Verifying Cancel Challan Restocking...');
  const cancelRes = await apiCall(`/challans/${createdChallan.id}/cancel`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokens.SALES}` },
  });
  if (cancelRes.status !== 200) {
    throw new Error(`Expected 200 on cancel, got ${cancelRes.status}: ${JSON.stringify(cancelRes.data)}`);
  }
  console.log('  ✓ Challan cancelled successfully');

  // Verify stock is restored
  const productAfterCancel = await apiCall(`/products`, {
    headers: { Authorization: `Bearer ${tokens.SALES}` },
  });
  const foundProd = productAfterCancel.data.data.find((p: any) => p.id === createdProduct.id);
  console.log('  Debug: Product stock after cancel:', foundProd.currentStock, 'Product:', JSON.stringify(foundProd));
  const stockAfterCancel = foundProd.currentStock;
  console.log(`  Stock after cancel: ${stockAfterCancel}`);
  if (stockAfterCancel !== stockAfter + 10) {
    throw new Error(`Stock did not restore! Expected ${stockAfter + 10}, got ${stockAfterCancel}`);
  }
  console.log('  ✓ Stock restored to original level successfully');

  // Verify StockMovement log is created for restore
  const cancelMovementsRes = await apiCall(`/products/${createdProduct.id}/movements`, {
    headers: { Authorization: `Bearer ${tokens.SALES}` },
  });
  const recentCancelMovement = cancelMovementsRes.data.data[0];
  if (!recentCancelMovement || recentCancelMovement.quantityChanged !== 10 || recentCancelMovement.movementType !== 'IN') {
    throw new Error(`Stock movement log for cancel not verified! Got: ${JSON.stringify(recentCancelMovement)}`);
  }
  console.log(`  ✓ Restock movement log verified: ${recentCancelMovement.reason} (Type: ${recentCancelMovement.movementType}, Qty: ${recentCancelMovement.quantityChanged})`);

  // 6. Concurrency safe Challan Numbering
  console.log('\n6. Verifying Concurrent Challan numbering...');
  const concurrentCount = 5;
  const promises = [];
  for (let i = 0; i < concurrentCount; i++) {
    promises.push(
      apiCall('/challans', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.SALES}` },
        body: JSON.stringify(challanPayload),
      })
    );
  }

  const results = await Promise.all(promises);
  const challanNumbers = results.map((r) => r.data.challanNumber);
  console.log('  Generated concurrent challan numbers:', challanNumbers);

  const uniqueNumbers = new Set(challanNumbers);
  if (uniqueNumbers.size !== concurrentCount) {
    throw new Error(`Duplicate challan numbers generated! Got: ${challanNumbers}`);
  }
  if (results.some((r) => r.status !== 201)) {
    throw new Error(`Some concurrent creations failed! Statuses: ${results.map((r) => r.status)}`);
  }
  console.log(`  ✓ Concurrency verified! All ${concurrentCount} challans created successfully with unique numbers`);

  console.log('\n--- ALL VERIFICATIONS PASSED SUCCESSFULLY! ---');
}

runTests().catch((err) => {
  console.error('\n❌ VERIFICATION FAILED:');
  console.error(err);
  process.exit(1);
});
