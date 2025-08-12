import { NextRequest, NextResponse } from 'next/server';
import { getImportedMapping } from '../../../utils/imported-mapping-store';
import path from 'path';
import fs from 'fs';

export async function GET(request: NextRequest) {
  try {
    console.log('Testing Flowtrac connection...');
    
    // Check Flowtrac credentials
    const hasFlowtracCredentials = process.env.FLOWTRAC_API_URL && process.env.FLOWTRAC_BADGE && process.env.FLOWTRAC_PIN;
    
    if (!hasFlowtracCredentials) {
      return NextResponse.json({
        success: false,
        error: 'Flowtrac credentials not configured',
        details: {
          FLOWTRAC_API_URL: !!process.env.FLOWTRAC_API_URL,
          FLOWTRAC_BADGE: !!process.env.FLOWTRAC_BADGE,
          FLOWTRAC_PIN: !!process.env.FLOWTRAC_PIN
        }
      });
    }

    // Test authentication
    let authResult = null;
    let authError = null;
    
    try {
      const axios = require('axios');
      const qs = require('qs');
      
      console.log('Attempting Flowtrac authentication...');
      const loginRes = await axios.post(
        `${process.env.FLOWTRAC_API_URL}/device-login/`,
        qs.stringify({ 
          badge: process.env.FLOWTRAC_BADGE, 
          pin: process.env.FLOWTRAC_PIN 
        }),
        { 
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, 
          withCredentials: true,
          timeout: 10000
        }
      );
      
      const cookies = loginRes.headers['set-cookie'];
      if (!cookies) {
        throw new Error('No session cookie from Flowtrac login');
      }
      
      const flowAuthCookie = cookies.find((c: string) => c.startsWith('flow_auth='));
      if (!flowAuthCookie) {
        throw new Error('No flow_auth cookie from Flowtrac login');
      }
      
      authResult = {
        success: true,
        hasCookie: true,
        cookieLength: flowAuthCookie.length
      };
      
      console.log('Flowtrac authentication successful');
      
    } catch (error) {
      authError = {
        message: (error as Error).message,
        status: (error as any).response?.status,
        statusText: (error as any).response?.statusText
      };
      console.error('Flowtrac authentication failed:', authError);
    }

    // Load mapping to get some test SKUs
    let mapping;
    const importedMapping = getImportedMapping();
    
    if (importedMapping) {
      mapping = importedMapping;
    } else {
      const mappingPath = path.join(process.cwd(), 'mapping.json');
      mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    }
    
    // Get a few test SKUs
    const testSkus = [];
    for (const product of mapping.products.slice(0, 3)) {
      if (product.flowtrac_sku) {
        testSkus.push({
          sku: product.flowtrac_sku,
          hasProductId: !!product.flowtrac_product_id,
          productId: product.flowtrac_product_id
        });
      }
    }
    
    return NextResponse.json({
      success: !authError,
      flowtrac_credentials: hasFlowtracCredentials,
      authentication: authResult,
      auth_error: authError,
      test_skus: testSkus,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_URL: process.env.VERCEL_URL || 'localhost'
      }
    });
    
  } catch (error) {
    console.error('Flowtrac connection test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
      stack: (error as Error).stack?.split('\n').slice(0, 5)
    }, { status: 500 });
  }
}
