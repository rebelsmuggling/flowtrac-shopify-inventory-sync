# Shopify API Documentation

## Overview

This document provides comprehensive information about integrating with the Shopify API for inventory management. The Shopify API allows you to retrieve product information, update inventory levels, and manage your Shopify store programmatically.

## Authentication

### Private App Authentication
Shopify uses API key and password authentication for private apps.

```typescript
// Example authentication
const shopify = new Shopify({
  shopName: 'your-shop.myshopify.com',
  apiKey: 'your_api_key',
  password: 'your_api_password',
  apiVersion: '2023-10'
});
```

### Access Token Authentication
For custom apps, use access tokens:

```typescript
const shopify = new Shopify({
  shopName: 'your-shop.myshopify.com',
  accessToken: 'your_access_token',
  apiVersion: '2023-10'
});
```

## Base URL Format
```
https://{shop-name}.myshopify.com/admin/api/{version}/
```

## API Versioning
Always specify the API version in your requests. Current stable version: `2023-10`

## Endpoints

### 1. Shop Information
**GET** `/admin/api/2023-10/shop.json`

Get information about the shop.

**Response:**
```json
{
  "shop": {
    "id": 12345678,
    "name": "My Shop",
    "email": "shop@example.com",
    "domain": "my-shop.myshopify.com",
    "province": "CA",
    "country": "US",
    "address1": "123 Main St",
    "zip": "90210",
    "city": "Beverly Hills",
    "phone": "555-123-4567",
    "latitude": 34.0736,
    "longitude": -118.4004,
    "primary_locale": "en",
    "address2": null,
    "created_at": "2020-01-01T00:00:00-05:00",
    "updated_at": "2020-01-01T00:00:00-05:00",
    "country_code": "US",
    "country_name": "United States",
    "currency": "USD",
    "customer_email": "shop@example.com",
    "timezone": "(GMT-05:00) Eastern Time (US & Canada)",
    "iana_timezone": "America/New_York",
    "shop_owner": "John Doe",
    "money_format": "${{amount}}",
    "money_with_currency_format": "${{amount}} USD",
    "weight_unit": "lb",
    "province_code": "CA",
    "taxes_included": false,
    "auto_configure_tax_inclusivity": null,
    "tax_shipping": null,
    "county_taxes": true,
    "plan_display_name": "Shopify",
    "plan_name": "shopify",
    "has_discounts": false,
    "has_gift_cards": false,
    "myshopify_domain": "my-shop.myshopify.com",
    "google_apps_domain": null,
    "google_apps_login_enabled": null,
    "money_in_emails_format": "${{amount}}",
    "money_with_currency_in_emails_format": "${{amount}} USD",
    "eligible_for_payments": true,
    "requires_extra_payments_agreement": false,
    "password_enabled": false,
    "has_storefront": true,
    "finances": true,
    "primary_location_id": 12345678,
    "cookie_consent_level": "implicit",
    "visitor_tracking_consent_preference": "allow_all",
    "checkout_api_supported": true,
    "multi_location_enabled": false,
    "setup_required": false,
    "pre_launch_enabled": false,
    "enabled_presentment_currencies": ["USD"],
    "transactional_sms_disabled": false,
    "marketing_sms_consent_enabled_at_checkout": false,
    "customer_accounts_enabled": true
  }
}
```

### 2. Get Products
**GET** `/admin/api/2023-10/products.json`

Retrieve all products from the shop.

**Query Parameters:**
- `limit` (optional): Number of products to return (default: 50, max: 250)
- `page_info` (optional): Pagination cursor
- `since_id` (optional): Return products after specified ID
- `title` (optional): Filter by product title
- `vendor` (optional): Filter by product vendor
- `handle` (optional): Filter by product handle
- `product_type` (optional): Filter by product type
- `collection_id` (optional): Filter by collection ID
- `created_at_min` (optional): Filter by creation date
- `created_at_max` (optional): Filter by creation date
- `updated_at_min` (optional): Filter by update date
- `updated_at_max` (optional): Filter by update date
- `published_at_min` (optional): Filter by publish date
- `published_at_max` (optional): Filter by publish date
- `published_status` (optional): Filter by publish status (published, unpublished, any)

**Response:**
```json
{
  "products": [
    {
      "id": 123456789,
      "title": "Product Title",
      "body_html": "<p>Product description</p>",
      "vendor": "Product Vendor",
      "product_type": "Product Type",
      "created_at": "2020-01-01T00:00:00-05:00",
      "handle": "product-handle",
      "updated_at": "2020-01-01T00:00:00-05:00",
      "published_at": "2020-01-01T00:00:00-05:00",
      "template_suffix": null,
      "status": "active",
      "published_scope": "web",
      "tags": "tag1, tag2",
      "admin_graphql_api_id": "gid://shopify/Product/123456789",
      "variants": [
        {
          "id": 123456789,
          "product_id": 123456789,
          "title": "Default Title",
          "price": "29.99",
          "sku": "PROD-001",
          "position": 1,
          "inventory_policy": "deny",
          "compare_at_price": null,
          "fulfillment_service": "manual",
          "inventory_management": "shopify",
          "option1": "Default Title",
          "option2": null,
          "option3": null,
          "created_at": "2020-01-01T00:00:00-05:00",
          "updated_at": "2020-01-01T00:00:00-05:00",
          "taxable": true,
          "barcode": null,
          "grams": 0,
          "image_id": null,
          "weight": 0,
          "weight_unit": "lb",
          "inventory_item_id": 123456789,
          "inventory_quantity": 100,
          "old_inventory_quantity": 100,
          "requires_shipping": true,
          "admin_graphql_api_id": "gid://shopify/ProductVariant/123456789"
        }
      ],
      "options": [
        {
          "id": 123456789,
          "product_id": 123456789,
          "name": "Title",
          "position": 1,
          "values": ["Default Title"]
        }
      ],
      "images": [],
      "image": null
    }
  ]
}
```

### 3. Get Product by ID
**GET** `/admin/api/2023-10/products/{product_id}.json`

Retrieve a specific product by ID.

**Response:**
```json
{
  "product": {
    "id": 123456789,
    "title": "Product Title",
    "body_html": "<p>Product description</p>",
    "vendor": "Product Vendor",
    "product_type": "Product Type",
    "created_at": "2020-01-01T00:00:00-05:00",
    "handle": "product-handle",
    "updated_at": "2020-01-01T00:00:00-05:00",
    "published_at": "2020-01-01T00:00:00-05:00",
    "template_suffix": null,
    "status": "active",
    "published_scope": "web",
    "tags": "tag1, tag2",
    "admin_graphql_api_id": "gid://shopify/Product/123456789",
    "variants": [...],
    "options": [...],
    "images": [...],
    "image": null
  }
}
```

### 4. Get Inventory Levels
**GET** `/admin/api/2023-10/inventory_levels.json`

Retrieve inventory levels for inventory items.

**Query Parameters:**
- `inventory_item_ids` (required): Comma-separated list of inventory item IDs
- `location_ids` (optional): Comma-separated list of location IDs

**Response:**
```json
{
  "inventory_levels": [
    {
      "inventory_item_id": 123456789,
      "location_id": 123456789,
      "available": 100,
      "updated_at": "2020-01-01T00:00:00-05:00",
      "admin_graphql_api_id": "gid://shopify/InventoryLevel/123456789"
    }
  ]
}
```

### 5. Set Inventory Level
**POST** `/admin/api/2023-10/inventory_levels/set.json`

Set the inventory level for a specific inventory item at a location.

**Request Body:**
```json
{
  "location_id": 123456789,
  "inventory_item_id": 123456789,
  "available": 150
}
```

**Response:**
```json
{
  "inventory_level": {
    "inventory_item_id": 123456789,
    "location_id": 123456789,
    "available": 150,
    "updated_at": "2020-01-01T00:00:00-05:00",
    "admin_graphql_api_id": "gid://shopify/InventoryLevel/123456789"
  }
}
```

### 6. Adjust Inventory Level
**POST** `/admin/api/2023-10/inventory_levels/adjust.json`

Adjust the inventory level for a specific inventory item at a location.

**Request Body:**
```json
{
  "location_id": 123456789,
  "inventory_item_id": 123456789,
  "available_adjustment": 10
}
```

**Response:**
```json
{
  "inventory_level": {
    "inventory_item_id": 123456789,
    "location_id": 123456789,
    "available": 160,
    "updated_at": "2020-01-01T00:00:00-05:00",
    "admin_graphql_api_id": "gid://shopify/InventoryLevel/123456789"
  }
}
```

### 7. Get Locations
**GET** `/admin/api/2023-10/locations.json`

Retrieve all locations for the shop.

**Response:**
```json
{
  "locations": [
    {
      "id": 123456789,
      "name": "Primary Location",
      "address1": "123 Main St",
      "address2": null,
      "city": "Beverly Hills",
      "zip": "90210",
      "province": "CA",
      "country": "US",
      "phone": "555-123-4567",
      "created_at": "2020-01-01T00:00:00-05:00",
      "updated_at": "2020-01-01T00:00:00-05:00",
      "country_code": "US",
      "country_name": "United States",
      "province_code": "CA",
      "legacy": false,
      "active": true,
      "admin_graphql_api_id": "gid://shopify/Location/123456789",
      "localized_country_name": "United States",
      "localized_province_name": "California",
      "primary": true
    }
  ]
}
```

### 8. Get Inventory Items
**GET** `/admin/api/2023-10/inventory_items.json`

Retrieve inventory items.

**Query Parameters:**
- `ids` (optional): Comma-separated list of inventory item IDs
- `limit` (optional): Number of items to return (default: 50, max: 250)
- `page_info` (optional): Pagination cursor

**Response:**
```json
{
  "inventory_items": [
    {
      "id": 123456789,
      "sku": "PROD-001",
      "created_at": "2020-01-01T00:00:00-05:00",
      "updated_at": "2020-01-01T00:00:00-05:00",
      "requires_shipping": true,
      "cost": "10.00",
      "country_code_of_origin": "US",
      "province_code_of_origin": "CA",
      "harmonized_system_code": null,
      "tracked": true,
      "country_harmonized_system_codes": [],
      "admin_graphql_api_id": "gid://shopify/InventoryItem/123456789"
    }
  ]
}
```

## Error Handling

### Error Response Format
```json
{
  "errors": "Error message description"
}
```

### Common HTTP Status Codes
- `200`: Success
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `422`: Unprocessable Entity
- `429`: Too Many Requests
- `500`: Internal Server Error

### Rate Limiting
Shopify implements rate limiting based on your app's plan:

- **Basic Shopify**: 2 requests per second
- **Shopify**: 2 requests per second
- **Advanced Shopify**: 4 requests per second
- **Shopify Plus**: 4 requests per second

Rate limit headers are included in responses:
```
X-Shopify-Shop-Api-Call-Limit: 1/40
```

## Data Types

### Product
```typescript
interface ShopifyProduct {
  id: number;
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  created_at: string;
  handle: string;
  updated_at: string;
  published_at?: string;
  template_suffix?: string;
  status: string;
  published_scope: string;
  tags?: string;
  admin_graphql_api_id: string;
  variants: ShopifyVariant[];
  options: ShopifyOption[];
  images: ShopifyImage[];
  image?: ShopifyImage;
}
```

### Product Variant
```typescript
interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku?: string;
  position: number;
  inventory_policy: string;
  compare_at_price?: string;
  fulfillment_service: string;
  inventory_management: string;
  option1?: string;
  option2?: string;
  option3?: string;
  created_at: string;
  updated_at: string;
  taxable: boolean;
  barcode?: string;
  grams: number;
  image_id?: number;
  weight: number;
  weight_unit: string;
  inventory_item_id: number;
  inventory_quantity: number;
  old_inventory_quantity: number;
  requires_shipping: boolean;
  admin_graphql_api_id: string;
}
```

### Inventory Level
```typescript
interface ShopifyInventoryLevel {
  inventory_item_id: number;
  location_id: number;
  available: number;
  updated_at: string;
  admin_graphql_api_id: string;
}
```

### Location
```typescript
interface ShopifyLocation {
  id: number;
  name: string;
  address1?: string;
  address2?: string;
  city?: string;
  zip?: string;
  province?: string;
  country?: string;
  phone?: string;
  created_at: string;
  updated_at: string;
  country_code?: string;
  country_name?: string;
  province_code?: string;
  legacy: boolean;
  active: boolean;
  admin_graphql_api_id: string;
  localized_country_name?: string;
  localized_province_name?: string;
  primary: boolean;
}
```

## Best Practices

### 1. Pagination
- Always handle pagination for large datasets
- Use `page_info` cursor for efficient pagination
- Set appropriate `limit` values

### 2. Rate Limiting
- Monitor rate limit headers
- Implement exponential backoff for retries
- Queue requests when approaching limits

### 3. Error Handling
- Always check for error responses
- Implement retry logic for transient errors
- Log errors for debugging

### 4. Data Validation
- Validate data before sending to API
- Handle missing or null values
- Verify data types and formats

## Integration Examples

### JavaScript/TypeScript
```typescript
import Shopify from 'shopify-api-node';

class ShopifyAPI {
  private shopify: Shopify;

  constructor(shopDomain: string, apiKey: string, apiPassword: string) {
    this.shopify = new Shopify({
      shopName: shopDomain,
      apiKey: apiKey,
      password: apiPassword,
      apiVersion: '2023-10'
    });
  }

  async getProducts(): Promise<ShopifyProduct[]> {
    try {
      const products = await this.shopify.product.list({ limit: 250 });
      return products;
    } catch (error) {
      console.error('Error fetching products:', error);
      throw error;
    }
  }

  async updateInventoryLevel(
    inventoryItemId: number, 
    locationId: number, 
    quantity: number
  ): Promise<boolean> {
    try {
      await this.shopify.inventoryLevel.set({
        inventory_item_id: inventoryItemId,
        location_id: locationId,
        available: quantity
      });
      return true;
    } catch (error) {
      console.error('Error updating inventory:', error);
      throw error;
    }
  }

  async getLocations(): Promise<ShopifyLocation[]> {
    try {
      const locations = await this.shopify.location.list();
      return locations;
    } catch (error) {
      console.error('Error fetching locations:', error);
      throw error;
    }
  }
}
```

### Python
```python
import requests
import json

class ShopifyAPI:
    def __init__(self, shop_domain: str, api_key: str, api_password: str):
        self.base_url = f"https://{shop_domain}.myshopify.com/admin/api/2023-10"
        self.auth = (api_key, api_password)
        self.headers = {'Content-Type': 'application/json'}

    def get_products(self, limit=250):
        try:
            response = requests.get(
                f'{self.base_url}/products.json',
                params={'limit': limit},
                auth=self.auth,
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()['products']
        except Exception as e:
            print(f'Error fetching products: {e}')
            raise

    def update_inventory_level(self, inventory_item_id: int, location_id: int, quantity: int):
        try:
            data = {
                'location_id': location_id,
                'inventory_item_id': inventory_item_id,
                'available': quantity
            }
            response = requests.post(
                f'{self.base_url}/inventory_levels/set.json',
                auth=self.auth,
                headers=self.headers,
                json=data
            )
            response.raise_for_status()
            return response.json()['inventory_level']
        except Exception as e:
            print(f'Error updating inventory: {e}')
            raise

    def get_locations(self):
        try:
            response = requests.get(
                f'{self.base_url}/locations.json',
                auth=self.auth,
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()['locations']
        except Exception as e:
            print(f'Error fetching locations: {e}')
            raise
```

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify API key and password are correct
   - Check if app has necessary permissions
   - Ensure proper authentication format

2. **Rate Limiting**
   - Monitor rate limit headers
   - Implement request throttling
   - Use bulk operations when possible

3. **Product Not Found**
   - Verify product ID exists
   - Check if product is active
   - Ensure proper API version

4. **Inventory Update Failures**
   - Verify inventory item ID and location ID
   - Check if inventory tracking is enabled
   - Ensure proper quantity format

### Support

For additional support or questions about the Shopify API:

- **Documentation**: https://shopify.dev/docs/api
- **API Reference**: https://shopify.dev/docs/api/admin-rest
- **Community**: https://community.shopify.com
- **Status Page**: https://status.shopify.com 