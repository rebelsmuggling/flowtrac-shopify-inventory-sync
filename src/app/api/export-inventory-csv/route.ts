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
    const useDatabase = url.searchParams.get('useDatabase') === 'true';

    // Check if we should use database
    if (useDatabase) {
      console.log('Using database for CSV export');
      return await generateDatabaseCSV(includeMissingSkus);
    }

    // 1. Load mapping.json (try imported mapping first, then fallback to file)
    let mapping;
    const importedMapping = getImportedMapping();
    
    if (importedMapping) {
      console.log('Using imported mapping data for CSV export');
      mapping = importedMapping;
    } else {
      // Try to load from mapping API first
      try {
        const mappingRes = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/mapping`);
        if (mappingRes.ok) {
          const mappingData = await mappingRes.json();
          if (mappingData.success) {
            console.log('Using mapping API data for CSV export');
            mapping = mappingData.mapping;
          }
        }
      } catch (apiError) {
        console.log('Mapping API not available, falling back to file');
      }
      
      // Fallback to file system
      if (!mapping) {
        const mappingPath = path.join(process.cwd(), 'mapping.json');
        console.log('Using file mapping data for CSV export');
        mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
      }
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

    // 3. Generate inventory data with resilient processing like main sync
    console.log('Generating inventory data for CSV export');
    let flowtracInventory: Record<string, { quantity: number, bins: string[], binBreakdown: Record<string, number> }> = {};
    let skuProcessingResults: Record<string, { success: boolean, error?: string }> = {};
    let hitTimeout = false;
    
    // Check if Flowtrac credentials are available
    const hasFlowtracCredentials = process.env.FLOWTRAC_API_URL && process.env.FLOWTRAC_BADGE && process.env.FLOWTRAC_PIN;
    
    if (hasFlowtracCredentials) {
      try {
        // Try to import and use Flowtrac service
        const { fetchFlowtracInventoryWithBins } = await import('../../../../services/flowtrac');
        console.log('About to fetch inventory for SKUs:', Array.from(skus).slice(0, 10), '... (total:', skus.size, ')');
        
        // Process SKUs in smaller chunks like main sync
        const skuArray = Array.from(skus);
        const chunkSize = 5; // Small chunks for better reliability
        const chunks = [];
        for (let i = 0; i < skuArray.length; i += chunkSize) {
          chunks.push(skuArray.slice(i, i + chunkSize));
        }
        
        console.log(`Processing ${chunks.length} chunks of up to ${chunkSize} SKUs each`);
        
        // Add timeout protection for Vercel's 300-second limit
        const startTime = Date.now();
        const maxExecutionTime = 240000; // 4 minutes (leaving 1 minute buffer)
        let processedChunks = 0;
        let totalProcessedSkus = 0;
        let successfulSkus = 0;
        let failedSkus = 0;
        
        // Process each chunk
        for (let i = 0; i < chunks.length; i++) {
          // Check if we're approaching the timeout
          if (Date.now() - startTime > maxExecutionTime) {
            console.warn(`Approaching Vercel timeout, stopping at chunk ${i + 1}/${chunks.length}`);
            console.warn(`Processed ${processedChunks} chunks and ${totalProcessedSkus} SKUs before timeout`);
            hitTimeout = true;
            break;
          }
          
          const chunk = chunks[i];
          console.log(`Processing chunk ${i + 1}/${chunks.length} (${chunk.length} SKUs)`);
          
          // Process each SKU in the chunk individually for better error handling
          for (const sku of chunk) {
            // Check timeout before each SKU
            if (Date.now() - startTime > maxExecutionTime) {
              console.warn(`Approaching Vercel timeout, stopping SKU processing`);
              hitTimeout = true;
              break;
            }
            
            try {
              const skuInventory = await fetchFlowtracInventoryWithBins([sku]);
              Object.assign(flowtracInventory, skuInventory);
              skuProcessingResults[sku] = { success: true };
              successfulSkus++;
              console.log(`✓ Successfully processed SKU ${sku}`);
            } catch (skuError) {
              console.warn(`✗ Failed to fetch SKU ${sku}:`, (skuError as Error).message);
              skuProcessingResults[sku] = { 
                success: false, 
                error: (skuError as Error).message 
              };
              failedSkus++;
              
              // Try one retry with delay
              try {
                await new Promise(resolve => setTimeout(resolve, 200));
                const retryInventory = await fetchFlowtracInventoryWithBins([sku]);
                Object.assign(flowtracInventory, retryInventory);
                skuProcessingResults[sku] = { success: true };
                successfulSkus++;
                failedSkus--; // Adjust counts
                console.log(`✓ Retry successful for SKU ${sku}`);
              } catch (retryError) {
                console.warn(`✗ Retry also failed for SKU ${sku}:`, (retryError as Error).message);
                skuProcessingResults[sku] = { 
                  success: false, 
                  error: `Retry failed: ${(retryError as Error).message}` 
                };
              }
            }
            
            totalProcessedSkus++;
            
            // Small delay between SKUs
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          
          processedChunks++;
          
          // Delay between chunks
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        
        // Log final results
        const executionTime = Date.now() - startTime;
        hitTimeout = executionTime > maxExecutionTime;
        
        if (hitTimeout) {
          console.warn(`CSV export completed with timeout after ${executionTime}ms`);
          console.warn(`Final stats: ${processedChunks} chunks, ${totalProcessedSkus} SKUs processed out of ${skuArray.length} total`);
          console.warn(`Success: ${successfulSkus}, Failed: ${failedSkus}, Skipped: ${skuArray.length - totalProcessedSkus}`);
        } else {
          console.log('Successfully fetched Flowtrac inventory for CSV export');
          console.log(`Final stats: ${processedChunks} chunks, ${totalProcessedSkus} SKUs processed`);
          console.log(`Success: ${successfulSkus}, Failed: ${failedSkus}`);
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
          skuProcessingResults[sku] = { success: false, error: 'Using mock data due to Flowtrac error' };
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
        skuProcessingResults[sku] = { success: false, error: 'Using mock data - no Flowtrac credentials' };
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
    
    // Track which SKUs were successfully processed vs failed
    if (includeMissingSkus && hasFlowtracCredentials) {
      for (const sku of skus) {
        if (skuProcessingResults[sku]?.success === true) {
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
        
        // For bundle products, check if ALL components were successfully processed
        const allComponentsSuccess = product.bundle_components.every((comp: any) => 
          skuProcessingResults[comp.flowtrac_sku]?.success === true
        );
        row.valid_flowtrac_connection = allComponentsSuccess ? 'True' : 'False';
        
      } else if (product.flowtrac_sku) {
        // Simple product
        const available = flowtracInventory[product.flowtrac_sku]?.quantity || 0;
        const bins = flowtracInventory[product.flowtrac_sku]?.bins || [];
        
        row.flowtrac_available = available;
        row.shopify_quantity = available;
        row.amazon_quantity = available;
        row.flowtrac_bins = bins.join(', ');
        
        // For simple products, check if the SKU was successfully processed
        row.valid_flowtrac_connection = skuProcessingResults[product.flowtrac_sku]?.success === true ? 'True' : 'False';
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

async function generateDatabaseCSV(includeMissingSkus: boolean) {
  try {
    console.log('Generating CSV from database');

    // 1. Load mapping.json
    let mapping;
    const importedMapping = getImportedMapping();

    if (importedMapping) {
      console.log('Using imported mapping data for database CSV export');
      mapping = importedMapping;
    } else {
      const mappingPath = path.join(process.cwd(), 'mapping.json');
      console.log('Using file mapping data for database CSV export');
      mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    }

    // 2. Get inventory data from database
    const { getFlowtracInventory } = await import('../../../lib/database');
    const inventoryResult = await getFlowtracInventory(undefined, 'Manteca');

    if (!inventoryResult.success) {
      throw new Error(`Failed to get inventory from database: ${inventoryResult.error}`);
    }

    // Convert database records to the expected format
    const flowtracInventory: Record<string, { quantity: number, bins: string[] }> = {};
    for (const record of inventoryResult.data || []) {
      flowtracInventory[record.sku] = {
        quantity: record.quantity,
        bins: record.bins || []
      };
    }

    console.log(`Retrieved ${inventoryResult.data?.length || 0} inventory records from database`);

    // 3. Collect all SKUs from mapping
    const skus = new Set<string>();
    for (const product of mapping.products) {
      if (product.flowtrac_sku) skus.add(product.flowtrac_sku);
      if (Array.isArray(product.bundle_components)) {
        for (const comp of product.bundle_components) {
          if (comp.flowtrac_sku) skus.add(comp.flowtrac_sku);
        }
      }
    }

    // 4. Generate CSV data
    const csvData: any[] = [];
    const validSkus: string[] = [];
    const missingSkus: string[] = [];

    for (const product of mapping.products) {
      const row: any = {
        shopify_sku: product.shopify_sku || '',
        flowtrac_sku: product.flowtrac_sku || '',
        amazon_sku: product.amazon_sku || '',
        product_type: '',
        flowtrac_available: 0,
        shopify_quantity: 0,
        amazon_quantity: 0,
        bundle_components: '',
        flowtrac_bins: '',
        valid_flowtrac_connection: 'False',
        data_source: 'Database Inventory Data',
        last_updated: new Date().toISOString()
      };

      if (Array.isArray(product.bundle_components) && product.bundle_components.length > 0) {
        // Bundle product
        row.product_type = 'Bundle';
        row.bundle_components = product.bundle_components.map((comp: any) =>
          `${comp.flowtrac_sku}:${comp.quantity}`
        ).join('; ');

        // Calculate bundle quantity based on component availability
        const quantities = product.bundle_components.map((comp: any) => {
          const available = flowtracInventory[comp.flowtrac_sku]?.quantity || 0;
          const skuValid = flowtracInventory[comp.flowtrac_sku] !== undefined;
          if (skuValid) validSkus.push(comp.flowtrac_sku);
          else missingSkus.push(comp.flowtrac_sku);
          return Math.floor(available / comp.quantity);
        });

        const bundleQuantity = quantities.length > 0 ? Math.min(...quantities) : 0;
        row.flowtrac_available = bundleQuantity;
        row.shopify_quantity = bundleQuantity;
        row.amazon_quantity = bundleQuantity;

        // Check if all bundle components are valid
        const allComponentsValid = product.bundle_components.every((comp: any) =>
          flowtracInventory[comp.flowtrac_sku] !== undefined
        );
        row.valid_flowtrac_connection = allComponentsValid ? 'True' : 'False';

      } else if (product.flowtrac_sku) {
        // Simple product
        const available = flowtracInventory[product.flowtrac_sku]?.quantity || 0;
        const bins = flowtracInventory[product.flowtrac_sku]?.bins || [];
        const skuValid = flowtracInventory[product.flowtrac_sku] !== undefined;

        row.product_type = 'Simple';
        row.flowtrac_available = available;
        row.shopify_quantity = available;
        row.amazon_quantity = available;
        row.flowtrac_bins = bins.join(', ');
        row.valid_flowtrac_connection = skuValid ? 'True' : 'False';

        if (skuValid) validSkus.push(product.flowtrac_sku);
        else missingSkus.push(product.flowtrac_sku);
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
      const filename = `inventory-database-preview-${new Date().toISOString().split('T')[0]}.csv`;

      console.log('Database CSV export with missing SKU information completed successfully');

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
          dataSource: 'Database Inventory Data'
        }
      });
    } else {
      const filename = `inventory-database-preview-${new Date().toISOString().split('T')[0]}.csv`;

      console.log('Database CSV export completed successfully');

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

  } catch (error) {
    console.error('Database CSV export failed:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
} 