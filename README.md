# Doppler Protocol Indexer 🚀

### Getting Started
run:
```bash
cp .env.example .env.local
npm install
npm run dev
```

---

### Environment Variables
it is recommended to use a third party RPC for better performance
```
MAINNET_RPC=""
BASE_RPC=""
INK_RPC=""
UNICHAIN_RPC=""
ENABLED_NETWORKS="base,ink,unichain"

# postgres or sqlite db
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/default"
```

---

### Database
Ponder can run with postgres or sqlite db. Start your own local postgres db
```bash
docker-compose -f docker-compose.yml up -d doppler-indexer-database
```
