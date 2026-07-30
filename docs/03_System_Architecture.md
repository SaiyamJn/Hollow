# System Architecture

``` text
Internet
   │
Cloudflare Tunnel
   │
Nginx
   │
React Frontend
   │
FastAPI Backend
   ├── PostgreSQL
   ├── Redis
   ├── MinIO
   └── Meilisearch
```

Deploy all services with Docker Compose on a Linux server.
