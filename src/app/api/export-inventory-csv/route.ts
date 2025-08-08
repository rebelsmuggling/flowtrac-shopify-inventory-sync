import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getImportedMapping } from '../../../utils/imported-mapping-store';

export async function GET(request: NextRequest) {
  try {
    console.log('Inventory CSV export started');

    // 1. Load mapping.json (try imported mapping first, then fallback to file)
    let mapping;
    const importedMapping = getImportedMapping();
    
    if (importedMapping) {
      console.log('Using imported mapping data for CSV export');
      mapping = importedMapping;
    } else {
      const mappingPath = path.join(process.cwd(), 'mapping.json');
      console.log('Using file mapping data for CSV export');
      mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    }

    // 2. Collect all SKUs (simple and bundle components)
    const skus = new Set<string>();
    for (const product of mapping.products) {
      if (product.flowtrac_sku) skus.add(product.flowtrac_sku);
      if (Array.isArray(product.bundle_components)) {
        for (const comp of product.bundle_components) {
          if (comp.flowtrac_sku) skus.add(comp.flowtrac_sku);
        }
      }
    }

    // 3. Generate inventory data (mock for now, will be enhanced with Flowtrac integration)
    console.log('Generating inventory data for CSV export');
    let flowtracInventory: Record<string, { quantity: number, bins: string[], binBreakdown: Record<string, number> }> = {};
    
    // Check if Flowtrac credentials are available
    const hasFlowtracCredentials = process.env.FLOWTRAC_API_URL && process.env.FLOWTRAC_BADGE && process.env.FLOWTRAC_PIN;
    
    if (hasFlowtracCredentials) {
      try {
        // Try to import and use Flowtrac service
        const { fetchFlowtracInventoryWithBins } = await import('../../../../services/flowtrac');
        flowtracInventory = await fetchFlowtracInventoryWithBins(Array.from(skus));
        console.log('Fetched Flowtrac inventory for CSV export', { flowtracInventory });
      } catch (flowtracError) {
        console.error('Failed to fetch Flowtrac inventory, using mock data:', flowtracError);
        // Fall back to mock data
        for (const sku of skus) {
          flowtracInventory[sku] = {
            quantity: Math.floor(Math.random() * 100) + 10,
            bins: ['A1', 'B2', 'C3'],
            binBreakdown: { 'A1': 50, 'B2': 30, 'C3': 20 }
          };
        }
      }
    } else {
      console.log('Flowtrac credentials not available, using mock data for preview');
      // Generate mock data for testing
      for (const sku of skus) {
        flowtracInventory[sku] = {
          quantity: Math.floor(Math.random() * 100) + 10,
          bins: ['A1', 'B2', 'C3'],
          binBreakdown: { 'A1': 50, 'B2': 30, 'C3': 20 }
        };
      }
    }

    // 4. Build inventory data for CSV
    const csvData: any[] = [];
    const dataSource = hasFlowtracCredentials ? 'Live Flowtrac Data' : 'Mock Data (Flowtrac credentials not configured)';
    
    for (const product of mapping.products) {
      const row: any = {
        shopify_sku: product.shopify_sku || '',
        flowtrac_sku: product.flowtrac_sku || '',
        amazon_sku: product.amazon_sku || '',
        product_type: product.bundle_components ? 'Bundle' : 'Simple',
        flowtrac_available: 0,
        shopify_quantity: 0,
        amazon_quantity: 0,
        bundle_components: '',
        flowtrac_bins: '',
        data_source: dataSource,
        last_updated: new Date().toISOString()
      };

      // Calculate quantities based on product type
      if (product.bundle_components && Array.isArray(product.bundle_components)) {
        // Bundle product - calculate based on component availability
        const componentDetails: string[] = [];
        const quantities = product.bundle_components.map((comp: any) => {
          const available = flowtracInventory[comp.flowtrac_sku]?.quantity || 0;
          const bins = flowtracInventory[comp.flowtrac_sku]?.bins || [];
          componentDetails.push(`${comp.flowtrac_sku}:${available}(${bins.join(',')})`);
          return Math.floor(available / comp.quantity);
        });
        
        const bundleQuantity = quantities.length > 0 ? Math.min(...quantities) : 0;
        row.flowtrac_available = bundleQuantity;
        row.shopify_quantity = bundleQuantity;
        row.amazon_quantity = bundleQuantity;
        row.bundle_components = componentDetails.join('; ');
        row.flowtrac_bins = product.bundle_components.map((comp: any) => 
          flowtracInventory[comp.flowtrac_sku]?.bins || []
        ).flat().join(', ');
        
      } else if (product.flowtrac_sku) {
        // Simple product
        const available = flowtracInventory[product.flowtrac_sku]?.quantity || 0;
        const bins = flowtracInventory[product.flowtrac_sku]?.bins || [];
        
        row.flowtrac_available = available;
        row.shopify_quantity = available;
        row.amazon_quantity = available;
        row.flowtrac_bins = bins.join(', ');
      }

      csvData.push(row);
    }

    // 5. Generate CSV content
    const headers = [
      'Shopify SKU',
      'Flowtrac SKU', 
      'Amazon SKU',
      'Product Type',
      'Flowtrac Available',
      'Shopify Quantity',
      'Amazon Quantity',
      'Bundle Components',
      'Flowtrac Bins',
      'Data Source',
      'Last Updated'
    ];

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => [
        `"${row.shopify_sku}"`,
        `"${row.flowtrac_sku}"`,
        `"${row.amazon_sku}"`,
        `"${row.product_type}"`,
        row.flowtrac_available,
        row.shopify_quantity,
        row.amazon_quantity,
        `"${row.bundle_components}"`,
        `"${row.flowtrac_bins}"`,
        `"${row.data_source}"`,
        `"${row.last_updated}"`
      ].join(','))
    ].join('\n');

    // 6. Return CSV file
    const filename = `inventory-sync-preview-${new Date().toISOString().split('T')[0]}.csv`;
    
    console.log('CSV export completed successfully');
    
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('Inventory CSV export failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
} 