# Delete Device API Implementation

## Overview
The delete device API allows authenticated users to permanently delete a device and all its associated data from LoRaDB. This operation is irreversible and removes data from all storage layers.

## API Endpoint

**DELETE** `/devices/:dev_eui`

### Authentication Required
- JWT Token or API Token required via `Authorization: Bearer <token>` header

### Path Parameters
- `dev_eui` (string): The DevEUI of the device to delete (max 32 characters)

### Response

**Success (200 OK):**
```json
{
  "dev_eui": "0123456789ABCDEF",
  "deleted_frames": 1234
}
```

**Error (400 Bad Request):**
```json
{
  "error": "InvalidDevEui",
  "message": "Device 0123456789ABCDEF not found"
}
```

**Error (401 Unauthorized):**
```json
{
  "error": "AuthError",
  "message": "Authentication failed"
}
```

**Error (500 Internal Server Error):**
```json
{
  "error": "InternalError",
  "message": "An internal error occurred. Please try again later."
}
```

## Implementation Details

### What Gets Deleted

1. **Memtable Data**: All frames for the device currently in the in-memory write buffer
2. **SSTable Data**: All frames for the device in persistent storage files
3. **Device Registry**: Device metadata and registration information

### Process Flow

1. **Validation**: Check dev_eui length and format
2. **Device Existence Check**: Verify device exists in registry
3. **Memtable Deletion**: Remove frames from in-memory buffer
4. **SSTable Rewrite**:
   - Read all existing SSTables
   - Filter out frames for the deleted device
   - Write new SSTables without the device's data
   - Delete old SSTable files
5. **Registry Removal**: Remove device from the device registry
6. **Logging**: Record operation with user ID, device ID, and deleted frame count

### Performance Considerations

- **Memtable deletion**: O(n) where n = frames for this device in memtable
- **SSTable rewrite**: O(m) where m = total frames across all SSTables
- **Note**: SSTable rewrite can be I/O intensive for large databases

### Security Features

- **String length validation**: Prevents memory exhaustion attacks
- **User authentication**: Requires valid JWT or API token
- **Audit logging**: Records who deleted what and when
- **Device existence check**: Returns 400 error for non-existent devices

## Usage Examples

### Using curl with JWT token

```bash
# First, generate a JWT token
TOKEN=$(docker compose exec loradb generate-token admin)

# Delete the device
curl -X DELETE \
  -H "Authorization: Bearer ${TOKEN}" \
  http://localhost:8080/devices/0123456789ABCDEF
```

### Using curl with API token

```bash
# Use an existing API token
API_TOKEN="ldb_your_api_token_here"

# Delete the device
curl -X DELETE \
  -H "Authorization: Bearer ${API_TOKEN}" \
  http://localhost:8080/devices/0123456789ABCDEF
```

### Response example

```json
{
  "dev_eui": "0123456789ABCDEF",
  "deleted_frames": 1542
}
```

## Code Locations

### API Layer
- **Handler**: `src/api/handlers.rs:260-315` - `delete_device()` function
- **Route**: `src/api/http.rs:82` - DELETE endpoint registration
- **Response Type**: `src/api/handlers.rs:310-315` - `DeleteDeviceResponse` struct

### Storage Layer
- **Storage Engine**: `src/storage/mod.rs:546-662` - `delete_device()` method
- **Memtable**: `src/engine/memtable.rs:156-196` - `delete_device()` method
- **Device Registry**: `src/model/device.rs:80-83` - `remove_device()` method

## Testing

To test the delete device API:

```bash
# 1. Write some test data for a device
curl -X POST http://localhost:8080/query \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM device '\''0123456789ABCDEF'\'' WHERE LAST '\''1h'\''"}'

# 2. Delete the device
curl -X DELETE \
  -H "Authorization: Bearer ${TOKEN}" \
  http://localhost:8080/devices/0123456789ABCDEF

# 3. Verify device is gone (should return 400 error)
curl -X DELETE \
  -H "Authorization: Bearer ${TOKEN}" \
  http://localhost:8080/devices/0123456789ABCDEF

# 4. Verify queries return no data
curl -X POST http://localhost:8080/query \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM device '\''0123456789ABCDEF'\''"}'
```

## Logging

The API logs the following events:

1. **Delete request**: User ID, device DevEUI
2. **Memtable deletion**: Number of frames deleted
3. **SSTable rewrite**: Number of SSTables processed, new SSTable IDs
4. **Completion**: Total frames deleted, success confirmation

Example log output:
```
INFO loradb::api::handlers: Deleting device and all its data user="admin" dev_eui="0123456789ABCDEF"
INFO loradb::storage: Deleting all data for device 0123456789ABCDEF
INFO loradb::storage: Deleted 15 frames from memtable
INFO loradb::storage: Rewriting 3 SSTables to remove device data
INFO loradb::storage: Created new SSTable 00000004 with 1523 entries
INFO loradb::storage: Created new SSTable 00000005 with 2108 entries
INFO loradb::storage: Created new SSTable 00000006 with 897 entries
INFO loradb::storage: Removed device from registry
INFO loradb::storage: Deleted total of 1542 frames for device 0123456789ABCDEF
INFO loradb::api::handlers: Device deleted successfully user="admin" dev_eui="0123456789ABCDEF" deleted_frames=1542
```

## Future Enhancements

Potential improvements for consideration:

1. **Soft Delete**: Add option to mark devices as deleted without removing data
2. **Batch Delete**: Support deleting multiple devices in one request
3. **Background Processing**: Move SSTable rewrite to background task for large datasets
4. **Dry Run**: Add query parameter to preview how many frames would be deleted
5. **Date Range Deletion**: Support deleting only frames within a specific date range
6. **Application-Level Deletion**: Delete all devices for a specific application ID
