# Doppler Protocol Indexer 🚀

## Disclaimer 
This repository is under active devlopment and not yet officially supported.

In the meantime, please use the [doppler-indexer](https://github.com/whetstoneresearch/doppler-sdk/tree/main/packages/doppler-v3-indexer) released in the [sdk monorepo](https://github.com/whetstoneresearch/doppler-sdk).

Although it is currently named "doppler-v3-indexer" it supports indexing both Doppler v3 and v4 tokens. 

We will update this README when it is ready for use. 

<hr/>

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
