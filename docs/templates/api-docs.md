# ACG Chat API Documentation

**Version:** {{version}}
**Generated:** {{timestamp}}

---

## Base URL

```
http://localhost:{{port}}/api
```

---

## Endpoints

### Health Check

```
GET /api/health
```

Returns server status.

**Response:**
```json
{ "ok": true, "timestamp": 1706000000000, "version": "1.0.0" }
```

---

### Rooms

#### List Rooms

```
GET /api/rooms
```

Returns all available chat rooms.

#### Get Room

```
GET /api/rooms/:id
```

Returns a specific room by ID.

#### Create Room

```
POST /api/rooms
Content-Type: application/json

{ "name": "My Room", "description": "A new room" }
```

---

### Messages

#### Get Messages

```
GET /api/messages/:roomId?channel=NEU&limit=100
```

Returns messages for a room/channel.

#### Send Message

```
POST /api/messages
Content-Type: application/json

{
  "room": "acg-main",
  "channel": "NEU",
  "content": "Hello!",
  "aiAssisted": false
}
```

---

### Data Management

#### Export

```
POST /api/export
```

Exports all data as JSON.

#### Import

```
POST /api/import
Content-Type: application/json

{ "version": 1, "app": "acg-chat", "data": { ... } }
```

---

## ISA-95 Path Resolution

The API supports ISA-95 hierarchical paths:

```
Enterprise / Site / Area / Line / Cell / Unit
```

Each level maps to the standard equipment hierarchy.

---

*ACG - Quality code, transparent AI, human-centered design.*
