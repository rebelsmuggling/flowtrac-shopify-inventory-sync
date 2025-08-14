import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';
import { setCachedMapping, getCacheStatus } from '../../../utils/mapping-cache';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mapping } = body;
    
    if (!mapping) {
      return NextResponse.json({ 
        success: false, 
        error: 'No mapping data provided' 
      }, { status: 400 });
    }

    // Store in both the imported mapping store and the persistent cache
    await mappingService.updateMapping(mapping, 'api_update');
    setCachedMapping(mapping);

    const status = getCacheStatus();
    return NextResponse.json({ 
      success: true, 
      message: `Successfully persisted mapping with ${mapping.products?.length || 0} products`,
      productCount: mapping.products?.length || 0,
      timestamp: status.timestamp
    });

  } catch (error) {
    console.error('Persist mapping failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const status = getCacheStatus();
    return NextResponse.json({ 
      success: true, 
      ...status
    });
  } catch (error) {
    console.error('Get mapping status failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
} 