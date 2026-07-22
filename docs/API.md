# API Documentation Reference

The backend API is a RESTful JSON service hosted by default on `http://localhost:4000` (development) or your deployed Render URL (production).

---

## 1. Authentication

All routes except `/auth/login` require an `Authorization` header containing a valid Bearer JWT:
```http
Authorization: Bearer <your-jwt-token-here>
```

---

## 2. Authentication Endpoints

### Login User
Authenticates a user and returns a JWT token along with user profile metadata.

*   **URL**: `/auth/login`
*   **Method**: `POST`
*   **Headers**: `Content-Type: application/json`
*   **Request Body**:
    ```json
    {
      "email": "sales@example.com",
      "password": "Password123!"
    }
    ```
*   **Success Response** (200 OK):
    ```json
    {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "id": 2,
        "name": "Sales User",
        "email": "sales@example.com",
        "role": "SALES"
      }
    }
    ```
*   **Error Response** (401 Unauthorized):
    ```json
    { "error": "Invalid credentials" }
    ```

---

## 3. Customer Endpoints

### List Customers
Retrieves a paginated list of customers. Supports search filters.

*   **URL**: `/customers`
*   **Method**: `GET`
*   **Query Parameters**:
    - `page` (optional, default: 1)
    - `limit` (optional, default: 10)
    - `search` (optional, filters by name/businessName/mobile)
    - `status` (optional, `LEAD` | `ACTIVE` | `INACTIVE`)
*   **Success Response** (200 OK):
    ```json
    {
      "data": [
        {
          "id": 1,
          "name": "Ravi Kumar",
          "mobile": "9876543210",
          "email": "ravi@example.com",
          "businessName": "Kumar Traders",
          "gstNumber": "29ABCDE1234F1Z5",
          "customerType": "WHOLESALE",
          "address": "Bengaluru",
          "status": "ACTIVE",
          "followUpDate": "2026-07-25T00:00:00.000Z",
          "createdAt": "2026-07-22T08:00:00.000Z"
        }
      ],
      "page": 1,
      "limit": 10,
      "total": 1
    }
    ```

### Create Customer
Registers a new customer profile.
*   **Method**: `POST`
*   **URL**: `/customers`
*   **Authorized Roles**: `ADMIN`, `SALES`
*   **Request Body**:
    ```json
    {
      "name": "Ramesh Shah",
      "mobile": "9898989898",
      "email": "ramesh@example.com",
      "businessName": "Shah Steels",
      "gstNumber": "29ABCDE1234F1Z5",
      "customerType": "WHOLESALE",
      "address": "Mumbai",
      "status": "ACTIVE",
      "followUpDate": "2026-07-30",
      "notes": "Initial follow-up call completed"
    }
    ```

### Add Customer Note
Appends a chronological follow-up note to a customer's history.
*   **Method**: `POST`
*   **URL**: `/customers/:id/notes`
*   **Authorized Roles**: `ADMIN`, `SALES`
*   **Request Body**:
    ```json
    {
      "note": "Quotations sent. Customer is reviewing."
    }
    ```

---

## 4. Product Endpoints

### List Products
*   **Method**: `GET`
*   **URL**: `/products`
*   **Query Parameters**: `search` (optional, filters by name/SKU/category)

### Create Product
*   **Method**: `POST`
*   **URL**: `/products`
*   **Authorized Roles**: `ADMIN`
*   **Request Body**:
    ```json
    {
      "name": "Steel Rod",
      "sku": "ST-001",
      "category": "Metal",
      "unitPrice": 120.00,
      "currentStock": 100,
      "minStockAlert": 20,
      "warehouseLocation": "A1"
    }
    ```

### Get Product Stock Movements
*   **Method**: `GET`
*   **URL**: `/products/:id/movements`
*   **Authorized Roles**: `ADMIN`, `WAREHOUSE`

---

## 5. Stock Movement Endpoints

### Adjust Inventory Stock
Manually adjusts stock levels of a product (increases or decreases inventory).
*   **Method**: `POST`
*   **URL**: `/stock-movements`
*   **Authorized Roles**: `WAREHOUSE`
*   **Request Body**:
    ```json
    {
      "productId": 1,
      "quantityChanged": 10,
      "movementType": "IN",
      "reason": "Received fresh batch from manufacturer"
    }
    ```

---

## 6. Challan Endpoints

### List Challans
*   **Method**: `GET`
*   **URL**: `/challans`
*   **Query Parameters**: `status` (optional, `DRAFT` | `CONFIRMED` | `CANCELLED`)

### Create Challan (Draft)
Creates a new delivery challan in `DRAFT` status. Copy-by-value snapshots of the product SKU, name, and unit price are saved instantly.
*   **Method**: `POST`
*   **URL**: `/challans`
*   **Authorized Roles**: `SALES`
*   **Request Body**:
    ```json
    {
      "customerId": 1,
      "items": [
        {
          "productId": 1,
          "quantity": 10
        }
      ]
    }
    ```

### Confirm Challan
Locks stock and processes delivery items.
*   **Method**: `PUT`
*   **URL**: `/challans/:id/confirm`
*   **Authorized Roles**: `SALES`
*   **Success Response** (200 OK): Returns the confirmed Challan object.
*   **Insufficient Stock Error Response** (400 Bad Request):
    ```json
    { "error": "Insufficient stock for: Steel Rod" }
    ```

### Cancel Challan
Cancels a confirmed challan, restocking items back to inventory and logging a compensating `IN` stock movement.
*   **Method**: `PUT`
*   **URL**: `/challans/:id/cancel`
*   **Authorized Roles**: `SALES`
