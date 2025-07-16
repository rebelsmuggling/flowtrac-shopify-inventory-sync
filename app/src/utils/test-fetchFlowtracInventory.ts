import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { fetchFlowtracInventory } from '@/services/flowtrac';

async function test() {
  // Using real SKUs provided by the user
  const skus = [
    'IC-KOOL-0045',
    'IC-HCPK-0048',
    'IC-DAVI-012',
    'IC-BIGS-009'
  ];

  try {
    const result = await fetchFlowtracInventory(skus);
    console.log('Inventory result:', result);
  } catch (err) {
    console.error('Error:', err);
  }
}

test(); 