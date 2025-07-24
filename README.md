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
DATABASE_URL="" # postgres or sqlite db
ENABLED_NETWORKS="base,ink,unichain"
```

---

### Database
Ponder can run with postgres of sqlite db. Start your own local postgres db
```bash
docker-compose -f docker-compose.yml up -d doppler-indexer-database
```
