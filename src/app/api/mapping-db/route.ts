import { NextRequest, NextResponse } from 'next/server';
import { getMapping, updateMapping, getMappingHistory, migrateMappingFromGitHub } from '../../../lib/database';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'get';
    
    switch (action) {
      case 'get':
        const mappingResult = await getMapping();
        if (!mappingResult.success) {
          return NextResponse.json({ 
            success: false, 
            error: mappingResult.error 
          }, { status: 404 });
        }
        
        return NextResponse.json({ 
          success: true, 
          mapping: mappingResult.data,
          source: 'database'
        });
        
      case 'history':
        const limit = parseInt(url.searchParams.get('limit') || '10');
        const historyResult = await getMappingHistory(limit);
        
        if (!historyResult.success) {
          return NextResponse.json({ 
            success: false, 
            error: historyResult.error 
          }, { status: 500 });
        }
        
        return NextResponse.json({ 
          success: true, 
          history: historyResult.data
        });
        
      case 'migrate':
        const migrateResult = await migrateMappingFromGitHub();
        
        if (!migrateResult.success) {
          return NextResponse.json({ 
            success: false, 
            error: migrateResult.error 
          }, { status: 500 });
        }
        
        return NextResponse.json({ 
          success: true, 
          message: migrateResult.message,
          data: migrateResult.data
        });
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action'
        }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Database mapping API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mapping, updatedBy } = body;
    
    if (!mapping || !mapping.products) {
      return NextResponse.json({ 
        success: false, 
        error: 'No mapping data provided' 
      }, { status: 400 });
    }
    
    const result = await updateMapping(mapping, updatedBy || 'api');
    
    if (!result.success) {
      return NextResponse.json({ 
        success: false, 
        error: result.error 
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Successfully updated mapping with ${mapping.products?.length || 0} products`,
      productCount: mapping.products?.length || 0,
      version: result.data.version,
      updatedAt: result.data.last_updated
    });
    
  } catch (error) {
    console.error('Update mapping error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
