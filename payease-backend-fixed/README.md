# Educa Fintech – Backend

Node.js + Express + MongoDB (Mongoose).

## Setup
```bash
cd backend
cp .env.example .env        # then fill in real values (never commit .env)
npm install
npm run dev                 # or: npm start
npm run seed:admin          # create the first admin
```
Requires Node 18+.

## Tests
```bash
npm test                                   # crypto tests (no DB needed)
TEST_MONGO_URI="mongodb://127.0.0.1:27017/educa_test?replicaSet=rs0" npm test   # + race-condition / lockout / transfer / yield tests
```
`TEST_MONGO_URI` must point to a throw-away database whose name contains `test`.
The transfer tests use multi-document transactions, so the test MongoDB must be a **replica set**
(a free Atlas test cluster, or locally `mongod --replSet rs0` then `mongosh --eval 'rs.initiate()'`).
Without `TEST_MONGO_URI` only the crypto and token tests run; the DB tests are skipped.

## Important environment variables
| Variable | Notes |
|---|---|
| `JWT_SECRET` | >= 32 chars, used only to sign login tokens |
| `ENCRYPTION_KEY` | **Required in production.** Encrypts KYC documents (AES-256-GCM). Back it up. |
| `LEGACY_ENCRYPTION_KEY` | Optional. Put your OLD `JWT_SECRET` here before rotating it, so documents encrypted by the previous version stay readable |
| `CLIENT_URL` | Comma separated list of allowed frontend origins |

## Money-safety rules (please keep following them)
* Never change a balance with `user.balance = x; await user.save()`. Use an atomic
  `findOneAndUpdate({ _id, balance: { $gte: amt } }, { $inc: { balance: -amt } })`.
* Anything that must run "once" (cron, transfer de-duplication, EMI debit) uses `utils/lock.js`
  (stored in MongoDB, so it works with several server instances).
* PIN and login brute-force protection lives in `utils/lockout.js`.
