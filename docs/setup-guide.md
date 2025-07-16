# Setup Guide

This guide will help you set up the Flowtrac to Shopify Inventory Sync Tool.

## Prerequisites

- Node.js 18+ installed
- A Flowtrac account with API access
- A Shopify store with API access
- Basic knowledge of environment variables and API configuration

## Installation

1. **Clone or download the project**
   ```bash
   git clone <repository-url>
   cd flowtracshopifyinv
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env.local
   ```

4. **Configure your environment variables**
   Edit `.env.local` and fill in your credentials (see Configuration section below).

## Configuration

### Flowtrac Configuration

You'll need the following information from your Flowtrac system:

- **Company Name**: Your Flowtrac company name (used in the URL: `https://rebelsmuggling.flowtrac.com`)
- **Badge**: Your user badge/ID for Flowtrac
- **PIN**: Your personal identification number (PIN) for Flowtrac

Set these in your `.env.local`:
```env
FLOWTRAC_COMPANY_NAME=rebelsmuggling
FLOWTRAC_BADGE=james@rebelsmuggling.com
FLOWTRAC_PIN=Expansion1!
```

### Shopify Configuration

You'll need to create a private app in your Shopify admin:

1. Go to your Shopify admin
2. Navigate to Apps > Develop apps
3. Click "Create an app"
4. Give it a name (e.g., "Inventory Sync")
5. Under "Admin API access scopes", enable:
   - `read_products`
   - `write_products`
   - `read_inventory`
   - `write_inventory`
   - `read_locations`
6. Install the app
7. Copy the API key and password

Set these in your `.env.local`:
```env
SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_PASSWORD=your_shopify_api_password
SHOPIFY_API_VERSION=2023-10
```

### Sync Configuration

Configure how the sync should run:

```env
# How often to run automatic sync (in minutes)
SYNC_INTERVAL_MINUTES=30

# Number of products to process in each batch
SYNC_BATCH_SIZE=10

# Enable automatic sync
ENABLE_AUTO_SYNC=false

# Warehouse name to sync inventory from (defaults to Manteca)
SYNC_WAREHOUSE_NAME=Manteca

# Comma-separated list of specific product IDs to sync (optional, if empty syncs all Shopify-marked products)
# Example: SYNC_PRODUCT_IDS=IC-KOOL-0045,IC-KOOL-0046,IC-KOOL-0047
SYNC_PRODUCT_IDS=IC-KOOL-0045
```

## Flowtrac API Setup

### Authentication

The Flowtrac API uses badge and PIN authentication. The system will automatically authenticate when needed.

### Product Configuration

To sync products from Flowtrac to Shopify:

1. **Set sync flag**: In Flowtrac, set the `sync_to_shopify` field to "Yes" for products you want to sync
2. **Product types**: Only "Stock" and "NonStock" products will be synced
3. **Barcode matching**: Products are matched by barcode first, then by product name
4. **Warehouse focus**: Only inventory from the Manteca warehouse will be synced to Shopify
5. **Specific products**: Configure `SYNC_PRODUCT_IDS` to sync only specific products (e.g., `IC-KOOL-0045`)

### Inventory Endpoints

The system uses the following Flowtrac endpoints:

- **Products**: `/api/products` - Get product information
- **Inventory**: `/api/product-warehouse-bins` - Get current inventory levels
- **Authentication**: `/api/device-login/` - Authenticate with badge/PIN

### Advanced Inventory Features

The system now includes advanced inventory capabilities:

- **Manteca Warehouse Focus**: Only syncs inventory from the Manteca warehouse to Shopify
- **Warehouse-Specific Inventory**: Get inventory for specific warehouses (e.g., Manteca)
- **Total Available Calculation**: Automatically calculates total available inventory across all locations
- **Detailed Breakdown**: Provides warehouse and bin-level inventory breakdowns
- **Stock Quantity Handling**: Properly handles both `available` and `stock_quantity` fields
- **Smart Filtering**: Filters for records that include in available stock (`include_in_available-eq=Yes`)

### Filtering

The system automatically filters for:
- Active products (`active-eq=Active`)
- Products marked for Shopify sync (`sync_to_shopify-eq=Yes`)
- Stock and NonStock products (`type-in=Stock,NonStock`)
- Available inventory records (`include_in_available-eq=Yes`)

## Running the Application

### Development Mode

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Production Mode

```bash
npm run build
npm start
```

## API Endpoints

### Manual Sync

**POST** `/api/sync`

Triggers a manual inventory sync from Flowtrac to Shopify.

**Response:**
```json
{
  "success": true,
  "message": "Sync completed successfully",
  "status": {
    "totalProducts": 150,
    "syncedProducts": 145,
    "failedProducts": 5,
    "lastSync": "2023-12-01T10:30:00.000Z",
    "lastError": null
  }
}
```

### Status Check

**GET** `/api/status`

Returns the current sync status and system information.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": {
      "isRunning": false,
      "lastSync": "2023-12-01T10:30:00.000Z",
      "lastError": null,
      "totalProducts": 150,
      "syncedProducts": 145,
      "failedProducts": 5,
      "currentProduct": null
    },
    "inventory": {
      "summary": {
        "totalProducts": 150,
        "totalInventory": 2500,
        "lowStockProducts": 15,
        "outOfStockProducts": 3
      },
      "totalProducts": 150,
      "totalInventoryRecords": 300
    },
    "syncHistory": {
      "lastSync": "2023-12-01T10:30:00.000Z",
      "totalSyncs": 25,
      "successRate": 96.7,
      "averageSyncTime": 45,
      "errors": []
    },
    "configuration": {
      "flowtrac": {
        "companyName": "your_company",
        "badge": "***",
        "pin": "***"
      },
      "shopify": {
        "shopDomain": "your-store.myshopify.com",
        "apiKey": "***",
        "apiPassword": "***",
        "apiVersion": "2023-10"
      },
      "syncInterval": 30,
      "batchSize": 10
    }
  }
}
```

## Dashboard

The web dashboard provides:

- **Real-time status**: Current sync status and progress
- **Inventory overview**: Summary of products and inventory levels
- **Sync history**: Recent sync results and statistics
- **Manual controls**: Buttons to trigger manual syncs
- **Configuration**: View current settings (credentials hidden)

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify your Flowtrac badge and PIN are correct
   - Ensure your Flowtrac account is active
   - Check that your company name is correct

2. **Shopify API Errors**
   - Verify your Shopify API credentials
   - Ensure the private app has the required permissions
   - Check that your shop domain is correct

3. **No Products Syncing**
   - Verify products have `sync_to_shopify` set to "Yes" in Flowtrac
   - Check that products are of type "Stock" or "NonStock"
   - Ensure products have matching barcodes or names in Shopify

4. **Inventory Not Updating**
   - Check that products have available inventory in Flowtrac
   - Verify the Shopify product exists and is active
   - Ensure the primary location is set in Shopify

### Debug Mode

Enable debug logging by setting:
```env
DEBUG=true
LOG_LEVEL=debug
```

### Logs

Check the console output for detailed error messages and sync progress.

## Security Considerations

- **Environment Variables**: Never commit `.env.local` to version control
- **API Credentials**: Keep your Flowtrac and Shopify credentials secure
- **Network Security**: Use HTTPS in production
- **Access Control**: Consider implementing authentication for the dashboard

## Performance Optimization

- **Batch Size**: Adjust `SYNC_BATCH_SIZE` based on your system performance
- **Sync Interval**: Set `SYNC_INTERVAL_MINUTES` based on your inventory update frequency
- **Caching**: The system caches product data to reduce API calls
- **Error Handling**: Failed products are logged and can be retried

## Support

For issues and questions:

1. Check the troubleshooting section above
2. Review the Flowtrac API documentation
3. Check the Shopify API documentation
4. Enable debug logging for detailed error information

## Next Steps

- **Database Integration**: Add persistent storage for sync history
- **Email Notifications**: Configure alerts for sync failures
- **Advanced Filtering**: Add more granular product filtering options
- **Bulk Operations**: Implement bulk product management features 