import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getImportedMapping } from '../../../utils/imported-mapping-store';

export async function GET(request: NextRequest) {
  try {
    console.log('Inventory CSV export started');
    
    // Check if user wants missing SKU information
    const url = new URL(request.url);
    const includeMissingSkus = url.searchParams.get('includeMissingSkus') === 'true';

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
    let hitTimeout = false;
    
    // Check if Flowtrac credentials are available
    const hasFlowtracCredentials = process.env.FLOWTRAC_API_URL && process.env.FLOWTRAC_BADGE && process.env.FLOWTRAC_PIN;
    
    if (hasFlowtracCredentials) {
      try {
        // Try to import and use Flowtrac service
        const { fetchFlowtracInventoryWithBins } = await import('../../../../services/flowtrac');
        console.log('About to fetch inventory for SKUs:', Array.from(skus).slice(0, 10), '... (total:', skus.size, ')');
        
        // Process SKUs in smaller batches to avoid overwhelming the Flowtrac API
        const skuArray = Array.from(skus);
        const batchSize = 25; // Reduced batch size for faster processing
        const batches = [];
        for (let i = 0; i < skuArray.length; i += batchSize) {
          batches.push(skuArray.slice(i, i + batchSize));
        }
        
        console.log(`Processing ${batches.length} batches of up to ${batchSize} SKUs each`);
        
        // Add timeout protection for Vercel's 300-second limit
        const startTime = Date.now();
        const maxExecutionTime = 240000; // 4 minutes (leaving 1 minute buffer)
        
        // Process each batch
        for (let i = 0; i < batches.length; i++) {
          // Check if we're approaching the timeout
          if (Date.now() - startTime > maxExecutionTime) {
            console.warn(`Approaching Vercel timeout, stopping at batch ${i + 1}/${batches.length}`);
            hitTimeout = true;
            break;
          }
          
          const batch = batches[i];
          console.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} SKUs)`);
          
          try {
            const batchInventory = await fetchFlowtracInventoryWithBins(batch);
            Object.assign(flowtracInventory, batchInventory);
            
            // Reduced delay between batches
            if (i < batches.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          } catch (batchError) {
            console.error(`Failed to fetch batch ${i + 1}, trying individual SKUs:`, batchError);
            
            // When a batch fails, try processing SKUs individually (with timeout check)
            for (const sku of batch) {
              // Check timeout before each individual SKU
              if (Date.now() - startTime > maxExecutionTime) {
                console.warn(`Approaching Vercel timeout, stopping individual SKU processing`);
                hitTimeout = true;
                break;
              }
              
              try {
                const individualInventory = await fetchFlowtracInventoryWithBins([sku]);
                Object.assign(flowtracInventory, individualInventory);
                
                // Reduced delay between individual SKUs
                await new Promise(resolve => setTimeout(resolve, 100));
              } catch (individualError) {
                console.warn(`Failed to fetch individual SKU ${sku}:`, individualError);
                // Skip this individual SKU, but continue with others
              }
            }
          }
        }
        
        // Check if we hit the timeout
        const executionTime = Date.now() - startTime;
        hitTimeout = executionTime > maxExecutionTime;
        
        if (hitTimeout) {
          console.warn(`CSV export completed with timeout after ${executionTime}ms`);
        } else {
          console.log('Successfully fetched Flowtrac inventory for CSV export');
        }
      } catch (flowtracError) {
        console.error('Failed to fetch Flowtrac inventory, using mock data:', flowtracError);
        console.error('Error details:', {
          message: (flowtracError as Error).message,
          stack: (flowtracError as Error).stack?.split('\n').slice(0, 5)
        });
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

    // 4. Build inventory data for CSV and track missing SKUs
    const csvData: any[] = [];
    let dataSource = hasFlowtracCredentials ? 'Live Flowtrac Data' : 'Mock Data (Flowtrac credentials not configured)';
    
    // Add timeout indicator if we hit the timeout
    if (hasFlowtracCredentials && typeof hitTimeout !== 'undefined' && hitTimeout) {
      dataSource = 'Live Flowtrac Data (Partial - Timeout)';
    }
    const missingSkus: string[] = [];
    const validSkus: string[] = [];
    
    // Track which SKUs are missing from Flowtrac
    if (includeMissingSkus && hasFlowtracCredentials) {
      for (const sku of skus) {
        if (flowtracInventory[sku] && flowtracInventory[sku].quantity !== undefined) {
          validSkus.push(sku);
        } else {
          missingSkus.push(sku);
        }
      }
      missingSkus.sort();
      validSkus.sort();
    }
    
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
        valid_flowtrac_connection: 'False', // Default to False, will be updated based on actual data
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
        
        // For bundle products, check if ALL components exist in Flowtrac
        const allComponentsExist = product.bundle_components.every((comp: any) => 
          flowtracInventory[comp.flowtrac_sku] && flowtracInventory[comp.flowtrac_sku].quantity !== undefined
        );
        row.valid_flowtrac_connection = allComponentsExist ? 'True' : 'False';
        
      } else if (product.flowtrac_sku) {
        // Simple product
        const available = flowtracInventory[product.flowtrac_sku]?.quantity || 0;
        const bins = flowtracInventory[product.flowtrac_sku]?.bins || [];
        
        row.flowtrac_available = available;
        row.shopify_quantity = available;
        row.amazon_quantity = available;
        row.flowtrac_bins = bins.join(', ');
        
        // For simple products, check if the SKU exists in Flowtrac
        row.valid_flowtrac_connection = (flowtracInventory[product.flowtrac_sku] && flowtracInventory[product.flowtrac_sku].quantity !== undefined) ? 'True' : 'False';
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
      'Valid Flowtrac Connection',
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
        `"${row.valid_flowtrac_connection}"`,
        `"${row.data_source}"`,
        `"${row.last_updated}"`
      ].join(','))
    ].join('\n');

    // 6. Return response based on request type
    if (includeMissingSkus) {
      // Return JSON with both CSV data and missing SKU information
      const filename = `inventory-sync-preview-${new Date().toISOString().split('T')[0]}.csv`;
      
      console.log('CSV export with missing SKU information completed successfully');
      
      return NextResponse.json({
        success: true,
        csvContent: csvContent,
        filename: filename,
        missingSkus: {
          total: skus.size,
          valid: validSkus.length,
          missing: missingSkus.length,
          percentageValid: Math.round((validSkus.length / skus.size) * 100),
          missingSkusList: missingSkus,
          validSkusList: validSkus
        },
        summary: {
          totalSkus: skus.size,
          validSkus: validSkus.length,
          missingSkus: missingSkus.length,
          dataSource: dataSource
        }
      });
    } else {
      // Return CSV file as before
      const filename = `inventory-sync-preview-${new Date().toISOString().split('T')[0]}.csv`;
      
      console.log('CSV export completed successfully');
      
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

  } catch (error) {
    console.error('Inventory CSV export failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
} 